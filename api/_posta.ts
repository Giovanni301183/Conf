// Email in arrivo da trasformare in agenda: Claude legge l'email inoltrata all'indirizzo dell'agenda (vedi n8n, flusso "Email Gmail")
// e propone titolo, riassunto, giorno, ora e commessa. Non crea niente: la proposta arriva in chat privata su Telegram
// e chi l'ha inoltrata sceglie con un pulsante se farne un appunto, un promemoria o una riunione (azioni posta e pe di /api/agenda).
import Anthropic from '@anthropic-ai/sdk';
import { ETICHETTE, LIMITE_MB, pulisciEtichette } from '../src/domain/documenti.js';

const MODELLO = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    titolo: { type: 'string', description: "Cosa fare o di cosa si tratta, massimo 120 caratteri (es. \"Rossi chiede conferma consegna pali\")." },
    riassunto: { type: 'string', description: "Riassunto in testo semplice dei punti utili (richieste, date, quantità, impegni), senza saluti né firme." },
    mittente: { type: 'string', description: "Chi ha scritto l'email originale (nome e azienda se ci sono), non chi l'ha inoltrata." },
    giorno: { type: 'string', description: "Data AAAA-MM-GG di una scadenza, consegna o riunione citata nell'email; vuoto se non c'è." },
    ora: { type: 'string', description: 'Ora HH:MM della riunione o scadenza; vuoto se non c\'è.' },
    riunione: { type: 'boolean', description: "true se l'email propone o fissa una riunione, una call o un incontro." },
    preventivo_id: { type: 'string', description: "id della commessa dell'elenco a cui si riferisce l'email; vuoto se non è chiaro." },
    etichette: { type: 'array', items: { type: 'string', enum: ETICHETTE.map(([k]) => k) },
      description: 'Da 0 a 3 temi: ' + ETICHETTE.map(([k, l]) => `${k} = ${l}`).join(', ') },
  },
  required: ['titolo', 'riassunto', 'mittente', 'giorno', 'ora', 'riunione', 'preventivo_id', 'etichette'],
  additionalProperties: false,
};

const sistema = (oggi: string) => `Sei l'assistente dell'agenda di Terranova S.r.l. (strutture per fotovoltaico, serre e agricoltura).
Un collega ti inoltra un'email (di un cliente, fornitore o collega) da mettere in agenda. Oggi è ${oggi}.
Regole:
- Se sopra l'email inoltrata il collega ha scritto due righe (commessa, cosa fare, quando), hanno la precedenza sull'email.
- Usa solo quello che c'è scritto: non inventare date, quantità, prezzi o impegni. Date relative ("venerdì prossimo") → AAAA-MM-GG da oggi.
- La commessa la scegli solo dall'elenco che ti passo, se nome, cliente, numero o riferimento corrispondono davvero; altrimenti vuoto.
- Etichette: da 0 a 3 temi che descrivono davvero l'email (es. offerta di un fornitore = acquisti; richiesta di un nuovo cliente = opportunita e vendita; reclamo = qualita).
- Testo semplice, niente markdown.
Rispondi con il JSON richiesto.`;

export interface Commessa { id: string; nome: string; cliente: string | null; num: string | null; rif: string | null }
export interface EmailIn { da: string; oggetto: string; testo: string; data?: string }
export interface Lettura { titolo: string; riassunto: string; mittente: string; giorno: string; ora: string; riunione: boolean; preventivo_id: string; etichette?: string[] }

/** Tiene solo i campi validi della risposta dell'AI: date e ore ben scritte, commessa presente nell'elenco. */
export function pulisciLettura(x: any, commesse: Commessa[]): Lettura {
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const giorno = s(x.giorno, 10), ora = s(x.ora, 5), pid = s(x.preventivo_id, 100);
  return {
    titolo: s(x.titolo, 200) || 'Email da guardare', riassunto: s(x.riassunto, 4000), mittente: s(x.mittente, 200),
    giorno: /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : '', ora: /^([01]\d|2[0-3]):[0-5]\d$/.test(ora) ? ora : '',
    riunione: x.riunione === true, preventivo_id: commesse.some(c => c.id === pid) ? pid : '', etichette: pulisciEtichette(x.etichette).slice(0, 3),
  };
}

export async function leggiEmail(e: EmailIn, commesse: Commessa[], oggi: string): Promise<Lettura | { errore: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { errore: 'Sul server manca ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' };
  const elenco = commesse.map(c => [c.id, c.nome, c.num && `N° ${c.num}`, c.cliente && `cliente ${c.cliente}`, c.rif && `rif. ${c.rif}`].filter(Boolean).join(' | ')).join('\n');
  const domanda = [`Commesse (id | nome | numero | cliente | riferimento):\n${elenco || '(nessuna)'}`,
    `Email inoltrata da: ${e.da}${e.data ? `\nRicevuta: ${e.data}` : ''}\nOggetto: ${e.oggetto.slice(0, 300)}`, `Testo:\n${e.testo.slice(0, 20_000) || '(vuoto)'}`].join('\n\n');
  try {
    const r = await new Anthropic().beta.messages.create({
      model: MODELLO, max_tokens: 3000, system: sistema(oggi), messages: [{ role: 'user', content: domanda }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (r.stop_reason === 'refusal') return { errore: "Il servizio AI non ha voluto leggere questa email." };
    const out = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('');
    try { return pulisciLettura(JSON.parse(out), commesse); } catch { return { errore: "Il servizio AI non ha restituito la lettura dell'email." }; }
  } catch (err) {
    if (err instanceof Anthropic.APIError) return { errore: `Errore dal servizio AI (${err.status}): ${err.message}` };
    return { errore: (err as Error).message };
  }
}

/* ---------- Allegati dell'email ---------- */
// n8n manda nome, tipo e peso ("12.3 kB") di ogni allegato; l'app dice quali caricare e dove (link firmato dello Storage).
export interface AllegatoIn { chiave: string; nome: string; mime: string; peso?: string | number }
/** Byte dal peso scritto da n8n ("523 B", "12.3 kB", "1.2 MB"); un numero vale gia' come byte. */
export function byteDa(peso: unknown): number {
  if (typeof peso === 'number') return peso;
  const m = /([\d.,]+)\s*([kmg]?)b/i.exec(String(peso ?? ''));
  return m ? Math.round(parseFloat(m[1].replace(',', '.')) * ({ '': 1, k: 1e3, m: 1e6, g: 1e9 } as Record<string, number>)[m[2].toLowerCase()]) : 0;
}
/** Allegati da tenere: niente loghi e immagini delle firme (immagini sotto 20 KB), niente inviti .ics, entro il limite per file; al massimo 10. */
export function allegatiDaCaricare(aa: AllegatoIn[]): AllegatoIn[] {
  return aa.filter(a => {
    const nome = String(a.nome || ''), mime = String(a.mime || ''), b = byteDa(a.peso);
    if (!a.chiave || !nome) return false;
    if (mime === 'text/calendar' || /\.ics$/i.test(nome)) return false;
    if (mime.startsWith('image/') && b > 0 && b < 20_000) return false;
    return b <= LIMITE_MB * 1024 * 1024;
  }).slice(0, 10);
}

/** Indirizzo email da un'intestazione From ("Mario Rossi <mario@x.it>" → mario@x.it). */
export const indirizzo = (from: string) => (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
