-- Conversazioni email legate alle voci (o alle note): un botta e risposta resta in una sola voce.
-- Ogni conversazione di Gmail (thread) sistemata una volta dall'app si ricorda qui, con la voce o la nota a cui appartiene,
-- il corrispondente e l'ultima email letta. Le email nuove della stessa conversazione entrano da sole (riga breve nella voce),
-- senza chiedere niente; una voce puo' avere piu' conversazioni (es. risposta con un oggetto nuovo, collegata a mano o dal suggerimento).
-- Solo il server (chiave di servizio) scrive; i colleghi leggono.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261030050000_flusso_voci_esistenti.sql). Aggiunge una tabella.

create table if not exists public.posta_fili (
  thread      text primary key,                                              -- id della conversazione in Gmail
  scadenza_id uuid references public.scadenze (id) on delete cascade,
  nota_id     uuid references public.documenti (id) on delete cascade,
  contatto    text,                                                          -- indirizzo di chi scrive dall'altra parte
  ultimo      bigint not null default 0,                                     -- data (ms) dell'ultima email letta della conversazione
  creato      timestamptz not null default now(),
  constraint posta_fili_legato check (scadenza_id is not null or nota_id is not null)
);
create index if not exists posta_fili_voce on public.posta_fili (scadenza_id) where scadenza_id is not null;
create index if not exists posta_fili_contatto on public.posta_fili (contatto);

alter table public.posta_fili enable row level security;
drop policy if exists "staff legge fili" on public.posta_fili;
create policy "staff legge fili" on public.posta_fili for select to authenticated using (public.is_staff());

-- Lo storico della voce mostra anche le email della conversazione («Email di …»): le scrive il server con questa funzione.
grant execute on function public.scadenze_evento(uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
