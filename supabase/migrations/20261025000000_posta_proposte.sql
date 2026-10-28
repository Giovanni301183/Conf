-- Email in arrivo: un collega inoltra un'email all'indirizzo dell'agenda, n8n la passa a /api/agenda (azione posta),
-- l'AI la legge e la proposta (titolo, riassunto, giorno, ora, commessa) arriva in chat privata su Telegram con i pulsanti
-- Appunto / Promemoria / Riunione / Ignora. Qui si tiene la proposta finche' il collega sceglie (i pulsanti portano solo l'id).
-- gmail_id evita una seconda proposta se n8n rilegge la stessa email.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261022000000_documenti.sql). Aggiunge solo una tabella.

create table if not exists public.posta_proposte (
  id       uuid primary key default gen_random_uuid(),
  email    text not null references public.utenti (email) on delete cascade,
  gmail_id text unique,
  dati     jsonb not null,
  creato   timestamptz not null default now(),
  usata    timestamptz
);

-- Nessuna regola di accesso: dal browser non si legge ne' si scrive, solo /api/agenda con la chiave di servizio.
alter table public.posta_proposte enable row level security;

notify pgrst, 'reload schema';
