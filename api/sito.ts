// Funzione Vercel: proposta delle condizioni di progetto dalla localita' per la scheda Invia preventivo dell'app,
// lo stesso calcolo del pulsante "Proponi dalla località" del modulo Telegram (_sito.ts). La usa solo un utente attivo dell'app.
import { createClient } from '@supabase/supabase-js';
import { propostaSito } from './_sito.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { ok: false, errore: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { ok: false, errore: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { ok: false, errore: 'Utente non attivo.' });

  const b = await req.json().catch(() => ({}));
  const lat = b.lat != null && b.lat !== '' ? Number(b.lat) : null, lng = b.lng != null && b.lng !== '' ? Number(b.lng) : null;
  if (!String(b.localita || '').trim() && (lat == null || lng == null)) return json(400, { ok: false, errore: 'Manca la località.' });
  try { return json(200, await propostaSito(String(b.localita || ''), lat, lng)); }
  catch (e) { return json(200, { ok: false, errore: (e as Error).message }); }
}
