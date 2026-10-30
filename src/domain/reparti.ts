// Reparti della mappa nella Home. Le note ci vanno tramite i temi (etichette, vedi documenti.ts); le voci d'agenda con i reparti scelti,
// oppure dal tipo (date di commessa, richiamo), oppure dai reparti di chi le deve fare. Quello che non ha reparto va in «Da smistare».
import type { Voce } from './calendario.js';

export interface Reparto { k: string; nome: string; ic: string; temi: string[] }
export const REPARTI: Reparto[] = [
  { k: 'direzione', nome: 'Direzione', ic: '🧭', temi: ['direzione', 'riunione'] },
  { k: 'commerciale', nome: 'Commerciale', ic: '🤝', temi: ['vendita', 'opportunita', 'marketing'] },
  { k: 'tecnico', nome: 'Tecnico', ic: '📐', temi: ['tecnico', 'geologia', 'pullout', 'normativa'] },
  { k: 'rs', nome: 'R&S', ic: '🔬', temi: ['sviluppo', 'idea'] },
  { k: 'acquisti', nome: 'Acquisti', ic: '🛒', temi: ['acquisti'] },
  { k: 'produzione', nome: 'Produzione', ic: '🏭', temi: ['produzione'] },
  { k: 'qualita', nome: 'Qualità e sicurezza', ic: '🦺', temi: ['qualita', 'sicurezza'] },
  { k: 'logistica', nome: 'Logistica', ic: '🚚', temi: ['logistica'] },
  { k: 'cantiere', nome: 'Cantiere', ic: '🏗️', temi: ['cantiere'] },
  { k: 'assistenza', nome: 'Assistenza', ic: '🔧', temi: ['assistenza'] },
  { k: 'amministrazione', nome: 'Amministrazione', ic: '📊', temi: ['amministrazione'] },
  { k: 'hr', nome: 'Risorse umane', ic: '👥', temi: ['personale'] },
];
export const SMISTARE = 'smistare';
export const nomeReparto = (k: string) => (k === SMISTARE ? 'Da smistare' : REPARTI.find(r => r.k === k)?.nome || k);
export const icReparto = (k: string) => (k === SMISTARE ? '📥' : REPARTI.find(r => r.k === k)?.ic || '•');
/** Solo chiavi di reparti esistenti, senza doppioni. */
export const pulisciReparti = (kk: unknown) => (Array.isArray(kk) ? [...new Set(kk.map(String).filter(k => REPARTI.some(r => r.k === k)))] : []);

/** Reparti dei temi di una nota. */
export const repartiDaTemi = (temi: string[] | null | undefined) => REPARTI.filter(r => r.temi.some(t => (temi || []).includes(t))).map(r => r.k);
/** Reparti di una nota: dai suoi temi, altrimenti «Da smistare». */
export function repartiNota(d: { etichette?: string[] | null }) {
  const r = repartiDaTemi(d.etichette);
  return r.length ? r : [SMISTARE];
}
/** Reparti di una voce del calendario: quelli scelti; le date di commessa e i richiami dal tipo; altrimenti i reparti di chi la deve fare
 *  (o di chi l'ha creata); altrimenti «Da smistare». repartiDi = reparti di un collega per email. */
export function repartiVoce(v: Voce, repartiDi: (email: string) => string[]) {
  const scelti = pulisciReparti(v.s?.reparti);
  if (scelti.length) return scelti;
  if (v.tipo === 'prod' || v.tipo === 'prodFine') return ['produzione'];
  if (v.tipo === 'mont') return ['cantiere'];
  if (v.tipo === 'richiamo') return ['commerciale'];
  const chi = v.s?.assegnata_a || v.s?.creato_da, r = chi ? pulisciReparti(repartiDi(chi)) : [];
  return r.length ? r : [SMISTARE];
}

// Settori della mappa: pallini intorno al reparto aperto. Una voce o una nota ha i settori scelti a mano; altrimenti quello del
// preventivo collegato (tracker e impianti fissi = Energia). «Lavori speciali» solo a mano. Senza settore resta solo nel reparto.
export interface SettoreMappa { k: string; nome: string; colore: string }
export const SETTORI_MAPPA: SettoreMappa[] = [
  { k: 'energia', nome: 'Energia', colore: '#d39a1c' },
  { k: 'serre', nome: 'Serre', colore: '#3f8f5a' },
  { k: 'vigneti', nome: 'Vigneti', colore: '#8b4f8f' },
  { k: 'recinzioni', nome: 'Recinzioni', colore: '#5b7590' },
  { k: 'speciali', nome: 'Lavori speciali', colore: '#c0572f' },
];
export const nomeSettoreMappa = (k: string) => SETTORI_MAPPA.find(s => s.k === k)?.nome || k;
/** Solo chiavi di settori esistenti, senza doppioni. */
export const pulisciSettori = (kk: unknown) => (Array.isArray(kk) ? [...new Set(kk.map(String).filter(k => SETTORI_MAPPA.some(s => s.k === k)))] : []);
/** Settore della mappa dal settore di un preventivo (prev.settore; vuoto = tracker). */
export const settoreMappaDi = (settore: string | null | undefined) => {
  const k = !settore || settore === 'tracker' || settore === 'fisso' ? 'energia' : settore;
  return SETTORI_MAPPA.some(s => s.k === k) ? k : '';
};
/** Settori di una voce o di una nota: quelli scelti, altrimenti quello del preventivo collegato.
 *  settoreDi = prev.settore del preventivo con quell'id ('' = tracker), undefined se non c'è. */
export function settoriDi(scelti: unknown, prevId: string | null | undefined, settoreDi: (id: string) => string | undefined): string[] {
  const s = pulisciSettori(scelti);
  if (s.length || !prevId) return s;
  const p = settoreDi(prevId), k = p === undefined ? '' : settoreMappaDi(p);
  return k ? [k] : [];
}
