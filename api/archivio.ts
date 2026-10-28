// Funzione Vercel: lettura di un documento dell'archivio tecnico (un file dei Documenti con etichetta tecnica). Claude legge il file (PDF, immagine o testo) e ne scrive la scheda
// (riassunto con valori e pagine) che l'assistente usa per ritrovarlo. Solo per utenti attivi e solo sui documenti che vedono.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { archivioDi, scriviScheda } from './_esperto.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Sul server manca ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { error: 'Utente non attivo.' });

  const b = await req.json().catch(() => null);
  try {
    const d = (await archivioDi(admin, me)).find(x => x.id === String(b?.id || ''));
    if (!d) return json(404, { error: 'Documento non trovato.' });
    if (!d.percorso) return json(400, { error: 'Una nota scritta non ha un file da leggere.' });
    return json(200, { scheda: await scriviScheda(admin, new Anthropic(), d) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: 'Chiave ANTHROPIC_API_KEY non valida.' });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'Troppe richieste o credito esaurito su Anthropic: riprova tra poco.' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Errore dal servizio AI (${e.status}): ${e.message}` });
    return json(500, { error: (e as Error).message });
  }
}
