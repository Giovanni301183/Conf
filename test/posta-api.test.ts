// Email in arrivo (/api/agenda, azioni posta e pe): lettura dell'AI ripulita e proposta su Telegram con i pulsanti.
import { describe, expect, it } from 'vitest';
import { prossimoLavorativo, propostaTelegram, type Proposta } from '../api/agenda';
import { indirizzo, pulisciLettura } from '../api/_posta';

const commesse = [{ id: 'p1', nome: 'Ripo Nord', cliente: 'Rossi', num: '2026/014', rif: null }];
const lettura = (o: Partial<Proposta> = {}): Proposta => ({ titolo: 'Rossi chiede conferma pali', riassunto: 'Vuole la consegna entro venerdì.', mittente: 'Mario Rossi',
  giorno: '', ora: '', riunione: false, preventivo_id: '', oggetto: 'Consegna pali', ...o });

describe('email in arrivo', () => {
  it('indirizzo dal campo From', () => {
    expect(indirizzo('Giovanni Sorrentino <G.Sorrentino@terranovasrl.net>')).toBe('g.sorrentino@terranovasrl.net');
    expect(indirizzo('luca@terranovasrl.net')).toBe('luca@terranovasrl.net');
  });
  it('lettura dell\'AI: date e ore ben scritte, commessa solo se esiste', () => {
    const l = pulisciLettura({ titolo: 'x', riassunto: 'y', mittente: 'z', giorno: 'venerdì', ora: '25:00', riunione: 'si', preventivo_id: 'inventato' }, commesse);
    expect(l).toMatchObject({ giorno: '', ora: '', riunione: false, preventivo_id: '' });
    expect(pulisciLettura({ titolo: '', giorno: '2026-10-30', ora: '10:30', riunione: true, preventivo_id: 'p1' }, commesse))
      .toMatchObject({ titolo: 'Email da guardare', giorno: '2026-10-30', ora: '10:30', riunione: true, preventivo_id: 'p1' });
  });
  it('promemoria senza data: primo giorno lavorativo dopo oggi', () => {
    expect(prossimoLavorativo('2026-10-23')).toBe('2026-10-26');   // venerdì → lunedì
    expect(prossimoLavorativo('2026-10-26')).toBe('2026-10-27');
  });
  it('pulsanti: appunto anche senza commessa (libero), riunione solo con data, con i temi', () => {
    const tasti = (m: ReturnType<typeof propostaTelegram>) => m.reply_markup.inline_keyboard.map(r => r[0].callback_data);
    const senza = propostaTelegram('id1', lettura(), null, '2026-10-23');
    expect(tasti(senza)).toEqual(['pe:id1:a', 'pe:id1:p', 'pe:id1:x']);
    expect(senza.reply_markup.inline_keyboard[1][0].text).toBe('🔔 Promemoria lun 26/10');
    expect(senza.text).toContain('Commessa: non riconosciuta');
    expect(senza.reply_markup.inline_keyboard[0][0].text).toBe('📝 Appunto');
    expect(propostaTelegram('id1', lettura({ etichette: ['acquisti', 'qualita'] }), null, '2026-10-23').text).toContain('Temi: Acquisti, Qualità e reclami');
    const con = propostaTelegram('id1', lettura({ giorno: '2026-10-30', ora: '10:30', preventivo_id: 'p1' }), 'Ripo Nord (N° 2026/014)', '2026-10-23');
    expect(tasti(con)).toEqual(['pe:id1:a', 'pe:id1:p', 'pe:id1:r', 'pe:id1:x']);
    expect(con.reply_markup.inline_keyboard[2][0].text).toBe('📅 Riunione ven 30/10 10:30');
    expect(con.text).toContain('Commessa: Ripo Nord (N° 2026/014)');
    // callback_data di Telegram: massimo 64 byte con un id uuid
    expect(`pe:${'0'.repeat(36)}:a`.length).toBeLessThanOrEqual(64);
  });
});
