-- Avvisi per reparto su Telegram: chi lo chiede (pulsante «🔔 Avvisami delle voci nuove dei miei reparti» sotto la situazione di un reparto)
-- riceve in privato le voci d'agenda nuove dei suoi reparti, create da altri. Vedi api/agenda.ts (avvisiReparto).
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261030010000_reparti.sql). Aggiunge una colonna.

alter table public.utenti add column if not exists avvisi_reparto boolean not null default false;

notify pgrst, 'reload schema';
