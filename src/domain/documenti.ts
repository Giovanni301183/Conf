// Documenti e note (DMS leggero): file e note scritte, legati a un preventivo/commessa, a una voce dell'agenda o a entrambi.
// I file stanno nello Storage di Supabase; qui ci sono solo i dati per elencarli e cercarli.

export type Cartella = 'cliente' | 'disegni' | 'fornitori' | 'produzione' | 'spedizione' | 'montaggio' | 'foto' | 'altro';
export interface Documento {
  id: string; preventivo_id: string | null; scadenza_id: string | null; cartella: Cartella; tipo: 'nota' | 'file';
  titolo: string; testo: string | null; percorso: string | null; mime: string | null; dimensione: number | null;
  creato_da: string; creato: string; modificato: string | null; etichette?: string[] | null;
  nota_id?: string | null;   // file allegato a una nota
}
// Cartelle di ogni commessa, nell'ordine in cui si mostrano: [chiave, etichetta].
export const CARTELLE: [Cartella, string][] = [
  ['cliente', 'Cliente e contratto'], ['disegni', 'Disegni e progetto'], ['fornitori', 'Ordini e fornitori'], ['produzione', 'Produzione'],
  ['spedizione', 'Spedizione e DDT'], ['montaggio', 'Montaggio e cantiere'], ['foto', 'Foto'], ['altro', 'Altro'],
];
export const nomeCartella = (k: string) => CARTELLE.find(c => c[0] === k)?.[1] || 'Altro';
// Etichette (temi) delle note, piu' di una per nota: [chiave, etichetta, colore]. Per aggiungerne una basta una riga qui.
export const ETICHETTE: [string, string, string][] = [
  ['acquisti', 'Acquisti', '#5f9473'], ['vendita', 'Vendita', '#2f6fb0'], ['opportunita', 'Opportunità', '#c58a42'],
  ['sviluppo', 'Sviluppo prodotto', '#8b72a3'], ['tecnico', 'Tecnico e progetto', '#3e6b8a'], ['produzione', 'Produzione', '#a0673a'],
  ['cantiere', 'Cantiere e montaggio', '#6f7d3a'], ['logistica', 'Logistica', '#4f8a8b'], ['qualita', 'Qualità e reclami', '#b8483e'],
  ['amministrazione', 'Amministrazione', '#7a6a55'], ['marketing', 'Marketing e fiere', '#c0577f'], ['personale', 'Personale', '#5b6b9a'],
  ['riunione', 'Riunione', '#2f8a6a'], ['idea', 'Idea', '#b39a2a'],
];
export const nomeEtichetta = (k: string) => ETICHETTE.find(e => e[0] === k)?.[1] || k;
export const coloreEtichetta = (k: string) => ETICHETTE.find(e => e[0] === k)?.[2] || '#8a9196';
export const etichetteDi = (d: Pick<Documento, 'etichette'>) => d.etichette || [];
const chiave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
/** Etichette valide da quello che scrive l'AI o Telegram: chiavi o nomi, in lista o separati da virgola ("Acquisti, opportunità"). */
export function pulisciEtichette(v: unknown): string[] {
  const xx = Array.isArray(v) ? v : String(v ?? '').split(/[,;]/);
  const kk = xx.map(x => chiave(String(x))).filter(Boolean)
    .map(x => ETICHETTE.find(([k, l]) => k === x || chiave(l) === x || chiave(l).startsWith(x) && x.length >= 4)?.[0]).filter((k): k is string => !!k);
  return [...new Set(kk)];
}
/** Nomi delle etichette per i testi ("Acquisti, Vendita"). */
export const nomiEtichette = (kk: string[] | null | undefined) => (kk || []).map(nomeEtichetta).join(', ');

// Parole che fanno pensare a un tema (inizi di parola, senza accenti): servono a suggerire le etichette mentre si scrive.
const INDIZI: Record<string, string[]> = {
  acquisti: ['acquist', 'ordin', 'fornitor', 'approvvigion', 'rda', 'acciaio', 'bulloni', 'materiale', 'magazzin', 'listino fornit'],
  vendita: ['vendit', 'offert', 'preventiv', 'trattativ', 'contratt', 'sconto', 'cliente', 'firmat', 'ordine cliente'],
  opportunita: ['opportunit', 'lead', 'gara', 'bando', 'nuovo cliente', 'potenzial', 'contatto', 'richiesta di offerta', 'interessat'],
  sviluppo: ['svilupp', 'prototip', 'nuovo prodotto', 'brevett', 'miglior', 'innovaz', 'versione', 'r&d', 'ricerca'],
  tecnico: ['disegn', 'calcol', 'progett', 'verific', 'carich', 'vento', 'dwg', 'dxf', 'layout', 'struttural', 'relazione tecnica'],
  produzione: ['produzion', 'lavoraz', 'taglio', 'saldat', 'zincat', 'officin', 'piegat', 'foratur'],
  cantiere: ['cantier', 'montagg', 'posa', 'sopralluog', 'installaz', 'battipal', 'squadra'],
  logistica: ['spedizion', 'trasport', 'camion', 'consegn', 'ddt', 'container', 'bilic', 'ritiro'],
  qualita: ['reclam', 'difett', 'non conform', 'garanzi', 'ruggin', 'rottur', 'contestaz', 'danneggiat'],
  amministrazione: ['fattur', 'pagament', 'bonific', 'iva', 'banca', 'incass', 'acconto', 'saldo', 'sollecito pagament'],
  marketing: ['fiera', 'fiere', 'brochure', 'sito', 'linkedin', 'social', 'catalog', 'intersolar', 'newsletter'],
  personale: ['feri', 'assunz', 'colloqui', 'formazion', 'dipendent', 'malatti', 'permess', 'stipend'],
  riunione: ['riunion', 'call', 'meet', 'teams', 'zoom', 'verbale', 'incontr', 'videochiamat'],
  idea: ['idea', 'potremmo', 'proposta', 'sarebbe bello', 'pensare a', 'valutare'],
};
const piano = (s: string) => ' ' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ') + ' ';
/** Etichette suggerite dal titolo e dal testo, le piu' probabili prima (al massimo tre). */
export function suggerisciEtichette(testo: string): string[] {
  const t = piano(testo);
  return ETICHETTE.map(([k]) => [k, (INDIZI[k] || []).filter(p => t.includes(' ' + p)).length] as const)
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}
/** Preventivi nominati nel testo (per nome, cliente o riferimento, almeno 4 lettere): i vinti e i piu' recenti prima. */
export function suggerisciPreventivi<T extends { id: string; nome?: string; cliente?: string; rif?: string; prev?: any }>(testo: string, arch: T[]): T[] {
  const t = piano(testo), peso = (e: T) => (e.prev?.stato === 'vinto' ? 0 : e.prev?.stato === 'perso' || e.prev?.stato === 'alternativa' ? 2 : 1);
  return arch.filter(e => [e.nome, e.cliente, e.rif].some(x => { const p = piano(x || '').trim(); return p.length >= 4 && t.includes(' ' + p + ' '); }))
    .sort((a, b) => peso(a) - peso(b)).slice(0, 3);
}
/** Documenti con almeno una delle etichette scelte (nessuna scelta = tutti). */
export const conEtichette = (docs: Documento[], sel: string[]) => sel.length ? docs.filter(d => etichetteDi(d).some(e => sel.includes(e))) : docs;
/** Quante note per etichetta, nell'ordine dell'elenco. */
export function perEtichetta(docs: Documento[]) {
  const n: Record<string, number> = {};
  for (const d of docs) for (const e of etichetteDi(d)) n[e] = (n[e] || 0) + 1;
  return n;
}
// Limite per file del piano gratuito di Supabase; dopo l'upgrade si alza qui e nella migrazione dello Storage.
export const LIMITE_MB = 50;

/** Nome del file per il percorso nello Storage: senza accenti, spazi e caratteri speciali (il titolo resta quello originale). */
export function nomeSicuro(nome: string) {
  const s = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|_+$/g, '');
  return (s || 'file').slice(-120);
}
/** Percorso nello Storage: cartella del preventivo (o "agenda", o "note" per gli allegati), poi una cartella unica per file, poi il nome. */
export const percorsoPer = (prevId: string | null, uid: string, nome: string) => `${prevId || 'agenda'}/${uid}/${nomeSicuro(nome)}`;

/** Cartella proposta per un file nuovo: foto e disegni si riconoscono dal tipo o dall'estensione. */
export function cartellaPer(nome: string, mime: string): Cartella {
  if (mime.startsWith('image/')) return 'foto';
  if (/\.(dwg|dxf|step|stp|ifc)$/i.test(nome)) return 'disegni';
  return 'altro';
}
export const immagine = (d: Pick<Documento, 'mime'>) => !!d.mime?.startsWith('image/');
/** Breve indicazione del tipo di file (PDF, Excel, DWG...), dall'estensione. */
export function estensione(titolo: string) { const m = /\.([a-z0-9]{1,5})$/i.exec(titolo); return m ? m[1].toUpperCase() : ''; }
export function fByte(n: number | null) {
  const b = n || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** File allegati a una nota, nell'ordine in cui sono stati caricati. */
export const allegatiDi = (docs: Documento[], notaId: string) => docs.filter(d => d.nota_id === notaId).sort((a, b) => a.creato.localeCompare(b.creato));
/** Documenti di un preventivo (compresi quelli caricati sulle sue voci d'agenda) o di una voce, i piu' recenti prima. */
export function documentiDi(docs: Documento[], { preventivo, scadenza }: { preventivo?: string; scadenza?: string }) {
  return docs.filter(d => (preventivo && d.preventivo_id === preventivo) || (scadenza && d.scadenza_id === scadenza))
    .sort((a, b) => b.creato.localeCompare(a.creato));
}
/** Ricerca su titolo, testo della nota, nome della cartella e delle etichette (parole in qualunque ordine). */
export function cerca(docs: Documento[], q: string) {
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parole.length) return docs;
  return docs.filter(d => { const t = `${d.titolo} ${d.testo || ''} ${nomeCartella(d.cartella)} ${etichetteDi(d).map(nomeEtichetta).join(' ')}`.toLowerCase(); return parole.every(p => t.includes(p)); });
}
export function perCartella(docs: Documento[]) {
  const n = Object.fromEntries(CARTELLE.map(([k]) => [k, 0])) as Record<Cartella, number>;
  for (const d of docs) n[d.cartella in n ? d.cartella : 'altro']++;
  return n;
}
