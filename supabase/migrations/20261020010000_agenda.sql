-- Agenda: le voci del calendario hanno un genere (da fare, promemoria, scadenza, appuntamento), un'ora facoltativa
-- e possono essere assegnate a un collega. Chi ha la voce assegnata puo' solo segnarla come fatta.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261020000000_calendario_scadenze.sql). Aggiunge solo colonne.

alter table public.scadenze add column if not exists genere text not null default 'attivita'
  check (genere in ('attivita', 'promemoria', 'scadenza', 'appuntamento'));
alter table public.scadenze add column if not exists ora time;
alter table public.scadenze add column if not exists assegnata_a text;

-- Autore e data di creazione non cambiano; l'assegnatario (ne' autore ne' amministratore) cambia solo "fatto".
-- Le funzioni del server (es. Telegram, con la chiave di servizio) non hanno questi limiti.
create or replace function public.scadenze_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and public.mia_email() <> old.creato_da and not public.is_admin() then
    new.giorno := old.giorno; new.ora := old.ora; new.genere := old.genere; new.titolo := old.titolo; new.nota := old.nota;
    new.preventivo_id := old.preventivo_id; new.assegnata_a := old.assegnata_a; new.origine := old.origine;
  end if;
  return new;
end $$;

drop policy if exists "autore modifica scadenze" on public.scadenze;
create policy "autore modifica scadenze" on public.scadenze for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or assegnata_a = public.mia_email() or public.is_admin()))
  with check (public.is_staff());
