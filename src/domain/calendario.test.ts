// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ATTESA, RICHIAMO, agenda, inAttesa, traGiorniLavorativi, allarmi, dateCommessa, daPianificare, mia, voci, type Scadenza } from './calendario';
import { newPrev } from './model';
import { dNum } from './plan';
import { R, S } from '../store/state';

const commessa = (id: string, stato: string, inizio: string) => {
  const prev: any = newPrev(); prev.stato = stato; prev.gantt.inizio = inizio; prev.righe[0].n = 10; prev.num = '014';
  return { id, nome: 'Impianto ' + id, cliente: 'Alfa', salvato: '2026-10-01T10:00:00Z', prev };
};
const sc = (id: string, giorno: string, o: Partial<Scadenza> = {}): Scadenza =>
  ({ id, giorno, ora: null, genere: 'attivita', titolo: 'Scad ' + id, nota: null, preventivo_id: null, assegnata_a: null, fatto: false, origine: 'app', creato_da: 'a@terranovasrl.net', creato: '', ...o });

describe('calendario', () => {
  it('date della commessa dal Gantt, senza toccare il preventivo aperto', () => {
    const p0 = S.prev, r0 = R;
    const v = dateCommessa(commessa('a', 'vinto', '2026-11-02'));   // lunedi'
    expect(S.prev).toBe(p0); expect(R).toBe(r0);
    expect(v.map(x => x.tipo)).toEqual(['prod', 'prodFine', 'mont']);
    expect(v[0].giorno).toBe(dNum('2026-11-02'));
    expect(v[1].giorno).toBeGreaterThan(v[0].giorno);
    expect(v[0]).toMatchObject({ prevId: 'a', sotto: 'N° 014 · Alfa' });
  });
  it('solo preventivi vinti con data di avvio', () => {
    const A = [commessa('b', 'inviato', '2026-11-02'), commessa('c', 'vinto', '')];
    expect(A.flatMap(dateCommessa)).toEqual([]);
    expect(daPianificare(A).map(e => e.id)).toEqual(['c']);
  });
  it('allarmi: scadute, in arrivo, fatte escluse', () => {
    const oggi = dNum('2026-10-20')!;
    const vv = voci([], [sc('1', '2026-10-18'), sc('2', '2026-10-18', { fatto: true }), sc('3', '2026-10-20'), sc('4', '2026-10-23'), sc('5', '2026-10-24'), sc('6', '2026-10-21', { fatto: true })]);
    const { scadute, prossime } = allarmi(vv, oggi);
    expect(scadute.map(v => v.s!.id)).toEqual(['1']);
    expect(prossime.map(v => v.s!.id)).toEqual(['3', '4']);
  });
  it('scadenza legata a un preventivo', () => {
    const [v] = voci([commessa('d', 'bozza', '')], [sc('7', '2026-10-25', { preventivo_id: 'd' })]);
    expect(v).toMatchObject({ tipo: 'man', prevId: 'd', sotto: 'Impianto d' });
  });
  it('agenda: in ordine di ora, arretrate in cima; "le mie" = create da me o assegnate a me', () => {
    const oggi = dNum('2026-10-20')!;
    const vv = voci([], [sc('a', '2026-10-21', { ora: '15:00:00' }), sc('b', '2026-10-21', { ora: '08:30:00' }), sc('c', '2026-10-21'), sc('d', '2026-10-10'),
      sc('e', '2026-10-22', { creato_da: 'b@terranovasrl.net', assegnata_a: 'a@terranovasrl.net' }), sc('f', '2026-10-22', { creato_da: 'b@terranovasrl.net' })]);
    const { arretrate, avanti } = agenda(vv, oggi);
    expect(arretrate.map(v => v.s!.id)).toEqual(['d']);
    expect(avanti.map(v => v.s!.id)).toEqual(['b', 'a', 'c', 'e', 'f']);
    expect(vv.filter(v => mia(v, 'a@terranovasrl.net')).map(v => v.s!.id)).not.toContain('f');
  });
  it('richiamo dei preventivi inviati senza risposta; le voci fatte vecchie spariscono', () => {
    const oggi = dNum('2026-10-20')!;
    const inv: any = commessa('r', 'inviato', ''); inv.prev.offerta.inviata = '2026-10-05';
    const [v] = voci([inv, commessa('s', 'vinto', '')], [], oggi);
    expect(v).toMatchObject({ tipo: 'richiamo', prevId: 'r', giorno: dNum('2026-10-05')! + RICHIAMO });
    expect(allarmi([v], oggi).scadute).toHaveLength(1);   // 15/10: gia' passato
    const vv = voci([], [sc('x', '2026-08-01', { fatto: true }), sc('y', '2026-08-01'), sc('z', '2026-10-01', { fatto: true })], oggi);
    expect(vv.map(x => x.s!.id)).toEqual(['y', 'z']);
  });
  it("urgenze: in cima finche' non sono risolte, qualunque data", () => {
    const oggi = dNum('2026-10-20')!;
    const vv = voci([], [sc('u1', '2026-10-10', { genere: 'urgenza' }), sc('u2', '2026-10-25', { genere: 'urgenza' }), sc('u3', '2026-10-19', { genere: 'urgenza', fatto: true }), sc('n', '2026-10-21')], oggi);
    const a = allarmi(vv, oggi);
    expect(a.urgenze.map(v => v.s!.id)).toEqual(['u1', 'u2']);
    expect(a.scadute).toEqual([]); expect(a.prossime.map(v => v.s!.id)).toEqual(['n']);
    expect(agenda(vv, oggi).arretrate.map(v => v.s!.id)).toEqual(['u1', 'u2']);
  });
});

describe('attesa risposta email', () => {
  it('giorni lavorativi: salta weekend e festivi', () => {
    const ven = dNum('2026-10-23')!;
    expect(traGiorniLavorativi(0, ven)).toBe(ven);
    expect(traGiorniLavorativi(1, ven)).toBe(dNum('2026-10-26'));
    expect(traGiorniLavorativi(1, dNum('2026-10-30')!)).toBe(dNum('2026-11-02'));   // 1 novembre festivo, di domenica
    expect(traGiorniLavorativi(1, dNum('2026-12-24')!)).toBe(dNum('2026-12-28'));   // Natale e Santo Stefano
  });
  it('riconosce il promemoria dal titolo', () => {
    const s = { genere: 'promemoria', titolo: ATTESA + 'rossi@x.it' } as Scadenza;
    expect([inAttesa(s), inAttesa({ ...s, genere: 'attivita' }), inAttesa({ ...s, titolo: 'Richiamare' })]).toEqual([true, false, false]);
  });
});
