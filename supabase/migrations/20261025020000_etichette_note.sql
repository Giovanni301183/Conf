-- Etichette (temi) delle note e dei documenti: acquisti, vendita, opportunita', sviluppo... piu' di una per documento.
-- L'elenco delle etichette sta nell'app (src/domain/documenti.ts, ETICHETTE): qui nessun vincolo, cosi' per aggiungerne
-- una basta cambiare l'app. Le note gia' scritte restano senza etichetta.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261025010000_avvisi_riunioni.sql). Aggiunge solo una colonna.

alter table public.documenti add column if not exists etichette text[] not null default '{}';
create index if not exists documenti_etichette_idx on public.documenti using gin (etichette);

notify pgrst, 'reload schema';
