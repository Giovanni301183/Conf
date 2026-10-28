// Costi degli impianti fissi: dalla distinta di ogni taglia (domain/fisso.ts) alle righe di costo nello stesso formato dei tracker,
// così Costi, Voci extra, Margini, prezzo spot, CSV e archivio sono comuni. Prezzi di default dalla Distinta IMPIANTO 36 MODULI - DE VITA
// (come in costi.ts del configuratore di Desktop\Impianto Fisso): costo d'acquisto in €/kg o €/pz, lavorazione in % sul costo d'acquisto,
// zincatura sì/no (peso aumentato della maggiorazione, pagata a €/kg), altre lavorazioni in €/kg.
// Colonne: acquisto a peso → Materiale, acquisto a pezzo → Acquisto, lavorazione → Lavorazione, zincatura → Zincatura, altre → Altro.
import { PROFILI, calcolaFisso, type Gruppo } from './fisso.js';
import { FCATS, clone, num } from './model.js';

export interface PrezzoFisso { costo: number; um: 'kg' | 'pz'; lav: number; zinc: boolean; altre: number }   // lav = frazione (0,1 = 10 %)
const kg = (costo: number, lav = 0.1, zinc = false): PrezzoFisso => ({ costo, um: 'kg', lav, zinc, altre: 0.05 });
const pz = (costo: number): PrezzoFisso => ({ costo, um: 'pz', lav: 0.1, zinc: false, altre: 0 });

export const PREZZI_FISSO0: Record<string, PrezzoFisso> = {
  trave_falda: kg(1), arc_sx: kg(1, 0.35), arc_centrale: kg(1, 0.35), arc_dx: kg(1, 0.35), arc_unico: kg(1, 0.35),
  montante_basso: kg(1, 0.1, true), montante_alto: kg(1, 0.1, true), puntone_ant: kg(1.2), puntone_post: kg(1.2),
  giunto_vert: kg(1.1), controvento: kg(1.2), giunto_palo: kg(1.1),
  m10x30: pz(0.12), m10x80: pz(0.27), dado: pz(0.075), rondella: pz(0.03),
  aggancio_centrale: pz(1.2), aggancio_laterale: pz(1),
};
/** Descrizioni dei codici per il listino (i profili dalla libreria, la minuteria come in distinta). */
export const NOMI_FISSO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PROFILI).map(([k, [d]]) => [k, d])),
  m10x30: 'Bullone M10x30 (DIN 933)', m10x80: 'Bullone M10x80 tutto filetto (DIN 933)', dado: 'Dado M10 (DIN 934)', rondella: 'Rondella M10 (DIN 125)',
  aggancio_centrale: 'Aggancio centrale', aggancio_laterale: 'Aggancio laterale',
};
// aumZinc = peso in più per la zincatura (frazione), costoZinc in €/kg.
export const PAR_FISSO0 = { aumZinc: 0.03, costoZinc: 0.85 };
export const defListinoFisso = () => ({ prezzi: clone(PREZZI_FISSO0), par: { ...PAR_FISSO0 } });
/** Listino dei fissi nei dati condivisi (data.fisso); i codici mancanti prendono i prezzi DE VITA. */
export function listinoFisso(data: any) {
  const f = data?.fisso || {};
  return { prezzi: { ...PREZZI_FISSO0, ...(f.prezzi || {}) } as Record<string, PrezzoFisso>, par: { ...PAR_FISSO0, ...(f.par || {}) } };
}
/** Completa data.fisso (listino salvato prima dei fissi o senza i codici nuovi), così la scheda Listino può modificarlo.
 *  Si chiama al caricamento dei dati: ripetuta non cambia niente. */
export function normListinoFisso(data: any) {
  const f = (data.fisso ??= {});
  f.par = { ...PAR_FISSO0, ...(f.par || {}) };
  f.prezzi ??= {};
  for (const [k, p] of Object.entries(PREZZI_FISSO0)) f.prezzi[k] ??= { ...p };
  return f;
}

// Categorie dei fissi (FCATS in model.ts): alluminio a parte, così ha un margine proprio.
const CAT: Record<Gruppo, string> = { strutturali: 'STRUTTURA', bulloneria: 'BULLONERIA', alluminio: 'ALLUMINIO' };
const GRUPPO: Record<Gruppo, string> = { strutturali: 'COMPONENTI STRUTTURALI', bulloneria: 'BULLONERIA', alluminio: 'ALLUMINIO' };
const SUB: Record<Gruppo, string> = { strutturali: 'Profili', bulloneria: 'Bulloneria', alluminio: 'Agganci moduli' };

/** Righe di costo (senza margini né voci extra) di un preventivo di impianto fisso, una per componente e taglia. */
export function lineeFisso(data: any, prev: any) {
  const { r, errore } = calcolaFisso(prev), { prezzi, par } = listinoFisso(data), lines: any[] = [], warn: string[] = [];
  if (!r) return { lines, righe: [] as any[], warn: errore ? [errore] : [], nStrutture: 0, nModuli: 0, kwp: 0, wp: 0 };
  const pesi0 = () => Object.fromEntries(FCATS.map(c => [c, 0])) as Record<string, number>;
  const righe = r.taglie.map((t, i) => {
    const n = t.input.n_strutture, label = `T${i + 1} · ${t.input.moduli} moduli · ×${n}`;
    for (const g of t.righe) {
      if (!g.quantita) continue;
      const p = prezzi[g.codice];
      if (!p) warn.push(`Prezzo di "${g.descrizione}" non trovato nel listino dei fissi`);
      const massa = (g.totale * g.massa) / g.quantita, kgZ = massa * (1 + num(par.aumZinc));
      const acquisto = p ? (p.um === 'kg' ? massa : g.totale) * num(p.costo) : 0;
      const L = g.lunghezza ? g.lunghezza / 1000 : '';
      lines.push({
        riga: i, rigaLabel: label, gruppo: GRUPPO[g.gruppo], cat: CAT[g.gruppo], sub: SUB[g.gruppo], code: g.codice, art: g.codice,
        desc: g.descrizione + (L ? ` · L ${String(+(+L).toFixed(3)).replace('.', ',')} m` : ''), L, q: g.totale, qPer: g.quantita,
        peso: p?.zinc ? kgZ : massa, mat: p?.um === 'kg' ? acquisto : 0, acq: p?.um === 'pz' ? acquisto : 0, lav: acquisto * num(p?.lav),
        zinc: p?.zinc ? kgZ * num(par.costoZinc) : 0, altro: massa * num(p?.altre),
      });
    }
    return { i, label, rid: `T${i + 1}`, conf: `${t.input.moduli} moduli · ${t.campate} campate · ${t.telai} telai · ${(t.lunghezza / 1000).toFixed(2).replace('.', ',')} m`,
      n, moduli: t.input.moduli * n, kwp: t.potenza * n, tot: 0, prezzo: 0, pesi: pesi0() };
  });
  return { lines, righe, warn, nStrutture: r.totali.strutture, nModuli: r.totali.moduli, kwp: r.totali.potenza, wp: num(prev.fisso?.comuni?.potenza_modulo) * 1000 };
}
