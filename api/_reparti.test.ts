import { describe, expect, it } from 'vitest';
import { msgReparti, msgSalvato, msgScrivi, msgTipi, repartiDiVoce, repartoDa, temiPerReparto } from './_reparti';
import { REPARTI } from '../src/domain/reparti';

describe('reparti su Telegram', () => {
  it('riconosce il reparto da come lo si scrive', () => {
    expect(repartoDa('acquisti')).toBe('acquisti');
    expect(repartoDa('Qualità')).toBe('qualita');
    expect(repartoDa('risorse umane')).toBe('hr');
    expect(repartoDa('R&S')).toBe('rs');
    expect(repartoDa('personale')).toBe('hr');   // dal tema
    expect(repartoDa('da smistare')).toBe('smistare');
    expect(repartoDa('')).toBe('');
    expect(repartoDa('marte')).toBe('');
  });
  it('i dati dei pulsanti stanno nei 64 byte di Telegram', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const tutti = [msgReparti(), ...REPARTI.map(r => msgTipi(r.k)), msgSalvato('v', id, 'Titolo', 'amministrazione')]
      .flatMap(m => m.reply_markup.inline_keyboard.flat().map(t => t.callback_data));
    tutti.push(...REPARTI.map(r => `rv:${id}:${r.k}`));
    for (const d of tutti) expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
  });
  it('la domanda porta reparto e tipo per l\'assistente', () => {
    expect(msgScrivi('acquisti', 'promemoria').text).toContain('[reparto=acquisti tipo=promemoria]');
  });
  it('una nota passata a un altro reparto cambia solo i temi dei reparti', () => {
    const acq = REPARTI.find(r => r.k === 'acquisti')!.temi[0], log = REPARTI.find(r => r.k === 'logistica')!.temi[0];
    expect(temiPerReparto([acq, 'zzz'], 'logistica')).toEqual(['zzz', log]);
    expect(temiPerReparto([acq], 'smistare')).toEqual([]);
  });
  it('reparti di una voce: scelti, poi quelli di chi la fa, poi da smistare', () => {
    const di = (e: string) => (e === 'a@x' ? ['produzione'] : []);
    expect(repartiDiVoce({ reparti: ['logistica'], assegnata_a: 'a@x', creato_da: 'b@x' }, di)).toEqual(['logistica']);
    expect(repartiDiVoce({ reparti: [], assegnata_a: 'a@x', creato_da: 'b@x' }, di)).toEqual(['produzione']);
    expect(repartiDiVoce({ reparti: null, assegnata_a: null, creato_da: 'b@x' }, di)).toEqual(['smistare']);
  });
});
