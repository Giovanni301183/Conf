// Riunioni online: link di Meet, Teams o Zoom dentro un testo (email in arrivo o nota di una voce d'agenda)
// e scelta degli appuntamenti da ricordare prima dell'inizio. Usato dall'app (pulsante e notifiche) e da /api/agenda (Telegram).

export const ANTICIPO = 30;   // minuti: avviso nell'app; su Telegram tra 30 e 40 (n8n controlla ogni 10 minuti)

const CON = /https?:\/\/(?:meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"')\]]+|teams\.live\.com\/meet\/[^\s<>"')\]]+|[\w-]+\.zoom\.us\/j\/[^\s<>"')\]]+)/i;
const MEET = /\bmeet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}\b/i;   // spesso nelle email senza https://

/** Primo link di una riunione online nel testo, sempre con https://; vuoto se non c'è. */
export function linkRiunione(t?: string | null): string {
  const s = t || '', m = s.match(CON);
  if (m) return m[0].replace(/[.,;:]+$/, '');
  const g = s.match(MEET);
  return g ? 'https://' + g[0] : '';
}

/** Minuti da "adesso" (HH:MM) all'ora indicata (HH:MM o HH:MM:SS) nello stesso giorno. */
export const minutiA = (ora: string, adesso: string) => (+ora.slice(0, 2) * 60 + +ora.slice(3, 5)) - (+adesso.slice(0, 2) * 60 + +adesso.slice(3, 5));

export interface Appuntamento { id: string; giorno: string; ora: string | null; genere: string; fatto: boolean }
/** Appuntamenti di oggi non fatti che iniziano entro "finestra" minuti (e non sono già iniziati). */
export const daAvvisare = <T extends Appuntamento>(vv: T[], oggi: string, adesso: string, finestra = ANTICIPO) =>
  vv.filter(v => v.genere === 'appuntamento' && !v.fatto && v.giorno === oggi && !!v.ora && minutiA(v.ora, adesso) > 0 && minutiA(v.ora, adesso) <= finestra);

/** Chiave di un avviso: cambia se la riunione viene spostata, così si avvisa di nuovo. */
export const chiaveAvviso = (v: Appuntamento) => `${v.giorno} ${(v.ora || '').slice(0, 5)}`;
