-- Archivio tecnico: memoria dei documenti per il consulente tecnico dell'assistente (ingegnere strutturista e geologo):
-- relazioni geologiche, prove di pull-out, calcoli, normative, schede tecniche e risposte salvate dalla chat.
-- Ogni documento e' condiviso (lo vedono tutti gli utenti) o privato (solo chi l'ha caricato); il legame a un preventivo e' facoltativo.
-- Alla prima lettura l'AI scrive la "scheda" (riassunto, valori e conclusioni con le pagine): l'assistente cerca li' e poi rilegge il file.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261025040000_allegati_note.sql). Aggiunge una tabella, una cartella
-- dello Storage e le loro regole: non tocca preventivi, documenti, listino, utenti, scadenze.

create table if not exists public.archivio_tecnico (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id text references public.preventivi (id) on delete set null,
  categoria     text not null default 'altro'
                check (categoria in ('geologia', 'pullout', 'calcolo', 'normativa', 'scheda', 'risposta', 'altro')),
  privato       boolean not null default false,
  titolo        text not null check (length(trim(titolo)) between 1 and 200),
  testo         text,                -- note scritte e risposte salvate dalla chat (senza file)
  scheda        text,                -- riassunto tecnico scritto dall'AI alla lettura del file
  letto         timestamptz,         -- quando e' stata scritta la scheda
  percorso      text unique,
  mime          text,
  dimensione    bigint,
  creato_da     text not null default public.mia_email(),
  creato        timestamptz not null default now(),
  modificato    timestamptz,
  constraint archivio_contenuto check (percorso is not null or testo is not null)
);
create index if not exists archivio_tecnico_preventivo_idx on public.archivio_tecnico (preventivo_id);

-- Autore, data e file non cambiano con le modifiche.
create or replace function public.archivio_tecnico_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  new.percorso := old.percorso;
  new.mime := old.mime;
  new.dimensione := old.dimensione;
  new.modificato := now();
  return new;
end $$;
drop trigger if exists archivio_tecnico_autore on public.archivio_tecnico;
create trigger archivio_tecnico_autore before update on public.archivio_tecnico
  for each row execute function public.archivio_tecnico_autore();

alter table public.archivio_tecnico enable row level security;
drop policy if exists "staff legge archivio" on public.archivio_tecnico;
drop policy if exists "staff crea archivio" on public.archivio_tecnico;
drop policy if exists "autore modifica archivio" on public.archivio_tecnico;
drop policy if exists "autore elimina archivio" on public.archivio_tecnico;
-- Un documento privato lo vede solo chi l'ha caricato (nemmeno l'amministratore).
create policy "staff legge archivio" on public.archivio_tecnico for select to authenticated
  using (public.is_staff() and (not privato or creato_da = public.mia_email()));
create policy "staff crea archivio" on public.archivio_tecnico for insert to authenticated
  with check (public.is_staff() and creato_da = public.mia_email());
create policy "autore modifica archivio" on public.archivio_tecnico for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or (public.is_admin() and not privato)))
  with check (public.is_staff());
create policy "autore elimina archivio" on public.archivio_tecnico for delete to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or (public.is_admin() and not privato)));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'archivio_tecnico') then
    alter publication supabase_realtime add table public.archivio_tecnico;
  end if;
end $$;

-- Cartella privata dello Storage, 50 MB per file come i documenti.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('archivio', 'archivio', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- File: si legge solo un file la cui riga si puo' leggere (i privati restano di chi li ha caricati); si carica liberamente,
-- si elimina il proprio. Nessuno sovrascrive un file esistente.
drop policy if exists "staff legge file archivio" on storage.objects;
drop policy if exists "staff carica file archivio" on storage.objects;
drop policy if exists "autore elimina file archivio" on storage.objects;
create policy "staff legge file archivio" on storage.objects for select to authenticated
  using (bucket_id = 'archivio' and public.is_staff() and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.archivio_tecnico a where a.percorso = storage.objects.name and (not a.privato or a.creato_da = public.mia_email()))
  ));
create policy "staff carica file archivio" on storage.objects for insert to authenticated
  with check (bucket_id = 'archivio' and public.is_staff());
create policy "autore elimina file archivio" on storage.objects for delete to authenticated
  using (bucket_id = 'archivio' and public.is_staff() and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.archivio_tecnico a where a.percorso = storage.objects.name
               and (a.creato_da = public.mia_email() or (public.is_admin() and not a.privato)))
  ));

notify pgrst, 'reload schema';
