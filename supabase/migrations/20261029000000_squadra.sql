-- Chat di squadra: i colleghi si scrivono dentro l'app (pannello «Squadra» accanto all'assistente), i messaggi arrivano a tutti in tempo reale.
-- Da un tratto di conversazione l'AI propone una nota (titolo, riassunto, decisioni, cose da fare, commessa, etichette): confermata, va nei Documenti
-- e i messaggi usati ricordano la nota (nota_id). Un file mandato in chat e' un normale Documento (libero), qui c'e' solo il collegamento.
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261028020000_archivio_unico.sql). Aggiunge solo una tabella.

create table if not exists public.messaggi (
  id           uuid primary key default gen_random_uuid(),
  testo        text,
  documento_id uuid references public.documenti (id) on delete set null,   -- file allegato al messaggio
  nota_id      uuid references public.documenti (id) on delete set null,   -- nota nata dal tratto di conversazione che contiene il messaggio
  creato_da    text not null default public.mia_email(),
  creato       timestamptz not null default now(),
  constraint messaggio_pieno check (testo is not null or documento_id is not null)
);
create index if not exists messaggi_creato on public.messaggi (creato desc);

-- Autore e data non cambiano; testo e file li cambia solo chi ha scritto il messaggio. La nota la puo' segnare chiunque (chi crea la nota).
create or replace function public.messaggi_autore() returns trigger
language plpgsql as $$
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  if old.creato_da is distinct from public.mia_email() then
    new.testo := old.testo;
    new.documento_id := old.documento_id;
  end if;
  return new;
end $$;
drop trigger if exists messaggi_autore on public.messaggi;
create trigger messaggi_autore before update on public.messaggi for each row execute function public.messaggi_autore();

alter table public.messaggi enable row level security;
drop policy if exists "staff legge messaggi" on public.messaggi;
drop policy if exists "staff scrive messaggi" on public.messaggi;
drop policy if exists "staff segna messaggi" on public.messaggi;
drop policy if exists "autore elimina messaggi" on public.messaggi;
create policy "staff legge messaggi" on public.messaggi for select to authenticated using (public.is_staff());
create policy "staff scrive messaggi" on public.messaggi for insert to authenticated
  with check (public.is_staff() and creato_da = public.mia_email());
create policy "staff segna messaggi" on public.messaggi for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "autore elimina messaggi" on public.messaggi for delete to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or public.is_admin()));

-- Messaggi nuovi a tutti in tempo reale.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messaggi') then
    alter publication supabase_realtime add table public.messaggi;
  end if;
end $$;

notify pgrst, 'reload schema';
