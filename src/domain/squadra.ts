// Chat di squadra: messaggi tra colleghi dentro l'app. Da un tratto di conversazione l'AI propone una nota (vedi api/squadra.ts),
// che si conferma e va nei Documenti; i messaggi usati ricordano la nota (nota_id).

export interface Messaggio {
  id: string; testo: string | null; documento_id: string | null; nota_id: string | null; creato_da: string; creato: string;
}
/** Proposta di nota scritta dall'AI da un tratto di chat. */
export interface PropostaNota {
  titolo: string; testo: string; etichette: string[]; preventivo_id: string | null;
  da_fare: { cosa: string; chi: string; entro: string }[];
}

/** Nome da mostrare: il nome dell'elenco utenti, altrimenti la parte dell'email prima della @. */
export const nomeDi = (email: string, colleghi: { email: string; nome: string | null }[]) => colleghi.find(c => c.email === email)?.nome || email.split('@')[0];

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
