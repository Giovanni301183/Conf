// Calendario e agenda della Home: date ricavate dalle commesse (preventivi vinti) e voci inserite a mano
// (cose da fare, promemoria, scadenze, appuntamenti), legate o no a un preventivo e assegnabili a un collega.
// Dalle commesse si prendono solo inizio e fine produzione e inizio montaggio, per non affollare il mese.
// Dai preventivi inviati senza risposta nasce da solo il richiamo al cliente dopo RICHIAMO giorni.
import { S, withPrev } from '../store/state';
import { eStato } from './kpi';
import { clone, normPrev } from './model';
import { AUTO, buildGantt, buildLavor, buildMontGantt, dNum, dToday, montDrv } from './plan';

export type Genere = 'attivita' | 'promemoria' | 'scadenza' | 'appuntamento';
export interface Scadenza {
  id: string; giorno: string; ora: string | null; genere: Genere; titolo: string; nota: string | null; preventivo_id: string | null;
  assegnata_a: string | null; fatto: boolean; origine: 'app' | 'telegram'; creato_da: string; creato: string;
}
export type Tipo = 'prod' | 'prodFine' | 'mont' | 'richiamo' | 'man';
export interface Voce { key: string; giorno: number; tipo: Tipo; titolo: string; sotto: string; prevId?: string; s?: Scadenza }
// [etichetta, colore]
export const TIPI: Record<Tipo, [string, string]> = {
  prod: ['Inizio produzione', 'var(--c-lav)'], prodFine: ['Fine produzione', 'var(--c-mat)'],
  mont: ['Inizio montaggio', 'var(--c-acq)'], richiamo: ['Richiamare il cliente', 'var(--warn)'], man: ['Voce a mano', 'var(--acc)'],
};
// Voci a mano: [etichetta, colore]
export const GENERI: Record<Genere, [string, string]> = {
  attivita: ['Da fare', 'var(--acc)'], promemoria: ['Promemoria', 'var(--gold)'],
  scadenza: ['Scadenza', 'var(--c-altro)'], appuntamento: ['Appuntamento', '#2f6fb0'],
};
/** Etichetta e colore di una voce: per le voci a mano conta il genere. */
export const aspetto = (v: Voce): [string, string] => (v.s ? GENERI[v.s.genere] || GENERI.attivita : TIPI[v.tipo]);
export const oraBreve = (s?: Scadenza) => (s?.ora ? s.ora.slice(0, 5) : '');
/** "Le mie": voci a mano create da me o assegnate a me (le date delle commesse restano per tutti). */
export const mia = (v: Voce, me: string) => !v.s || v.s.creato_da === me || v.s.assegnata_a === me;
export const PREAVVISO = 3;   // giorni: "in scadenza" da oggi a oggi + 3
export const RICHIAMO = 10;   // giorni dall'invio dell'offerta senza risposta
export const TIENI_FATTE = 30;   // giorni: le voci fatte piu' vecchie spariscono dal calendario (restano nel database)
/** Voci che "scadono" se non fatte: quelle a mano e i richiami. Le date delle commesse passano e basta. */
export const daFare = (v: Voce) => v.tipo === 'man' || v.tipo === 'richiamo';

const nomeCommessa = (e: any) => [e.prev?.num ? 'N° ' + e.prev.num : '', e.cliente].filter(Boolean).join(' · ');
/** Commessa = preventivo vinto con la data di avvio produzione impostata nel Gantt. */
export const daPianificare = (arch: any[]) => arch.filter(e => eStato(e) === 'vinto' && dNum(e.prev?.gantt?.inizio) == null);

// Il calcolo del Gantt costa: si rifà solo se cambiano il preventivo salvato o i parametri di Gantt e montaggio.
const memo = new Map<string, { k: string; v: Voce[] }>();
export function dateCommessa(e: any): Voce[] {
  if (eStato(e) !== 'vinto' || dNum(e.prev?.gantt?.inizio) == null) return [];
  const k = e.salvato + JSON.stringify(S.data.params?.gantt) + JSON.stringify(S.data.mont?.par);
  const m = memo.get(e.id); if (m && m.k === k) return m.v;
  const bak = { ...AUTO };   // i segnaposto del preventivo aperto non vanno toccati
  let v: Voce[] = [];
  try {
    v = withPrev(normPrev(clone(e.prev)), () => {
      const G = buildGantt(buildLavor()), M = buildMontGantt(montDrv(), G);
      // Inizio montaggio = prima fase di cantiere pianificata (anche senza durate: parte dopo tracciamento e prima consegna).
      const cant = M.tasks.filter((t: any) => t.grp === 'cant');
      const base = { titolo: e.nome, sotto: nomeCommessa(e), prevId: e.id };
      const out: Voce[] = [{ ...base, key: e.id + ':prod', giorno: G.start, tipo: 'prod' }];
      if (G.end > G.start) out.push({ ...base, key: e.id + ':prodFine', giorno: G.end, tipo: 'prodFine' });
      if (cant.length) out.push({ ...base, key: e.id + ':mont', giorno: Math.min(...cant.map((t: any) => t.s)), tipo: 'mont' });
      return out;
    });
  } catch { v = []; }   // un preventivo malformato non deve bloccare il calendario
  finally { for (const x in AUTO) delete AUTO[x]; Object.assign(AUTO, bak); }
  memo.set(e.id, { k, v });
  return v;
}

/** Preventivo inviato e ancora senza risposta: richiamo RICHIAMO giorni dopo l'invio (o dopo la data del preventivo). */
export function richiamo(e: any): Voce[] {
  if (eStato(e) !== 'inviato') return [];
  const d = dNum(e.prev?.offerta?.inviata) ?? dNum(e.data); if (d == null) return [];
  return [{ key: e.id + ':richiamo', giorno: d + RICHIAMO, tipo: 'richiamo', titolo: e.nome, sotto: nomeCommessa(e), prevId: e.id }];
}

export function vociScadenze(sc: Scadenza[], arch: any[]): Voce[] {
  const byId = new Map(arch.map(e => [e.id, e]));
  return sc.flatMap(s => {
    const g = dNum(s.giorno); if (g == null) return [];
    const e = s.preventivo_id ? byId.get(s.preventivo_id) : null;
    return [{ key: 's:' + s.id, giorno: g, tipo: 'man' as const, titolo: s.titolo, sotto: e ? e.nome : '', prevId: e?.id, s }];
  });
}

export function voci(arch: any[], sc: Scadenza[], oggi = dToday()): Voce[] {
  const recenti = sc.filter(s => !(s.fatto && (dNum(s.giorno) ?? 0) < oggi - TIENI_FATTE));
  return [...arch.flatMap(dateCommessa), ...arch.flatMap(richiamo), ...vociScadenze(recenti, arch)]
    .sort((a, b) => a.giorno - b.giorno || a.tipo.localeCompare(b.tipo) || (oraBreve(a.s) || '99').localeCompare(oraBreve(b.s) || '99') || a.titolo.localeCompare(b.titolo));
}

/** Scadute: voci a mano non fatte e richiami con data passata. In arrivo: da oggi a oggi + PREAVVISO (le voci fatte no). */
export function allarmi(vv: Voce[], oggi: number) {
  const aperta = (v: Voce) => !v.s?.fatto;
  return {
    scadute: vv.filter(v => daFare(v) && aperta(v) && v.giorno < oggi),
    prossime: vv.filter(v => aperta(v) && v.giorno >= oggi && v.giorno <= oggi + PREAVVISO),
  };
}

/** Agenda: le voci aperte rimaste indietro, poi tutto quello che c'e' da oggi per i prossimi giorni. */
export function agenda(vv: Voce[], oggi: number, giorni = 30) {
  return { arretrate: allarmi(vv, oggi).scadute, avanti: vv.filter(v => v.giorno >= oggi && v.giorno <= oggi + giorni) };
}

export const perGiorno = (vv: Voce[]) => {
  const m = new Map<number, Voce[]>();
  for (const v of vv) { const a = m.get(v.giorno); if (a) a.push(v); else m.set(v.giorno, [v]); }
  return m;
};
