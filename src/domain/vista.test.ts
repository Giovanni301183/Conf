import { describe, expect, it } from 'vitest';
import { VISTA_TUTTO, filtraVista, normVista, vedeTutto } from './vista';

const me = 'tec@terranovasrl.net', altro = 'com@terranovasrl.net';
const man = (id: string, x: { creato_da?: string; assegnata_a?: string; genere?: string; prevId?: string } = {}) =>
  ({ key: id, tipo: 'man', prevId: x.prevId, s: { creato_da: x.creato_da ?? altro, assegnata_a: x.assegnata_a ?? null, genere: x.genere ?? 'attivita', fatto: false } });
const VV = [
  man('mia', { creato_da: me }), man('perme', { assegnata_a: me }), man('altrui'), man('altruiSeguita', { prevId: 'p1' }),
  man('urg', { genere: 'urgenza' }),
  { key: 'prod1', tipo: 'prod', prevId: 'p1' }, { key: 'prod2', tipo: 'prod', prevId: 'p2' }, { key: 'rich', tipo: 'richiamo', prevId: 'p3' },
];
const keys = (vista: any) => filtraVista(VV, normVista(vista), me).map(v => v.key);

describe('cosa vedo nel calendario', () => {
  it('senza scelta salvata si vede tutto', () => {
    expect(normVista(null)).toEqual(VISTA_TUTTO);
    expect(vedeTutto(normVista({}))).toBe(true);
    expect(keys(null)).toHaveLength(VV.length);
  });
  it('ufficio tecnico: solo le sue voci, quelle per lui e le commesse che segue', () => {
    expect(keys({ altri: 'seguite', commesse: 'seguite', richiami: false, urgenze: false, seguo: ['p1'] }))
      .toEqual(['mia', 'perme', 'altruiSeguita', 'prod1']);
  });
  it('le proprie voci restano sempre; le urgenze di tutti se scelte', () => {
    expect(keys({ altri: 'nessuna', commesse: 'nessuna', richiami: false, urgenze: true })).toEqual(['mia', 'perme', 'urg']);
  });
  it('valori sconosciuti tornano a quelli di base', () => {
    expect(normVista({ altri: 'boh', seguo: ['a', 3] })).toEqual({ ...VISTA_TUTTO, seguo: ['a'] });
  });
});
