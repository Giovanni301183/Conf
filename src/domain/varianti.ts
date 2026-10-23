// Varianti di un preventivo: copie identiche al preventivo base che cambiano solo il materiale (profilo dei pilastri,
// spessore dell'asse, spessore dell'omega) su tutte le righe tracker. Ogni variante e' un preventivo a se', con il suo numero
// e la sua offerta; in prev.variante resta il legame con il base. Usate dall'app (archivio e assistente) e da Telegram (_preventivo.ts).
import { eur, fN } from './format.js';
import { clone, num } from './model.js';
import { pilastri } from './referenze.js';

export interface Variante { prof?: string | null; asse?: number | string | null; omega?: number | string | null }
export const SPESSORI = { asse: ['2,5', '3,0'], omega: ['2,0', '1,8'] } as const;

const norm = (v: unknown) => String(v).toUpperCase().replace(/[\s.]/g, '');
/** Profilo detto o scritto: il codice esatto ("IPE 180") o la sola famiglia ("IPEA"). Con piu' profili della famiglia
 *  si sceglie quello della stessa misura del profilo attuale (IPE 140 → IPEA 140). Errore = eccezione col motivo. */
export function profDa(v: unknown, data: any, attuale = ''): string {
  const pp = pilastri(data).map(([c]) => c), x = norm(v);
  const esatto = pp.find(c => norm(c) === x); if (esatto) return esatto;
  const fam = pp.filter(c => norm(c).replace(/[\d,x]+$/i, '') === x);
  if (fam.length === 1) return fam[0];
  const misura = norm(attuale).match(/[\d,x]+$/i)?.[0];
  const stessa = misura ? fam.filter(c => norm(c).endsWith(misura)) : [];
  if (stessa.length === 1) return stessa[0];
  throw new Error(fam.length ? `Profilo "${v}": quale? ${fam.join(' o ')}.` : `Profilo "${v}" sconosciuto: ${pp.join(', ')}.`);
}
const spessore = (k: 'asse' | 'omega', v: unknown) => {
  const o = SPESSORI[k].find(x => Math.abs(num(x) - num(v)) < 1e-6);
  if (!o) throw new Error(`Spessore ${k} ${v} non previsto: ${SPESSORI[k].join(' o ')} mm.`);
  return o;
};

/** Profilo e spessori della variante come codici dell'app; i campi vuoti restano quelli del base. */
export function pulisci(v: Variante, data: any, base: any): { prof?: string; asse?: string; omega?: string } {
  const out: { prof?: string; asse?: string; omega?: string } = {}, vuoto = (x: unknown) => x == null || x === '';
  if (!vuoto(v.prof)) out.prof = profDa(v.prof, data, base.righe[0]?.prof);
  if (!vuoto(v.asse)) out.asse = spessore('asse', v.asse);
  if (!vuoto(v.omega)) out.omega = spessore('omega', v.omega);
  return out;
}

/** Profili e spessori usati nelle righe, per il nome della variante: "IPEA 140 · asse 2,5 · omega 2,0". */
export function etichetta(P: any): string {
  const d = (k: string) => [...new Set(P.righe.map((r: any) => String(r[k])))].join('/');
  return `${d('prof')} · asse ${d('asse')} · omega ${d('omega')}`;
}

/** Copia del base con la variante applicata a tutte le righe; null se la variante e' uguale al base. Errore = eccezione. */
export function variante(base: any, v: Variante, data: any): any | null {
  const x = pulisci(v, data, base);
  if (!Object.keys(x).length) throw new Error('Variante vuota: indica profilo, asse o omega.');
  const P = clone(base);
  for (const r of P.righe) Object.assign(r, x);
  if (etichetta(P) === etichetta(base)) return null;
  delete P._id; delete P.num;
  P.stato = 'bozza';
  if (P.offerta) P.offerta.inviata = '';
  // Sempre legata al primo base, anche se nasce dalla variante di una variante: il gruppo resta uno.
  P.variante = { di: base.variante?.di || base._id || null, num: base.variante?.num || base.num || '', etichetta: etichetta(P) };
  return P;
}

/** Nome in archivio della variante: quello del base (senza la variante del base) piu' l'etichetta. */
export const nomeVariante = (nomeBase: string, P: any) => `${nomeBase.split(' — ')[0]} — ${P.variante.etichetta}`;

/** Riga del confronto tra varianti: numero, materiale, prezzo, €/Wp e acciaio. */
export const rigaVariante = (P: any, R: any) =>
  `N° ${P.num || '–'} · ${etichetta(P)} · ${eur(R.prezzo)} · €/Wp ${R.kwp ? fN(R.prezzo / (R.kwp * 1000), 4) : '–'} · acciaio ${fN(R.steel / 1000, 1)} t`;

/** Gli altri preventivi del gruppo (base e sue varianti) ancora in bozza o inviati: quando uno e' vinto diventano "non scelta". */
export function daNonScegliere(arch: any[], id: string): any[] {
  const e = arch.find(a => a.id === id); if (!e) return [];
  const radice = e.prev?.variante?.di || e.id;
  return arch.filter(a => a.id !== id && (a.id === radice || a.prev?.variante?.di === radice) && ['bozza', 'inviato'].includes(a.prev?.stato || 'bozza'));
}
