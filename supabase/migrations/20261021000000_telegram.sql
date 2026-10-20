-- Telegram: urgenze nell'agenda e abbinamento tra account Telegram e utenti dell'app.
-- La chat (n8n) legge e scrive l'agenda solo attraverso la funzione /api/agenda, con la chiave di servizio:
-- li' si controlla chi scrive (telegram_id abbinato) e si applicano le stesse regole dell'app.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261020010000_agenda.sql). Aggiunge solo colonne, una tabella e due funzioni.

-- Nuovo genere "urgenza" (resta in cima agli allarmi finche' non e' risolta) e categoria facoltativa.
alter table public.scadenze drop constraint if exists scadenze_genere_check;
alter table public.scadenze add constraint scadenze_genere_check
  check (genere in ('attivita', 'promemoria', 'scadenza', 'appuntamento', 'urgenza'));
alter table public.scadenze add column if not exists categoria text
  check (categoria in ('STRUTTURA', 'BULLONERIA', 'ELETTROMECCANICO', 'ELETTRONICO'));

-- Account Telegram abbinato (lo imposta solo /api/agenda, dopo il codice di abbinamento).
alter table public.utenti add column if not exists telegram_id bigint unique;

-- Codici di abbinamento: nessuno li legge dal browser (niente regole di lettura), si creano solo con codice_telegram().
create table if not exists public.telegram_codici (
  email  text primary key references public.utenti (email) on delete cascade,
  codice text not null,
  scade  timestamptz not null
);
alter table public.telegram_codici enable row level security;

-- Nuovo codice di 6 cifre per chi e' collegato, valido 10 minuti: va scritto al bot come "/collega 123456".
create or replace function public.codice_telegram() returns text
language plpgsql security definer set search_path = public as $$
declare c text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not public.is_staff() then raise exception 'Utente non abilitato'; end if;
  insert into public.telegram_codici (email, codice, scade) values (public.mia_email(), c, now() + interval '10 minutes')
    on conflict (email) do update set codice = excluded.codice, scade = excluded.scade;
  return c;
end $$;
revoke execute on function public.codice_telegram() from public, anon;
grant execute on function public.codice_telegram() to authenticated;

-- Toglie l'abbinamento del proprio account.
create or replace function public.scollega_telegram() returns void
language sql security definer set search_path = public as $$
  update public.utenti set telegram_id = null where email = public.mia_email() and public.is_staff();
$$;
revoke execute on function public.scollega_telegram() from public, anon;
grant execute on function public.scollega_telegram() to authenticated;

notify pgrst, 'reload schema';
