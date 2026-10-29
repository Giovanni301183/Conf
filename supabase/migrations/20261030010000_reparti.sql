-- Mappa dei reparti nella Home: ogni collega ha uno o piu' reparti (li assegna l'amministratore dalla pagina Utenti)
-- e una voce d'agenda puo' dire a quali reparti appartiene. Le note vanno nei reparti tramite i loro temi (etichette), senza colonne nuove.
-- Chiavi dei reparti: vedi src/domain/reparti.ts (direzione, commerciale, tecnico, rs, acquisti, produzione, qualita, logistica,
-- cantiere, assistenza, amministrazione, hr). Una voce senza reparti prende quelli di chi la deve fare.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261030000000_squadra_collega.sql). Aggiunge due colonne.

alter table public.utenti add column if not exists reparti text[] not null default '{}';
alter table public.scadenze add column if not exists reparti text[] not null default '{}';

notify pgrst, 'reload schema';
