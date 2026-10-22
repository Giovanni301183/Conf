// Documenti e note (DMS leggero): file e note scritte, legati a un preventivo/commessa, a una voce dell'agenda o a entrambi.
// I file stanno nello Storage di Supabase; qui ci sono solo i dati per elencarli e cercarli.

export type Cartella = 'cliente' | 'disegni' | 'fornitori' | 'produzione' | 'spedizione' | 'montaggio' | 'foto' | 'altro';
export interface Documento {
  id: string; preventivo_id: string | null; scadenza_id: string | null; cartella: Cartella; tipo: 'nota' | 'file';
  titolo: string; testo: string | null; percorso: string | null; mime: string | null; dimensione: number | null;
  creato_da: string; creato: string; modificato: string | null;
}
// Cartelle di ogni commessa, nell'ordine in cui si mostrano: [chiave, etichetta].
export const CARTELLE: [Cartella, string][] = [
  ['cliente', 'Cliente e contratto'], ['disegni', 'Disegni e progetto'], ['fornitori', 'Ordini e fornitori'], ['produzione', 'Produzione'],
  ['spedizione', 'Spedizione e DDT'], ['montaggio', 'Montaggio e cantiere'], ['foto', 'Foto'], ['altro', 'Altro'],
];
export const nomeCartella = (k: string) => CARTELLE.find(c => c[0] === k)?.[1] || 'Altro';
// Limite per file del piano gratuito di Supabase; dopo l'upgrade si alza qui e nella migrazione dello Storage.
export const LIMITE_MB = 50;

/** Nome del file per il percorso nello Storage: senza accenti, spazi e caratteri speciali (il titolo resta quello originale). */
export function nomeSicuro(nome: string) {
  const s = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|_+$/g, '');
  return (s || 'file').slice(-120);
}
/** Percorso nello Storage: cartella del preventivo (o "agenda"), poi una cartella unica per file, poi il nome. */
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

/** Documenti di un preventivo (compresi quelli caricati sulle sue voci d'agenda) o di una voce, i piu' recenti prima. */
export function documentiDi(docs: Documento[], { preventivo, scadenza }: { preventivo?: string; scadenza?: string }) {
  return docs.filter(d => (preventivo && d.preventivo_id === preventivo) || (scadenza && d.scadenza_id === scadenza))
    .sort((a, b) => b.creato.localeCompare(a.creato));
}
/** Ricerca su titolo, testo della nota e nome della cartella (parole in qualunque ordine). */
export function cerca(docs: Documento[], q: string) {
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parole.length) return docs;
  return docs.filter(d => { const t = `${d.titolo} ${d.testo || ''} ${nomeCartella(d.cartella)}`.toLowerCase(); return parole.every(p => t.includes(p)); });
}
export function perCartella(docs: Documento[]) {
  const n = Object.fromEntries(CARTELLE.map(([k]) => [k, 0])) as Record<Cartella, number>;
  for (const d of docs) n[d.cartella in n ? d.cartella : 'altro']++;
  return n;
}
