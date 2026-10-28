// Referenze del listino: sostituzione di un codice nelle distinte e profili scelti come pilastro.
import { GROUPS, IMP } from './model.js';

export const ASSI = 'ASSI DI ROTAZIONE';

// Profili usabili come pilastro ($PROF): le barre con "pil". Senza la spunta (listini salvati prima) valgono IPE 140 e IPEA 140.
const PIL0 = ['IPE 140', 'IPEA 140'];
export const isPil = (it: any) => it.t === 'barra' && (it.pil ?? PIL0.includes(it.c));
/** [codice, etichetta] dei profili pilastro; extra = valore gia' scelto in una riga, se non e' piu' fra quelli spuntati. */
export function pilastri(data: any, extra?: string): [string, string][] {
  const r = data.listino.filter(isPil).map((it: any) => [it.c, it.c] as [string, string]);
  if (extra && !r.some(([c]) => c === extra)) r.push([extra, extra]);
  return r;
}

/** Righe delle distinte (gruppo, taglia) che usano il codice: distinta comune e blocco assi di ogni taglia. */
function righe(data: any, gruppi?: Set<string>) {
  const out: { g: string; taglia?: string; r: any }[] = [];
  for (const r of data.template) if (!gruppi || gruppi.has(r.g)) out.push({ g: r.g, r });
  if (!gruppi || gruppi.has(ASSI)) for (const [taglia, s] of Object.entries<any>(data.sizes)) for (const r of s.assi) out.push({ g: ASSI, taglia, r });
  return out;
}
export const gruppiDistinte = () => [...GROUPS.filter(g => g !== ASSI), ASSI];
export const inUso = (data: any, c: string) => righe(data).some(x => x.r.c === c) || IMP.some(x => x[1] === c);

/** Sostituisce nei gruppi scelti ogni codice "da" con il suo "a"; con prova=true conta soltanto. Ritorna i conteggi per gruppo e codice. */
export function sostituisci(data: any, coppie: [string, string][], gruppi: Set<string>, prova = false) {
  const m = new Map(coppie.filter(([da, a]) => da && a && da !== a));
  const conti: { g: string; da: string; a: string; n: number; taglie: string[] }[] = [];
  for (const x of righe(data, gruppi)) {
    const a = m.get(x.r.c); if (!a) continue;
    let k = conti.find(c => c.g === x.g && c.da === x.r.c);
    if (!k) conti.push(k = { g: x.g, da: x.r.c, a, n: 0, taglie: [] });
    k.n++; if (x.taglia && !k.taglie.includes(x.taglia)) k.taglie.push(x.taglia);
    if (!prova) x.r.c = a;
  }
  return conti;
}
