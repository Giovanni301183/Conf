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
