// Funzione Vercel: dall'appunto (nota dei documenti) Claude scrive oggetto e testo di un'email di aggiornamento (vedi _email.ts).
// Non invia niente: l'app apre la bozza nel Gmail di chi l'ha chiesta, che la rilegge e preme Invia.
import { createClient } from '@supabase/supabase-js';
import { scriviBozza } from './_email.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo, nome').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { error: 'Utente non attivo.' });

  const b = await req.json().catch(() => null);
  const r = await scriviBozza({ titolo: String(b?.titolo || ''), testo: String(b?.testo || ''), contesto: String(b?.contesto || ''), richiesta: String(b?.richiesta || '') },
    row.nome || me.split('@')[0]);
  return 'errore' in r ? json(r.status, { error: r.errore }) : json(200, r);
}
