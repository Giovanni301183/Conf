// Azioni dell'app: archivio preventivi, frecce dei campi numerici, tendine, stampa, file.
import { flushSync } from 'react-dom';
import { compute } from '../domain/compute';
import { MIN_CUSC, clone, defaultData, newPrev, normPrev, num } from '../domain/model';
import { download, fileName } from '../domain/format';
import { AUTO } from '../domain/plan';
import { KEY_ARCH, KEY_DRAFT, KEY_PREV, R, S, commit, getP, load, save, setP, store, unstore } from './state';

/* ---------- Avvisi ---------- */
let toastFn: (m: string) => void = () => {};
export function setToast(f: (m: string) => void) { toastFn = f; }
export const toast = (m: string) => toastFn(m);

/* ---------- Archivio ---------- */
// Ogni preventivo salvato conserva anche il listino e le distinte in uso, cosi' si puo' ricalcolare com'era.
export const snap = (o: unknown) => JSON.stringify(o, (k, v) => (k === '_imp' ? undefined : v));
// Il preventivo lasciato aperto nella sessione precedente con modifiche non salvate diventa una bozza recuperabile.
(() => {
  const last = load(KEY_PREV); if (!last || !Array.isArray(last.righe)) return;
  const e = last._id ? S.arch.find(a => a.id === last._id) : null;
  if (e ? snap(e.prev) !== snap(last) : !isBlank(last)) store(KEY_DRAFT, last);
  store(KEY_PREV, S.prev);
})();
export function curEntry() { return S.prev._id ? S.arch.find(a => a.id === S.prev._id) : null; }
// Un preventivo nuovo ancora vuoto (salvo la data) non conta come modifica non salvata.
export function isBlank(p) { return !p._id && snap({ ...p, data: '' }) === snap({ ...newPrev(), data: '' }); }
export function isDirty() { const e = curEntry(); return e ? snap(e.prev) !== snap(S.prev) : !isBlank(S.prev); }
export function prevName(p) { return p._nome || [p.cliente, p.rif].filter(Boolean).join(' · ') || 'Preventivo senza nome'; }
export function righeTxt(p) { return p.righe.map(r => `${num(r.n)}×${r.taglia} ${r.tipo === 'Basso' ? 'Basso' : 'Agri'}`).join(', '); }
function saveArch() {
  if (store(KEY_ARCH, S.arch)) return true;
  alert("Spazio del browser esaurito: elimina qualche preventivo dall'archivio oppure esportalo su file e poi eliminalo.");
  return false;
}
export function archSave(asNew: boolean) {
  const P = S.prev, old = curEntry();
  let nome = old && !asNew ? old.nome : prompt('Nome del preventivo:', asNew && old ? old.nome + ' (copia)' : prevName(P));
  if (nome == null) return; nome = nome.trim() || prevName(P);
  const id = old && !asNew ? old.id : 'p' + Date.now().toString(36);
  P._id = id; P._nome = nome;
  const e = { id, nome, cliente: P.cliente, rif: P.rif, data: P.data, salvato: new Date().toISOString(),
    totale: R.total, prezzo: R.prezzo, kwp: R.kwp, nTracker: R.nTracker, righe: righeTxt(P), prev: clone(P), dati: clone(S.data) };
  const i = S.arch.findIndex(a => a.id === id);
  if (i >= 0) S.arch[i] = e; else S.arch.unshift(e);
  if (saveArch()) toast(i >= 0 ? `Preventivo "${nome}" aggiornato` : `Preventivo "${nome}" salvato nell'archivio`);
  save();
}
export function archOpen(id: string) {
  const e = S.arch.find(a => a.id === id); if (!e) return;
  if (S.prev._id !== id && isDirty() && !confirm('Il preventivo aperto ha modifiche non salvate che andranno perse. Continuare?')) return;
  normPrev(e.prev); S.prev = clone(e.prev); S.prev._id = e.id; S.prev._nome = e.nome;
  // Parametri del Gantt e listino montaggio non contano come "listino cambiato".
  const dSnap = d => snap({ ...d, mont: undefined, params: { ...d.params, gantt: undefined } });
  if (e.dati && dSnap(e.dati) !== dSnap(S.data) && !confirm(`Il listino è cambiato dopo il salvataggio di "${e.nome}".\n\nOK → ricalcola con il listino ATTUALE (prezzi aggiornati)\nAnnulla → ripristina il listino salvato con il preventivo`))
    S.data = { ...clone(e.dati), mont: S.data.mont, params: { ...e.dati.params, gantt: S.data.params.gantt } };
  save(); S.ui.tab = 'config'; toast(`Aperto "${e.nome}"`);
}
export function archDup(id: string) {
  const e = S.arch.find(a => a.id === id); if (!e) return;
  const c = clone(e); c.id = 'p' + Date.now().toString(36); c.nome = e.nome + ' (copia)'; c.salvato = new Date().toISOString(); c.prev._id = c.id; c.prev._nome = c.nome;
  S.arch.unshift(c); saveArch();
}
export function archDel(id: string) {
  const e = S.arch.find(a => a.id === id); if (!e || !confirm(`Eliminare definitivamente "${e.nome}" dall'archivio?`)) return;
  S.arch = S.arch.filter(a => a.id !== id); saveArch();
  if (S.prev._id === id) { delete S.prev._id; save(); }
}
export function archDl(id: string) {
  const e = S.arch.find(a => a.id === id);
  if (e) download(`preventivo_${fileName(e.nome)}.json`, JSON.stringify({ tipo: 'preventivo', nome: e.nome, prev: e.prev, data: e.dati }, null, 1));
}
export function archExp() {
  download(`archivio_preventivi_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ tipo: 'archivio', preventivi: S.arch }));
}
function archImport(j) {
  let n = 0;
  const add = (prev, dati, nome) => {
    const id = 'p' + Date.now().toString(36) + n++; const p = clone(prev); p._id = id; p._nome = nome || prevName(p);
    const r = compute(dati || S.data, p);
    S.arch.unshift({ id, nome: p._nome, cliente: p.cliente, rif: p.rif, data: p.data, salvato: new Date().toISOString(), totale: r.total, prezzo: r.prezzo, kwp: r.kwp, nTracker: r.nTracker, righe: righeTxt(p), prev: p, dati: clone(dati || S.data) });
  };
  if (j.tipo === 'archivio' && Array.isArray(j.preventivi)) {
    for (const e of j.preventivi) { if (S.arch.some(a => a.id === e.id)) continue; S.arch.unshift(e); n++; }
  } else if (j.prev) add(j.prev, j.data, j.nome);
  else throw new Error('il file non contiene preventivi');
  saveArch(); toast(`${n} preventiv${n === 1 ? 'o importato' : 'i importati'} nell'archivio`);
}
export function newPreventivo() {
  if (isDirty() && !confirm('Il preventivo attuale ha modifiche non salvate. Iniziare comunque un nuovo preventivo?')) return;
  S.prev = newPrev(); S.ui.tab = 'config'; save();
}
export function draftOpen() {
  const dr = load(KEY_DRAFT); if (!dr) return;
  if (isDirty() && !confirm('Il preventivo attuale ha modifiche non salvate che andranno perse. Continuare?')) return;
  S.prev = normPrev(dr); unstore(KEY_DRAFT); S.ui.tab = 'config'; save();
}
export function draftDel() { if (confirm('Scartare definitivamente la bozza non salvata?')) unstore(KEY_DRAFT); }

/* ---------- File: archivio, preventivo, listino ---------- */
type PickMode = 'arch' | 'prev' | 'data';
let pickMode: PickMode = 'arch';
let fileInput: HTMLInputElement | null = null;
export function setFileInput(el: HTMLInputElement | null) { fileInput = el; }
export function pickFile(m: PickMode) { pickMode = m; if (fileInput) { fileInput.value = ''; fileInput.click(); } }
export async function onFilePicked(f: File) {
  try {
    const j = JSON.parse(await f.text());
    if (pickMode === 'arch') archImport(j);
    else if (pickMode === 'prev') {
      if (!j.prev) throw new Error('il file non contiene un preventivo');
      S.prev = normPrev(j.prev);
      if (j.data && confirm('Il file contiene anche il listino usato per quel preventivo.\nOK = usa quel listino · Annulla = tieni il listino attuale')) S.data = j.data;
    } else {
      if (!j.data || !j.data.listino) throw new Error('il file non contiene un listino');
      if (!confirm('Sostituire listino e distinte con quelli del file?')) return;
      S.data = j.data;
    }
    save(); commit();
  } catch (err) { alert('File non valido: ' + (err as Error).message); }
}
export function resetData() {
  if (!confirm("Ripristinare listino e distinte ai valori dell'Excel? Le modifiche al listino andranno perse.")) return;
  S.data = defaultData(); save(); commit();
}

/* ---------- Campi ---------- */
export function fixRiga(r) { if (num(r.lCusc) < MIN_CUSC[r.tipo] - 1e-9) r.lCusc = MIN_CUSC[r.tipo]; }
/** Scrive un valore nello stato, sistema la riga tracker se serve, salva e ridisegna. */
export function setVal(path: string, v: unknown) {
  setP(path, v);
  const m = path.match(/^prev\.righe\.(\d+)/); if (m) fixRiga(S.prev.righe[+m[1]]);
  save(); commit();
}
// Selettore a due posizioni: cambiando il tipo, il cuscinetto al minimo segue il minimo del nuovo tipo (2,30 ⇄ 2,80 m).
export function setSeg(path: string, val: string) {
  const m = path.match(/^prev\.righe\.(\d+)\.tipo$/);
  if (m) { const r = S.prev.righe[+m[1]]; if (Math.abs(num(r.lCusc) - MIN_CUSC[r.tipo]) < 1e-9) r.lCusc = MIN_CUSC[val]; }
  if (path.startsWith('ui.')) { setP(path, val); commit(); return; }
  setVal(path, val);
}
// Passo delle frecce secondo il campo: pezzi a 1, €/kg al centesimo, lunghezze a 5 cm, ecc.
export function stepFor(path: string) {
  if (/^data\.params\.gantt\.kg/.test(path)) return 500;
  if (/\.(n|mot|cusc|omega)$|^prev\.imp\.|\.sd\.\d+\.q$/.test(path)) return 1;
  if (path === 'prev.modulo.wp') return 5;
  if (/\.(acq|zn|lav|kg)$/.test(path)) return 0.01;
  if (/\.(costo|p)$/.test(path)) return 1;
  if (/\.L$/.test(path)) return 0.05;
  if (/^prev\.marg\./.test(path)) return 0.5;
  if (path === 'data.params.maggZinc') return 0.1;
  if (/^prev\.extra\.\d+\.val$/.test(path)) return getP(path.replace(/val$/, 'modo')) === 'perc' ? 0.5 : 10;
  return 1;
}
const decs = (x: number) => Math.min(6, (String(x).split('.')[1] || '').length);
export function bump(path: string, type: string, step: number, dir: number) {
  const v = getP(path);
  // Campo opzionale vuoto: le frecce partono dal valore calcolato (margine generale, durata del Gantt, quantita' o prezzo di listino).
  const cur = type === 'pct' ? num(v) * 100 : (v === '' || v == null) && type === 'optnum' ? (path in AUTO ? num(AUTO[path]) : path.startsWith('prev.marg.') ? num(S.prev.marg.gen) : 0) : num(v);
  const d = Math.max(decs(step), decs(Math.round(cur * 1e6) / 1e6));
  const nv = Math.max(0, Math.round((cur + dir * step) * 10 ** d) / 10 ** d);
  setVal(path, type === 'pct' ? Math.round(nv * 1e6) / 1e8 : nv);
}

/* ---------- Tendine ---------- */
// Una tendina resta aperta finche' l'utente non la chiude: nessuna azione la chiude da sola.
export const isOpen = (id: string) => !!S.ui.folds[id];
export const foldIds = new Set<string>();
// "Apri tutte" ripete tre volte: le tendine interne compaiono solo dopo che si apre quella che le contiene.
export function foldAll(on: boolean) {
  for (let k = 0; k < 3; k++) { foldIds.forEach(id => (S.ui.folds[id] = on)); flushSync(commit); }
  if (!on) { S.ui.open = new Set(); commit(); }
}

/* ---------- Stampa ---------- */
export function printCosti() {
  S.ui.tab = 'costi'; S.ui.folds['co-riep'] = true; S.ui.folds['co-cat'] = true;
  flushSync(commit); setTimeout(() => window.print(), 50);
}
// Stampa solo le tendine indicate (classe pcard), A4 orizzontale; tutto torna com'era dopo la stampa.
export function printPage(ids: string[]) {
  ids.forEach(id => (S.ui.folds[id] = true)); flushSync(commit);
  document.body.classList.add('pg');
  const on = ids.map(id => document.querySelector(`[data-fold="${id}"]`)).filter(Boolean) as Element[];
  on.forEach(el => el.classList.add('pon'));
  const ps = document.createElement('style'); ps.textContent = '@page{size:A4 landscape;margin:10mm}'; document.head.appendChild(ps);
  window.addEventListener('afterprint', () => { document.body.classList.remove('pg'); on.forEach(el => el.classList.remove('pon')); ps.remove(); }, { once: true });
  setTimeout(() => window.print(), 50);
}
