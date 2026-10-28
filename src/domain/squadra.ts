// Chat di squadra: messaggi tra colleghi dentro l'app. Da un tratto di conversazione l'AI propone una nota (vedi api/squadra.ts),
// che si conferma e va nei Documenti; i messaggi usati ricordano la nota (nota_id).

export interface Messaggio {
  id: string; testo: string | null; documento_id: string | null; nota_id: string | null; creato_da: string; creato: string;
  preventivo_id?: string | null;   // stanza della commessa (vuoto = Generale)
  risposta_a?: string | null;      // messaggio a cui risponde
  menzioni?: string[];             // email dei colleghi chiamati con @nome
}
type Collega = { email: string; nome: string | null };
// I messaggi dell'assistente (chiamato con @assistente) li scrive il server con questo autore.
export const ASSISTENTE = 'assistente';

/** Messaggi di una stanza: quella di una commessa, o il Generale (null). */
export const diStanza = (mm: Messaggio[], stanza: string | null) => mm.filter(m => (m.preventivo_id || null) === stanza);

/** Come si chiama un collega con @: il primo nome, oppure la parte dell'email prima della @ (senza spazi). */
export const tagDi = (c: Collega) => (c.nome?.trim().split(/\s+/)[0] || c.email.split('@')[0]).replace(/[^\p{L}\p{N}._-]/gu, '');
const piano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Colleghi chiamati nel testo con @nome (anche @nome.cognome dell'email); 'assistente' se c'è @assistente. */
export function menzioniIn(testo: string, colleghi: Collega[]): string[] {
  const tags = [...testo.matchAll(/@([\p{L}\p{N}._-]+)/gu)].map(m => piano(m[1].replace(/[._-]+$/, '')));   // "@Mario." a fine frase
  const out = new Set<string>();
  for (const t of tags) {
    if (t === 'assistente') { out.add(ASSISTENTE); continue; }
    const c = colleghi.find(c => piano(tagDi(c)) === t || piano(c.email.split('@')[0]) === t);
    if (c) out.add(c.email);
  }
  return [...out];
}
/** Il nome che si sta scrivendo dopo una @ alla fine del testo (per i suggerimenti); null se non si sta scrivendo un nome. */
export const tagInCorso = (testo: string) => { const m = /(?:^|\s)@([\p{L}\p{N}._-]*)$/u.exec(testo); return m ? m[1] : null; };
/** Avvisi della chat, scelta personale: tutti i messaggi, solo quelli per me (@nome o risposta a un mio messaggio), nessuno. */
export type Avvisi = 'tutti' | 'mie' | 'no';
export const AVVISI: [Avvisi, string][] = [['tutti', 'Tutti i messaggi'], ['mie', 'Solo @nome e risposte a me'], ['no', 'Nessun avviso']];
/** Il messaggio è per me: mi chiamano con @ o rispondono a un mio messaggio. */
export const perMeMsg = (m: Messaggio, mm: Messaggio[], me: string) =>
  !!m.menzioni?.includes(me) || (!!m.risposta_a && mm.find(x => x.id === m.risposta_a)?.creato_da === me);
/** Messaggi nuovi di cui avvisarmi, secondo la mia scelta (i miei mai). */
export const daAvvisare = (nuovi: Messaggio[], mm: Messaggio[], me: string, scelta: Avvisi) =>
  scelta === 'no' ? [] : nuovi.filter(m => m.creato_da !== me && (scelta === 'tutti' || perMeMsg(m, mm, me)));
/** Messaggi non letti in cui sono chiamato con @. */
export const perMeNonLetti = (mm: Messaggio[], visto: string, me: string) => mm.filter(m => m.creato_da !== me && m.creato > visto && m.menzioni?.includes(me)).length;
/** Proposta di nota scritta dall'AI da un tratto di chat. */
export interface PropostaNota {
  titolo: string; testo: string; etichette: string[]; preventivo_id: string | null;
  da_fare: { cosa: string; chi: string; entro: string }[];
}

/** Nome da mostrare: il nome dell'elenco utenti, altrimenti la parte dell'email prima della @. */
export const nomeDi = (email: string, colleghi: { email: string; nome: string | null }[]) => email === ASSISTENTE ? '✦ Assistente' : colleghi.find(c => c.email === email)?.nome || email.split('@')[0];

/** Primo messaggio proposto per la nota: dopo l'ultimo già finito in una nota, e comunque non prima di oggi (se oggi c'è qualcosa). */
export function inizioProposto(mm: Messaggio[], oggi: string): number {
  if (!mm.length) return -1;
  let i = 0;
  for (let k = mm.length - 1; k >= 0; k--) if (mm[k].nota_id) { i = k + 1; break; }
  if (i >= mm.length) return mm.length - 1;
  const primoOggi = mm.findIndex((m, k) => k >= i && m.creato.slice(0, 10) >= oggi);
  return primoOggi >= 0 ? primoOggi : i;
}

/** Messaggi arrivati da altri dopo l'ultima volta che ho aperto la chat. */
export const nonLetti = (mm: Messaggio[], visto: string, me: string) => mm.filter(m => m.creato_da !== me && m.creato > visto).length;

/** Il tratto di chat come lo legge l'AI: una riga per messaggio con giorno, ora e nome; i file per nome. */
export function trattoPerAI(mm: Messaggio[], colleghi: { email: string; nome: string | null }[], file: (id: string) => string) {
  return mm.map(m => {
    const d = new Date(m.creato), q = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const f = m.documento_id ? ` [file: ${file(m.documento_id) || 'allegato'}]` : '';
    return `[${q}] ${nomeDi(m.creato_da, colleghi)} (${m.creato_da}): ${(m.testo || '').trim()}${f}`.trim();
  }).join('\n');
}

/** Testo della nota con le cose da fare in fondo (le cose da fare in agenda arrivano in un secondo passo). */
export function testoNota(p: Pick<PropostaNota, 'testo' | 'da_fare'>, colleghi: { email: string; nome: string | null }[]) {
  const giorno = (g: string) => new Date(g + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  const righe = p.da_fare.filter(x => x.cosa.trim()).map(x => `- ${x.cosa.trim()}${x.chi ? ` (${nomeDi(x.chi, colleghi)})` : ''}${x.entro ? ` entro il ${giorno(x.entro)}` : ''}`);
  return [p.testo.trim(), righe.length ? 'Da fare:\n' + righe.join('\n') : ''].filter(Boolean).join('\n\n');
}

/** La chat come appunti per l'assistente: una voce per giorno e stanza (le più recenti prima), con le righe "ora Nome: testo".
 *  Di una giornata lunga resta la parte finale (al massimo n caratteri). */
export function chatComeAppunti(mm: Messaggio[], colleghi: Collega[], commessa: (id: string) => string, n = 2000) {
  const gruppi = new Map<string, { quando: string; commessa: string; righe: string[] }>();
  for (const m of mm) {
    if (!m.testo?.trim()) continue;
    const d = new Date(m.creato), quando = d.toLocaleDateString('sv-SE'), k = quando + '|' + (m.preventivo_id || '');
    if (!gruppi.has(k)) gruppi.set(k, { quando, commessa: m.preventivo_id ? commessa(m.preventivo_id) : '', righe: [] });
    gruppi.get(k)!.righe.push(`${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} ${nomeDi(m.creato_da, colleghi)}: ${m.testo.trim()}`);
  }
  return [...gruppi.values()].sort((a, b) => b.quando.localeCompare(a.quando)).map(g => {
    const t = g.righe.join('\n');
    return { quando: g.quando, commessa: g.commessa, titolo: `Chat di squadra · ${g.commessa || 'Generale'}`, testo: t.length > n ? '…' + t.slice(-n) : t };
  });
}
