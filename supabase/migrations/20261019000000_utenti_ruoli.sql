-- Utenti abilitati e ruoli: amministratore o utente.
-- Entra solo chi ha email aziendale ED e' nell'elenco utenti come attivo; solo l'amministratore elimina preventivi e gestisce gli utenti.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261016000000_archivio_condiviso.sql).

create table if not exists public.utenti (
  email       text primary key check (email = lower(email)),
  nome        text,
  ruolo       text not null default 'utente' check (ruolo in ('admin', 'utente')),
  attivo      boolean not null default true,
  creato      timestamptz not null default now(),
  invitato_da text
);

-- Solo alla prima esecuzione (elenco vuoto) chi ha gia' un account aziendale diventa utente;
-- rieseguendo lo script non si riabilita chi e' stato tolto. Il primo amministratore e' indicato qui.
insert into public.utenti (email)
  select lower(email) from auth.users
  where email ilike '%@terranovasrl.net' and not exists (select 1 from public.utenti)
  on conflict do nothing;
insert into public.utenti (email, ruolo) values ('g.sorrentino@terranovasrl.net', 'admin')
  on conflict (email) do update set ruolo = 'admin', attivo = true;

create or replace function public.mia_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- security definer: leggono utenti senza passare dalle sue regole RLS (che a loro volta usano queste funzioni).
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mia_email() like '%@terranovasrl.net'
     and exists (select 1 from public.utenti u where u.email = public.mia_email() and u.attivo)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
     and exists (select 1 from public.utenti u where u.email = public.mia_email() and u.ruolo = 'admin')
$$;

-- Deve restare sempre almeno un amministratore attivo, altrimenti nessuno potrebbe piu' gestire gli utenti.
create or replace function public.utenti_un_admin() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.utenti where ruolo = 'admin' and attivo) then
    raise exception 'Serve almeno un amministratore attivo';
  end if;
  return null;
end $$;
drop trigger if exists utenti_un_admin on public.utenti;
create constraint trigger utenti_un_admin after update or delete on public.utenti
  for each row execute function public.utenti_un_admin();

alter table public.utenti enable row level security;
drop policy if exists "staff legge utenti" on public.utenti;
drop policy if exists "admin scrive utenti" on public.utenti;
create policy "staff legge utenti" on public.utenti for select to authenticated using (public.is_staff());
create policy "admin scrive utenti" on public.utenti for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Preventivi: tutti leggono, creano e modificano; eliminare spetta all'amministratore.
drop policy if exists "staff scrive preventivi" on public.preventivi;
drop policy if exists "staff crea preventivi" on public.preventivi;
drop policy if exists "staff modifica preventivi" on public.preventivi;
drop policy if exists "admin elimina preventivi" on public.preventivi;
create policy "staff crea preventivi" on public.preventivi for insert to authenticated with check (public.is_staff());
create policy "staff modifica preventivi" on public.preventivi for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin elimina preventivi" on public.preventivi for delete to authenticated using (public.is_admin());
