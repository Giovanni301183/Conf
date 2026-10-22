"""Copia di sicurezza delle tabelle dell'app (preventivi, listino, utenti, scadenze, documenti) in backup/AAAA-MM-GG_HHMM.json
e dei file dei documenti (Storage, cartella "documenti") in backup/AAAA-MM-GG_HHMM_documenti/.
Da lanciare prima di una migrazione del database.

Uso:  python scripts/backup.py
Legge SUPABASE_ACCESS_TOKEN da .env.local; non stampa chiavi. La cartella backup/ non va su GitHub.
"""
import datetime, json, os, re, sys, urllib.error, urllib.parse, urllib.request

REF = 'exkrxxidecsrpkbhrqkp'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABELLE = ['preventivi', 'listino', 'utenti', 'scadenze', 'documenti']
FACOLTATIVE = {'scadenze', 'documenti'}   # tabelle che possono non esistere ancora


def call(method, url, headers):
    req = urllib.request.Request(url, method=method, headers={**headers, 'User-Agent': 'conf-setup'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or 'null')


def file_storage(H, prefisso=''):
    """Percorsi di tutti i file della cartella "documenti" dello Storage (le sottocartelle si esplorano una per una)."""
    out, off = [], 0
    while True:
        body = json.dumps({'prefix': prefisso, 'limit': 1000, 'offset': off}).encode()
        req = urllib.request.Request(f'https://{REF}.supabase.co/storage/v1/object/list/documenti', data=body, method='POST',
                                     headers={**H, 'Content-Type': 'application/json', 'User-Agent': 'conf-setup'})
        with urllib.request.urlopen(req) as r: voci = json.loads(r.read().decode() or '[]')
        for v in voci:
            p = (prefisso + '/' if prefisso else '') + v['name']
            if v.get('id') is None: out += file_storage(H, p)   # senza id = sottocartella
            else: out.append(p)
        if len(voci) < 1000: return out
        off += 1000


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
        elif t in FACOLTATIVE: print(f'{t}: tabella non ancora creata')
        else: sys.exit(f'{t} non letta ({st}): {rows}')
    os.makedirs(os.path.join(ROOT, 'backup'), exist_ok=True)
    nome = datetime.datetime.now().strftime('%Y-%m-%d_%H%M')
    path = os.path.join(ROOT, 'backup', nome + '.json')
    with open(path, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
    print('Salvato in', path)

    # File dei documenti: solo se la cartella dello Storage esiste (migrazione 20261022000000_documenti.sql eseguita).
    try: files = file_storage(H)
    except urllib.error.HTTPError as e:
        print('Documenti: cartella dello Storage non ancora creata' if e.code in (400, 404) else f'Documenti: elenco non letto ({e.code})'); return
    cart = os.path.join(ROOT, 'backup', nome + '_documenti')
    for p in files:
        dest = os.path.join(cart, *p.split('/'))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        req = urllib.request.Request(f'https://{REF}.supabase.co/storage/v1/object/documenti/{urllib.parse.quote(p)}', headers={**H, 'User-Agent': 'conf-setup'})
        with urllib.request.urlopen(req) as r, open(dest, 'wb') as f: f.write(r.read())
    print(f'Documenti: {len(files)} file salvati in {cart}' if files else 'Documenti: nessun file')


main()
