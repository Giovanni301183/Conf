-- Allegati delle note: un file (documento, foto, PDF...) puo' essere allegato a una nota, anche a una nota libera.
-- nota_id = la nota a cui e' allegato. Il file si vede sotto la nota, non nell'elenco dei documenti della commessa.
-- Eliminando la nota, l'app toglie prima i suoi file dallo Storage; la riga del file se ne va con la nota (on delete cascade).
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261025030000_note_libere.sql). Aggiunge una colonna e cambia un vincolo.

alter table public.documenti add column if not exists nota_id uuid references public.documenti (id) on delete cascade;
create index if not exists documenti_nota_idx on public.documenti (nota_id);

alter table public.documenti drop constraint if exists documenti_allegato;
alter table public.documenti add constraint documenti_allegato check (nota_id is null or tipo = 'file');

alter table public.documenti drop constraint if exists documenti_legato;
alter table public.documenti add constraint documenti_legato
  check (tipo = 'nota' or preventivo_id is not null or scadenza_id is not null or nota_id is not null);

notify pgrst, 'reload schema';
