import { describe, expect, it } from 'vitest';
import { inizioProposto, nomeDi, nonLetti, testoNota, trattoPerAI, type Messaggio } from './squadra';

const msg = (p: Partial<Messaggio>): Messaggio => ({ id: 'm', testo: 'ciao', documento_id: null, nota_id: null, creato_da: 'a@terranovasrl.net', creato: '2026-10-28T08:00:00Z', ...p });
const colleghi = [{ email: 'a@terranovasrl.net', nome: 'Anna' }, { email: 'b@terranovasrl.net', nome: null }];

describe('chat di squadra', () => {
  it('nome dal elenco utenti o dalla email', () => {
    expect(nomeDi('a@terranovasrl.net', colleghi)).toBe('Anna');
    expect(nomeDi('b@terranovasrl.net', colleghi)).toBe('b');
  });
  it('inizio proposto: dopo l\'ultima nota e non prima di oggi', () => {
    const mm = [msg({ creato: '2026-10-26T08:00:00Z' }), msg({ creato: '2026-10-27T08:00:00Z', nota_id: 'n' }), msg({ creato: '2026-10-27T09:00:00Z' }), msg({ creato: '2026-10-28T08:00:00Z' })];
    expect(inizioProposto(mm, '2026-10-28')).toBe(3);
    expect(inizioProposto(mm, '2026-10-29')).toBe(2);
    expect(inizioProposto([], '2026-10-28')).toBe(-1);
    expect(inizioProposto([msg({ nota_id: 'n' })], '2026-10-28')).toBe(0);
  });
  it('non letti: solo degli altri e dopo l\'ultima apertura', () => {
    const mm = [msg({ creato: '2026-10-28T08:00:00Z' }), msg({ creato: '2026-10-28T09:00:00Z' }), msg({ creato: '2026-10-28T10:00:00Z', creato_da: 'b@terranovasrl.net' })];
    expect(nonLetti(mm, '2026-10-28T08:30:00Z', 'b@terranovasrl.net')).toBe(1);
    expect(nonLetti(mm, '', 'c@terranovasrl.net')).toBe(3);
  });
  it('tratto per l\'AI con nomi e file', () => {
    const t = trattoPerAI([msg({ testo: 'guarda', documento_id: 'd1' })], colleghi, () => 'foto.jpg');
    expect(t).toContain('Anna (a@terranovasrl.net): guarda [file: foto.jpg]');
  });
  it('testo della nota con le cose da fare', () => {
    expect(testoNota({ testo: 'Riassunto', da_fare: [{ cosa: 'Ordinare bulloni', chi: 'a@terranovasrl.net', entro: '2026-11-03' }, { cosa: ' ', chi: '', entro: '' }] }, colleghi))
      .toBe('Riassunto\n\nDa fare:\n- Ordinare bulloni (Anna) entro il 3 novembre');
    expect(testoNota({ testo: 'Solo testo', da_fare: [] }, colleghi)).toBe('Solo testo');
  });
});
