// Reparti su Telegram (chiamato da agenda.ts): menu «/nuovo» con i pulsanti (reparto → cosa aggiungere → risposta con il testo,
// che legge l'assistente), «Cambia reparto» e «Annulla» sotto quello che si è appena salvato, scelta del reparto per la situazione.
// Pulsanti: callback_data "<azione>:<id>:<scelta>" (Telegram: al massimo 64 byte). n8n li gira all'app con chat e msg del messaggio,
// che l'app cambia da sola (editMessageText): la risposta { ok, testo: '' } dice a n8n di non scrivere altro.
//   nv:<reparto>:<tipo>     menu nuovo (reparto vuoto = elenco dei reparti; tipo vuoto = scegli cosa aggiungere)
//   rv:<id voce>:<reparto>  cambia reparto di una voce d'agenda (reparto vuoto = scegli); rn: lo stesso per una nota
//   xv:<id voce> / xn:<id nota>   annulla (elimina) quello appena salvato
//   tv:<id voce>:<settore>  settore di una voce (settore vuoto = scegli; «nessuno» = togli); tn: lo stesso per una nota
//   sr:<reparto>:<settore>  situazione del reparto, anche di un solo settore (vedi situazioneReparto in agenda.ts)
//   ar                      avvisi in privato per le voci nuove dei miei reparti: sì / no
import { REPARTI, SETTORI_MAPPA, SMISTARE, nomeReparto, nomeSettoreMappa, pulisciReparti } from '../src/domain/reparti.js';

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const fatto = { ok: true, testo: '' };

/** Chiave di un reparto da come lo scrive l'assistente o un collega («acquisti», «Qualità», «risorse umane», «da smistare»); '' se non c'è. */
export function repartoDa(s: unknown): string {
  const t = norm(s);
  if (!t) return '';
  if (t === SMISTARE || t.includes('smist') || t === 'nessuno') return SMISTARE;
  return REPARTI.find(r => r.k === t || norm(r.nome) === t)?.k
    || REPARTI.find(r => norm(r.nome).startsWith(t) || r.temi.includes(t))?.k || '';
}
/** Chiave di un settore della mappa da come lo scrive l'assistente («energia», «Serre», «lavori speciali», «fotovoltaico»); '' se non c'è. */
export function settoreDa(s: unknown): string {
  const t = norm(s);
  if (!t) return '';
  if (t === 'nessuno' || t === 'nessun settore') return 'nessuno';
  if (/\b(tracker|fiss|fotovolt|solar|agrivolt)/.test(t)) return 'energia';
  if (t.includes('special')) return 'speciali';
  return SETTORI_MAPPA.find(x => x.k === t || norm(x.nome) === t || norm(x.nome).startsWith(t) && t.length >= 3)?.k || '';
}
const IC_SETTORE: Record<string, string> = { energia: '☀️', serre: '🌱', vigneti: '🍇', recinzioni: '🚧', speciali: '⭐' };
export const etichettaSettore = (k: string) => `${IC_SETTORE[k] || '•'} ${nomeSettoreMappa(k)}`;
export const icona = (k: string) => (k === SMISTARE ? '📥' : REPARTI.find(r => r.k === k)?.ic || '•');
export const etichetta = (k: string) => `${icona(k)} ${nomeReparto(k)}`;
/** Reparti di una voce: quelli scelti, altrimenti quelli di chi la deve fare (o di chi l'ha creata), altrimenti «Da smistare». */
export function repartiDiVoce(v: { reparti?: string[] | null; assegnata_a: string | null; creato_da: string }, repartiDi: (email: string) => string[]) {
  const scelti = pulisciReparti(v.reparti);
  if (scelti.length) return scelti;
  const r = pulisciReparti(repartiDi(v.assegnata_a || v.creato_da));
  return r.length ? r : [SMISTARE];
}
/** Temi di una nota passata a un altro reparto: via quelli dei reparti, dentro il primo tema del nuovo (Da smistare: nessuno). */
export function temiPerReparto(etichette: string[] | null | undefined, k: string) {
  const via = new Set(REPARTI.flatMap(r => r.temi));
  return [...(etichette || []).filter(t => !via.has(t)), ...(k && k !== SMISTARE ? REPARTI.find(r => r.k === k)!.temi.slice(0, 1) : [])];
}

export const TIPI: [string, string][] = [['nota', '📝 Nota'], ['promemoria', '🔔 Promemoria'], ['scadenza', '⏳ Scadenza'], ['urgenza', '🔴 Urgenza'],
  ['appuntamento', '📅 Appuntamento'], ['attivita', '☑️ Da fare']];
type Tasto = { text: string; callback_data: string };
const righe = (tt: Tasto[], n = 2) => Array.from({ length: Math.ceil(tt.length / n) }, (_, i) => tt.slice(i * n, i * n + n));
/** Tastiera con i 12 reparti (e, se serve, «Da smistare»), due per riga. */
export const tastiReparti = (cb: (k: string) => string, smistare = false) =>
  righe([...REPARTI.map(r => r.k), ...(smistare ? [SMISTARE] : [])].map(k => ({ text: etichetta(k), callback_data: cb(k) })));

export const msgReparti = () => ({ text: '➕ Nuovo: in quale reparto?', reply_markup: { inline_keyboard: tastiReparti(k => `nv:${k}:`, true) } });
export const msgTipi = (k: string) => ({ text: `➕ Nuovo in ${etichetta(k)}: cosa aggiungi?`,
  reply_markup: { inline_keyboard: [...righe(TIPI.map(([t, l]) => ({ text: l, callback_data: `nv:${k}:${t}` }))), [{ text: '‹ Altro reparto', callback_data: 'nv::' }]] } });
/** Domanda a cui rispondere con il testo: la riga tra parentesi quadre la legge l'assistente (vedi le istruzioni in n8n). */
export function msgScrivi(k: string, t: string) {
  const nome = TIPI.find(x => x[0] === t)?.[1] || t;
  return { text: `✍️ ${etichetta(k)} · ${nome}\nRispondi a questo messaggio con ${t === 'nota' ? 'il testo della nota' : 'cosa e quando'} (va bene anche un vocale).\n[reparto=${k} tipo=${t}]`,
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: t === 'nota' ? 'es. il fornitore alza i prezzi del 5%' : 'es. richiamare il fornitore venerdì alle 10' } };
}
/** Sotto una voce o una nota appena salvata con un reparto o un settore: cambia reparto, settore, o annulla. q = 'v' voce, 'n' nota. */
export const msgSalvato = (q: 'v' | 'n', id: string, titolo: string, k: string, ok = '', ss: string[] = []) => ({
  text: [`🏷 ${titolo.slice(0, 200)}`, k ? `Reparto: ${etichetta(k)}` : '', ss.length ? `Settore: ${ss.map(etichettaSettore).join(', ')}` : ''].filter(Boolean).join('\n') + ok,
  reply_markup: { inline_keyboard: [[{ text: '🔁 Cambia reparto', callback_data: `r${q}:${id}:` }, { text: ss.length ? '🏷 Cambia settore' : '🏷 Settore', callback_data: `t${q}:${id}:` }],
    [{ text: '↩ Annulla', callback_data: `x${q}:${id}:` }]] },
});
/** Tastiera dei settori (Energia, Serre, Vigneti, Recinzioni, Lavori speciali), due per riga; con «nessuno» per toglierlo. */
export const tastiSettori = (cb: (k: string) => string, nessuno = false) =>
  righe([...SETTORI_MAPPA.map(x => ({ text: etichettaSettore(x.k), callback_data: cb(x.k) })), ...(nessuno ? [{ text: '✖ Nessun settore', callback_data: cb('nessuno') }] : [])]);

/** Chiamata all'API di Telegram con il token del bot; false se non è andata. */
export async function tg(metodo: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok;
}
/** Cambia il messaggio del pulsante premuto (testo e tasti; senza tasti li toglie). */
export const cambia = (b: any, m: { text: string; reply_markup?: unknown }) =>
  tg('editMessageText', { chat_id: Number(b.chat), message_id: Number(b.msg), text: m.text, ...(m.reply_markup ? { reply_markup: m.reply_markup } : {}) });
export const senzaMessaggio = (b: any) => !Number(b.chat) || !Number(b.msg);
export const MANCA_N8N = 'In n8n il nodo «Pulsante → app» deve mandare anche chat e msg (vedi le istruzioni dei reparti).';

/** Pulsanti del menu nuovo: elenco reparti → cosa aggiungere → domanda a cui rispondere con il testo. */
export async function pulsanteNuovo(b: any) {
  if (senzaMessaggio(b)) return { ok: false, errore: MANCA_N8N };
  const k = repartoDa(b.id), t = String(b.scelta ?? '');
  if (!k) { await cambia(b, msgReparti()); return fatto; }
  if (!t || !TIPI.some(x => x[0] === t)) { await cambia(b, msgTipi(k)); return fatto; }
  await cambia(b, { text: `➕ ${etichetta(k)} · ${TIPI.find(x => x[0] === t)![1]}` });
  await tg('sendMessage', { chat_id: Number(b.chat), ...msgScrivi(k, t) });
  return fatto;
}
