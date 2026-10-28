-- Cosa vede ciascuno nel calendario (scelta personale): voci degli altri, date delle commesse, richiami, urgenze, commesse seguite.
-- Vuota = vede tutto, come prima. La usa anche il riepilogo personale su Telegram.
alter table public.utenti add column if not exists vista jsonb;

-- Ognuno cambia solo la propria scelta (le regole RLS lasciano scrivere su utenti solo all'amministratore,
-- che puo' comunque impostarla per conto di un collega dalla pagina Utenti).
create or replace function public.salva_mia_vista(v jsonb) returns void
language sql security definer set search_path = public as $$
  update public.utenti set vista = v where email = public.mia_email() and public.is_staff()
$$;
revoke all on function public.salva_mia_vista(jsonb) from public;
grant execute on function public.salva_mia_vista(jsonb) to authenticated;
