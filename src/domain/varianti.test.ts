// Varianti di materiale: profilo per famiglia, spessori, variante uguale al base, legame con il base.
import { describe, expect, it } from 'vitest';
import { defRiga, defaultData, newPrev } from './model';
import { etichetta, nomeVariante, profDa, variante } from './varianti';

const data = defaultData();
const base = () => { const P: any = newPrev(); P._id = 'p1'; P.num = '2026/014'; P.cliente = 'Rossi'; P.stato = 'inviato';
  P.righe = [{ ...defRiga(), n: 40, taglia: '36' }, { ...defRiga(), n: 10, taglia: '24' }]; return P; };

describe('varianti', () => {
  it('profilo per famiglia o codice', () => {
    expect(profDa('ipea', data, 'IPE 140')).toBe('IPEA 140');
    expect(profDa('IPE 140', data)).toBe('IPE 140');
    expect(() => profDa('HEA', data)).toThrow(/sconosciuto/);
  });
  it('cambia profilo e asse su tutte le righe, il resto resta', () => {
    const P = variante(base(), { prof: 'IPEA', asse: 3 }, data);
    expect(P.righe.map((r: any) => [r.prof, r.asse, r.omega, r.n])).toEqual([['IPEA 140', '3,0', '2,0', 40], ['IPEA 140', '3,0', '2,0', 10]]);
    expect(P.num).toBeUndefined(); expect(P._id).toBeUndefined(); expect(P.stato).toBe('bozza');
    expect(P.variante).toEqual({ di: 'p1', num: '2026/014', etichetta: 'IPEA 140 · asse 3,0 · omega 2,0' });
    expect(nomeVariante('Rossi · Ripo — IPE 140 · asse 2,5 · omega 2,0', P)).toBe('Rossi · Ripo — IPEA 140 · asse 3,0 · omega 2,0');
  });
  it('uguale al base = null; spessori non previsti = errore', () => {
    expect(variante(base(), { prof: 'IPE', asse: 2.5 }, data)).toBeNull();
    expect(etichetta(base())).toBe('IPE 140 · asse 2,5 · omega 2,0');
    expect(() => variante(base(), { asse: 4 }, data)).toThrow(/asse/);
    expect(() => variante(base(), {}, data)).toThrow(/vuota/);
  });
});
