-- Chat di squadra, terza parte: un messaggio si lega a una nota (o file) dei Documenti o a una voce d'agenda (allarme, scadenza, appuntamento,
-- anche gia' fatta). rif_nota e rif_voce li puo' cambiare chiunque (come stanza e nota): il messaggio mostra l'etichetta cliccabile
-- e la nota o la voce mostrano «💬 N messaggi». Eliminando la nota o la voce il collegamento si svuota, il messaggio resta.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261029010000_squadra_stanze.sql). Aggiunge due colonne alla tabella messaggi.

alter table public.messaggi add column if not exists rif_nota uuid references public.documenti (id) on delete set null;
alter table public.messaggi add column if not exists rif_voce uuid references public.scadenze (id) on delete set null;
create index if not exists messaggi_rif_nota on public.messaggi (rif_nota) where rif_nota is not null;
create index if not exists messaggi_rif_voce on public.messaggi (rif_voce) where rif_voce is not null;

notify pgrst, 'reload schema';
