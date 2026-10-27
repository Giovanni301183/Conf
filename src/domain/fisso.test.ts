// Motore degli impianti fissi: stessi casi dei test del configuratore Python (tests/test_regole.py, test_ntc.py).
import { describe, expect, it } from 'vitest';
import { calcola, calcolaImpianto, COMUNI, input, nuovaTaglia, proponiImpianto, TagliaNonAmmessa } from './fisso';
import { categoria, kmDalMare, zonaVento } from '../../api/_sito';
import { SITO, vento } from './vento';

const quantita = (r: ReturnType<typeof calcola>) => Object.fromEntries(r.righe.map(x => [x.codice, x.quantita]));
const totali = (r: ReturnType<typeof calcola>) => Object.fromEntries(r.righe.map(x => [x.codice, x.totale]));

describe('impianto fisso', () => {
  it('36 come distinta DE VITA', () => {
    const r = calcola(input()), q = quantita(r);
    expect([r.colonne, r.campate, r.telai]).toEqual([18, 9, 10]);
    expect(r.lunghezza).toBeCloseTo(23814);
    expect(q.trave_falda).toBe(10);
    expect(q.giunto_vert).toBe(20);
    expect([q.arc_sx, q.arc_centrale, q.arc_dx]).toEqual([4, 28, 4]);
    expect(q.controvento).toBe(6);
    expect(q.giunto_palo).toBe(32);
    expect(q.aggancio_centrale).toBe(72);
    expect(q.aggancio_laterale).toBe(8);
  });

  it('bulloneria ridotta in proporzione', () => {
    const t24 = totali(calcola(input({ moduli: 24 })));
    expect([t24.m10x30, t24.m10x80, t24.dado, t24.rondella]).toEqual([3, 89, 92, 184]);
    const t12 = totali(calcola(input({ moduli: 12 })));
    expect([t12.m10x30, t12.m10x80, t12.dado, t12.rondella]).toEqual([2, 45, 47, 94]);
  });

  it('bulloneria arrotondata sul totale come DE VITA', () => {
    const t = totali(calcola(input({ moduli: 36, n_strutture: 19 })));
    expect([t.m10x30, t.m10x80, t.dado, t.rondella]).toEqual([84, 2532, 2616, 5232]);
  });

  it('impianto con più taglie', () => {
    const { taglie } = calcolaImpianto(COMUNI, [nuovaTaglia(36, 4), nuovaTaglia(18, 5)]);
    expect(taglie.map(r => [r.input.moduli, r.input.n_strutture])).toEqual([[36, 4], [18, 5]]);
    expect(totali(taglie[0]).trave_falda).toBe(40);
    expect(totali(taglie[1]).trave_falda).toBe(30);
    expect(() => calcolaImpianto(COMUNI, [nuovaTaglia(36, 1), nuovaTaglia(36, 2)])).toThrow(TagliaNonAmmessa);
  });

  it('taglia 4: arcareccio unico modificabile', () => {
    const r = calcola(input({ moduli: 4, lunghezza_arc_unico: 2800 })), arc = r.righe.find(x => x.codice === 'arc_unico')!;
    expect([r.campate, r.telai, arc.quantita, arc.lunghezza]).toEqual([1, 2, 4, 2800]);
    expect(quantita(r).giunto_palo).toBe(0);
  });

  it('18 con riserva', () => {
    const r = calcola(input({ moduli: 18 }));
    expect(r.campate).toBe(5);
    expect(r.avvisi.some(a => a.includes('riserva'))).toBe(true);
  });

  it.each([14, 26, 2])('taglia %i non ammessa', moduli => {
    expect(() => calcola(input({ moduli }))).toThrow(TagliaNonAmmessa);
  });

  it('controventi scelti dall\'utente', () => {
    expect(quantita(calcola(input({ moduli: 24, controventi: 4 }))).controvento).toBe(4);
  });

  it('telai come tavola DE VITA', () => {
    const g = calcola(input()).geometria;
    const campate = g.telai_x.slice(1).map((b, i) => Math.round((b - g.telai_x[i]) * 10) / 10);
    expect(campate).toEqual([2405, ...Array(8).fill(2646)]);
    expect(Math.round(g.interasse_pali)).toBe(23573);
    expect(g.campate_controventi).toEqual([1, 4, 7]);
  });

  it('18: ultima campata ridotta', () => {
    const r = calcola(input({ moduli: 18 })), t = r.geometria.telai_x;
    expect(Math.round(t[t.length - 1] - t[t.length - 2])).toBe(1323);
    expect(r.geometria.campate_controventi).not.toContain(r.campate - 1);
  });

  it.each([
    [{ moduli: 776 }, [[36, 21], [20, 1]], 776],   // esempio del PRD
    [{ moduli: 36 }, [[36, 1]], 36],
    [{ moduli: 34 }, [[36, 1]], 36],                // resto arrotondato a 36: una 36 in più
    [{ moduli: 30 }, [[32, 1]], 32],
    [{ kwp: 570.36 }, [[36, 21], [20, 1]], 776],
  ])('proposta %j: prima le 36, poi il resto', (obiettivo, attese, moduli) => {
    const p = proponiImpianto(obiettivo);
    expect(p.taglie.map(t => [t.moduli, t.n_strutture])).toEqual(attese);
    expect(p.moduli).toBe(moduli);
  });

  it('proposta senza obiettivo', () => {
    expect(() => proponiImpianto({})).toThrow(TagliaNonAmmessa);
  });

  it('l\'infissione cambia i pilastri', () => {
    const lunghezze = (o = {}) => Object.fromEntries(calcola(input(o)).righe.map(r => [r.codice, r.lunghezza]));
    const base = lunghezze();
    expect([base.montante_basso, base.montante_alto]).toEqual([1390, 3415]);
    const L = lunghezze({ infissione_ant: 900, infissione_post: 1000 });
    expect([L.montante_basso, L.montante_alto]).toEqual([1590, 3215]);
    expect(() => calcola(input({ infissione_ant: -10 }))).toThrow(TagliaNonAmmessa);
  });

  it('peso modulo inserito dall\'utente', () => {
    expect(calcola(input()).avvisi.some(a => a.includes('Peso modulo'))).toBe(true);
    expect(calcola(input({ peso_modulo: 38.5 })).avvisi.some(a => a.includes('Peso modulo'))).toBe(false);
  });
});

describe('sito e vento', () => {
  it('zona vento come Conf', () => {
    expect(zonaVento('Sicilia', 'Trapani', 37.8, 12.4)).toBe(4);
    expect(zonaVento('Sardegna', 'Cagliari', 39.22, 9.12)).toBe(5);
    expect(zonaVento('Sardegna', 'Oristano', 39.9, 8.59)).toBe(6);
    expect(zonaVento('Friuli-Venezia Giulia', 'Trieste', 45.6, 13.8)).toBe(8);
    expect(zonaVento('Puglia', 'Foggia', 41.4, 15.5)).toBe(3);
  });

  it('categoria e distanza dal mare', () => {
    expect(categoria(3, 'D', 50, 100)).toBe('II');
    expect(categoria(3, 'D', 50, 600)).toBe('III');
    expect(kmDalMare(41.46, 15.55)).toBeGreaterThan(20);   // Foggia
    expect(kmDalMare(41.13, 16.87)).toBeLessThan(3);       // Bari
  });

  it('vento: dati mancanti e zona 3 sotto i 500 m', () => {
    expect(vento(SITO, 2)).toBeNull();
    const v = vento({ ...SITO, zona_vento: 3, altitudine: 100, categoria: 'II' }, 2)!;
    expect(v.vb).toBe(27);
    expect(v.cr).toBeCloseTo(1.0007, 4);  // Tr 50 anni
    expect(v.qr).toBeCloseTo(456.29, 2);  // 0,5 · 1,25 · (27 · cr)²
  });
});
