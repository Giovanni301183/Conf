// Stato dell'app: listino e distinte (data), preventivo aperto (prev), interfaccia (ui) e archivio.
// Come nell'app legacy si modifica "sul posto" e poi si chiama commit(): React ridisegna tutto.
import { useSyncExternalStore } from 'react';
import { compute } from '../domain/compute';
import { defaultData, newPrev } from '../domain/model';

export const KEY_DATA = 'tracker_prev_data_v1', KEY_PREV = 'tracker_prev_prev_v1', KEY_UI = 'tracker_prev_ui_v1';
export const KEY_ARCH = 'tracker_prev_archivio_v1', KEY_DRAFT = 'tracker_prev_bozza_v1', KEY_SCAD = 'tracker_prev_scadenze_v1';

export function load(k: string): any {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function store(k: string, v: unknown): boolean {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}
export function unstore(k: string) {
  try { localStorage.removeItem(k); } catch { /* storage non disponibile */ }
}

export const TABS = [['archivio', 'Home'], ['listino', 'Listino'], ['distinte', 'Distinte base'], ['config', 'Configura'], ['costi', 'Costi'],
  ['extra', 'Voci extra'], ['margini', 'Margini'], ['invia', 'Invia preventivo'], ['lavor', 'Distinta lavorazione'], ['mont', 'Montaggio'], ['utenti', 'Utenti']] as const;
export type Tab = (typeof TABS)[number][0];

export interface Ui {
  tab: Tab; view: string; av: 'elenco' | 'kpi' | 'mappa' | 'cal'; kf: { anno: string; mese: string; stato: string; cliente: string }; folds: Record<string, boolean>; open: Set<string>; sizeSel: string; openSd: Set<number>; filter: string; aq: string;
}
// scad = scadenze del calendario inserite a mano (dal server, o dal browser senza Supabase).
export interface State { data: any; prev: any; ui: Ui; arch: any[]; scad: any[] }

const UI0 = load(KEY_UI) || {};
const hashTab = TABS.find(t => t[0] === location.hash.slice(1))?.[0];
// All'avvio si parte sempre da un preventivo nuovo, sulla schermata Preventivi (elenco dell'archivio).
export const S: State = {
  data: load(KEY_DATA) || defaultData(), prev: newPrev(), arch: load(KEY_ARCH) || [], scad: load(KEY_SCAD) || [],
  ui: { tab: hashTab || 'archivio', view: UI0.view || 'cat', av: UI0.av || 'elenco', kf: { anno: '', mese: '', stato: '', cliente: '' }, folds: UI0.folds || {}, open: new Set(), sizeSel: '12', openSd: new Set(), filter: '', aq: '' },
};

// Risultato del calcolo sul preventivo aperto: si aggiorna a ogni commit().
export let R = compute(S.data, S.prev);

/** Esegue f come se fosse aperto un altro preventivo (es. le date di una commessa in archivio), poi rimette tutto com'era. */
export function withPrev<T>(prev: any, f: () => T): T {
  const p0 = S.prev, r0 = R;
  try { S.prev = prev; R = compute(S.data, prev); return f(); } finally { S.prev = p0; R = r0; }
}

// Chiamato dopo ogni salvataggio: con Supabase attivo invia il listino al server.
let saveHook = () => {};
export function setSaveHook(f: () => void) { saveHook = f; }
export function save() { store(KEY_DATA, S.data); store(KEY_PREV, S.prev); saveHook(); }
export function saveUi() { store(KEY_UI, { tab: S.ui.tab, view: S.ui.view, av: S.ui.av, folds: S.ui.folds }); }

let version = 0;
const subs = new Set<() => void>();
/** Ricalcola, salva l'interfaccia e ridisegna. */
export function commit() {
  R = compute(S.data, S.prev);
  version++;
  saveUi();
  if (location.hash.slice(1) !== S.ui.tab) history.replaceState(null, '', '#' + S.ui.tab);
  subs.forEach(f => f());
}
export function useStore() {
  return useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => version);
}

// Percorsi tipo "prev.righe.0.n" sullo stato.
export function getP(p: string): any { return p.split('.').reduce((o: any, k) => (o == null ? o : o[k]), S); }
export function setP(p: string, v: unknown) { const ks = p.split('.'); const last = ks.pop()!; ks.reduce((o: any, k) => o[k], S)[last] = v; }
