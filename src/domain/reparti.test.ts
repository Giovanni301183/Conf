import { describe, expect, it } from 'vitest';
import { SMISTARE, pulisciReparti, repartiNota, repartiVoce, settoriDi } from './reparti';
import type { Scadenza, Voce } from './calendario';

const s = (x: Partial<Scadenza>) => ({ id: '1', giorno: '2026-10-30', ora: null, genere: 'attivita', titolo: 'x', nota: null, preventivo_id: null, assegnata_a: null, fatto: false, origine: 'app', creato_da: 'a@t.it', creato: '', ...x }) as Scadenza;
const man = (x: Partial<Scadenza>): Voce => ({ key: 'k', giorno: 0, tipo: 'man', titolo: 'x', sotto: '', s: s(x) });
const di = (e: string) => ({ 'a@t.it': ['tecnico'], 'b@t.it': ['acquisti', 'logistica'] } as Record<string, string[]>)[e] || [];

describe('reparti', () => {
  it('note: dai temi, anche più di un reparto; senza temi da smistare', () => {
    expect(repartiNota({ etichette: ['vendita', 'tecnico'] })).toEqual(['commerciale', 'tecnico']);
    expect(repartiNota({ etichette: ['riunione'] })).toEqual(['direzione']);
    expect(repartiNota({ etichette: [] })).toEqual([SMISTARE]);
    expect(repartiNota({})).toEqual([SMISTARE]);
  });
  it('voci: prima i reparti scelti, poi il tipo, poi chi la deve fare, poi chi l\'ha creata', () => {
    expect(repartiVoce(man({ reparti: ['qualita'] }), di)).toEqual(['qualita']);
    expect(repartiVoce({ key: 'p', giorno: 0, tipo: 'prod', titolo: '', sotto: '' }, di)).toEqual(['produzione']);
    expect(repartiVoce({ key: 'm', giorno: 0, tipo: 'mont', titolo: '', sotto: '' }, di)).toEqual(['cantiere']);
    expect(repartiVoce({ key: 'r', giorno: 0, tipo: 'richiamo', titolo: '', sotto: '' }, di)).toEqual(['commerciale']);
    expect(repartiVoce(man({ assegnata_a: 'b@t.it' }), di)).toEqual(['acquisti', 'logistica']);
    expect(repartiVoce(man({}), di)).toEqual(['tecnico']);
    expect(repartiVoce(man({ creato_da: 'nessuno@t.it' }), di)).toEqual([SMISTARE]);
  });
  it('tiene solo reparti esistenti', () => expect(pulisciReparti(['tecnico', 'boh', 'tecnico'])).toEqual(['tecnico']));
  it('settori: quelli scelti, altrimenti dal preventivo (tracker e fissi = Energia)', () => {
    const sp = (id: string) => ({ p1: '', p2: 'fisso', p3: 'serre' } as Record<string, string>)[id];
    expect(settoriDi(['vigneti', 'boh'], 'p3', sp)).toEqual(['vigneti']);
    expect([settoriDi([], 'p1', sp), settoriDi(null, 'p2', sp), settoriDi([], 'p3', sp)]).toEqual([['energia'], ['energia'], ['serre']]);
    expect([settoriDi([], 'manca', sp), settoriDi([], null, sp)]).toEqual([[], []]);
  });
});
