// Vento NTC 2018 (§ 3.3) dalle condizioni del sito, per gli impianti fissi (dal configuratore di Desktop\Impianto Fisso).
// La località dà la proposta (zona, quota, categoria: /api/sito); qui si ricalcola a ogni modifica.

export type Categoria = 'I' | 'II' | 'III' | 'IV' | 'V';
export interface Sito {
  localita: string; luogo: string;   // scritta dall'utente; nome trovato
  lat: number | null; lng: number | null;
  zona_vento: number | null; altitudine: number | null; km_mare: number | null;   // m s.l.m.; km
  categoria: Categoria | '';
  tr: number;                // periodo di ritorno, anni
  cp_giu: number | null;     // coefficiente di pressione netta della falda verso il basso (dal progettista)
  cp_su: number | null;      // verso l'alto (sollevamento), in valore assoluto
  cd: number;                // coefficiente dinamico
}
export const SITO: Sito = { localita: '', luogo: '', lat: null, lng: null, zona_vento: null, altitudine: null, km_mare: null, categoria: '', tr: 50, cp_giu: null, cp_su: null, cd: 1 };
export const CATEGORIE: Categoria[] = ['I', 'II', 'III', 'IV', 'V'];

// Tab. 3.3.I: velocità base di riferimento vb0 (m/s), quota a0 (m), coefficiente ks.
const VENTO: Record<number, [number, number, number]> = {
  1: [25, 1000, 0.4], 2: [25, 750, 0.45], 3: [27, 500, 0.37], 4: [28, 500, 0.36], 5: [28, 750, 0.4],
  6: [28, 500, 0.36], 7: [28, 1000, 0.54], 8: [30, 1500, 0.5], 9: [31, 500, 0.32],
};
// Tab. 3.3.II: kr, z0 (m), zmin (m) per categoria di esposizione.
const ESPOSIZIONE: Record<Categoria, [number, number, number]> = {
  I: [0.17, 0.01, 2], II: [0.19, 0.05, 4], III: [0.2, 0.1, 5], IV: [0.22, 0.3, 8], V: [0.23, 0.7, 12],
};

export interface Vento { vb0: number; a0: number; ks: number; ca: number; vb: number; cr: number; vr: number; qr: number; z: number; zmin: number; ce: number; qp: number }

/** z = quota del bordo alto dei moduli da terra (m). qr e qp in N/m². */
export function vento(s: Sito, z: number): Vento | null {
  if (!s.zona_vento || !VENTO[s.zona_vento] || s.altitudine === null || !s.categoria) return null;
  const [vb0, a0, ks] = VENTO[s.zona_vento];
  const ca = s.altitudine <= a0 ? 1 : 1 + ks * (s.altitudine / a0 - 1), vb = vb0 * ca;
  const cr = 0.75 * Math.sqrt(1 - 0.2 * Math.log(-Math.log(1 - 1 / s.tr))), vr = vb * cr;
  const qr = 0.5 * 1.25 * vr * vr;
  const [kr, z0, zmin] = ESPOSIZIONE[s.categoria];
  const l = Math.log(Math.max(z, zmin) / z0);   // ct = 1 (terreno pianeggiante)
  const ce = kr * kr * l * (7 + l);
  return { vb0, a0, ks, ca, vb, cr, vr, qr, z, zmin, ce, qp: qr * ce };
}

/** § 3.3.4: pressione del vento sui moduli p = qp · cp · cd (N/m²), verso il basso e in sollevamento. */
export function pressioni(s: Sito, v: Vento | null) {
  const p = (cp: number | null) => (v && cp !== null ? v.qp * cp * s.cd : null);
  return { giu: p(s.cp_giu), su: p(s.cp_su) };
}
