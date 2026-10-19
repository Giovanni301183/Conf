-- Ognuno legge la propria riga dell'elenco utenti, anche se disattivato:
-- cosi' l'app distingue "account disattivato" da "non in elenco".
drop policy if exists "utente legge se stesso" on public.utenti;
create policy "utente legge se stesso" on public.utenti for select to authenticated using (email = public.mia_email());

-- Ultimo accesso di ogni utente (da auth.users, che il browser non puo' leggere): solo per l'amministratore.
create or replace function public.ultimi_accessi() returns table (email text, ultimo_accesso timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(u.email)::text, u.last_sign_in_at from auth.users u where public.is_admin()
$$;
revoke execute on function public.ultimi_accessi() from public, anon;
grant execute on function public.ultimi_accessi() to authenticated;
