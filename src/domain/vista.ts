// Cosa vede ciascuno nel calendario: scelta personale salvata con l'utente (colonna utenti.vista), uguale su ogni dispositivo
// e usata anche per il riepilogo personale su Telegram. Le voci proprie (create da me o assegnate a me) si vedono sempre.
// Senza scelta salvata si vede tutto, come prima.

export type Quanto = 'tutte' | 'seguite' | 'nessuna';
export interface Vista {
  altri: Quanto;       // voci a mano degli altri: tutte, solo delle commesse che seguo, nessuna
  commesse: Quanto;    // date delle commesse (inizio e fine produzione, inizio montaggio)
  richiami: boolean;   // richiami ai clienti per le offerte senza risposta
  urgenze: boolean;    // urgenze di tutti, anche non mie
  seguo: string[];     // id dei preventivi / commesse che seguo
}
export const VISTA_TUTTO: Vista = { altri: 'tutte', commesse: 'tutte', richiami: true, urgenze: true, seguo: [] };

const QUANTI: Quanto[] = ['tutte', 'seguite', 'nessuna'];
/** Scelta letta dal database (anche parziale o assente) completata con i valori di base. */
export function normVista(v: any): Vista {
  const q = (x: any, d: Quanto) => (QUANTI.includes(x) ? x : d);
  return {
    altri: q(v?.altri, 'tutte'), commesse: q(v?.commesse, 'tutte'),
    richiami: v?.richiami !== false, urgenze: v?.urgenze !== false,
    seguo: Array.isArray(v?.seguo) ? v.seguo.filter((x: any) => typeof x === 'string') : [],
  };
}
export const vedeTutto = (v: Vista) => v.altri === 'tutte' && v.commesse === 'tutte' && v.richiami && v.urgenze;

// Quanto basta di una voce del calendario (app) o di una scadenza (server) per decidere se mostrarla.
export interface VoceVista {
  tipo: string; prevId?: string | null;
  s?: { creato_da?: string | null; assegnata_a?: string | null; coinvolti?: string[] | null; genere?: string; fatto?: boolean } | null;
}
const passa = (q: Quanto, v: VoceVista, seguo: string[]) => q === 'tutte' || (q === 'seguite' && !!v.prevId && seguo.includes(v.prevId));

export function vedo(v: VoceVista, vista: Vista, me: string): boolean {
  const s = v.s;
  if (s) {
    if (me && (s.creato_da === me || s.assegnata_a === me || s.coinvolti?.includes(me))) return true;
    if (vista.urgenze && s.genere === 'urgenza' && !s.fatto) return true;
    return passa(vista.altri, v, vista.seguo);
  }
  if (v.tipo === 'richiamo') return vista.richiami;
  return passa(vista.commesse, v, vista.seguo);
}
export const filtraVista = <T extends VoceVista>(vv: T[], vista: Vista, me: string) => (vedeTutto(vista) ? vv : vv.filter(v => vedo(v, vista, me)));
