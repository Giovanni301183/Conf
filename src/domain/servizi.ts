// Servizi opzionali dell'offerta (slide «Forniture e servizi opzionali»): elenco standard e prezzo come compare nel PowerPoint.
// File a parte, senza dipendenze pesanti: lo usano anche il modulo Telegram e il server.
import { fN } from './format.js';

const numIt = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) ? n : 0; };

/** Slide «Forniture e servizi opzionali»: elenco standard. Prezzo vuoto = trasporto e posa dai prezzi dell'offerta, le altre «Su richiesta»;
 *  un numero diventa «€ … + IVA» (0 = «Incluso»), un testo va tale e quale (es. «Da quotare»). Ogni preventivo può cambiarlo (prev.offerta.servizi). */
export type Servizio = { k?: 'trasporto' | 'posa' | 'gru'; voce: string; prezzo: string; on: boolean };
export const SERVIZI0: readonly Servizio[] = [
  { k: 'trasporto', voce: 'Trasporto in cantiere (scarico escluso)', prezzo: '', on: true }, { k: 'posa', voce: 'Posa in opera', prezzo: '', on: true },
  ...['Ricambi di montaggio in fase di costruzione', 'Ricambi O&M (2 anni)', 'Pull-out test', 'Supervisione al montaggio', 'Commissioning in sito', 'Prolunga pali (+10 cm)']
    .map(voce => ({ voce, prezzo: '', on: true })),
];
// Impianti fissi: niente ricambi O&M e commissioning; c'e' il servizio gru per lo scarico.
export const SERVIZI_FISSO0: readonly Servizio[] = [
  { k: 'trasporto', voce: 'Trasporto in cantiere', prezzo: '', on: true }, { k: 'gru', voce: 'Servizio gru per lo scarico', prezzo: '', on: true },
  { k: 'posa', voce: 'Posa in opera', prezzo: '', on: true },
  ...['Pull-out test', 'Supervisione al montaggio', 'Ricambi di montaggio in fase di costruzione', 'Prolunga pali'].map(voce => ({ voce, prezzo: '', on: true })),
];
export const servizi0 = (settore?: string) => (settore === 'fisso' ? SERVIZI_FISSO0 : SERVIZI0);
export const serviziDi = (O: any, settore?: string): Servizio[] => (Array.isArray(O.servizi) ? O.servizi : servizi0(settore).map(x => ({ ...x })));
/** Prezzo di un servizio come compare nell'offerta. */
export function prezzoServizio(x: Servizio, auto: { trasporto: string; posa: string; gru?: string }) {
  const t = String(x.prezzo ?? '').trim();
  if (!t) return (x.k && auto[x.k]) || 'Su richiesta';
  const n = /^[\d.,\s€]+$/.test(t) && /\d/.test(t) ? numIt(t.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '')) : NaN;
  return n > 0 ? `€ ${fN(n, 2)} + IVA` : n === 0 ? 'Incluso' : t;
}
