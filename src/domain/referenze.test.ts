import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { clone, defaultData, newPrev } from './model';
import { ASSI, inUso, pilastri, sostituisci } from './referenze';

describe('sostituisci referenza', () => {
  it('solo nei gruppi scelti; la prova conta senza cambiare niente', () => {
    const d = defaultData(), prima = clone(d);
    const g = new Set(['PILASTRO MOTORE']);
    const conti = sostituisci(d, [['10ROND10', '10ROND16'], ['10DAZAM10', '10DAZAM16']], g, true);
    expect(conti.map(c => [c.g, c.da, c.n])).toEqual([['PILASTRO MOTORE', '10ROND10', 1], ['PILASTRO MOTORE', '10DAZAM10', 1]]);
    expect(d).toEqual(prima);
    sostituisci(d, [['10ROND10', '10ROND16'], ['10DAZAM10', '10DAZAM16']], g);
    expect(d.template.filter(t => t.g === 'PILASTRO MOTORE').some(t => t.c === '10ROND10')).toBe(false);
    expect(inUso(d, '10ROND10')).toBe(d.template.some(t => t.c === '10ROND10'));
  });
  it('anche nel blocco assi di ogni taglia, e il calcolo usa il codice nuovo', () => {
    const d = defaultData();
    const conti = sostituisci(d, [['GAFFA GIUNZIONE ASSE', 'GAFFA']], new Set([ASSI]));
    expect(conti[0]?.taglie.length).toBeGreaterThan(1);
    expect(Object.values<any>(d.sizes).some(s => s.assi.some(a => a.c === 'GAFFA GIUNZIONE ASSE'))).toBe(false);
    const p = newPrev(); p.righe[0].n = 1;
    expect(compute(d, p).lines.some(l => l.code === 'GAFFA GIUNZIONE ASSE')).toBe(false);
  });
});

describe('profili dei pilastri', () => {
  it('IPE 140 e IPEA 140 di serie; poi contano le spunte del listino', () => {
    const d = defaultData();
    expect(pilastri(d).map(x => x[0])).toEqual(['IPE 140', 'IPEA 140']);
    d.listino.find(x => x.c === 'IPEA 140').pil = false;
    d.listino.find(x => x.c === 'OMEGA 2,0').pil = true;
    expect(pilastri(d, 'IPEA 140').map(x => x[0])).toEqual(['IPE 140', 'OMEGA 2,0', 'IPEA 140']);
  });
});
