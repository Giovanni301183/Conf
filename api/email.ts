// Funzione Vercel: dall'appunto (nota dei documenti) Claude scrive oggetto e testo di un'email di aggiornamento.
// Non invia niente: l'app apre la bozza nel Gmail di chi l'ha chiesta, che la rilegge e preme Invia.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MODELLO = 'claude-opus-5-5';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Risposta strutturata: JSON con oggetto e testo (su questo modello non si può forzare l'uso di uno strumento).
const SCHEMA = {
  type: 'object',
  properties: {
    oggetto: { type: 'string', description: "Oggetto breve e chiaro, con il riferimento della commessa se c'è." },
    testo: { type: 'string', description: 'Corpo in testo semplice (niente markdown), con saluto iniziale e chiusura firmata col nome del mittente.' },
  },
  required: ['oggetto', 'testo'],
  additionalProperties: false,
};

const sistema = (mittente: string) => `Sei l'assistente di Terranova S.r.l. (strutture per fotovoltaico, serre e agricoltura).
Trasforma l'appunto interno che ti passo in un'email di aggiornamento professionale in italiano, da mandare a clienti, fornitori o colleghi.
Regole:
- Usa solo le informazioni dell'appunto e del contesto: non inventare date, quantità, prezzi o impegni.
- Tono cordiale e diretto, frasi brevi; elenco puntato con "- " solo se ci sono più punti distinti.
- Togli abbreviazioni e note personali che non devono arrivare al destinatario.
- Se l'appunto indica a chi è rivolto, saluta di conseguenza; altrimenti usa "Buongiorno,".
- Chiudi con "Cordiali saluti," e il nome del mittente: ${mittente}.
Rispondi con il JSON richiesto (oggetto e testo).`;

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Sul server manca ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('attivo, nome').eq('email', me).maybeSingle();
  if (!row || !row.attivo) return json(403, { error: 'Utente non attivo.' });

  const b = await req.json().catch(() => null);
  const titolo = String(b?.titolo || '').slice(0, 300), testo = String(b?.testo || '').slice(0, 20_000), contesto = String(b?.contesto || '').slice(0, 2000);
  const richiesta = String(b?.richiesta || '').slice(0, 2000);
  if (!titolo.trim() && !testo.trim()) return json(400, { error: "L'appunto è vuoto." });
  const mittente = row.nome || me.split('@')[0];
  const domanda = [contesto && `Contesto: ${contesto}`, `Titolo dell'appunto: ${titolo}`, `Appunto:\n${testo || '(solo titolo)'}`,
    richiesta && `Indicazioni per l'email: ${richiesta}`].filter(Boolean).join('\n\n');

  try {
    const r = await new Anthropic().beta.messages.create({
      model: MODELLO, max_tokens: 4000, system: sistema(mittente), messages: [{ role: 'user', content: domanda }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // Se il modello declina, la richiesta riparte da sola sul modello di riserva consigliato da Anthropic.
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (r.stop_reason === 'refusal') return json(502, { error: 'Il servizio AI non ha voluto scrivere questa email.' });
    const out = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('');
    let x: { oggetto?: string; testo?: string };
    try { x = JSON.parse(out); } catch { return json(502, { error: 'Il servizio AI non ha restituito la bozza: riprova.' }); }
    return json(200, { oggetto: String(x.oggetto || ''), testo: String(x.testo || '') });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: 'Chiave ANTHROPIC_API_KEY non valida.' });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'Troppe richieste o credito esaurito su Anthropic: riprova tra poco.' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Errore dal servizio AI (${e.status}): ${e.message}` });
    return json(500, { error: (e as Error).message });
  }
}
