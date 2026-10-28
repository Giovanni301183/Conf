-- Note libere: una nota puo' non essere legata a nessun preventivo ne' voce d'agenda (es. un'idea di sviluppo, un appunto
-- sugli acquisti). Il tema lo danno le etichette. I file restano sempre legati a un preventivo o a una voce d'agenda.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261025020000_etichette_note.sql). Cambia solo un vincolo.

alter table public.documenti drop constraint if exists documenti_legato;
alter table public.documenti add constraint documenti_legato
  check (tipo = 'nota' or preventivo_id is not null or scadenza_id is not null);

notify pgrst, 'reload schema';
