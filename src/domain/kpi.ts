// Indicatori dell'archivio preventivi: filtri del cruscotto e della mappa, totali e raggruppamenti.
import { STATI, num } from './model';

export const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export type KFiltro = { anno: string; mese: string; stato: string; cliente: string };

export const eStato = (e: any): string => e.prev?.stato || 'bozza';
export const eLuogo = (e: any) => e.prev?.luogo || { nome: '', lat: null, lng: null };
export const hasPos = (e: any) => { const l = eLuogo(e); return l.lat != null && l.lng != null && isFinite(l.lat) && isFinite(l.lng); };
/** Data del preventivo (quella scritta in Commessa), altrimenti la data di salvataggio. */
export const eData = (e: any): string => (/^\d{4}-\d{2}/.test(e.data || '') ? e.data : String(e.salvato || '').slice(0, 10));
export const eAnno = (e: any) => eData(e).slice(0, 4);
export const eMese = (e: any) => num(eData(e).slice(5, 7)) - 1;
export const eCliente = (e: any) => (e.cliente || '').trim() || '(senza cliente)';

export function testo(e: any) { return [e.nome, e.cliente, e.rif, e.righe, eLuogo(e).nome].join(' ').toLowerCase(); }

/** Applica ricerca e filtri. `salta` esclude un filtro: un grafico non si filtra da solo, cosi' resta cliccabile. */
export function filtra(arch: any[], q: string, f: KFiltro, salta: keyof KFiltro | '' = '') {
  const t = q.trim().toLowerCase();
  return arch.filter(e => (!t || testo(e).includes(t))
    && (salta === 'anno' || !f.anno || eAnno(e) === f.anno)
    && (salta === 'mese' || f.mese === '' || String(eMese(e)) === f.mese)
    && (salta === 'stato' || !f.stato || eStato(e) === f.stato)
    && (salta === 'cliente' || !f.cliente || eCliente(e) === f.cliente));
}

export function totali(list: any[]) {
  const t = { n: list.length, costo: 0, prezzo: 0, kwp: 0, trk: 0, vinti: 0, persi: 0, vValore: 0, aperti: 0, aValore: 0 };
  for (const e of list) {
    const p = num(e.prezzo ?? e.totale); t.costo += num(e.totale); t.prezzo += p; t.kwp += num(e.kwp); t.trk += num(e.nTracker);
    const s = eStato(e);
    if (s === 'vinto') { t.vinti++; t.vValore += p; } else if (s === 'perso') t.persi++; else if (s === 'inviato') { t.aperti++; t.aValore += p; }
  }
  return {
    ...t,
    margine: t.prezzo - t.costo,
    margPct: t.prezzo ? ((t.prezzo - t.costo) / t.prezzo) * 100 : null,
    wpVend: t.kwp ? t.prezzo / (t.kwp * 1000) : null,
    wpCosto: t.kwp ? t.costo / (t.kwp * 1000) : null,
    successo: t.vinti + t.persi ? (t.vinti / (t.vinti + t.persi)) * 100 : null,
  };
}

/** Valore (prezzo di vendita) per mese, diviso per stato. */
export function perMese(list: any[]) {
  const m = MESI.map((_, i) => ({ i, tot: 0, n: 0, s: Object.fromEntries(STATI.map(([k]) => [k, 0])) as Record<string, number> }));
  for (const e of list) { const i = eMese(e); if (i < 0 || i > 11) continue; const p = num(e.prezzo ?? e.totale); m[i].tot += p; m[i].n++; m[i].s[eStato(e)] += p; }
  return m;
}
export function perStato(list: any[]) {
  return STATI.map(([k, l, c, ic]) => { const x = list.filter(e => eStato(e) === k); return { k, l, c, ic, n: x.length, v: x.reduce((s, e) => s + num(e.prezzo ?? e.totale), 0) }; });
}
export function perCliente(list: any[], max = 8) {
  const g = new Map<string, { k: string; v: number; n: number; kwp: number }>();
  for (const e of list) { const k = eCliente(e); const x = g.get(k) || { k, v: 0, n: 0, kwp: 0 }; x.v += num(e.prezzo ?? e.totale); x.n++; x.kwp += num(e.kwp); g.set(k, x); }
  const all = [...g.values()].sort((a, b) => b.v - a.v);
  if (all.length <= max) return all;
  const rest = all.slice(max - 1);
  return [...all.slice(0, max - 1), { k: `Altri ${rest.length} clienti`, v: rest.reduce((s, x) => s + x.v, 0), n: rest.reduce((s, x) => s + x.n, 0), kwp: rest.reduce((s, x) => s + x.kwp, 0), altri: true } as any];
}
export const anni = (arch: any[]) => [...new Set(arch.map(eAnno).filter(Boolean))].sort().reverse();
