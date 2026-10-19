"""Collega il progetto Supabase all'app su Vercel, una volta sola.

1. crea tabelle, regole di accesso e ruoli (supabase/migrations/*.sql, in ordine);
2. imposta l'indirizzo dell'app per i link di invito e recupero password;
3. mette URL e chiavi del progetto nelle variabili d'ambiente di Vercel;
4. aggiorna .env.local, cosi' anche l'app in locale usa lo stesso progetto.

Legge SUPABASE_ACCESS_TOKEN e VERCEL_TOKEN da .env.local e non stampa mai chiavi o token.
Uso:  python scripts/collega-supabase-vercel.py
"""
import glob, json, os, re, sys, urllib.error, urllib.request

REF = 'exkrxxidecsrpkbhrqkp'          # progetto Supabase "Conf"
VERCEL_PROJECT = 'conf'
SITE = 'https://conf-five.vercel.app'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, '.env.local')


def env_file():
    vals = {}
    for line in open(ENV, encoding='utf-8'):
        m = re.match(r'^([A-Z_]+)=(.*)$', line.strip())
        if m: vals[m[1]] = m[2]
    return vals


def call(method, url, token, body=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'conf-setup'})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        sys.exit(f'ERRORE {e.code} su {method} {url.split("?")[0]}:\n{e.read().decode()[:800]}')


def main():
    E = env_file()
    sb, vc = E.get('SUPABASE_ACCESS_TOKEN'), E.get('VERCEL_TOKEN')
    if not sb or not vc: sys.exit('In .env.local mancano SUPABASE_ACCESS_TOKEN o VERCEL_TOKEN.')
    api = f'https://api.supabase.com/v1/projects/{REF}'

    print('1. Database')
    tabs = call('POST', api + '/database/query', sb, {'query': "select table_name from information_schema.tables where table_schema='public' order by 1"})
    print('   tabelle gia\' presenti:', ', '.join(t['table_name'] for t in tabs) or 'nessuna')
    for f in sorted(glob.glob(os.path.join(ROOT, 'supabase', 'migrations', '*.sql'))):
        call('POST', api + '/database/query', sb, {'query': open(f, encoding='utf-8').read()})
        print('   eseguito', os.path.basename(f))
    adm = call('POST', api + '/database/query', sb, {'query': "select email, ruolo, attivo from public.utenti order by ruolo, email"})
    for u in adm: print(f"   utente {u['email']}: {u['ruolo']}{'' if u['attivo'] else ' (disattivato)'}")

    print('2. Indirizzo dell\'app per inviti e recupero password')
    call('PATCH', api + '/config/auth', sb, {'site_url': SITE, 'uri_allow_list': f'{SITE},{SITE}/**,http://localhost:5173,http://localhost:5173/**'})
    print('  ', SITE)

    print('3. Variabili d\'ambiente su Vercel')
    keys = {k['name']: k.get('api_key') for k in call('GET', api + '/api-keys?reveal=true', sb)}
    anon, service = keys.get('anon'), keys.get('service_role')
    if not anon or not service: sys.exit('Chiavi anon/service_role non trovate nel progetto Supabase.')
    url = f'https://{REF}.supabase.co'
    pr = call('GET', f'https://api.vercel.com/v9/projects/{VERCEL_PROJECT}', vc)
    q = f"?upsert=true&teamId={pr['accountId']}"
    for key, value, target, typ in [
        ('VITE_SUPABASE_URL', url, ['production', 'preview', 'development'], 'plain'),
        ('VITE_SUPABASE_ANON_KEY', anon, ['production', 'preview', 'development'], 'plain'),
        ('SUPABASE_SERVICE_ROLE_KEY', service, ['production', 'preview'], 'sensitive'),
    ]:
        call('POST', f"https://api.vercel.com/v10/projects/{pr['id']}/env{q}", vc, {'key': key, 'value': value, 'target': target, 'type': typ})
        print('  ', key, '→', ', '.join(target))

    print('4. .env.local')
    txt = open(ENV, encoding='utf-8').read()
    for k, v in [('VITE_SUPABASE_URL', url), ('VITE_SUPABASE_ANON_KEY', anon)]:
        old = re.search(rf'^{k}=(.*)$', txt, re.M)
        if old and old[1] != v: txt = txt.replace(old[0], (f'# vecchio progetto: {old[0]}\n' if old[1] else '') + f'{k}={v}', 1)
        elif not old: txt += f'\n{k}={v}\n'
    open(ENV, 'w', encoding='utf-8', newline='').write(txt)
    print('   aggiornato (i valori del vecchio progetto restano commentati)')
    print('\nFatto. Ora serve una nuova pubblicazione su Vercel perche\' le variabili abbiano effetto.')


main()
