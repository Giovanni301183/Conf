-- Settori nella mappa dei reparti: cliccando un reparto compaiono i pallini Energia, Serre, Vigneti, Recinzioni, Lavori speciali.
-- Una voce d'agenda o una nota puo' dire a quali settori appartiene; se non ne dice, vale il settore del preventivo collegato
-- (tracker e impianti fissi = Energia). Chiavi: energia, serre, vigneti, recinzioni, speciali (vedi src/domain/reparti.ts).
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261030020000_avvisi_reparto.sql). Aggiunge due colonne.

alter table public.scadenze add column if not exists settori text[] not null default '{}';
alter table public.documenti add column if not exists settori text[] not null default '{}';

notify pgrst, 'reload schema';
