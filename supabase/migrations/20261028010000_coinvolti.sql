-- Agenda: oltre a chi ha la voce assegnata (il responsabile), altri colleghi coinvolti. La vedono come fosse loro,
-- possono segnarla come fatta (basta uno) e aggiungerle note e file; titolo, data, nota e persone li cambiano
-- solo chi l'ha creata e l'amministratore.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261020010000_agenda.sql). Aggiunge una colonna.

alter table public.scadenze add column if not exists coinvolti text[] not null default '{}';

create or replace function public.scadenze_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and public.mia_email() <> old.creato_da and not public.is_admin() then
    new.giorno := old.giorno; new.ora := old.ora; new.genere := old.genere; new.categoria := old.categoria; new.titolo := old.titolo; new.nota := old.nota;
    new.preventivo_id := old.preventivo_id; new.assegnata_a := old.assegnata_a; new.coinvolti := old.coinvolti; new.origine := old.origine;
  end if;
  return new;
end $$;

drop policy if exists "autore modifica scadenze" on public.scadenze;
create policy "autore modifica scadenze" on public.scadenze for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or assegnata_a = public.mia_email()
    or public.mia_email() = any(coinvolti) or public.is_admin()))
  with check (public.is_staff());
