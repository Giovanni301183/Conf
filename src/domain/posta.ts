// Link per aprire una mail già compilata nell'app Gmail del telefono (Android: intent verso Gmail; iPhone: googlegmail://),
// così non parte l'app di posta predefinita, che può avere un altro account. Usato dall'app e dalla pagina ponte di Telegram (api/posta.ts).

/** Sistema del telefono dallo user agent: null sul computer. */
export const telefono = (ua: string) => /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : null;

/** Link per aprire la mail compilata: nell'app Gmail (secondo il telefono) e in qualsiasi app di posta (mailto). */
export function linkPosta(a: string, su: string, body: string, ua: string) {
  const dest = a.split(',').map(x => encodeURIComponent(x.trim()).replace(/%40/g, '@')).filter(Boolean).join(',');
  const q = `subject=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;
  const mailto = `mailto:${dest}?${q}`, t = telefono(ua);
  const gmail = t === 'android' ? `intent:${dest}?${q}#Intent;scheme=mailto;action=android.intent.action.SENDTO;package=com.google.android.gm;end`
    : t === 'ios' ? `googlegmail://co?to=${dest}&${q}` : mailto;
  return { gmail, mailto };
}

// Codice della commessa nell'oggetto delle email mandate dall'app ("Offerta tracker [TN-2026/014]"): le risposte lo tengono ("Re: …"),
// così l'email inoltrata all'agenda si lega da sola alla commessa e alla voce «✉ Attesa risposta». Usato dall'app e da Telegram (api/agenda.ts).
export const codice = (num: string) => `[TN-${num.trim()}]`;
/** Oggetto con il codice in fondo, se la commessa ha un numero e il codice non c'è già. */
export function conCodice(oggetto: string, num?: string | null) {
  if (!num?.trim()) return oggetto;
  const c = codice(num);
  return oggetto.includes(c) ? oggetto : `${oggetto.trim()} ${c}`.trim();
}
/** Numero della commessa letto dal codice nell'oggetto; vuoto se non c'è. */
export const numDaOggetto = (o: string) => /\[TN-([\w./-]+)\]/i.exec(o)?.[1] || '';
/** Oggetto senza Re:/R:/I:/Fwd:, senza codice e in minuscolo: per riconoscere la risposta a un'email mandata. */
export const oggettoBase = (o: string) => o.replace(/\[TN-[^\]]*\]/gi, '').replace(/^\s*((re|r|i|fw|fwd|inoltro|aw|tr)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Voce «✉ Attesa risposta» ancora aperta a cui risponde l'email: prima quella con lo stesso oggetto, poi l'ultima della stessa commessa.
 *  Il titolo della voce è «✉ Attesa risposta · destinatario — oggetto» (vedi components/Email). */
export function attesaPer<V extends { titolo: string; preventivo_id: string | null }>(vv: V[], oggetto: string, pid: string): V | undefined {
  const base = oggettoBase(oggetto);
  return (base.length >= 4 ? vv.find(v => oggettoBase(v.titolo.split(' — ').slice(1).join(' — ')) === base) : undefined)
    || (pid ? vv.find(v => v.preventivo_id === pid) : undefined);
}

// Etichette di Gmail «Conf/…»: messe a un'email (anche dal telefono), n8n la porta nell'app, in «In arrivo» da sistemare.
// Le etichette tema (Conf/Acquisti, Conf/Tecnico…) diventano i temi della nota; tre etichette dicono cosa farne:
// Conf/Da fare = cosa da fare, Conf/Attesa risposta = voce in attesa della risposta, Conf/Riunione = appuntamento.
// Conf/In app e Conf/Non entrata le mette n8n dopo (non sono temi).
export const PREFISSO_GMAIL = 'Conf/';
/** Scelta proposta: f cosa da fare, t in attesa, r riunione, '' nessuna (decide chi la sistema). */
export type AzioneGmail = '' | 'f' | 't' | 'r';
const AZIONI_GMAIL: [RegExp, AzioneGmail][] = [[/^da\s*fare$/i, 'f'], [/^attesa(\s+risposta)?$/i, 't'], [/^riunion[ei]$/i, 'r']];
export function daEtichetteGmail(nomi: string[], pulisci: (v: unknown) => string[]): { temi: string[]; azione: AzioneGmail } {
  const nostre = nomi.filter(n => n.toLowerCase().startsWith(PREFISSO_GMAIL.toLowerCase())).map(n => n.slice(PREFISSO_GMAIL.length).trim())
    .filter(n => n && !/in app|non entrata/i.test(n));
  const azione = nostre.map(n => AZIONI_GMAIL.find(([r]) => r.test(n))?.[1]).find(Boolean) || '';
  return { temi: pulisci(nostre.filter(n => !AZIONI_GMAIL.some(([r, a]) => r.test(n) && a !== 'r'))), azione };
}

// ---------- Conversazioni email legate alle voci (tabella posta_fili) ----------
export interface MsgGmail { id: string; thread: string; data: number }   // data = ms (0 se non nota)
/** Quali email leggere, dalla più vecchia: di una conversazione già legata a una voce o nota, tutte quelle nuove (dopo l'ultima letta);
 *  di una conversazione non ancora legata, solo l'ultima (etichettando una conversazione lunga arriva una proposta sola) e solo se non ce n'è
 *  già una da sistemare. Le email già lette (visti) non tornano. A parità di data vale l'ordine di Gmail (dalla più recente). */
export function daLeggere(mm: MsgGmail[], visti: Set<string>, fili: Map<string, number>, inSospeso: Set<string>): string[] {
  const per = new Map<string, MsgGmail[]>();
  mm.forEach(m => { if (m.id && !visti.has(m.id)) per.set(m.thread, [...(per.get(m.thread) || []), m]); });
  const out: MsgGmail[] = [];
  for (const [t, xx] of per) {
    if (t && fili.has(t)) { const u = fili.get(t)!; out.push(...xx.filter(m => !m.data || m.data > u)); continue; }
    if (t && inSospeso.has(t)) continue;
    out.push(xx.reduce((a, b) => (b.data > a.data ? b : a)));
  }
  return [...new Set(out.sort((a, b) => a.data - b.data).map(m => m.id))];
}
/** Voci aperte a cui potrebbe appartenere un'email con un oggetto nuovo: stessa persona dall'altra parte, stessa commessa
 *  (codice [TN-…] o lettura dell'AI). Al massimo 3, prima quelle che corrispondono in entrambi i modi. */
export function suggerisciFili<V extends { id: string; titolo: string; preventivo_id: string | null }>(
  fili: { contatto: string | null; voce: V }[], contatto: string, pid: string): V[] {
  const punti = new Map<string, { v: V; p: number }>();
  for (const f of fili) {
    const p = (contatto && f.contatto === contatto ? 2 : 0) + (pid && f.voce.preventivo_id === pid ? 1 : 0);
    if (p && (punti.get(f.voce.id)?.p || 0) < p) punti.set(f.voce.id, { v: f.voce, p });
  }
  return [...punti.values()].sort((a, b) => b.p - a.p).slice(0, 3).map(x => x.v);
}
