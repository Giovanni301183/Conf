import { describe, expect, it } from 'vitest';
import { filtra, perCliente, perMese, totali } from './kpi';

const e = (id: string, o: any) => ({ id, nome: id, cliente: o.cliente, data: o.data, totale: o.costo, prezzo: o.prezzo, kwp: o.kwp, nTracker: 1, prev: { stato: o.stato } });
const A = [
  e('a', { cliente: 'Alfa', data: '2026-01-10', costo: 80, prezzo: 100, kwp: 100, stato: 'vinto' }),
  e('b', { cliente: 'Beta', data: '2026-01-20', costo: 150, prezzo: 200, kwp: 200, stato: 'perso' }),
  e('c', { cliente: 'Alfa', data: '2025-03-05', costo: 250, prezzo: 300, kwp: 100, stato: 'inviato' }),
  e('d', { cliente: '', data: '', costo: 10, prezzo: 10, kwp: 0, stato: undefined }),
];
const F0 = { anno: '', mese: '', stato: '', cliente: '' };

describe('cruscotto', () => {
  it('totali e indicatori', () => {
    const t = totali(A.slice(0, 3));
    expect(t.prezzo).toBe(600); expect(t.margPct).toBeCloseTo(20, 6);
    expect(t.successo).toBe(50); expect(t.aValore).toBe(300); expect(t.wpVend).toBeCloseTo(600 / 400000, 9);
  });
  it('filtri, e un grafico non si filtra da solo', () => {
    expect(filtra(A, '', { ...F0, anno: '2026' }).map(x => x.id)).toEqual(['a', 'b']);
    expect(filtra(A, '', { ...F0, cliente: 'Alfa', stato: 'vinto' }).map(x => x.id)).toEqual(['a']);
    expect(filtra(A, '', { ...F0, cliente: 'Alfa' }, 'cliente').length).toBe(4);
    expect(filtra(A, 'beta', F0).map(x => x.id)).toEqual(['b']);
    expect(filtra(A, '', { ...F0, stato: 'bozza' }).map(x => x.id)).toEqual(['d']);
  });
  it('per mese e per cliente', () => {
    const m = perMese(A.slice(0, 3));
    expect(m[0].tot).toBe(300); expect(m[0].s.vinto).toBe(100); expect(m[2].n).toBe(1);
    expect(perCliente(A)[0]).toMatchObject({ k: 'Alfa', v: 400, n: 2 });
  });
});
