import { describe, expect, it } from 'vitest';
import { attesaPer, conCodice, numDaOggetto, oggettoBase } from './posta';

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
