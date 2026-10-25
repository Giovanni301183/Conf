-- Avvisi delle riunioni su Telegram: n8n chiama /api/agenda (azione avvisi_riunioni) ogni 10 minuti e gli appuntamenti
-- che iniziano tra poco arrivano in privato a chi li ha creati e a chi sono assegnati.
-- avvisata_per = giorno e ora gia' avvisati ("2026-10-26 11:00"): se la riunione si sposta, si avvisa di nuovo.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261025000000_posta_proposte.sql). Aggiunge solo una colonna.

alter table public.scadenze add column if not exists avvisata_per text;

notify pgrst, 'reload schema';
