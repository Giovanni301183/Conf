import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { defaultData, newPrev } from './model';
import { margineSpot } from './margini';

// Impianto DE VITA: 19 strutture da 36 moduli, prezzi della Distinta IMPIANTO 36 MODULI - DE VITA.
const prev = () => { const P: any = newPrev('fisso'); P.fisso.taglie[0].n_strutture = 19; return P; };
const riga = (R: any, code: string) => R.lines.find((l: any) => l.code === code);

describe('costi degli impianti fissi', () => {
  it('trave di falda: acquisto a peso, lavorazione 10 %, altre lavorazioni 0,05 €/kg, niente zincatura', () => {
    const l = riga(compute(defaultData(), prev()), 'trave_falda'), kg = 10 * 19 * 4 * 3.432;
    expect(l.q).toBe(190);
    expect(l.peso).toBeCloseTo(kg, 6);
    expect(l.mat).toBeCloseTo(kg, 6);
    expect(l.lav).toBeCloseTo(kg * 0.1, 6);
    expect(l.altro).toBeCloseTo(kg * 0.05, 6);
    expect(l.zinc).toBe(0);
  });
  it('montante zincato: zincatura a 0,85 €/kg sul peso +3 %', () => {
    const l = riga(compute(defaultData(), prev()), 'montante_basso'), kg = 10 * 19 * 1.39 * 4.29;
    expect(l.zinc).toBeCloseTo(kg * 1.03 * 0.85, 6);
    expect(l.peso).toBeCloseTo(kg * 1.03, 6);
  });
  it('minuteria a pezzo nella colonna Acquisto', () => {
    const R = compute(defaultData(), prev()), l = riga(R, 'aggancio_centrale');
    expect(l.cat).toBe('ALLUMINIO');
    expect(l.acq).toBeCloseTo(72 * 19 * 1.2, 6);
    expect(l.mat).toBe(0);
  });
  it('margine di partenza 17 % sul prezzo, strutture contate come righe', () => {
    const R: any = compute(defaultData(), prev());
    expect(R.prezzo).toBeCloseTo(R.total / 0.83, 6);
    expect(R.nTracker).toBe(19);
    expect(R.unita).toBe('struttura');
    expect(R.righe[0].tot).toBeCloseTo(R.total, 6);
    expect(R.kwp).toBeCloseTo(19 * 36 * 0.735, 6);
  });
  it('voce extra «per tracker» = per struttura', () => {
    const P = prev(); P.extra = [{ desc: 'Montaggio', voce: 'altro', modo: 'tracker', val: 100 }];
    const R0 = compute(defaultData(), prev()), R = compute(defaultData(), P);
    expect(R.total - R0.total).toBeCloseTo(1900, 6);
  });
  it('il listino dei fissi nei dati condivisi cambia il costo', () => {
    const d: any = defaultData(), t0 = compute(d, prev()).total;
    d.fisso = { prezzi: { trave_falda: { costo: 2, um: 'kg', lav: 0.1, zinc: false, altre: 0.05 } } };
    expect(compute(d, prev()).total - t0).toBeCloseTo(10 * 19 * 4 * 3.432 * 1.1, 6);
  });
  it('prezzo spot anche per i fissi, con le categorie dei fissi', () => {
    const P = prev(); P.marg.cat.ALLUMINIO = 30;
    const x = margineSpot(defaultData(), P, 50000);
    if ('errore' in x) throw new Error(x.errore);
    expect(x.prezzo).toBeCloseTo(50000, 2);
    expect(x.marg.cat.ALLUMINIO).toBeCloseTo(30 + x.delta, 6);
  });
  it('taglia non ammessa: nessuna riga e un avviso', () => {
    const P = prev(); P.fisso.taglie[0].moduli = 10;
    const R = compute(defaultData(), P);
    expect(R.total).toBe(0);
    expect(R.warn[0]).toMatch(/non ammessa/);
  });
});
