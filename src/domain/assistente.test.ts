import { describe, expect, it } from 'vitest';
import { datiPerAssistente, esegui } from './assistente';
import { defaultData } from './model';

describe('strumenti dell\'assistente', () => {
  const D = datiPerAssistente(defaultData());
  it('cerca articoli e legge le righe di un gruppo', () => {
    expect(esegui('cerca_articoli', { testo: 'm16 x60' }, D, 't1').testo).toContain('10BZM16X60');
    const r = esegui('righe_distinta', { gruppo: 'PILASTRO MOTORE' }, D, 't2').testo;
    expect(r).toContain('10DAZAM16'); expect(r).toContain('MOT*4');
  });
  it('propone la sostituzione con i codici nuovi da creare, senza cambiare i dati', () => {
    const prima = JSON.stringify(D);
    const x = esegui('proponi_sostituzione', { gruppi: ['PILASTRO MOTORE'], coppie: [
      { da: '10BZM16X60', a: '10BZM20X60', descrizione_nuovo: 'Bullone M20X60', peso_kg: null, costo: null },
      { da: '10DAZAM16', a: '10DAZAM20', descrizione_nuovo: null, peso_kg: null, costo: null }] }, D, 't3');
    expect(x.proposta).toMatchObject({ tipo: 'sostituzione', nuovi: ['10BZM20X60', '10DAZAM20'] });
    expect(x.proposta && x.proposta.tipo === 'sostituzione' && x.proposta.righe.map(r => r.n)).toEqual([1, 1]);
    expect(JSON.stringify(D)).toBe(prima);
    expect(esegui('proponi_sostituzione', { gruppi: ['PILASTRO MOTORE'], coppie: [{ da: 'NONCE', a: 'X', descrizione_nuovo: null, peso_kg: null, costo: null }] }, D, 't4').errore).toBe(true);
    expect(esegui('proponi_sostituzione', { gruppi: ['KIT INCLINOMETRO'], coppie: [{ da: '10BZM16X60', a: '10BZM20X60', descrizione_nuovo: null, peso_kg: null, costo: null }] }, D, 't5').errore).toBe(true);
  });
  it('propone un evento e controlla data e ora', () => {
    expect(esegui('proponi_evento', { titolo: 'Riunione', giorno: '2026-10-22', ora: '17:00', genere: 'appuntamento', nota: null }, D, 't6').proposta)
      .toMatchObject({ tipo: 'evento', giorno: '2026-10-22', ora: '17:00' });
    expect(esegui('proponi_evento', { titolo: 'Riunione', giorno: 'domani', ora: null, genere: 'attivita', nota: null }, D, 't7').errore).toBe(true);
    expect(esegui('proponi_evento', { titolo: '', giorno: '2026-10-22', ora: '5', genere: 'attivita', nota: null }, D, 't8').errore).toBe(true);
  });
  it("cerca negli appunti e propone un'email senza inviarla", () => {
    const A = datiPerAssistente(defaultData(), [
      { quando: '2026-10-22', commessa: 'Rossi Agrivoltaico', titolo: 'Telefonata', testo: 'Consegna pali spostata a lunedì' },
      { quando: '2026-10-20', commessa: 'Bianchi', titolo: 'Sopralluogo', testo: 'Terreno ok' }]);
    const r = esegui('cerca_appunti', { testo: 'rossi pali' }, A, 't9').testo;
    expect(r).toContain('Consegna pali'); expect(r).not.toContain('Terreno');
    expect(esegui('cerca_appunti', { testo: '' }, A, 't10').testo).toContain('Sopralluogo');
    expect(esegui('proponi_email', { a: null, oggetto: 'Aggiornamento', testo: 'Buongiorno, …' }, A, 't11').proposta).toMatchObject({ tipo: 'email', a: '', oggetto: 'Aggiornamento' });
    expect(esegui('proponi_email', { a: 'x@y.it', oggetto: 'X', testo: ' ' }, A, 't12').errore).toBe(true);
  });
});
