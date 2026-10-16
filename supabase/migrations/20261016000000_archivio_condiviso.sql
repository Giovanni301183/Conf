-- Archivio preventivi e listino condivisi tra gli utenti dell'ufficio.
-- Accesso solo a utenti autenticati con email aziendale confermata (vedi is_staff()).

create or replace function public.is_staff() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@terranovasrl.net'
$$;

-- Un preventivo salvato: i campi di riepilogo per l'elenco, più preventivo e listino usati (jsonb).
create table if not exists public.preventivi (
  id          text primary key,
  nome        text not null,
  cliente     text,
  rif         text,
  data        text,
  salvato     timestamptz not null default now(),
  totale      double precision,
  prezzo      double precision,
  kwp         double precision,
  n_tracker   double precision,
  righe       text,
  prev        jsonb not null,
  dati        jsonb,
  creato_da   text default (auth.jwt() ->> 'email'),
  modificato_da text default (auth.jwt() ->> 'email')
);
create index if not exists preventivi_salvato_idx on public.preventivi (salvato desc);

-- Listino e distinte in uso: una sola riga (id = 1).
create table if not exists public.listino (
  id            int primary key default 1 check (id = 1),
  dati          jsonb not null,
  aggiornato    timestamptz not null default now(),
  modificato_da text default (auth.jwt() ->> 'email')
);

alter table public.preventivi enable row level security;
alter table public.listino enable row level security;

drop policy if exists "staff legge preventivi" on public.preventivi;
drop policy if exists "staff scrive preventivi" on public.preventivi;
create policy "staff legge preventivi" on public.preventivi for select to authenticated using (public.is_staff());
create policy "staff scrive preventivi" on public.preventivi for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff legge listino" on public.listino;
drop policy if exists "staff scrive listino" on public.listino;
create policy "staff legge listino" on public.listino for select to authenticated using (public.is_staff());
create policy "staff scrive listino" on public.listino for all to authenticated using (public.is_staff()) with check (public.is_staff());
