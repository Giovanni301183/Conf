// Validazione sull'Excel (PRD §7.1): i totali devono restare identici a quelli del configuratore.
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { defaultData, newPrev } from './model';

const r2 = (x: number) => Math.round(x * 100) / 100;

function prev(taglia: string, imp = false) {
  const p = newPrev();
  p.righe = [{ taglia, n: 1, tipo: 'Agrivoltaico', prof: 'IPE 140', asse: '2,5', omega: '2,0', lFond: 3, lCusc: 2.3 }];
  if (imp) p.imp = { quadA: 1, quadGen: 1, box: 1, piran: 1, anem: 1, termAria: 1, termCont: 1 };
  return p;
}

describe('validazione Excel', () => {
  it('12 moduli, 1 tracker', () => {
    const R = compute(defaultData(), prev('12'));
    expect(r2(R.total)).toBe(1548.4);
    expect(R.warn).toEqual([]);
  });

  it('12 moduli + impianto, per voce di costo', () => {
    const R = compute(defaultData(), prev('12', true));
    expect(r2(R.total)).toBe(6248.4);
    expect([R.T.mat, R.T.zinc, R.T.lav, R.T.acq].map(r2)).toEqual([556.9, 140.48, 118.94, 5432.08]);
  });

  it.each([
    ['18', 2088.53], ['20', 2156.8], ['22', 2226.49], ['36', 3334.03], ['40', 3802.39],
  ])('%s moduli, 1 tracker senza impianto', (taglia, atteso) => {
    expect(r2(compute(defaultData(), prev(taglia)).total)).toBe(atteso);
  });

  it('preventivo nuovo parte da 0 €', () => {
    expect(compute(defaultData(), newPrev()).total).toBe(0);
  });
});

describe('margine sulla lavorazione', () => {
  const prev = () => { const p: any = newPrev(); p.righe[0].n = 1; p.marg.gen = 20; return p; };
  it('vuoto: la lavorazione segue la categoria della riga', () => {
    const p = prev(); p.marg.cat.STRUTTURA = 30; const r = compute(defaultData(), p);
    for (const l of r.lines) expect(l.pLav).toBeCloseTo(l.lav * (l.cat === 'STRUTTURA' ? 1 / 0.7 : 1 / 0.8), 6);
  });
  it('valore proprio: vale solo sul costo di lavorazione', () => {
    const p = prev(); p.marg.cat.LAVORAZIONE = 50; const r = compute(defaultData(), p);
    const lav = r.lines.reduce((s, l) => s + l.lav, 0);
    expect(lav).toBeGreaterThan(0);
    expect(r.prezzo).toBeCloseTo((r.total - lav) / 0.8 + lav / 0.5, 6);
  });
});
