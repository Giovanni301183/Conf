// Funzione Vercel: dall'appunto (nota dei documenti) Claude scrive oggetto e testo di un'email di aggiornamento (vedi _email.ts).
// Con azione "risposta": riassume l'email di risposta incollata nell'app («Risposta arrivata» sulla voce in attesa, vedi _posta.ts).
// Non invia niente: l'app apre la bozza nel Gmail di chi l'ha chiesta, che la rilegge e preme Invia.
import { createClient } from '@supabase/supabase-js';
import { scriviBozza } from './_email.js';
import { leggiEmail } from './_posta.js';
import { inArrivo, sceltaPosta } from './agenda.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo, nome, ruolo').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { error: 'Utente non attivo.' });

  const b = await req.json().catch(() => null);
  // «In arrivo»: email etichettate o inoltrate da sistemare, e la scelta fatta nell'app (stessa logica dei pulsanti Telegram).
  if (b?.azione === 'in_arrivo' || b?.azione === 'in_arrivo_scelta') {
    const io = { email: me, nome: row.nome, ruolo: row.ruolo };
    const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
    const r: any = b.azione === 'in_arrivo' ? await inArrivo(admin as any, io) : await sceltaPosta(admin as any, { ...b, origine: 'app' }, io, oggi);
    return r.ok ? json(200, r) : json(400, { error: r.errore });
  }
  if (b?.azione === 'risposta') {
    const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
    const l = await leggiEmail({ da: '', oggetto: String(b.oggetto || ''), testo: String(b.testo || '') }, [], oggi);
    return 'errore' in l ? json(500, { error: l.errore }) : json(200, { titolo: l.titolo, riassunto: l.riassunto });
  }
  const r = await scriviBozza({ titolo: String(b?.titolo || ''), testo: String(b?.testo || ''), contesto: String(b?.contesto || ''), richiesta: String(b?.richiesta || '') },
    row.nome || me.split('@')[0]);
  return 'errore' in r ? json(r.status, { error: r.errore }) : json(200, r);
}
