// Impianti fissi: dal modulo, dalla taglia e dai parametri ricava geometria e distinta di una struttura (motore portato
// dal configuratore Python di Desktop\Impianto Fisso, engine/regole.py e engine/libreria.py: stessi numeri, stessi avvisi).
// Tutto discende dalle colonne di moduli C = moduli / file in verticale: campate K = ceil(C / 2), telai T = K + 1.
// La libreria di default viene dalla Distinta IMPIANTO 36 MODULI - DE VITA (lunghezze in mm, kg/m per i profili, kg/pz per la minuteria).

import type { Sito } from './vento.js';

export const PROFILI: Record<string, [string, number, number]> = {
  trave_falda: ['Trave di falda - profilo MAX zinc. S250 ZM 220x2,0', 4000, 3.432],
  arc_sx: ['Arcareccio tipo "1" testata sinistra - sv. 242 sp. 2,0', 2996, 3.7752],
  arc_centrale: ['Arcareccio tipo "2" centrali - sv. 242 sp. 2,0', 2644, 3.7752],
  arc_dx: ['Arcareccio tipo "3" testata destra - sv. 242 sp. 2,0', 2395, 3.7752],
  arc_unico: ['Arcareccio unico (taglia da 4) - sv. 242 sp. 2,0', 2731, 3.7752],
  montante_basso: ['Montante basso - profilo MAX nero S355 220x2,5', 1390, 4.29],
  montante_alto: ['Montante alto - profilo MAX nero S355 220x2,5', 3415, 4.29],
  puntone_ant: ['Puntone anteriore - scatolare 50x20x3 Z275', 1656, 3.01],
  puntone_post: ['Puntone posteriore - scatolare 50x20x3 Z275', 2050, 3.01],
  giunto_vert: ['Giunto di collegamento verticale - scatolare 50x20x3', 230, 3.01],
  controvento: ['Controventature - tubo zincato Ø32x2', 3300, 1.470265361880023],
  giunto_palo: ['Giunto per palo MAX - piatto zincato 300x166x4', 300, 5.1792],
};
// Bulloneria della struttura da 36: totali della distinta De Vita divisi per 19 strutture.
export const BULLONERIA_36: Record<string, [string, number, number]> = {
  m10x30: ['Bullone M10x30 (DIN 933)', 84 / 19, 0.025],
  m10x80: ['Bullone M10x80 tutto filetto (DIN 933)', 2532 / 19, 0.053],
};
export const DADO: [string, number] = ['Dado M10 (DIN 934)', 0.011];
export const RONDELLA: [string, number] = ['Rondella M10 (DIN 125)', 0.004];
// Infissione compresa nelle lunghezze dei montanti (tavola DE VITA): cambiando l'infissione il montante cambia della stessa differenza.
export const INFISSIONE_BASE: Record<string, number> = { montante_basso: 700, montante_alto: 1200 };
export const ALLUMINIO: Record<string, [string, number]> = {
  aggancio_centrale: ['Aggancio centrale', 0.04],
  aggancio_laterale: ['Aggancio laterale', 0.03],
};

export const FILE_ARCARECCI = 4;
export const COLONNE_PER_CAMPATA = 2;
const TAGLIE_CON_RISERVA = [18];
// Sbalzo dei moduli oltre il primo e l'ultimo telaio (tavola DE VITA rev. IV): prima campata 2646 - 20 - 2 x 110,5 = 2405 mm.
export const SBALZO = 110.5;
export const DISTANZA_PALI_ANT_POST = 3270;   // mm in pianta: dipende dal telaio, non dalla taglia
export const TAGLIA_MAX = 36;
export const TAGLIE = [4, 8, 12, 16, 18, 20, 24, 28, 32, 36];

/** Parametri comuni a tutto l'impianto: pannello, struttura, cliente. */
export interface Comuni {
  lunghezza_modulo: number;   // mm, lato inclinato
  larghezza_modulo: number;   // mm, lungo la struttura
  potenza_modulo: number;     // kWp
  peso_modulo: number | null; // kg, dipende dal pannello: lo inserisce l'utente
  file_verticali: number;
  fuga: number;               // mm
  inclinazione: number;       // gradi
  altezza_min_terra: number;  // mm
  infissione_ant: number;     // mm sotto il piano di campagna, pilastro anteriore (montante basso)
  infissione_post: number;    // mm, pilastro posteriore (montante alto)
  cliente: string;
  data: string;               // gg/mm/aaaa, vuota = oggi
}
/** Una riga della composizione impianto: taglia, quante strutture e le scelte proprie. */
export interface Taglia { moduli: number; n_strutture: number; controventi: number | null; lunghezza_arc_unico: number | null }
export type Input = Comuni & Taglia;

export const COMUNI: Comuni = {
  lunghezza_modulo: 2384, larghezza_modulo: 1303, potenza_modulo: 0.735, peso_modulo: null, file_verticali: 2, fuga: 20,
  inclinazione: 25, altezza_min_terra: 400, infissione_ant: 700, infissione_post: 1200, cliente: '', data: '',
};
export const nuovaTaglia = (moduli: number, n_strutture = 1): Taglia => ({ moduli, n_strutture, controventi: null, lunghezza_arc_unico: null });
export const input = (o: Partial<Input> = {}): Input => ({ ...COMUNI, ...nuovaTaglia(36), ...o });

export type Gruppo = 'strutturali' | 'bulloneria' | 'alluminio';
export interface Riga {
  codice: string; descrizione: string; gruppo: Gruppo;
  quantita: number;          // per una struttura
  lunghezza: number | null;
  peso_unit: number;         // kg/m per i profili, kg/pz per la minuteria
  massa: number;             // kg per una struttura
  totale: number;            // pezzi per tutte le strutture di questa taglia
}
export interface Rettangolo { x: number; y: number; w: number; h: number }
export interface Geometria {
  lunghezza: number; profondita: number; moduli: Rettangolo[]; telai_x: number[]; interasse_pali: number;
  distanza_pali_ant_post: number; campate_controventi: number[];
  sezione: { falda: [number, number][]; altezza_bassa: number; altezza_alta: number };
}
export interface Risultato {
  input: Input; colonne: number; campate: number; telai: number; lunghezza: number; potenza: number;
  righe: Riga[]; avvisi: string[]; geometria: Geometria; massa_struttura: number; massa_totale: number;
}

export class TagliaNonAmmessa extends Error {}

/** Numero come lo scrive Python con {:g}: niente zeri inutili. */
const g = (x: number) => String(+x.toPrecision(6));

export function verificaTaglia(moduli: number): string[] {
  if (moduli < 4) throw new TagliaNonAmmessa('La taglia minima è 4 moduli.');
  if (moduli % 4 === 0) return [];
  if (TAGLIE_CON_RISERVA.includes(moduli)) return [`Taglia ${moduli} ammessa con riserva: l'ultima campata porta 1 sola colonna di moduli. Da verificare.`];
  throw new TagliaNonAmmessa(`Taglia ${moduli} non ammessa: solo multipli di 4 (e 18 con riserva).`);
}

/** Sulla 36 (9 campate) sono 6; sulle altre taglie è una proposta che l'utente cambia. */
export const controventiProposti = (campate: number) => Math.max(2, 2 * Math.ceil(6 * campate / 9 / 2));

export function calcola(inp: Input): Risultato {
  const avvisi = verificaTaglia(inp.moduli);
  if (inp.moduli % inp.file_verticali) throw new TagliaNonAmmessa('Il numero di moduli deve essere divisibile per le file in verticale.');
  const C = inp.moduli / inp.file_verticali, K = Math.ceil(C / COLONNE_PER_CAMPATA), T = K + 1;
  const passoColonna = inp.larghezza_modulo + inp.fuga, lunghezza = C * passoColonna;
  const N = Math.max(inp.n_strutture, 1), righe: Riga[] = [];

  const profilo = (codice: string, q: number, lunghezzaMm?: number | null) => {
    const [descrizione, L0, kgm] = PROFILI[codice], L = lunghezzaMm || L0;
    righe.push({ codice, descrizione, gruppo: 'strutturali', quantita: q, lunghezza: L, peso_unit: kgm, massa: q * L / 1000 * kgm, totale: q * inp.n_strutture });
  };

  const infissione: Record<string, number> = { montante_basso: inp.infissione_ant, montante_alto: inp.infissione_post };
  for (const [codice, inf] of Object.entries(infissione)) {
    if (inf < 0) throw new TagliaNonAmmessa("L'infissione dei pali non può essere negativa.");
    const base = INFISSIONE_BASE[codice];
    if (inf !== base) avvisi.push(`${PROFILI[codice][0].split(' - ')[0]}: infissione ${g(inf)} mm invece di ${base} (lunghezza ${g(PROFILI[codice][1] + inf - base)} mm).`);
  }
  for (const codice of ['trave_falda', 'montante_basso', 'montante_alto', 'puntone_ant', 'puntone_post'])
    profilo(codice, T, codice in infissione ? PROFILI[codice][1] + infissione[codice] - INFISSIONE_BASE[codice] : null);
  profilo('giunto_vert', 2 * T);

  if (K === 1) {
    profilo('arc_unico', FILE_ARCARECCI, inp.lunghezza_arc_unico);
    avvisi.push('Taglia da 4: arcareccio unico per fila, lunghezza proposta modificabile.');
  } else {
    profilo('arc_sx', FILE_ARCARECCI);
    profilo('arc_centrale', (K - 2) * FILE_ARCARECCI);
    if (C % COLONNE_PER_CAMPATA) {
      // ultima campata con una sola colonna: testata destra accorciata di una colonna
      const Ldx = PROFILI.arc_dx[1] - COLONNE_PER_CAMPATA * passoColonna / 2;
      profilo('arc_dx', FILE_ARCARECCI, Ldx);
      avvisi.push(`Arcareccio testata destra accorciato a ${g(Ldx)} mm: da verificare.`);
    } else profilo('arc_dx', FILE_ARCARECCI);
  }

  let nContr = inp.controventi ?? null;
  if (nContr == null) {
    nContr = inp.moduli === 36 ? 6 : controventiProposti(K);
    if (inp.moduli !== 36) avvisi.push(`Controventi: proposti ${nContr}, da confermare.`);
  }
  profilo('controvento', nContr);
  profilo('giunto_palo', (K - 1) * FILE_ARCARECCI);

  // Bulloneria: quantità della 36 ridotte in proporzione ai moduli. Per struttura resta il valore esatto, come nella
  // distinta DE VITA; si arrotonda per eccesso sul totale della taglia.
  let bulloni = 0;
  for (const [codice, [descrizione, q36, kg]] of Object.entries(BULLONERIA_36)) {
    const q = q36 * inp.moduli / 36, tot = Math.ceil(q * N - 1e-9);
    bulloni += tot;
    righe.push({ codice, descrizione, gruppo: 'bulloneria', quantita: q, lunghezza: null, peso_unit: kg, massa: q * kg, totale: tot });
  }
  for (const [codice, [descrizione, kg], tot] of [['dado', DADO, bulloni], ['rondella', RONDELLA, 2 * bulloni]] as const)
    righe.push({ codice, descrizione, gruppo: 'bulloneria', quantita: tot / N, lunghezza: null, peso_unit: kg, massa: tot / N * kg, totale: tot });

  for (const [codice, q] of [['aggancio_centrale', 2 * inp.moduli], ['aggancio_laterale', 2 * FILE_ARCARECCI]] as const) {
    const [descrizione, kg] = ALLUMINIO[codice];
    righe.push({ codice, descrizione, gruppo: 'alluminio', quantita: q, lunghezza: null, peso_unit: kg, massa: q * kg, totale: q * N });
  }

  if (!inp.peso_modulo) avvisi.push('Peso modulo non inserito: in distinta i pannelli hanno massa 0.');

  return {
    input: inp, colonne: C, campate: K, telai: T, lunghezza, potenza: inp.moduli * inp.potenza_modulo, righe, avvisi,
    geometria: geometria(inp, C, K, lunghezza, nContr),
    massa_struttura: righe.reduce((s, r) => s + r.massa, 0),
    massa_totale: righe.reduce((s, r) => s + (r.quantita ? r.totale * r.massa / r.quantita : 0), 0),
  };
}

/** Un risultato per taglia; pannello, inclinazione, infissione, cliente e data sono comuni. */
export function calcolaImpianto(base: Comuni, taglie: Taglia[]) {
  if (!taglie.length) throw new TagliaNonAmmessa("Aggiungi almeno una taglia all'impianto.");
  const viste = new Set<number>();
  for (const t of taglie) {
    if (viste.has(t.moduli)) throw new TagliaNonAmmessa(`La taglia ${t.moduli} compare due volte: somma le strutture in una riga.`);
    if (t.n_strutture < 1) throw new TagliaNonAmmessa(`Taglia ${t.moduli}: serve almeno una struttura.`);
    viste.add(t.moduli);
  }
  const rr = taglie.map(t => calcola({ ...base, moduli: t.moduli, n_strutture: t.n_strutture, controventi: t.controventi, lunghezza_arc_unico: t.lunghezza_arc_unico }));
  return {
    taglie: rr,
    totali: {
      strutture: rr.reduce((s, r) => s + r.input.n_strutture, 0),
      moduli: rr.reduce((s, r) => s + r.input.moduli * r.input.n_strutture, 0),
      potenza: rr.reduce((s, r) => s + r.potenza * r.input.n_strutture, 0),
      massa: rr.reduce((s, r) => s + r.massa_totale, 0),
    },
  };
}
export type RisultatoImpianto = ReturnType<typeof calcolaImpianto>;

export interface Proposta { taglie: Taglia[]; moduli: number; richiesti: number; potenza: number; note: string[] }

/** Prima tutte le strutture da 36, poi una sola taglia per il resto (multipla di 4, per eccesso).
 *  L'utente parte da qui e modifica la composizione come vuole. */
export function proponiImpianto(o: { moduli?: number | null; kwp?: number | null }, potenzaModulo = 0.735): Proposta {
  const note: string[] = [];
  let moduli = o.moduli ?? null;
  if (moduli == null) {
    if (!o.kwp || o.kwp <= 0 || potenzaModulo <= 0) throw new TagliaNonAmmessa('Indica la potenza in kWp o il numero di moduli.');
    moduli = Math.ceil(o.kwp / potenzaModulo - 1e-9);
    const it = (x: number) => g(x).replace('.', ',');
    note.push(`${it(o.kwp)} kWp / ${it(potenzaModulo)} kWp per modulo = ${moduli} moduli.`);
  }
  if (moduli < 1) throw new TagliaNonAmmessa('Servono almeno 4 moduli.');
  const richiesti = moduli;
  let n36 = Math.floor(moduli / TAGLIA_MAX), resto = Math.ceil((moduli % TAGLIA_MAX) / 4) * 4;
  if (resto === TAGLIA_MAX) { n36++; resto = 0; }
  const taglie = [...(n36 ? [nuovaTaglia(TAGLIA_MAX, n36)] : []), ...(resto ? [nuovaTaglia(resto)] : [])];
  const totale = n36 * TAGLIA_MAX + resto;
  if (totale > richiesti) note.push(`Le taglie vanno a multipli di 4: ${totale} moduli, ${totale - richiesti} in più del richiesto.`);
  return { taglie, moduli: totale, richiesti, potenza: totale * potenzaModulo, note };
}

/** Campate (da 0) con una croce di controvento: 2 tubi per croce, distribuite lungo la struttura.
 *  Sulla 36 dà le campate 1, 4, 7 come nella tavola DE VITA. */
export function campateControventi(C: number, K: number, nControventi: number) {
  const nCroci = Math.floor(nControventi / 2), campate: number[] = [];
  for (let k = 0; k < nCroci; k++) {
    let j = Math.min(Math.floor((k + 0.5) * K / nCroci), K - 1);
    if (C % COLONNE_PER_CAMPATA && j === K - 1 && K > 1) j = K - 2;   // l'ultima campata ridotta non porta croci
    if (!campate.includes(j)) campate.push(j);
  }
  return campate;
}

/** Coordinate in mm condivise da anteprima e DXF. */
export function geometria(inp: Input, C: number, K: number, lunghezza: number, nControventi = 0): Geometria {
  const passoColonna = inp.larghezza_modulo + inp.fuga, passoCampata = COLONNE_PER_CAMPATA * passoColonna;
  const a = inp.inclinazione * Math.PI / 180;
  const falda = inp.file_verticali * inp.lunghezza_modulo + (inp.file_verticali - 1) * inp.fuga;
  const profPianta = falda * Math.cos(a), passoFila = (inp.lunghezza_modulo + inp.fuga) * Math.cos(a);
  const moduli: Rettangolo[] = [];
  for (let c = 0; c < C; c++)
    for (let f = 0; f < inp.file_verticali; f++)
      moduli.push({ x: c * passoColonna, y: f * passoFila, w: inp.larghezza_modulo, h: inp.lunghezza_modulo * Math.cos(a) });
  const telai_x = [SBALZO];
  for (let i = 1; i <= K; i++) telai_x.push(Math.min(i * passoCampata, lunghezza) - inp.fuga - SBALZO);
  const basso = inp.altezza_min_terra, alto = basso + falda * Math.sin(a);
  return {
    lunghezza, profondita: profPianta, moduli, telai_x, interasse_pali: telai_x[telai_x.length - 1] - telai_x[0],
    distanza_pali_ant_post: DISTANZA_PALI_ANT_POST, campate_controventi: campateControventi(C, K, nControventi),
    sezione: { falda: [[0, basso], [profPianta, alto]], altezza_bassa: basso, altezza_alta: alto },
  };
}

/* ---------- Preventivo di un impianto fisso (prev.fisso) ---------- */
// I campi facoltativi vuoti dei moduli dell'app valgono '' (peso modulo, controventi, arcareccio unico, dati del sito): qui diventano null.
// Cliente e data sono quelli della commessa del preventivo.
export function defFisso() {
  const { cliente: _c, data: _d, ...comuni } = COMUNI;
  return { comuni: { ...comuni, peso_modulo: '' as number | '' }, taglie: [{ ...nuovaTaglia(36), controventi: '', lunghezza_arc_unico: '' }] as any[], sito: defSito() };
}
// Località e coordinate sono quelle del preventivo (prev.luogo, come per i tracker e la mappa): qui solo i dati del vento.
export function defSito() {
  return { luogo: '', zona_vento: '', altitudine: '', km_mare: '', categoria: '', tr: 50, cp_giu: '', cp_su: '', cd: 1 } as Record<string, any>;
}
const nul = (v: unknown) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
const dataIt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '');
export function comuniDi(P: any): Comuni {
  const c = P.fisso?.comuni || {};
  return { ...COMUNI, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, nul(v)])), peso_modulo: nul(c.peso_modulo), cliente: P.cliente || '', data: dataIt(P.data) } as Comuni;
}
export const taglieDi = (P: any): Taglia[] => (P.fisso?.taglie || []).map((t: any) =>
  ({ moduli: nul(t.moduli) ?? 36, n_strutture: nul(t.n_strutture) ?? 1, controventi: nul(t.controventi), lunghezza_arc_unico: nul(t.lunghezza_arc_unico) }));
/** Sito con i valori numerici (null dove vuoti), per il calcolo del vento. */
export function sitoDi(P: any): Sito {
  const s = { ...defSito(), ...(P.fisso?.sito || {}) };
  return { ...s, localita: P.luogo?.nome || '', lat: nul(P.luogo?.lat), lng: nul(P.luogo?.lng), zona_vento: nul(s.zona_vento), altitudine: nul(s.altitudine), km_mare: nul(s.km_mare),
    tr: nul(s.tr) ?? 50, cp_giu: nul(s.cp_giu), cp_su: nul(s.cp_su), cd: nul(s.cd) ?? 1 };
}
/** Calcolo del preventivo aperto: risultato oppure il messaggio dell'errore (taglia non ammessa, dati mancanti). */
export function calcolaFisso(P: any): { r: RisultatoImpianto | null; errore: string } {
  try { return { r: calcolaImpianto(comuniDi(P), taglieDi(P)), errore: '' }; }
  catch (e) { return { r: null, errore: (e as Error).message }; }
}
