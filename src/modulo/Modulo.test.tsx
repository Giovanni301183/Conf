// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

describe('modulo del preventivo in Telegram', () => {
  it('si carica, chiede l\'anteprima e solo dopo crea il preventivo', async () => {
    (window as any).Telegram = { WebApp: { initData: 'firmato', ready: vi.fn(), expand: vi.fn(), close: vi.fn(), showAlert: vi.fn() } };
    window.history.replaceState(null, '', '/modulo.html?cliente=Rossi%20Srl');
    const chiamate: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_: string, req: any) => {
      const b = JSON.parse(req.body); chiamate.push(b);
      const r = b.azione === 'dati' ? { ok: true, taglie: ['12', '36'], opzioni: { prof: [['IPE 140', 'IPE'], ['IPEA 140', 'IPEA']], asse: [['2,5', '2,5 mm'], ['3,0', '3,0 mm']], omega: [['2,0', '2,0 mm'], ['1,8', '1,8 mm']], lFond: [3], lCusc: [2.3, 2.8], minCusc: { Agrivoltaico: 2.3, Basso: 2.8 } }, categorie: ['STRUTTURA', 'ZINCATURA'], impianto: [['quadri_campo', 'quadri di campo'], ['piranometro', 'piranometri']], progetto: [['vento_ms', 'Vento di progetto (m/s)', '27'], ['categoria_terreno', 'Categoria', 'II'], ['classe_corrosivita', 'Corrosività', 'C3']], prev: null }
        : b.azione === 'anteprima' ? { ok: true, testo: 'riepilogo', costo: 100, prezzo: 125, kwp: 1, offerta: { titolo: 'Rossi Srl', potenza: '1 kWp', tracker: ['5 × 36 moduli'], prezzi: [{ label: 'Trasporto', value: 'Escluso' }], layout: '' }, avvisi: [] }
        : { ok: true, id: 'p1', numero: '2026/010', testo: 'fatto', offerta: 'inviata nella chat privata con il bot' };
      return new Response(JSON.stringify(r));
    }));
    const { Modulo } = await import('./Modulo');
    await act(async () => { render(<Modulo />); });
    expect((screen.getByDisplayValue('Rossi Srl') as HTMLInputElement).value).toBe('Rossi Srl');
    fireEvent.change(screen.getByLabelText('N° tracker'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('1,8 mm'));
    fireEvent.change(screen.getByLabelText('Piranometri'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Vento di progetto/), { target: { value: '27' } });
    await act(async () => { fireEvent.click(screen.getByText('Anteprima')); });
    expect(chiamate[1]).toMatchObject({ azione: 'anteprima', initData: 'firmato', campi: { cliente: 'Rossi Srl', righe: [{ n: '5', taglia: '36', omega: '1,8' }], piranometro: '2', prog: { vento_ms: '27' } } });
    expect(screen.getByText('5 × 36 moduli')).toBeTruthy();
    // Una modifica dopo l'anteprima la annulla: si invia solo quello che si è visto.
    fireEvent.change(screen.getByLabelText('N° tracker'), { target: { value: '6' } });
    expect(screen.queryByText('Crea e invia')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Anteprima')); });
    await act(async () => { fireEvent.click(screen.getByText('Crea e invia')); });
    expect(chiamate[3]).toMatchObject({ azione: 'crea', campi: { righe: [{ n: '6' }] } });
    expect(screen.getByText('✅ Preventivo N° 2026/010')).toBeTruthy();
  });
});
