-- Documenti e note (DMS leggero): file e note scritte, legati a un preventivo/commessa, a una voce dell'agenda o a entrambi.
-- I file stanno nello Storage di Supabase (cartella privata "documenti"); qui ci sono nome, cartella, autore e percorso.
-- Tutti gli utenti leggono e aggiungono; modifica ed eliminazione spettano a chi l'ha caricato e all'amministratore.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261021000000_telegram.sql). Aggiunge una tabella, una cartella
-- dello Storage e le sue regole: non tocca preventivi, listino, utenti, scadenze.

create table if not exists public.documenti (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id text references public.preventivi (id) on delete set null,
  scadenza_id   uuid references public.scadenze (id) on delete set null,
  cartella      text not null default 'altro'
                check (cartella in ('cliente', 'disegni', 'fornitori', 'produzione', 'spedizione', 'montaggio', 'foto', 'altro')),
  tipo          text not null check (tipo in ('nota', 'file')),
  titolo        text not null check (length(trim(titolo)) between 1 and 200),
  testo         text,
  percorso      text unique,
  mime          text,
  dimensione    bigint,
  creato_da     text not null default public.mia_email(),
  creato        timestamptz not null default now(),
  modificato    timestamptz,
  -- Sempre legato a qualcosa: eliminare il preventivo o la voce d'agenda di un documento non e' possibile finche'
  -- il documento non viene tolto (o non resta legato all'altro). Cosi' un file non si perde per sbaglio.
  constraint documenti_legato check (preventivo_id is not null or scadenza_id is not null),
  constraint documenti_file check ((tipo = 'file') = (percorso is not null))
);
create index if not exists documenti_preventivo_idx on public.documenti (preventivo_id);
create index if not exists documenti_scadenza_idx on public.documenti (scadenza_id);

-- Autore, data e file non cambiano con le modifiche (si cambiano solo titolo, testo, cartella e collegamenti).
create or replace function public.documenti_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  new.tipo := old.tipo;
  new.percorso := old.percorso;
  new.mime := old.mime;
  new.dimensione := old.dimensione;
  new.modificato := now();
  return new;
end $$;
drop trigger if exists documenti_autore on public.documenti;
create trigger documenti_autore before update on public.documenti
  for each row execute function public.documenti_autore();

alter table public.documenti enable row level security;
drop policy if exists "staff legge documenti" on public.documenti;
drop policy if exists "staff crea documenti" on public.documenti;
drop policy if exists "autore modifica documenti" on public.documenti;
drop policy if exists "autore elimina documenti" on public.documenti;
create policy "staff legge documenti" on public.documenti for select to authenticated using (public.is_staff());
create policy "staff crea documenti" on public.documenti for insert to authenticated
  with check (public.is_staff() and creato_da = public.mia_email());
create policy "autore modifica documenti" on public.documenti for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()))
  with check (public.is_staff());
create policy "autore elimina documenti" on public.documenti for delete to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()));

-- Aggiornamento in tempo reale: i documenti di un collega compaiono senza ricaricare la pagina.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documenti') then
    alter publication supabase_realtime add table public.documenti;
  end if;
end $$;

-- Cartella privata dello Storage. 50 MB per file (limite del piano gratuito): dopo l'upgrade a Pro si puo' alzare
-- cambiando il numero qui sotto (in byte) e rieseguendo solo questa istruzione.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('documenti', 'documenti', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Regole sui file: leggere e caricare per tutti gli utenti abilitati; eliminare solo il file di un documento
-- caricato da se' (o da amministratore). Nessuno sovrascrive un file esistente.
drop policy if exists "staff legge file documenti" on storage.objects;
drop policy if exists "staff carica file documenti" on storage.objects;
drop policy if exists "autore elimina file documenti" on storage.objects;
create policy "staff legge file documenti" on storage.objects for select to authenticated
  using (bucket_id = 'documenti' and public.is_staff());
create policy "staff carica file documenti" on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti' and public.is_staff());
create policy "autore elimina file documenti" on storage.objects for delete to authenticated
  using (bucket_id = 'documenti' and public.is_staff() and (
    public.is_admin()
    or owner_id = auth.uid()::text
    or exists (select 1 from public.documenti d where d.percorso = storage.objects.name and d.creato_da = public.mia_email())
  ));

notify pgrst, 'reload schema';
