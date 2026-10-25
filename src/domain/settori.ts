// Settori di prodotto: ognuno ha la sua cascata di schede (distinta base → preventivo → produzione e cantiere).
// Per ora solo i tracker sono pronti; gli altri mostrano la pagina «in sviluppo».

export type Settore = 'tracker' | 'fisso' | 'vigneti' | 'serre' | 'recinzioni';
export interface InfoSettore { k: Settore; gruppo: string; nome: string; pronto: boolean; cosa: string }

export const SETTORI: InfoSettore[] = [
  { k: 'tracker', gruppo: 'Energia', nome: 'Tracker solari', pronto: true, cosa: 'Tracker monoassiali: configurazione delle file, distinta, costi, margini, offerta, lavorazione e montaggio.' },
  { k: 'fisso', gruppo: 'Energia', nome: 'Impianti fissi', pronto: false, cosa: 'Strutture fisse per fotovoltaico, con un preventivo separato da quello dei tracker.' },
  { k: 'vigneti', gruppo: 'Vigneti', nome: 'Vigneti', pronto: false, cosa: 'Pali in profilo d\'acciaio di nostra produzione, con lo sviluppo che cambia secondo le esigenze nostre e del cliente; fili, ancore, reti e cancelli commercializzati.' },
  { k: 'serre', gruppo: 'Serre', nome: 'Serre', pronto: false, cosa: 'Serre su progetto: si parte da un modello e la distinta si modifica nel singolo preventivo.' },
  { k: 'recinzioni', gruppo: 'Recinzioni', nome: 'Recinzioni', pronto: false, cosa: 'Recinzioni: reti, pali e cancelli.' },
];
/** Macro aree del menu, nell'ordine: ognuna con i suoi settori (Energia ne ha due, le altre uno). */
export const AREE = [...new Set(SETTORI.map(s => s.gruppo))];
/** Schede della cascata di ogni settore. */
export const PASSI = ['distinte', 'config', 'costi', 'extra', 'margini', 'invia', 'docs', 'lavor', 'mont'] as const;
export const infoSettore = (k: string) => SETTORI.find(s => s.k === k) || SETTORI[0];
/** Settore di un preventivo: quelli salvati prima dei settori sono tutti tracker. */
export const settoreDi = (prev: any): Settore => infoSettore(prev?.settore).k;
