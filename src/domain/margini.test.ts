// Riepilogo margini per Telegram: categorie che sommano al totale, margine proprio di categoria.
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { perCategoria, testoMargini } from './margini';
import { defRiga, defaultData, newPrev } from './model';

describe('margini', () => {
  const data = defaultData(), P: any = newPrev();
  P.num = '2026/014'; P.cliente = 'Rossi'; P.righe = [{ ...defRiga(), n: 20, taglia: '36' }]; P.marg.gen = 18; P.marg.cat.STRUTTURA = 25;
  const R = compute(data, P);
  it('le categorie sommano a costo e prezzo totali', () => {
    const cc = Object.values(perCategoria(R));
    expect(cc.reduce((s, x) => s + x.c, 0)).toBeCloseTo(R.total, 2);
    expect(cc.reduce((s, x) => s + x.p, 0)).toBeCloseTo(R.prezzo, 2);
  });
  it('testo con intestazione, margine proprio e totale', () => {
    const t = testoMargini(P, R);
    expect(t).toContain('📊 Margini · N° 2026/014 · Rossi');
    expect(t).toContain('Margine sul prezzo generale 18');
    expect(t).toMatch(/• STRUTTURA: .*margine proprio 25/);
    expect(t).toContain('TOTALE: costo');
    expect(t).toContain('• R1 20 × 36 moduli agri');
  });
});
