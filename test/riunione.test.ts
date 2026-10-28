// Riunioni online: link di Meet/Teams/Zoom nei testi e avvisi prima dell'inizio (app e Telegram).
import { describe, expect, it } from 'vitest';
import { chiaveAvviso, daAvvisare, linkRiunione, minutiA } from '../src/domain/riunione';
import { avvisoRiunione, oraRoma, type Ctx, type Voce } from '../api/agenda';

const app = (o: Partial<Voce> = {}): Voce => ({ id: 'v1', giorno: '2026-10-26', ora: '11:00:00', genere: 'appuntamento', categoria: null, titolo: 'Riunione Trackers', nota: null,
  preventivo_id: null, assegnata_a: null, fatto: false, origine: 'telegram', creato_da: 'mario@terranovasrl.net', creato: '', ...o });

describe('riunioni', () => {
  it('link della riunione nel testo', () => {
    expect(linkRiunione('Link della riunione meet.google.com/cdj-tcyp-qyd Partecipa')).toBe('https://meet.google.com/cdj-tcyp-qyd');
    expect(linkRiunione('Entra: https://meet.google.com/cdj-tcyp-qyd?authuser=0.')).toBe('https://meet.google.com/cdj-tcyp-qyd');
    expect(linkRiunione('Teams https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=x ciao')).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=x');
    expect(linkRiunione('https://us02web.zoom.us/j/123456789?pwd=abc')).toBe('https://us02web.zoom.us/j/123456789?pwd=abc');
    expect(linkRiunione('nessun link qui')).toBe('');
    expect(linkRiunione(null)).toBe('');
  });
  it('quali appuntamenti avvisare', () => {
    const vv = [app(), app({ id: 'v2', ora: '12:00:00' }), app({ id: 'v3', genere: 'promemoria' }), app({ id: 'v4', fatto: true }), app({ id: 'v5', ora: '10:20:00' }), app({ id: 'v6', ora: null })];
    expect(minutiA('11:00:00', '10:25')).toBe(35);
    expect(daAvvisare(vv, '2026-10-26', '10:30').map(v => v.id)).toEqual(['v1']);          // app: entro 30 minuti
    expect(daAvvisare(vv, '2026-10-26', '10:21', 40).map(v => v.id)).toEqual(['v1']);      // Telegram: entro 40
    expect(daAvvisare(vv, '2026-10-27', '10:30')).toEqual([]);
    expect(chiaveAvviso(app())).toBe('2026-10-26 11:00');
  });
  it('messaggio Telegram con il pulsante per entrare', () => {
    const ctx: Ctx = { nomi: new Map(), commesse: new Map([['p1', { nome: 'Ripo Nord', num: '2026/014' }]]) };
    const m = avvisoRiunione(app({ nota: 'Ordine del giorno\n🎥 https://meet.google.com/cdj-tcyp-qyd', preventivo_id: 'p1' }), '10:25', ctx);
    expect(m.text).toContain('⏰ Tra 35 minuti: Riunione Trackers (ore 11:00)');
    expect(m.text).toContain('Commessa: Ripo Nord');
    expect(m.reply_markup?.inline_keyboard[0][0]).toEqual({ text: '🎥 Entra nella riunione', url: 'https://meet.google.com/cdj-tcyp-qyd' });
    expect(avvisoRiunione(app(), '10:25', ctx).reply_markup).toBeUndefined();
    expect(oraRoma(new Date('2026-10-26T09:05:00Z'))).toBe('10:05');   // ora solare: UTC+1
  });
});
