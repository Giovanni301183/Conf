import { describe, expect, it } from 'vitest';
import { azioni, cambia, giornoAllarme, intatta, statoDi } from './flusso';
import { allarmi, daConfermare, voci, type Scadenza } from './calendario';
import { dNum } from './plan';

const A = 'autore@terranovasrl.net', B = 'collega@terranovasrl.net', C = 'altro@terranovasrl.net';
const sc = (o: Partial<Scadenza> = {}): Scadenza =>
  ({ id: '1', giorno: '2026-10-20', ora: null, genere: 'attivita', titolo: 'Ordinare bulloni', nota: null, preventivo_id: null, assegnata_a: B, fatto: false, origine: 'app', creato_da: A, creato: '', ...o });
const OGGI = '2026-10-20';

describe('flusso delle voci', () => {
  it('stato dalle voci vecchie senza colonna stato', () => {
    expect(statoDi({ fatto: false })).toBe('aperta');
    expect(statoDi({ fatto: true })).toBe('chiusa');
  });
  it('fatta da un collega aspetta la conferma; fatta dall\'autore si chiude subito', () => {
    const f = cambia(sc(), { stato: 'fatta', esito: 'Ordinati' }, B, false, OGGI, false) as Scadenza;
    expect(f).toMatchObject({ stato: 'fatta', fatto: true, esito: 'Ordinati' });
    expect(daConfermare([f], A)).toHaveLength(1);
    expect(azioni(f, A, false, false).conferma).toBe(true);
    expect(azioni(f, B, false, false).conferma).toBe(false);
    expect(cambia(f, { stato: 'chiusa' }, B, false, OGGI, false)).toMatch(/conferma chi ha creato/);
    expect(cambia(sc(), { stato: 'fatta' }, A, false, OGGI, false)).toMatchObject({ stato: 'chiusa', fatto: true });
  });
  it('la spunta di un programma vecchio porta lo stato con sé', () => {
    expect(cambia(sc(), { fatto: true }, B, false, OGGI, false)).toMatchObject({ stato: 'fatta' });
    expect(cambia(sc({ stato: 'fatta', fatto: true }), { fatto: false }, B, false, OGGI, false)).toMatchObject({ stato: 'in_corso', fatto: false });
  });
  it('annullare: amministratore sempre, autore solo voce intatta', () => {
    const s = sc();
    expect(cambia(s, { stato: 'annullata' }, A, false, OGGI, true)).toMatchObject({ stato: 'annullata', fatto: true });
    expect(cambia(s, { stato: 'annullata' }, A, false, OGGI, false)).toMatch(/amministratore/);
    expect(cambia(s, { stato: 'annullata' }, C, true, OGGI, false)).toMatchObject({ stato: 'annullata' });
    expect(cambia(s, { stato: 'annullata' }, B, false, OGGI, true)).toMatch(/amministratore/);
    expect(intatta(s, 0, 0)).toBe(true);
    expect(intatta(sc({ passaggi: 1 }), 0, 0)).toBe(false);
    expect(intatta(s, 1, 0)).toBe(false);
    expect(intatta(s, 0, 2)).toBe(false);
    expect(azioni(sc({ passaggi: 2 }), A, false, false)).toMatchObject({ annulla: false, chiediAnnullo: true, elimina: false });
  });
  it('richiesta di annullamento: la decide l\'amministratore', () => {
    const r = cambia(sc({ stato: 'in_corso', passaggi: 1 }), { annullo_chiesto: 'Ordine saltato' }, B, false, OGGI, false) as Scadenza;
    expect(r).toMatchObject({ annullo_chiesto: 'Ordine saltato', annullo_da: B });
    expect(azioni(r, C, true, false).decidiAnnullo).toBe(true);
    expect(cambia(r, { annullo_chiesto: null }, A, false, OGGI, false)).toMatch(/amministratore/);
    expect(cambia(r, { stato: 'annullata' }, C, true, OGGI, false)).toMatchObject({ annullo_chiesto: null, stato: 'annullata' });
  });
  it('in attesa: non scade fino al sollecito', () => {
    const s = sc({ giorno: '2026-10-10', stato: 'in_attesa', attesa_di: 'zincatura', sollecito: '2026-10-22' });
    expect(giornoAllarme(s, dNum(s.giorno)!)).toBe(dNum('2026-10-22'));
    const vv = voci([], [s]);
    expect(allarmi(vv, dNum('2026-10-20')!)).toMatchObject({ scadute: [], prossime: [vv[0]] });
    expect(allarmi(vv, dNum('2026-10-23')!).scadute).toEqual([vv[0]]);
    expect(cambia(s, { stato: 'in_corso' }, B, false, OGGI, false)).toMatchObject({ attesa_di: null, sollecito: null });
  });
  it('rinvio solo se la voce era già arrivata alla sua data', () => {
    expect((cambia(sc({ giorno: '2026-10-18' }), { giorno: '2026-10-25' }, A, false, OGGI, false) as Scadenza).rinvii).toBe(1);
    expect((cambia(sc({ giorno: '2026-10-28' }), { giorno: '2026-10-30' }, A, false, OGGI, false) as Scadenza).rinvii).toBeFalsy();
  });
  it('la prende chiunque se è per chiunque; riaprire una chiusa spetta all\'autore', () => {
    expect(azioni(sc({ assegnata_a: null }), C, false, false).prendi).toBe(true);
    expect(azioni(sc(), C, false, false).prendi).toBe(false);
    const ch = sc({ stato: 'chiusa', fatto: true });
    expect(azioni(ch, B, false, false).riapri).toBe(false);
    expect(azioni(ch, A, false, false).riapri).toBe(true);
  });
});
