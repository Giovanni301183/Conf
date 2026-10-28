// Funzione Vercel per la chat di squadra.
// - Proposta di nota: da un tratto di chat Claude propone una nota (titolo, riassunto con le decisioni, cose da fare, commessa, etichette).
//   Non salva niente: la proposta torna all'app, l'utente la corregge e la conferma.
// - azione 'rispondi' (@assistente in chat): Claude legge gli ultimi messaggi della stanza, da consulente tecnico con l'archivio tecnico
//   (solo i documenti condivisi: la risposta la leggono tutti), e scrive la risposta come messaggio dell'assistente.
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ETICHETTE, pulisciEtichette } from '../src/domain/documenti.js';
import { ESPERTO, TOOLS_ESPERTO } from '../src/domain/esperto.js';
import { ASSISTENTE } from '../src/domain/squadra.js';
import { eseguiEsperto, type CtxEsperto } from './_esperto.js';

const MODELLO = 'claude-opus-5-5';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Risposta strutturata: JSON con la proposta (su questo modello non si può forzare l'uso di uno strumento).
const SCHEMA = {
  type: 'object',
  properties: {
    titolo: { type: 'string', description: "Titolo breve e concreto, con la commessa se c'è." },
    testo: { type: 'string', description: 'Riassunto in testo semplice: di cosa si è parlato, le decisioni prese ("Deciso: ..."), i numeri e i dati tecnici citati. Niente cose da fare qui.' },
    etichette: { type: 'array', items: { type: 'string', enum: ETICHETTE.map(e => e[0]) }, description: 'Da 1 a 3 temi della conversazione.' },
    preventivo_id: { type: 'string', description: "id della commessa/preventivo di cui si parla, preso dall'elenco; vuoto se non è chiaro." },
    da_fare: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cosa: { type: 'string', description: 'Azione concreta, che inizia con un verbo.' },
          chi: { type: 'string', description: "Email del collega che se ne occupa, solo se detto in chat; altrimenti vuoto." },
          entro: { type: 'string', description: 'Scadenza AAAA-MM-GG solo se detta in chat (anche "venerdì", "domani"); altrimenti vuoto.' },
        },
        required: ['cosa', 'chi', 'entro'],
        additionalProperties: false,
      },
    },
  },
  required: ['titolo', 'testo', 'etichette', 'preventivo_id', 'da_fare'],
  additionalProperties: false,
};

const sistema = (oggi: string) => `Sei l'assistente di Terranova S.r.l. (strutture per fotovoltaico, serre e agricoltura).
Ti passo un tratto della chat interna tra colleghi. Trasformalo in una nota ordinata da archiviare nei Documenti, in italiano.
Oggi è ${oggi}.
Regole:
- Usa solo quello che è scritto in chat: non inventare decisioni, numeri, date o persone.
- Scrivi in modo chiaro per chi leggerà la nota tra mesi senza aver letto la chat: frasi complete, niente saluti o battute.
- Le decisioni prese vanno scritte come tali; le domande rimaste aperte come "Da chiarire: ...".
- Le cose da fare vanno solo in da_fare, con il collega e la scadenza solo se detti; le date relative le converti in AAAA-MM-GG.
- La commessa la scegli dall'elenco solo se in chat se ne parla chiaramente (nome, cliente, numero o località).
Rispondi con il JSON richiesto.`;

const MAX_GIRI = 6;
const errAI = (e: unknown) => {
  if (e instanceof Anthropic.AuthenticationError) return json(500, { error: 'Chiave ANTHROPIC_API_KEY non valida.' });
  if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'Troppe richieste o credito esaurito su Anthropic: riprova tra poco.' });
  if (e instanceof Anthropic.APIError) return json(502, { error: `Errore dal servizio AI (${e.status}): ${e.message}` });
  return json(500, { error: (e as Error).message });
};
const sistemaChat = (oggi: string, stanza: string) => `Sei l'assistente di Terranova S.r.l. dentro la chat di squadra dell'app: i colleghi ti chiamano con @assistente.
Oggi è ${oggi}. Stanza: ${stanza}.
Rispondi in italiano all'ultima domanda rivolta a te, tenendo conto della conversazione: breve e concreto come in una chat (poche righe, elenco con "- " solo se serve), testo semplice senza markdown.
Non puoi modificare dati dell'app: se ti chiedono di farlo, spiega che si fa dall'assistente (✦) o dall'app.
Nell'archivio tecnico vedi solo i documenti condivisi, perché la risposta la leggono tutti.
${ESPERTO}`;

/** @assistente: risposta scritta nella chat come messaggio dell'assistente, nella stessa stanza, in risposta alla domanda. */
async function rispondi(admin: SupabaseClient, me: string, b: any) {
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Sul server manca ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' });
  const chat = String(b?.chat || '').slice(-40_000).trim(), domanda = String(b?.domanda || '');
  if (!chat || !domanda) return json(400, { error: 'Richiesta incompleta.' });
  const { data: q } = await admin.from('messaggi').select('id, creato_da, preventivo_id').eq('id', domanda).maybeSingle();
  if (!q || q.creato_da !== me) return json(400, { error: 'Domanda non trovata.' });
  const preventivi = (Array.isArray(b?.commesse) ? b.commesse : []).slice(0, 400).map((c: any) => ({ id: String(c.id), num: String(c.num || ''), nome: String(c.nome || ''), cliente: String(c.cliente || '') }));
  const st = preventivi.find((p: any) => p.id === q.preventivo_id);
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  // Archivio solo condiviso: con un autore che non esiste i documenti privati restano fuori.
  const ctx: CtxEsperto = { admin, email: ASSISTENTE, D: { listino: [], template: [], sizes: {}, preventivi, aperto: q.preventivo_id || null } };
  const tools = TOOLS_ESPERTO.filter(t => t.name !== 'proponi_memoria') as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Chat (le ultime righe sono le più recenti):\n${chat}` }];
  const client = new Anthropic();
  let testo = '';
  try {
    for (let giro = 0; giro < MAX_GIRI && !testo; giro++) {
      const r = await client.beta.messages.create({
        model: MODELLO, max_tokens: 8000, system: sistemaChat(oggi, st ? `commessa N° ${st.num} ${st.nome} (${st.cliente})` : 'Generale'), tools, messages,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      });
      messages.push({ role: 'assistant', content: r.content });
      if (r.stop_reason === 'refusal') { testo = 'Non posso aiutarti con questa richiesta.'; break; }
      if (r.stop_reason !== 'tool_use') { testo = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('\n').trim() || 'Non ho una risposta: prova a riformulare la domanda.'; break; }
      const risultati: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const c of r.content) {
        if (c.type !== 'tool_use') continue;
        const x = await eseguiEsperto(c.name, c.input, ctx, c.id);
        risultati.push({ type: 'tool_result', tool_use_id: c.id, content: x?.contenuto ?? 'Strumento non disponibile in chat.', is_error: !x || !!x.errore });
      }
      messages.push({ role: 'user', content: risultati });
    }
  } catch (e) { return errAI(e); }
  if (!testo) testo = 'Ci ho messo troppi passaggi: prova con una domanda più precisa.';
  const { error } = await admin.from('messaggi').insert({ testo: testo.slice(0, 20_000), creato_da: ASSISTENTE, preventivo_id: q.preventivo_id || null, risposta_a: q.id });
  return error ? json(500, { error: error.message }) : json(200, { ok: true });
}

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
  if (b?.azione === 'rispondi') return rispondi(admin, me, b);
  const chat = String(b?.chat || '').slice(0, 60_000).trim();
  if (!chat) return json(400, { error: 'Nessun messaggio da riassumere.' });
  const commesse = (Array.isArray(b?.commesse) ? b.commesse : []).slice(0, 400)
    .map((c: any) => `${c.id} | N° ${c.num || '-'} | ${c.nome || ''} | ${c.cliente || ''}`).join('\n');
  const colleghi = (Array.isArray(b?.colleghi) ? b.colleghi : []).map((c: any) => `${c.email} (${c.nome || ''})`).join(', ');
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })
    + ' (' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) + ')';
  const domanda = [`Colleghi: ${colleghi || '-'}`, `Commesse e preventivi (id | numero | nome | cliente):\n${commesse || '-'}`, `Chat:\n${chat}`].join('\n\n');
  try {
    const r = await new Anthropic().beta.messages.create({
      model: MODELLO, max_tokens: 6000, system: sistema(oggi), messages: [{ role: 'user', content: domanda }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // Se il modello declina, la richiesta riparte da sola sul modello di riserva consigliato da Anthropic.
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (r.stop_reason === 'refusal') return json(502, { error: 'Il servizio AI non ha voluto scrivere questa nota.' });
    const out = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('');
    let x: any;
    try { x = JSON.parse(out); } catch { return json(502, { error: 'Il servizio AI non ha restituito la nota: riprova.' }); }
    const ids = new Set((Array.isArray(b?.commesse) ? b.commesse : []).map((c: any) => c.id));
    const date = /^\d{4}-\d{2}-\d{2}$/;
    return json(200, {
      titolo: String(x.titolo || '').slice(0, 200), testo: String(x.testo || ''), etichette: pulisciEtichette(x.etichette).slice(0, 3),
      preventivo_id: ids.has(x.preventivo_id) ? x.preventivo_id : null,
      da_fare: (Array.isArray(x.da_fare) ? x.da_fare : []).map((d: any) => ({ cosa: String(d.cosa || ''), chi: String(d.chi || '').toLowerCase(), entro: date.test(d.entro) ? d.entro : '' })),
    });
  } catch (e) { return errAI(e); }
}
