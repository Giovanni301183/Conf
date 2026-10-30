import { describe, expect, it } from 'vitest';
import { attesaPer, conCodice, daEtichetteGmail, daLeggere, suggerisciFili, numDaOggetto, oggettoBase } from './posta';
import { pulisciEtichette } from './documenti';

describe('codice della commessa nell\'oggetto', () => {
  it('lo aggiunge una volta sola, solo se c\'è il numero', () => {
    expect(conCodice('Offerta tracker', '2026/014')).toBe('Offerta tracker [TN-2026/014]');
    expect(conCodice('Offerta tracker [TN-2026/014]', '2026/014')).toBe('Offerta tracker [TN-2026/014]');
    expect(conCodice('Offerta tracker', '')).toBe('Offerta tracker');
    expect(conCodice('Offerta tracker', null)).toBe('Offerta tracker');
  });
  it('lo ritrova nella risposta', () => {
    expect(numDaOggetto('Re: R: Offerta tracker [TN-2026/014]')).toBe('2026/014');
    expect(numDaOggetto('Re: Offerta tracker')).toBe('');
  });
  it('oggetto base: senza Re/Fwd, senza codice, minuscolo', () => {
    expect(oggettoBase('Re: R: Offerta tracker Foggia [TN-2026/014]')).toBe('offerta tracker foggia');
    expect(oggettoBase('Fwd: RE: Consegna  pali')).toBe('consegna pali');
  });
});

describe('risposta a una email mandata', () => {
  const vv = [
    { id: 'a', titolo: '✉ Attesa risposta · rossi@x.it — Offerta tracker Foggia [TN-2026/014]', preventivo_id: 'p1' },
    { id: 'b', titolo: '✉ Attesa risposta · bianchi@y.it — Consegna pali', preventivo_id: 'p2' },
  ];
  it('prima lo stesso oggetto', () => expect(attesaPer(vv, 'Re: Consegna pali', '')?.id).toBe('b'));
  it('poi la stessa commessa', () => expect(attesaPer(vv, 'Domanda veloce', 'p1')?.id).toBe('a'));
  it('niente se non corrisponde', () => expect(attesaPer(vv, 'Altro', 'p9')).toBeUndefined());
});

describe('etichette di Gmail «Conf/…»', () => {
  const g = (nn: string[]) => daEtichetteGmail(nn, pulisciEtichette);
  it('temi e scelta proposta', () => {
    expect(g(['INBOX', 'Conf/Acquisti', 'Conf/Da fare'])).toEqual({ temi: ['acquisti'], azione: 'f' });
    expect(g(['Conf/Attesa risposta', 'Conf/Tecnico e progetto'])).toEqual({ temi: ['tecnico'], azione: 't' });
    expect(g(['Conf/Riunione'])).toEqual({ temi: ['riunione'], azione: 'r' });
  });
  it('ignora le etichette messe da n8n e quelle fuori da Conf/', () => {
    expect(g(['Conf/In app', 'Conf/Non entrata', 'Acquisti', 'IMPORTANT'])).toEqual({ temi: [], azione: '' });
  });
});

describe('conversazioni legate alle voci', () => {
  const m = (id: string, thread: string, data: number) => ({ id, thread, data });
  it("conversazione nuova: solo l'ultima email, e niente se ce n'è già una da sistemare", () => {
    const mm = [m('a3', 'T1', 30), m('a1', 'T1', 10), m('a2', 'T1', 20)];
    expect(daLeggere(mm, new Set(), new Map(), new Set())).toEqual(['a3']);
    expect(daLeggere(mm, new Set(), new Map(), new Set(['T1']))).toEqual([]);
  });
  it("conversazione legata: tutte le nuove dopo l'ultima letta, dalla più vecchia, senza quelle già lette", () => {
    const mm = [m('b4', 'T2', 40), m('b3', 'T2', 30), m('b2', 'T2', 20), m('b1', 'T2', 10)];
    expect(daLeggere(mm, new Set(['b3']), new Map([['T2', 15]]), new Set())).toEqual(['b2', 'b4']);
  });
  it('senza data: la conversazione legata le prende lo stesso, quella nuova la prima di Gmail', () => {
    expect(daLeggere([m('c2', 'T3', 0), m('c1', 'T3', 0)], new Set(), new Map(), new Set())).toEqual(['c2']);
    expect(daLeggere([m('d1', 'T4', 0)], new Set(), new Map([['T4', 99]]), new Set())).toEqual(['d1']);
  });
  it('voci suggerite per un oggetto nuovo: stessa persona e stessa commessa', () => {
    const v = (id: string, pid: string | null) => ({ id, titolo: 'Voce ' + id, preventivo_id: pid });
    const ff = [{ contatto: 'rossi@x.it', voce: v('1', null) }, { contatto: 'bianchi@y.it', voce: v('2', 'p1') }, { contatto: 'rossi@x.it', voce: v('3', 'p1') }];
    expect(suggerisciFili(ff, 'rossi@x.it', 'p1').map(x => x.id)).toEqual(['3', '1', '2']);
    expect(suggerisciFili(ff, 'verdi@z.it', '').map(x => x.id)).toEqual([]);
  });
});
