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
