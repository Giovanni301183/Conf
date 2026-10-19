"""Crea (se manca) l'account di accesso, lo abilita nell'app e stampa un link, valido una volta, per scegliere la password.
Serve quando l'email di invito o di recupero non arriva (es. servizio email standard di Supabase).

Uso:  python scripts/primo-accesso.py nome.cognome@terranovasrl.net
Legge SUPABASE_ACCESS_TOKEN da .env.local; non stampa chiavi. Il link e' personale: non inoltrarlo.
"""
import json, os, re, sys, urllib.error, urllib.request

REF = 'exkrxxidecsrpkbhrqkp'
SITE = 'https://conf-five.vercel.app'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def call(method, url, headers, body=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={**headers, 'Content-Type': 'application/json', 'User-Agent': 'conf-setup'})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or 'null')


def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    email = sys.argv[1].strip().lower()
    env = dict(m.groups() for m in re.finditer(r'^([A-Z_]+)=(.*)$', open(os.path.join(ROOT, '.env.local'), encoding='utf-8').read(), re.M))
    tok = env.get('SUPABASE_ACCESS_TOKEN') or sys.exit('In .env.local manca SUPABASE_ACCESS_TOKEN.')

    st, keys = call('GET', f'https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true', {'Authorization': 'Bearer ' + tok})
    if st != 200: sys.exit(f'Chiavi non lette ({st}): {keys}')
    srv = next(k['api_key'] for k in keys if k['name'] == 'service_role')
    H = {'apikey': srv, 'Authorization': 'Bearer ' + srv}
    auth = f'https://{REF}.supabase.co/auth/v1'

    st, r = call('POST', auth + '/admin/users', H, {'email': email, 'email_confirm': True})
    if st in (200, 201): print('Account creato per', email)
    elif st == 422 or 'already' in json.dumps(r): print('Account gia\' esistente per', email)
    else: sys.exit(f'Creazione account non riuscita ({st}): {r}')

    # Abilitazione nell'app: se l'utente e' gia' in elenco, ruolo e stato restano quelli impostati dalla pagina Utenti.
    st, r = call('POST', f'https://{REF}.supabase.co/rest/v1/utenti?on_conflict=email', {**H, 'Prefer': 'resolution=ignore-duplicates'}, {'email': email})
    if st not in (200, 201): sys.exit(f'Abilitazione nell\'app non riuscita ({st}): {r}')
    st, r = call('GET', f'https://{REF}.supabase.co/rest/v1/utenti?select=ruolo,attivo&email=eq.{email}', H)
    u = r[0] if st == 200 and r else {}
    if u.get('attivo'): print(f"Abilitato nell'app come {u['ruolo']}")
    else: print("ATTENZIONE: nell'app risulta DISATTIVATO. Riattivalo dalla pagina Utenti, altrimenti vedra' \"Account non abilitato\".")

    st, r = call('POST', auth + '/admin/generate_link', H, {'type': 'recovery', 'email': email, 'redirect_to': SITE})
    link = r and (r.get('action_link') or (r.get('properties') or {}).get('action_link'))
    if not link: sys.exit(f'Link non generato ({st}): {r}')
    print('\nApri questo link nel browser (vale una volta sola, scade presto) e scegli la password:\n')
    print(link)


main()
