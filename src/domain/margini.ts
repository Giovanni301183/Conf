// Margini per categoria di un preventivo calcolato, come nella scheda Margini: lavorazione e zincatura contate a parte,
// nella loro categoria. Usati dalla scheda Margini e dal riepilogo mandato su Telegram (azione "margini" di /api/agenda).
import { compute, tot } from './compute.js';
import { eur, fN, fP } from './format.js';
import { LAV_CAT, MCATS, ZINC_CAT, num } from './model.js';

/** Costo e prezzo per categoria. */
export function perCategoria(R: any): Record<string, { c: number; p: number }> {
  const byCat: Record<string, { c: number; p: number }> = {};
  const add = (k: string, c: number, p: number) => { (byCat[k] ??= { c: 0, p: 0 }); byCat[k].c += c; byCat[k].p += p; };
  for (const l of R.lines) {
    add(l.cat, tot(l) - l.lav - l.zinc, l.prezzo - l.pLav - l.pZinc);
    if (l.lav) add(LAV_CAT, l.lav, l.pLav); if (l.zinc) add(ZINC_CAT, l.zinc, l.pZinc);
  }
  return byCat;
}

/** Riepilogo dei margini in testo semplice (per Telegram): impostazione, categorie, totale, €/Wp e prezzo per tracker. */
export function testoMargini(P: any, R: any): string {
  const M = P.marg, ric = M.modo === 'ricarico', C = R.total, V = R.prezzo, mg = V - C, byCat = perCategoria(R);
  const wp = (x: number) => (R.kwp ? fN(x / (R.kwp * 1000), 4) : '–'), pct = (c: number, p: number) => (p ? fP(((p - c) / p) * 100) : '–');
  const cat = [...MCATS, 'NON TROVATO'].filter(c => byCat[c] && (byCat[c].c || byCat[c].p)).map(c => {
    const n = byCat[c], proprio = M.cat?.[c] !== '' && M.cat?.[c] != null;
    return `• ${c}: costo ${eur(n.c)} → prezzo ${eur(n.p)} · margine ${eur(n.p - n.c)} (${pct(n.c, n.p)})${proprio ? ` · ${ric ? 'ricarico' : 'margine'} proprio ${fP(num(M.cat[c]))}` : ''}`;
  });
  const righe = P.righe.map((r: any, i: number) => {
    const rr = R.righe[i];
    return rr?.n ? `• R${i + 1} ${fN(rr.n, 0)} × ${r.taglia} moduli ${r.tipo === 'Basso' ? 'basso' : 'agri'}: ${eur(rr.tot / rr.n)} → ${eur(rr.prezzo / rr.n)} a tracker` : '';
  }).filter(Boolean);
  return [`📊 Margini · N° ${P.num || '–'} · ${[P.cliente, P.rif].filter(Boolean).join(' · ') || 'senza nome'}`,
    `${ric ? 'Ricarico sul costo' : 'Margine sul prezzo'} generale ${fP(num(M.gen))}`, '',
    ...cat, '',
    `TOTALE: costo ${eur(C)} → prezzo ${eur(V)}`,
    `Margine ${eur(mg)} · sul prezzo ${V ? fP((mg / V) * 100) : '–'} · ricarico sul costo ${C ? fP((mg / C) * 100) : '–'}`,
    `€/Wp costo → vendita: ${wp(C)} → ${wp(V)}`,
    ...(righe.length ? ['', 'Per tracker (costo → prezzo):', ...righe] : [])].join('\n');
}

/** Margini che portano il prezzo di vendita al prezzo spot, mantenendo le differenze tra categorie: il margine generale
 *  e quelli propri delle categorie si spostano tutti degli stessi punti (le categorie vuote continuano a seguire il generale).
 *  Il prezzo cresce con lo spostamento: si cerca per bisezione, fino al centesimo (i margini tengono tutti i decimali che servono:
 *  arrotondarli a 4 cifre spostava il prezzo di qualche decina di centesimi). Ritorna i margini nuovi o il motivo per cui non si arriva. */
export function margineSpot(data: any, P: any, spot: number): { marg: any; delta: number; prezzo: number } | { errore: string } {
  const M = P.marg, ric = M.modo === 'ricarico', propri = MCATS.filter(c => M.cat?.[c] !== '' && M.cat?.[c] != null);
  const valori = [num(M.gen), ...propri.map(c => num(M.cat[c]))];
  const sposta = (d: number) => ({ ...M, gen: +(num(M.gen) + d).toFixed(10), cat: { ...M.cat, ...Object.fromEntries(propri.map(c => [c, +(num(M.cat[c]) + d).toFixed(10)])) } });
  const prezzo = (d: number) => compute(data, { ...P, marg: sposta(d) }).prezzo;
  if (!(spot > 0)) return { errore: 'Scrivi il prezzo spot in euro.' };
  // Limiti: nessun margine sotto il -100 %; col margine sul prezzo ognuno resta sotto il 100 % (col ricarico fino al 1000 %).
  let lo = -100 - Math.min(...valori) + 1e-3, hi = ric ? 1000 - Math.max(...valori) : 100 - Math.max(...valori) - 1e-3;
  const pLo = prezzo(lo), pHi = prezzo(hi);
  if (spot < pLo) return { errore: `Prezzo troppo basso: il minimo raggiungibile è circa ${eur(pLo)}.` };
  if (spot > pHi) return { errore: `Prezzo troppo alto: il massimo raggiungibile è circa ${eur(pHi)}.` };
  for (let i = 0; i < 100 && hi - lo > 1e-11; i++) { const m = (lo + hi) / 2; if (prezzo(m) < spot) lo = m; else hi = m; }
  const delta = +((lo + hi) / 2).toFixed(10);
  return { marg: sposta(delta), delta, prezzo: prezzo(delta) };
}
