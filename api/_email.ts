// Bozza di un'email di aggiornamento scritta da Claude a partire da un appunto: usata dall'app (/api/email) e da Telegram (/api/agenda, azione email).
// Non invia niente: la bozza si apre nel Gmail di chi l'ha chiesta, che la rilegge e preme Invia.
import Anthropic from '@anthropic-ai/sdk';

const MODELLO = 'claude-opus-5-5';

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
- Usa solo le informazioni dell'appunto, del contesto e delle indicazioni dell'utente: non inventare date, quantità, prezzi o impegni.
- Le indicazioni dell'utente (destinatario, cose da aggiungere, tono) hanno la precedenza sull'appunto.
- Tono cordiale e diretto, frasi brevi; elenco puntato con "- " solo se ci sono più punti distinti.
- Togli abbreviazioni e note personali che non devono arrivare al destinatario.
- Se l'appunto indica a chi è rivolto, saluta di conseguenza; altrimenti usa "Buongiorno,".
- Chiudi con "Cordiali saluti," e il nome del mittente: ${mittente}.
Rispondi con il JSON richiesto (oggetto e testo).`;

export interface Appunto { titolo: string; testo: string; contesto?: string; richiesta?: string }
export type Bozza = { oggetto: string; testo: string } | { errore: string; status: number };

export async function scriviBozza(a: Appunto, mittente: string): Promise<Bozza> {
  if (!process.env.ANTHROPIC_API_KEY) return { status: 500, errore: 'Sul server manca ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' };
  const titolo = a.titolo.slice(0, 300), testo = a.testo.slice(0, 20_000), contesto = (a.contesto || '').slice(0, 2000), richiesta = (a.richiesta || '').slice(0, 2000);
  if (!titolo.trim() && !testo.trim()) return { status: 400, errore: "L'appunto è vuoto." };
  const domanda = [contesto && `Contesto: ${contesto}`, `Titolo dell'appunto: ${titolo}`, `Appunto:\n${testo || '(solo titolo)'}`,
    richiesta && `Indicazioni dell'utente per l'email: ${richiesta}`].filter(Boolean).join('\n\n');
  try {
    const r = await new Anthropic().beta.messages.create({
      model: MODELLO, max_tokens: 4000, system: sistema(mittente), messages: [{ role: 'user', content: domanda }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // Se il modello declina, la richiesta riparte da sola sul modello di riserva consigliato da Anthropic.
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (r.stop_reason === 'refusal') return { status: 502, errore: 'Il servizio AI non ha voluto scrivere questa email.' };
    const out = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('');
    let x: { oggetto?: string; testo?: string };
    try { x = JSON.parse(out); } catch { return { status: 502, errore: 'Il servizio AI non ha restituito la bozza: riprova.' }; }
    return { oggetto: String(x.oggetto || ''), testo: String(x.testo || '') };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { status: 500, errore: 'Chiave ANTHROPIC_API_KEY non valida.' };
    if (e instanceof Anthropic.RateLimitError) return { status: 429, errore: 'Troppe richieste o credito esaurito su Anthropic: riprova tra poco.' };
    if (e instanceof Anthropic.APIError) return { status: 502, errore: `Errore dal servizio AI (${e.status}): ${e.message}` };
    return { status: 500, errore: (e as Error).message };
  }
}

/** Finestra di scrittura di Gmail già compilata, sull'account indicato (come apriGmail nell'app). */
export function linkGmail(account: string, a: string, oggetto: string, testo: string) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: a.trim(), su: oggetto, body: testo });
  return `https://mail.google.com/mail/u/${encodeURIComponent(account)}/?${q.toString().replace(/\+/g, '%20')}`;
}
