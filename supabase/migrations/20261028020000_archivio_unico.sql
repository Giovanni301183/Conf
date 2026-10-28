-- Archivio unico: i documenti tecnici sono normali Documenti con un'etichetta tecnica (Tecnico e progetto, Geologia e terreni,
-- Prove di pull-out, Normativa e schede tecniche), da qualunque parte arrivino (app, Telegram, email). L'Archivio tecnico
-- dell'app e l'esperto dell'assistente li leggono da qui.
-- Ogni documento puo' essere privato (lo vede solo chi l'ha caricato); per i file l'AI scrive una "scheda" (riassunto con valori e pagine).
-- Un file puo' anche restare libero (senza preventivo, voce d'agenda o nota): i collegamenti si aggiungono o cambiano quando si vuole.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261028010000_coinvolti.sql). Aggiunge tre colonne alla tabella documenti,
-- toglie un vincolo e aggiorna le regole di lettura; copia nei Documenti le note scritte nell'archivio tecnico di prova.

alter table public.documenti add column if not exists privato boolean not null default false;
alter table public.documenti add column if not exists scheda text;          -- riassunto tecnico scritto dall'AI alla lettura del file
alter table public.documenti add column if not exists letto timestamptz;    -- quando e' stata scritta la scheda

-- File liberi: il collegamento non e' piu' obbligatorio.
alter table public.documenti drop constraint if exists documenti_legato;

-- Autore, data e file non cambiano con le modifiche; privato/condiviso lo decide solo chi ha caricato il documento.
create or replace function public.documenti_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  new.tipo := old.tipo;
  new.percorso := old.percorso;
  new.mime := old.mime;
  new.dimensione := old.dimensione;
  if new.privato is distinct from old.privato and old.creato_da is distinct from public.mia_email() then
    new.privato := old.privato;
  end if;
  new.modificato := now();
  return new;
end $$;

-- Un documento privato lo vede, cambia ed elimina solo chi l'ha caricato (nemmeno l'amministratore).
drop policy if exists "staff legge documenti" on public.documenti;
drop policy if exists "autore modifica documenti" on public.documenti;
drop policy if exists "autore elimina documenti" on public.documenti;
create policy "staff legge documenti" on public.documenti for select to authenticated
  using (public.is_staff() and (not privato or creato_da = public.mia_email()));
create policy "autore modifica documenti" on public.documenti for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or (public.is_admin() and not privato)))
  with check (public.is_staff());
create policy "autore elimina documenti" on public.documenti for delete to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or (public.is_admin() and not privato)));

-- Il file di un documento privato si apre solo da chi l'ha caricato.
drop policy if exists "staff legge file documenti" on storage.objects;
create policy "staff legge file documenti" on storage.objects for select to authenticated
  using (bucket_id = 'documenti' and public.is_staff() and (
    owner_id = auth.uid()::text
    or not exists (select 1 from public.documenti d where d.percorso = storage.objects.name and d.privato and d.creato_da is distinct from public.mia_email())
  ));

-- Le note scritte nell'archivio tecnico di prova passano nei Documenti (una volta sola). I file caricati li' vanno ricaricati.
do $$
begin
  if to_regclass('public.archivio_tecnico') is not null then
    insert into public.documenti (tipo, cartella, titolo, testo, etichette, privato, preventivo_id, creato_da, creato)
    select 'nota', 'altro', a.titolo, coalesce(a.testo, a.scheda),
           array[case a.categoria when 'geologia' then 'geologia' when 'pullout' then 'pullout' when 'normativa' then 'normativa' when 'scheda' then 'normativa' else 'tecnico' end],
           a.privato, a.preventivo_id, a.creato_da, a.creato
    from public.archivio_tecnico a
    where a.percorso is null and coalesce(a.testo, a.scheda) is not null
      and not exists (select 1 from public.documenti d where d.tipo = 'nota' and d.titolo = a.titolo and d.creato = a.creato);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Quanti file dell'archivio di prova vanno ricaricati dalla nuova scheda (0 = nessuno).
select count(*) as file_da_ricaricare from public.archivio_tecnico where percorso is not null;
