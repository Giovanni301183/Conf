import { describe, expect, it } from 'vitest';
import { allegatiDi, cartellaPer, cerca, conEtichette, documentiDi, estensione, fByte, nomeSicuro, percorsoPer, perCartella, perEtichetta, pulisciEtichette, suggerisciEtichette, suggerisciPreventivi, type Documento } from './documenti';

const doc = (p: Partial<Documento>): Documento => ({ id: 'x', preventivo_id: null, scadenza_id: null, cartella: 'altro', tipo: 'file', titolo: 'a.pdf', testo: null,
  percorso: null, mime: null, dimensione: null, creato_da: 'a@terranovasrl.net', creato: '2026-10-22T08:00:00Z', modificato: null, ...p });

describe('nomi e percorsi', () => {
  it('nome sicuro per lo Storage', () => {
    expect(nomeSicuro('Offerta n° 12 – Città.pdf')).toBe('Offerta_n_12_Citta.pdf');
    expect(nomeSicuro('  ')).toBe('file');
    expect(nomeSicuro('../../x.pdf')).toBe('x.pdf');
  });
  it('percorso per preventivo o agenda', () => {
    expect(percorsoPer('p1', 'u1', 'Foto 1.JPG')).toBe('p1/u1/Foto_1.JPG');
    expect(percorsoPer(null, 'u1', 'a.pdf')).toBe('agenda/u1/a.pdf');
  });
  it('cartella proposta, estensione, dimensione', () => {
    expect(cartellaPer('IMG_1.jpg', 'image/jpeg')).toBe('foto');
    expect(cartellaPer('layout.DWG', '')).toBe('disegni');
    expect(cartellaPer('ordine.pdf', 'application/pdf')).toBe('altro');
    expect(estensione('Layout.dwg')).toBe('DWG');
    expect(estensione('senza')).toBe('');
    expect(fByte(512)).toBe('512 B');
    expect(fByte(2.5 * 1024 * 1024)).toBe('2,5 MB');
  });
});

describe('elenchi', () => {
  const D = [
    doc({ id: '1', preventivo_id: 'p1', titolo: 'Contratto firmato.pdf', cartella: 'cliente', creato: '2026-10-01T00:00:00Z' }),
    doc({ id: '2', preventivo_id: 'p1', scadenza_id: 's1', tipo: 'nota', titolo: 'Telefonata', testo: 'Il cliente vuole i pali da 3 m', creato: '2026-10-05T00:00:00Z' }),
    doc({ id: '3', scadenza_id: 's2', titolo: 'foto.jpg', cartella: 'foto' }),
  ];
  it('documenti di un preventivo e di una voce d\'agenda', () => {
    expect(documentiDi(D, { preventivo: 'p1' }).map(d => d.id)).toEqual(['2', '1']);
    expect(documentiDi(D, { scadenza: 's1' }).map(d => d.id)).toEqual(['2']);
    expect(documentiDi(D, {})).toEqual([]);
  });
  it('ricerca su titolo, testo e cartella', () => {
    expect(cerca(D, 'pali cliente').map(d => d.id)).toEqual(['2']);
    expect(cerca(D, 'CONTRATTO').map(d => d.id)).toEqual(['1']);
    expect(cerca(D, 'foto').map(d => d.id)).toEqual(['3']);
    expect(cerca(D, '  ')).toHaveLength(3);
  });
  it('conteggio per cartella', () => {
    expect(perCartella(D)).toMatchObject({ cliente: 1, altro: 1, foto: 1, disegni: 0 });
  });
});

describe('etichette', () => {
  const D = [
    doc({ id: '1', tipo: 'nota', titolo: 'Offerta acciaio', etichette: ['acquisti', 'opportunita'] }),
    doc({ id: '2', tipo: 'nota', titolo: 'Fiera Intersolar', etichette: ['marketing', 'vendita'] }),
    doc({ id: '3', tipo: 'nota', titolo: 'Vecchia nota', etichette: null }),
  ];
  it('filtra con almeno una delle etichette scelte', () => {
    expect(conEtichette(D, []).length).toBe(3);
    expect(conEtichette(D, ['acquisti']).map(d => d.id)).toEqual(['1']);
    expect(conEtichette(D, ['acquisti', 'vendita']).map(d => d.id)).toEqual(['1', '2']);
  });
  it('conta per etichetta e cerca anche nei nomi delle etichette', () => {
    expect(perEtichetta(D)).toEqual({ acquisti: 1, opportunita: 1, marketing: 1, vendita: 1 });
    expect(cerca(D, 'opportunità').map(d => d.id)).toEqual(['1']);
  });
});

describe('suggerimenti', () => {
  it('riconosce il tema dalle parole', () => {
    expect(suggerisciEtichette("Ordine dell'acciaio al fornitore")).toEqual(['acquisti']);
    expect(suggerisciEtichette('Fattura e pagamento della spedizione')).toEqual(['amministrazione', 'logistica']);
    expect(suggerisciEtichette('Idea: un nuovo prodotto per le serre')[0]).toBe('sviluppo');
    expect(suggerisciEtichette('ciao')).toEqual([]);
  });
  it('riconosce la commessa dal nome o dal cliente, i vinti prima', () => {
    const A = [{ id: 'a', nome: 'Impianto Rossi', cliente: 'Rossi Energia', prev: { stato: 'perso' } },
      { id: 'b', nome: 'Tracker Foggia', cliente: 'Rossi Energia', prev: { stato: 'vinto' } }, { id: 'c', nome: 'Bar', cliente: 'Ne' }];
    expect(suggerisciPreventivi('Sentito Rossi Energia per i pali', A).map(e => e.id)).toEqual(['b', 'a']);
    expect(suggerisciPreventivi('Novità sul tracker foggia', A).map(e => e.id)).toEqual(['b']);
    expect(suggerisciPreventivi('Un bar e Ne', A)).toEqual([]);
  });
});

describe('etichette da AI e Telegram', () => {
  it('accetta chiavi, nomi e liste separate da virgola, scarta il resto', () => {
    expect(pulisciEtichette(['acquisti', 'Opportunità'])).toEqual(['acquisti', 'opportunita']);
    expect(pulisciEtichette('Vendita, qualità, boh, vendita')).toEqual(['vendita', 'qualita']);
    expect(pulisciEtichette('sviluppo')).toEqual(['sviluppo']);
    expect(pulisciEtichette('')).toEqual([]);
    expect(pulisciEtichette(null)).toEqual([]);
  });
});

describe('allegati delle note', () => {
  it('elenca i file di una nota, i primi caricati prima', () => {
    const D = [doc({ id: 'n', tipo: 'nota', titolo: 'Nota' }), doc({ id: 'b', nota_id: 'n', creato: '2026-10-25T10:00:00Z' }),
      doc({ id: 'a', nota_id: 'n', creato: '2026-10-25T09:00:00Z' }), doc({ id: 'c', nota_id: 'altra' })];
    expect(allegatiDi(D, 'n').map(d => d.id)).toEqual(['a', 'b']);
  });
});
