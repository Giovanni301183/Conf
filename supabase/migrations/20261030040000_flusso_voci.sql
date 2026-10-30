-- Flusso delle voci d'agenda fino alla chiusura. Oltre a "fatto" (che resta, per Telegram, n8n e le versioni vecchie) c'e' lo stato:
--   aperta -> in_corso ("La prendo io") -> in_attesa (di chi + data del sollecito) -> fatta (con l'esito) -> chiusa (confermata da chi l'ha creata)
--   annullata (con motivo): la decide l'amministratore; l'autore da solo solo se la voce e' ancora intatta (nessun passaggio, nota, file o messaggio),
--   altrimenti chiede l'annullamento e decide l'amministratore. La stessa regola vale per l'eliminazione.
-- fatto = stato fatta, chiusa o annullata: se un programma vecchio cambia solo "fatto", lo stato segue da solo (e viceversa).
-- Chi chiude una voce che ha creato lui la chiude subito; se la chiude un altro, la voce aspetta la conferma dell'autore.
-- Rinvio: spostare piu' avanti una voce gia' arrivata alla sua data conta un rinvio. Ogni passaggio finisce nello storico (scadenze_eventi).
-- motivo e da_chi non restano sulla voce: servono solo a scrivere lo storico (da_chi lo usano le funzioni del server, es. Telegram).
-- Da eseguire una volta nel SQL Editor di Supabase (dopo 20261030030000_settori_mappa.sql). Aggiunge colonne, una tabella e cambia trigger e regole.

alter table public.scadenze add column if not exists stato text not null default 'aperta'
  check (stato in ('aperta', 'in_corso', 'in_attesa', 'fatta', 'chiusa', 'annullata'));
alter table public.scadenze add column if not exists esito text;
alter table public.scadenze add column if not exists attesa_di text;
alter table public.scadenze add column if not exists sollecito date;
alter table public.scadenze add column if not exists seguito_di uuid references public.scadenze (id) on delete set null;
alter table public.scadenze add column if not exists rinvii int not null default 0;
alter table public.scadenze add column if not exists passaggi int not null default 0;
alter table public.scadenze add column if not exists annullo_chiesto text;
alter table public.scadenze add column if not exists annullo_da text;
alter table public.scadenze add column if not exists motivo text;
alter table public.scadenze add column if not exists da_chi text;
update public.scadenze set stato = 'chiusa' where fatto and stato = 'aperta';

create table if not exists public.scadenze_eventi (
  id          bigint generated always as identity primary key,
  scadenza_id uuid not null references public.scadenze (id) on delete cascade,
  quando      timestamptz not null default now(),
  chi         text,                  -- vuoto = dal server (Telegram, email) senza sapere chi
  cosa        text not null,         -- stato, rinvio, annullo_chiesto, annullo_rifiutato
  da          text,
  a           text,
  testo       text
);
create index if not exists scadenze_eventi_voce on public.scadenze_eventi (scadenza_id, quando);
alter table public.scadenze_eventi enable row level security;
drop policy if exists "staff legge eventi" on public.scadenze_eventi;
create policy "staff legge eventi" on public.scadenze_eventi for select to authenticated using (public.is_staff());
-- Nessuna regola di scrittura: lo storico lo scrive solo il trigger qui sotto.

create or replace function public.scadenze_evento(v uuid, chi text, cosa text, da text, a text, testo text) returns void
language sql security definer set search_path = public as $$
  insert into public.scadenze_eventi (scadenza_id, chi, cosa, da, a, testo) values (v, nullif(chi, ''), cosa, da, a, nullif(trim(testo), ''));
$$;

-- Intatta: ancora aperta, senza passaggi, senza note o file e senza messaggi della chat legati (anche privati degli altri).
create or replace function public.voce_intatta(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.scadenze s where s.id = v and s.stato = 'aperta' and s.passaggi = 0)
     and not exists (select 1 from public.documenti d where d.scadenza_id = v)
     and not exists (select 1 from public.messaggi m where m.rif_voce = v)
$$;

create or replace function public.scadenze_autore() returns trigger
language plpgsql as $$
declare
  utente boolean := coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
  chi text := case when utente then public.mia_email() else coalesce(new.da_chi, '') end;
  admin boolean := not utente or public.is_admin();   -- le funzioni del server hanno gli stessi poteri dell'amministratore
  autore boolean := chi = old.creato_da;
  mot text := new.motivo;
begin
  new.creato_da := old.creato_da;
  new.creato := old.creato;
  new.motivo := null; new.da_chi := null;
  new.passaggi := old.passaggi; new.rinvii := old.rinvii;
  -- Chi non e' ne' autore ne' amministratore cambia solo lo stato, l'esito, l'attesa e la richiesta di annullamento.
  -- Eccezione: una voce per chiunque la puo' prendere in carico chi la sta guardando ("La prendo io").
  if utente and not autore and not admin then
    if not (old.assegnata_a is null and new.assegnata_a = chi and new.stato = 'in_corso') then new.assegnata_a := old.assegnata_a; end if;
    new.giorno := old.giorno; new.ora := old.ora; new.genere := old.genere; new.categoria := old.categoria; new.titolo := old.titolo; new.nota := old.nota;
    new.preventivo_id := old.preventivo_id; new.coinvolti := old.coinvolti; new.origine := old.origine; new.seguito_di := old.seguito_di;
  end if;

  -- Stato e "fatto" vanno d'accordo: vince quello che e' cambiato.
  if new.stato is distinct from old.stato then
    new.fatto := new.stato in ('fatta', 'chiusa', 'annullata');
  elsif new.fatto is distinct from old.fatto then
    new.stato := case when new.fatto then 'fatta' when old.assegnata_a is not null then 'in_corso' else 'aperta' end;
  end if;
  -- Chi chiude una voce sua la chiude subito; da Telegram senza sapere chi, la chiude subito solo se non era per un altro.
  if new.stato = 'fatta' and old.stato <> 'fatta' and (autore or (chi = '' and coalesce(new.assegnata_a, old.creato_da) = old.creato_da)) then
    new.stato := 'chiusa';
  end if;

  if new.stato is distinct from old.stato then
    if new.stato = 'annullata' and not admin and not (autore and public.voce_intatta(old.id)) then
      raise exception 'Annullare questa voce spetta all''amministratore: chiedi l''annullamento';
    end if;
    if old.stato = 'annullata' and not admin and not autore then
      raise exception 'Una voce annullata la rimettono in agenda solo chi l''ha creata e l''amministratore';
    end if;
    if new.stato = 'chiusa' and old.stato = 'fatta' and not admin and not autore then
      raise exception 'La chiusura la conferma chi ha creato la voce (o l''amministratore)';
    end if;
    if old.stato = 'chiusa' and not admin and not autore then
      raise exception 'Una voce chiusa la riaprono solo chi l''ha creata e l''amministratore';
    end if;
    if new.stato <> 'in_attesa' then new.attesa_di := null; new.sollecito := null; end if;
    if new.stato in ('aperta', 'in_corso', 'in_attesa') and old.stato in ('fatta', 'chiusa', 'annullata') then new.esito := null; end if;
    if new.stato = 'annullata' then new.annullo_chiesto := null; new.annullo_da := null; end if;
    perform public.scadenze_evento(old.id, chi, 'stato', old.stato, new.stato,
      case when new.stato in ('fatta', 'chiusa') and old.stato <> 'fatta' then coalesce(new.esito, mot)
           when new.stato = 'in_attesa' then concat_ws(' · ', 'di ' || new.attesa_di, 'sollecito il ' || to_char(new.sollecito, 'DD/MM/YYYY'), mot)
           else mot end);
    new.passaggi := new.passaggi + 1;
  elsif new.stato = 'in_attesa' and (new.attesa_di is distinct from old.attesa_di or new.sollecito is distinct from old.sollecito) then
    perform public.scadenze_evento(old.id, chi, 'stato', old.stato, new.stato,
      concat_ws(' · ', 'di ' || new.attesa_di, 'sollecito il ' || to_char(new.sollecito, 'DD/MM/YYYY'), mot));
    new.passaggi := new.passaggi + 1;
  end if;

  -- Rinvio: la voce era gia' arrivata alla sua data (o scaduta) e la si sposta piu' avanti.
  if new.giorno > old.giorno and old.giorno <= current_date and not new.fatto then
    new.rinvii := new.rinvii + 1; new.passaggi := new.passaggi + 1;
    perform public.scadenze_evento(old.id, chi, 'rinvio', old.giorno::text, new.giorno::text, mot);
  end if;

  -- Richiesta di annullamento all'amministratore: la fa chiunque segue la voce; la toglie l'amministratore (rifiuto) o chi l'ha chiesta.
  if new.annullo_chiesto is distinct from old.annullo_chiesto then
    if new.annullo_chiesto is not null then
      new.annullo_da := nullif(chi, '');
      new.passaggi := new.passaggi + 1;
      perform public.scadenze_evento(old.id, chi, 'annullo_chiesto', null, null, new.annullo_chiesto);
    elsif new.stato <> 'annullata' then
      if not admin and chi is distinct from old.annullo_da then
        raise exception 'La richiesta di annullamento la toglie l''amministratore (o chi l''ha fatta)';
      end if;
      new.annullo_da := null;
      perform public.scadenze_evento(old.id, chi, 'annullo_rifiutato', null, null, mot);
    end if;
  end if;
  return new;
end $$;

-- Voci nuove: chi ne crea una gia' fatta (programmi vecchi) la crea chiusa; motivo e da_chi non restano.
create or replace function public.scadenze_nuova() returns trigger
language plpgsql as $$
begin
  if new.fatto then new.stato := 'chiusa'; else new.fatto := new.stato in ('fatta', 'chiusa', 'annullata'); end if;
  new.motivo := null; new.da_chi := null; new.passaggi := 0; new.rinvii := 0;
  return new;
end $$;
drop trigger if exists scadenze_nuova on public.scadenze;
create trigger scadenze_nuova before insert on public.scadenze
  for each row execute function public.scadenze_nuova();

-- Una voce per chiunque la puo' aggiornare ogni collega (per prenderla in carico); i campi li protegge il trigger.
drop policy if exists "autore modifica scadenze" on public.scadenze;
create policy "autore modifica scadenze" on public.scadenze for update to authenticated
  using (public.is_staff() and (creato_da = public.mia_email() or assegnata_a = public.mia_email() or assegnata_a is null
    or public.mia_email() = any(coinvolti) or public.is_admin()))
  with check (public.is_staff());
-- Eliminare: l'amministratore sempre, l'autore solo una voce intatta.
drop policy if exists "autore elimina scadenze" on public.scadenze;
create policy "autore elimina scadenze" on public.scadenze for delete to authenticated
  using (public.is_staff() and (public.is_admin() or (creato_da = public.mia_email() and public.voce_intatta(id))));

notify pgrst, 'reload schema';
