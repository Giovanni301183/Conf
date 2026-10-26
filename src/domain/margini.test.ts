// Riepilogo margini per Telegram: categorie che sommano al totale, margine proprio di categoria.
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { margineSpot, perCategoria, testoMargini } from './margini';
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
  it('prezzo spot: stessi punti a tutti i margini, prezzo raggiunto', () => {
    const spot = Math.round(R.prezzo * 1.05), x: any = margineSpot(data, P, spot);
    expect(x.errore).toBeUndefined();
    expect(Math.abs(x.prezzo - spot)).toBeLessThan(0.005);   // al centesimo
    expect(x.marg.cat.STRUTTURA - x.marg.gen).toBeCloseTo(7, 3);   // la differenza 25 − 18 resta
    expect(compute(data, { ...P, marg: x.marg }).prezzo).toBeCloseTo(x.prezzo, 2);
    expect((margineSpot(data, P, 1) as any).errore).toMatch(/troppo basso/);
    // Anche con i centesimi, su un prezzo grande: il prezzo resta quello scritto.
    const cent = Math.round(R.prezzo * 1.3) + 0.37;
    expect((margineSpot(data, P, cent) as any).prezzo.toFixed(2)).toBe(cent.toFixed(2));
    expect((margineSpot(data, { ...P, marg: { ...P.marg, modo: 'ricarico' } }, spot) as any).prezzo).toBeCloseTo(spot, 2);
  });
});
