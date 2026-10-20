"""Copia di sicurezza delle tabelle dell'app (preventivi, listino, utenti, scadenze) in backup/AAAA-MM-GG_HHMM.json.
Da lanciare prima di una migrazione del database.

Uso:  python scripts/backup.py
Legge SUPABASE_ACCESS_TOKEN da .env.local; non stampa chiavi. La cartella backup/ non va su GitHub.
"""
import datetime, json, os, re, sys, urllib.error, urllib.request

REF = 'exkrxxidecsrpkbhrqkp'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABELLE = ['preventivi', 'listino', 'utenti', 'scadenze']


def call(method, url, headers):
    req = urllib.request.Request(url, method=method, headers={**headers, 'User-Agent': 'conf-setup'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or 'null')


def main():
    env = dict(m.groups() for m in re.finditer(r'^([A-Z_]+)=(.*)$', open(os.path.join(ROOT, '.env.local'), encoding='utf-8').read(), re.M))
    tok = env.get('SUPABASE_ACCESS_TOKEN') or sys.exit('In .env.local manca SUPABASE_ACCESS_TOKEN.')
    st, keys = call('GET', f'https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true', {'Authorization': 'Bearer ' + tok})
    if st != 200: sys.exit(f'Chiavi non lette ({st}): {keys}')
    srv = next(k['api_key'] for k in keys if k['name'] == 'service_role')
    H = {'apikey': srv, 'Authorization': 'Bearer ' + srv}

    out = {}
    for t in TABELLE:
        st, rows = call('GET', f'https://{REF}.supabase.co/rest/v1/{t}?select=*', H)
        if st == 200: out[t] = rows; print(f'{t}: {len(rows)} righe')
        elif t == 'scadenze': print('scadenze: tabella non ancora creata')
        else: sys.exit(f'{t} non letta ({st}): {rows}')
    os.makedirs(os.path.join(ROOT, 'backup'), exist_ok=True)
    path = os.path.join(ROOT, 'backup', datetime.datetime.now().strftime('%Y-%m-%d_%H%M') + '.json')
    with open(path, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
    print('Salvato in', path)


main()
