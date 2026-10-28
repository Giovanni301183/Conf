-- Chat di squadra, seconda parte: stanze per commessa, risposte, @menzioni e messaggi dell'assistente.
-- preventivo_id = stanza della commessa (vuoto = Generale); un messaggio del Generale si puo' spostare nella stanza di una commessa.
-- risposta_a = messaggio a cui si risponde (citato sopra); menzioni = email dei colleghi chiamati con @nome (per gli avvisi).
-- I messaggi dell'assistente (@assistente) li scrive /api/squadra con la chiave di servizio, con creato_da = 'assistente'.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261029000000_squadra.sql). Aggiunge tre colonne alla tabella messaggi.

alter table public.messaggi add column if not exists preventivo_id text references public.preventivi (id) on delete set null;
alter table public.messaggi add column if not exists risposta_a uuid references public.messaggi (id) on delete set null;
alter table public.messaggi add column if not exists menzioni text[] not null default '{}';
create index if not exists messaggi_stanza on public.messaggi (preventivo_id, creato desc);

-- Autore e data non cambiano; testo, file, risposta e menzioni li cambia solo chi ha scritto. Nota e stanza le puo' cambiare chiunque.
create or replace function public.messaggi_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  if old.creato_da is distinct from public.mia_email() then
    new.testo := old.testo;
    new.documento_id := old.documento_id;
    new.risposta_a := old.risposta_a;
    new.menzioni := old.menzioni;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
