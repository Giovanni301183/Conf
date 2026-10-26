// Funzione /api/agenda (chat Telegram via n8n): date nel fuso di Roma, controllo dei campi, permessi, testi.
import { describe, expect, it } from 'vitest';
import { emailPromemoria, oggiISO, permesso, pulisciVoce, richiami, riga, testoRiepilogo, type Ctx, type Voce } from '../api/agenda';

const voce = (o: Partial<Voce> = {}): Voce => ({ id: 'v1', giorno: '2026-10-21', ora: null, genere: 'attivita', categoria: null, titolo: 'Prova', nota: null,
  preventivo_id: null, assegnata_a: null, fatto: false, origine: 'app', creato_da: 'mario@terranovasrl.net', creato: '', ...o });
const ctx: Ctx = { nomi: new Map([['mario@terranovasrl.net', 'Mario'], ['luca@terranovasrl.net', 'Luca']]), commesse: new Map([['p1', { nome: 'Ripo Nord', num: '2026/014' }]]) };
const mario = { email: 'mario@terranovasrl.net', nome: 'Mario', ruolo: 'utente' as const };
const luca = { email: 'luca@terranovasrl.net', nome: 'Luca', ruolo: 'utente' as const };
const admin = { email: 'capo@terranovasrl.net', nome: 'Capo', ruolo: 'admin' as const };

describe('/api/agenda', () => {
  it('oggi nel fuso di Roma, non in UTC', () => {
    expect(oggiISO(new Date('2026-10-20T23:30:00Z'))).toBe('2026-10-21');
    expect(oggiISO(new Date('2026-10-20T10:00:00Z'))).toBe('2026-10-20');
  });
  it('campi: urgenza senza data = oggi, "domani", ora e categoria controllate', () => {
    expect(pulisciVoce({ genere: 'urgenza', titolo: 'Mancano bulloni', categoria: 'bulloneria' }, '2026-10-20').v)
      .toMatchObject({ genere: 'urgenza', giorno: '2026-10-20', categoria: 'BULLONERIA' });
    expect(pulisciVoce({ titolo: 'x', giorno: 'domani', ora: '15:00' }, '2026-10-31').v).toMatchObject({ genere: 'attivita', giorno: '2026-11-01', ora: '15:00' });
    expect(pulisciVoce({ titolo: 'x' }, '2026-10-20').errore).toMatch(/giorno/);
    expect(pulisciVoce({ titolo: 'x', giorno: 'oggi', ora: '25:00' }, '2026-10-20').errore).toMatch(/ora/);
    expect(pulisciVoce({ titolo: 'x', giorno: 'oggi', genere: 'festa' }, '2026-10-20').errore).toMatch(/Genere/);
    expect(pulisciVoce({ titolo: 'x', giorno: 'oggi', categoria: 'vernice' }, '2026-10-20').errore).toMatch(/Categoria/);
    expect(pulisciVoce({ fatto: true }, '2026-10-20', true).v).toEqual({ fatto: true });   // modifica parziale
  });
  it('permessi come nell\'app', () => {
    const v = voce({ assegnata_a: 'luca@terranovasrl.net' });
    expect(permesso('aggiorna', v, mario)).toBe(true);
    expect(permesso('aggiorna', v, luca)).toBe(false);
    expect(permesso('risolvi', v, luca)).toBe(true);
    expect(permesso('elimina', v, admin)).toBe(true);
    expect(permesso('prendi', v, admin)).toBe(true);
    expect(permesso('prendi', voce({ genere: 'urgenza' }), luca)).toBe(true);   // senza assegnatario la prende chiunque
    expect(permesso('prendi', voce({ assegnata_a: 'mario@terranovasrl.net', creato_da: 'capo@terranovasrl.net' }), luca)).toBe(false);
  });
  it('richiami e riepilogo del mattino', () => {
    const ri = richiami([{ id: 'a', nome: 'Offerta Beta', stato: 'inviato', inviata: '2026-10-05', data: null },
      { id: 'b', nome: 'Recente', stato: 'inviato', inviata: '2026-10-15', data: null }, { id: 'c', nome: 'Vinta', stato: 'vinto', inviata: '2026-01-01', data: null }], '2026-10-20');
    expect(ri).toEqual([{ id: 'a', nome: 'Offerta Beta', giorni: 15 }]);
    const t = testoRiepilogo([voce({ genere: 'urgenza', titolo: 'Mancano bulloni', preventivo_id: 'p1', giorno: '2026-10-19' }),
      voce({ id: 'v2', giorno: '2026-10-20', ora: '15:00:00', genere: 'appuntamento', titolo: 'Sopralluogo' })], ri, '2026-10-20', ctx);
    expect(t).toContain('🔴 Urgenze aperte'); expect(t).toContain('Mancano bulloni · Ripo Nord');
    expect(t).toContain('📅 15:00 Sopralluogo'); expect(t).toContain('Offerta Beta · inviata da 15 giorni');
    expect(testoRiepilogo([], [], '2026-10-20', ctx)).toContain('Niente in programma');
  });
  it('promemoria via email: uno per collega, solo voci assegnate scadute, in scadenza o urgenti', () => {
    const ee = emailPromemoria([
      voce({ id: 'a', giorno: '2026-10-19', titolo: 'Ordinare acciaio', assegnata_a: 'luca@terranovasrl.net', creato_da: 'capo@terranovasrl.net', nota: 'Chiedere\nprezzo' }),
      voce({ id: 'b', giorno: '2026-10-22', titolo: 'Chiamare cliente', assegnata_a: 'luca@terranovasrl.net' }),
      voce({ id: 'c', giorno: '2026-11-30', titolo: 'Troppo avanti', assegnata_a: 'luca@terranovasrl.net' }),
      voce({ id: 'd', giorno: '2026-10-19', titolo: 'Già fatta', assegnata_a: 'luca@terranovasrl.net', fatto: true }),
      voce({ id: 'e', giorno: '2026-12-01', genere: 'urgenza', titolo: 'Bulloni', assegnata_a: 'mario@terranovasrl.net' }),
      voce({ id: 'f', giorno: '2026-10-19', titolo: 'Di nessuno' })], '2026-10-20', ctx, 'https://app.test');
    expect(ee.map(e => [e.a, e.voci])).toEqual([['luca@terranovasrl.net', 2], ['mario@terranovasrl.net', 1]]);
    expect(ee[0].oggetto).toBe('Promemoria: 1 scaduta, 1 in scadenza');
    expect(ee[0].testo).toContain('Ciao Luca,'); expect(ee[0].testo).toContain('SCADUTE\n- ☑️ lun 19/10 Ordinare acciaio\n  Chiedere prezzo\n  (assegnata da');
    expect(ee[0].testo).not.toContain('per Luca'); expect(ee[0].testo).toContain('https://app.test');
    expect(ee[1].oggetto).toBe('Promemoria: 1 urgenza');
  });
  it('riga leggibile', () => {
    expect(riga(voce({ ora: '09:30:00', assegnata_a: 'luca@terranovasrl.net', categoria: 'BULLONERIA', preventivo_id: 'p1' }), ctx))
      .toBe('☑️ mer 21/10 09:30 Prova · Ripo Nord · bulloneria · per Luca');
  });
});
