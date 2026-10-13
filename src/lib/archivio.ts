// Archivio preventivi. Per ora vive nel browser con lo stesso formato dell'app legacy
// (chiave e file di export compatibili); in seguito passerà su Supabase.

export interface ArchEntry {
  id: string;
  nome: string;
  cliente?: string;
  rif?: string;
  data?: string;
  salvato: string;
  totale: number;
  prezzo?: number | null;
  kwp: number;
  nTracker?: number;
  righe: string;
  prev: Record<string, unknown>;
  dati?: Record<string, unknown>;
}

const KEY_ARCH = 'tracker_prev_archivio_v1';

export function loadArch(): ArchEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_ARCH) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveArch(list: ArchEntry[]): boolean {
  try {
    localStorage.setItem(KEY_ARCH, JSON.stringify(list));
    return true;
  } catch {
    alert("Spazio del browser esaurito: elimina qualche preventivo dall'archivio oppure esportalo su file e poi eliminalo.");
    return false;
  }
}

export const newId = () => 'p' + Date.now().toString(36);

export function fileName(s: string) {
  return String(s).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'preventivo';
}

export function download(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Unisce un file esportato (archivio completo) all'elenco; restituisce quanti ne ha aggiunti. */
export function mergeImport(list: ArchEntry[], j: any): { list: ArchEntry[]; n: number } {
  if (j?.tipo === 'archivio' && Array.isArray(j.preventivi)) {
    const nuovi = (j.preventivi as ArchEntry[]).filter(e => e?.id && !list.some(a => a.id === e.id));
    return { list: [...nuovi, ...list], n: nuovi.length };
  }
  if (j?.prev) throw new Error("il preventivo singolo si potrà importare quando sarà migrato il calcolo dei costi; per ora importa l'archivio completo");
  throw new Error('il file non contiene preventivi');
}
