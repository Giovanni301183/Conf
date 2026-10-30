-- Voci gia' presenti nel flusso fino alla chiusura (dopo 20261030040000_flusso_voci.sql):
--  - cose da fare, scadenze e urgenze ancora aperte e assegnate a qualcuno: "in corso" (c'e' gia' chi se ne occupa);
--  - le attese di risposta alle email («✉ Attesa risposta · destinatario — oggetto»), prima promemoria, diventano cose da fare
--    "in attesa" del destinatario con il sollecito alla loro data (quelle gia' spuntate: chiuse).
-- Il trigger resta spento durante l'aggiornamento: non e' un passaggio di nessuno, quindi niente storico e le voci restano intatte.
-- Da eseguire una volta nel SQL Editor di Supabase. Non tocca le voci gia' fatte, salvo il genere delle attese.

alter table public.scadenze disable trigger scadenze_autore;

update public.scadenze set stato = 'in_corso'
  where stato = 'aperta' and not fatto and assegnata_a is not null and genere in ('attivita', 'scadenza', 'urgenza');

update public.scadenze set genere = 'attivita',
    stato = case when fatto then 'chiusa' else 'in_attesa' end,
    attesa_di = case when fatto then null else nullif(trim(split_part(substr(titolo, length('✉ Attesa risposta · ') + 1), ' — ', 1)), '') end,
    sollecito = case when fatto then null else giorno end
  where genere = 'promemoria' and titolo like '✉ Attesa risposta · %';

alter table public.scadenze enable trigger scadenze_autore;
