// Funzione Vercel: offerta PowerPoint → PDF per la scheda Invia preventivo, con ConvertAPI come il bot Telegram.
// CONVERTAPI_TOKEN resta solo sul server; la usa soltanto un utente attivo dell'app (token di accesso Supabase).
import { createClient } from '@supabase/supabase-js';
import { inPdf } from './_pdf.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  if (!process.env.CONVERTAPI_TOKEN) return json(500, { error: 'Sul server manca CONVERTAPI_TOKEN (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { error: 'Utente non attivo.' });

  const pptx = new Uint8Array(await req.arrayBuffer());
  if (!pptx.length) return json(400, { error: 'Manca il PowerPoint da convertire.' });
  const pdf = await inPdf(pptx, 'offerta.pptx');
  if (!pdf) return json(502, { error: 'ConvertAPI non ha convertito il file (conversioni finite o servizio non raggiungibile).' });
  return new Response(pdf as BlobPart, { status: 200, headers: { 'content-type': 'application/pdf' } });
}
