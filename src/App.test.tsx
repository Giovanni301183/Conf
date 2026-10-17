// @vitest-environment jsdom
// Prova di fumo dell'interfaccia: ogni scheda si disegna con tutte le tendine aperte, i campi ricalcolano, gli Excel si generano.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';
import { S, TABS, commit } from './store/state';
import { lavorWorkbook, montWorkbook } from './domain/excel';

beforeAll(() => {
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.alert = () => {};
  S.prev.righe = [
    { taglia: '12', n: 1, tipo: 'Agrivoltaico', prof: 'IPE 140', asse: '2,5', omega: '2,0', lFond: 3, lCusc: 2.3 },
    { taglia: '36', n: 0, tipo: 'Basso', prof: 'IPEA 140', asse: '3,0', omega: '1,8', lFond: 3, lCusc: 2.8 },
  ];
  S.prev.imp = { quadA: 1, quadGen: 1, box: 1, piran: 1, anem: 1, termAria: 1, termCont: 1 };
  // Tutte le tendine aperte.
  S.ui.folds = new Proxy({}, { get: () => true, set: () => true });
  commit();
});
afterEach(cleanup);

describe('interfaccia', () => {
  it.each(TABS.map(t => [t[0], t[1]]))('scheda %s (%s) si disegna', tab => {
    act(() => { S.ui.tab = tab as any; commit(); });
    const { container } = render(<App />);
    expect(container.querySelector('main')!.textContent!.length).toBeGreaterThan(50);
    if (tab === 'costi') { act(() => { fireEvent.click(screen.getByText('Espandi tutto')); }); expect(container.textContent).toContain('Cablaggio'); }
  });

  it('il totale in testata corrisponde all\'Excel e si aggiorna scrivendo', () => {
    act(() => { S.ui.tab = 'config'; commit(); });
    const { container } = render(<App />);
    const kpi = () => container.querySelector('.kpi.main b')!.textContent;
    expect(kpi()).toBe('6.248,40 €');
    const nInput = container.querySelector('table.rows tr:nth-child(2) td:nth-child(3) input') as HTMLInputElement;
    act(() => { fireEvent.focus(nInput); fireEvent.change(nInput, { target: { value: '2' } }); });
    expect(kpi()).toBe('7.796,81 €');
    expect(nInput.value).toBe('2');
  });

  it('le frecce cambiano il valore', () => {
    act(() => { S.ui.tab = 'config'; commit(); });
    const { container } = render(<App />);
    const up = container.querySelector('table.rows tr:nth-child(2) td:nth-child(3) .spin button') as HTMLButtonElement;
    act(() => { fireEvent.pointerDown(up); fireEvent.pointerUp(window); });
    expect(S.prev.righe[0].n).toBe(3);
  });

  it('gli Excel di lavorazione e montaggio si generano', () => {
    expect(lavorWorkbook().size).toBeGreaterThan(5000);
    expect(montWorkbook().size).toBeGreaterThan(5000);
  });
});

describe('archivio: cruscotto e mappa', () => {
  it.each(['kpi', 'mappa'])('vista %s si disegna', av => {
    act(() => {
      S.arch = [{ id: 'x1', nome: 'Prova', cliente: 'Cliente', rif: '', data: '2026-05-04', salvato: '2026-05-04T10:00:00Z', totale: 1000, prezzo: 1250, kwp: 50, nTracker: 2, righe: '2×12 Agri',
        prev: { stato: 'inviato', luogo: { nome: 'Foggia', lat: 41.46, lng: 15.55 } } }];
      S.ui.tab = 'archivio'; S.ui.av = av as any; commit();
    });
    const { container } = render(<App />);
    expect(container.textContent).toContain('Prova');
    if (av === 'kpi') expect(container.querySelector('.ktiles')!.textContent).toContain('Tasso di successo');
    act(() => { S.ui.av = 'elenco'; S.arch = []; commit(); });
  });
});
