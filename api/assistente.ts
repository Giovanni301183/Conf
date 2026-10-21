// Funzione Vercel: assistente dell'app con Claude. ANTHROPIC_API_KEY resta solo sul server; lo usa soltanto un utente attivo.
// Il browser manda la conversazione (com'era nella risposta precedente, senza modifiche), la nuova domanda e listino e distinte.
// Gli strumenti leggono quei dati e preparano proposte: le modifiche le fa l'app dopo la conferma dell'utente.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { TOOLS, esegui, sistema, type DatiAssistente, type Proposta } from '../src/domain/assistente.js';

const MODELLO = 'claude-opus-5-5';
const MAX_GIRI = 8;
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
  const testo = String(b?.testo || '').trim(), D = b?.dati as DatiAssistente;
  if (!testo || !Array.isArray(D?.listino) || !Array.isArray(D?.template)) return json(400, { error: 'Richiesta incompleta.' });
  const prima: Anthropic.Beta.BetaMessageParam[] = Array.isArray(b.messages) ? b.messages : [];
  if (JSON.stringify(prima).length > 300_000) return json(400, { error: 'Conversazione troppo lunga: premi «Nuova chat».' });
  const messages: Anthropic.Beta.BetaMessageParam[] = [...prima, { role: 'user', content: b.nota ? `${b.nota}\n\n${testo}` : testo }];

  const client = new Anthropic();
  const proposte: Proposta[] = [];
  try {
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const r = await client.beta.messages.create({
        model: MODELLO, max_tokens: 16000, system: sistema(new Date()), tools: TOOLS as Anthropic.Beta.BetaTool[], messages,
        output_config: { effort: 'medium' },
        // Se il modello declina, la richiesta riparte da sola sul modello di riserva consigliato da Anthropic.
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      });
      messages.push({ role: 'assistant', content: r.content });
      if (r.stop_reason === 'refusal') return json(200, { messages, proposte, testo: 'Non posso aiutarti con questa richiesta.' });
      if (r.stop_reason !== 'tool_use') {
        const out = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('\n').trim();
        return json(200, { messages, proposte, testo: out || (r.stop_reason === 'max_tokens' ? 'Risposta troppo lunga: riprova con una domanda più precisa.' : '') });
      }
      const risultati: Anthropic.Beta.BetaToolResultBlockParam[] = r.content.flatMap(c => {
        if (c.type !== 'tool_use') return [];
        const x = esegui(c.name, c.input, D, c.id);
        if (x.proposta) proposte.push(x.proposta);
        return [{ type: 'tool_result' as const, tool_use_id: c.id, content: x.testo, is_error: !!x.errore }];
      });
      messages.push({ role: 'user', content: risultati });
    }
    return json(200, { messages, proposte, testo: 'Ci ho messo troppi passaggi: prova a dividere la richiesta.' });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: 'Chiave ANTHROPIC_API_KEY non valida.' });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'Troppe richieste o credito esaurito su Anthropic: riprova tra poco.' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Errore dal servizio AI (${e.status}): ${e.message}` });
    return json(500, { error: (e as Error).message });
  }
}
