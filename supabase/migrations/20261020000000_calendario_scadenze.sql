-- Calendario della Home: scadenze e promemoria inseriti a mano (dall'app; piu' avanti anche da Telegram).
-- Le date di produzione e montaggio non stanno qui: l'app le ricava dai preventivi vinti.
-- Tutti gli utenti leggono e creano; modifica ed eliminazione spettano a chi l'ha creata e all'amministratore.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261019010000_utenti_propria_riga.sql). Non tocca le altre tabelle.

create table if not exists public.scadenze (
  id            uuid primary key default gen_random_uuid(),
  giorno        date not null,
  titolo        text not null check (length(trim(titolo)) between 1 and 200),
  nota          text,
  preventivo_id text references public.preventivi (id) on delete set null,
  fatto         boolean not null default false,
  origine       text not null default 'app' check (origine in ('app', 'telegram')),
  creato_da     text not null default public.mia_email(),
  creato        timestamptz not null default now()
);
create index if not exists scadenze_giorno_idx on public.scadenze (giorno);

-- Autore e data di creazione non cambiano con le modifiche.
create or replace function public.scadenze_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  return new;
end $$;
drop trigger if exists scadenze_autore on public.scadenze;
create trigger scadenze_autore before update on public.scadenze
  for each row execute function public.scadenze_autore();

alter table public.scadenze enable row level security;
drop policy if exists "staff legge scadenze" on public.scadenze;
drop policy if exists "staff crea scadenze" on public.scadenze;
drop policy if exists "autore modifica scadenze" on public.scadenze;
drop policy if exists "autore elimina scadenze" on public.scadenze;
create policy "staff legge scadenze" on public.scadenze for select to authenticated using (public.is_staff());
create policy "staff crea scadenze" on public.scadenze for insert to authenticated
  with check (public.is_staff() and creato_da = public.mia_email());
create policy "autore modifica scadenze" on public.scadenze for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()))
  with check (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()));
create policy "autore elimina scadenze" on public.scadenze for delete to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()));

-- Aggiornamento in tempo reale: le scadenze di un collega compaiono senza ricaricare la pagina.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scadenze') then
    alter publication supabase_realtime add table public.scadenze;
  end if;
end $$;
