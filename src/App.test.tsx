// @vitest-environment jsdom
// Prova di fumo dell'interfaccia: ogni scheda si disegna con tutte le tendine aperte, i campi ricalcolano, gli Excel si generano.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
      S.ui.tab = 'prev'; S.ui.av = av as any; commit();
    });
    const { container } = render(<App />);
    expect(container.textContent).toContain('Prova');
    if (av === 'kpi') expect(container.querySelector('.ktiles')!.textContent).toContain('Tasso di successo');
    act(() => { S.ui.av = 'elenco'; S.arch = []; commit(); });
  });
  it('calendario in cima alla Home: una scadenza aggiunta va negli allarmi; le barre si chiudono e si riaprono', async () => {
    act(() => { S.scad = []; S.ui.tab = 'archivio'; S.ui.av = 'elenco'; S.ui.hb = {}; commit(); });
    const { container } = render(<App />);
    expect(container.querySelectorAll('.cday').length).toBeGreaterThanOrEqual(28);
    expect(container.textContent).not.toContain('Archivio preventivi');   // l'archivio sta nella scheda Preventivi
    fireEvent.click(screen.getByText('+ Aggiungi'));
    fireEvent.change(screen.getByPlaceholderText(/computo/), { target: { value: 'Collaudo quadri' } });
    await act(async () => { fireEvent.click(screen.getByText('Aggiungi')); });
    expect(S.scad.map(s => s.titolo)).toEqual(['Collaudo quadri']);
    expect(container.querySelector('.calarm')!.textContent).not.toContain('Collaudo quadri');   // all'avvio aperti solo calendario e mappa
    fireEvent.click(container.querySelector('.calarm .hbchev')!);
    expect(container.querySelector('.calarm')!.textContent).toContain('Collaudo quadri');
    fireEvent.click(container.querySelector('.calhead .hbchev')!);
    expect(container.querySelector('.cday')).toBeNull();
    expect(container.querySelector('.calarm')!.textContent).toContain('Collaudo quadri');   // chiuso il calendario restano gli allarmi
    fireEvent.click(container.querySelector('.card.chiusa .hbchev')!);   // la prima barra chiusa è il calendario
    expect(container.querySelector('.cday')).not.toBeNull();
    act(() => { S.ui.hb = {}; commit(); });
    act(() => { S.scad = []; commit(); });
  });
  it('il + di un reparto apre «Nuovo in…» e la voce nasce già in quel reparto', async () => {
    act(() => { S.scad = []; S.ui.tab = 'archivio'; S.ui.hb = {}; commit(); });
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('[aria-label="Aggiungi in Acquisti"]')!);
    expect(screen.getByRole('dialog').textContent).toContain('Nuovo in Acquisti');
    fireEvent.change(screen.getByPlaceholderText(/Richiamare il cliente/), { target: { value: 'Ordine acciaio' } });
    await act(async () => { fireEvent.click(screen.getByText('Aggiungi')); });
    expect(S.scad.map(s => [s.titolo, s.genere, s.reparti])).toEqual([['Ordine acciaio', 'promemoria', ['acquisti']]]);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => { S.scad = []; commit(); });
  });
  it('richiamo di un preventivo inviato: numerino sul menu e agenda nel preventivo', () => {
    act(() => {
      S.scad = []; S.ui.hb = {}; S.ui.tab = 'config'; S.ui.folds['cf-agenda'] = true;
      S.arch = [{ id: 'r1', nome: 'Offerta Beta', cliente: 'Beta', rif: '', data: '2026-01-10', salvato: '2026-01-10T10:00:00Z', totale: 1, prezzo: 1, kwp: 1, nTracker: 1, righe: '',
        prev: { stato: 'inviato', offerta: { inviata: '2026-01-10' } } }];
      S.prev._id = 'r1'; commit();
    });
    const { container } = render(<App />);
    expect(container.querySelector('.nbadge')!.textContent).toBe('1');
    expect(container.querySelector('[data-fold="cf-agenda"]')!.textContent).toContain('Richiamare il cliente');
    act(() => { delete S.prev._id; S.arch = []; S.ui.tab = 'archivio'; commit(); });
  });
});

describe('settori', () => {
  it('menu per settori: i tracker hanno le schede vere, gli altri «in sviluppo»; i vecchi preventivi sono tracker', async () => {
    const { settoreDi } = await import('./domain/settori');
    expect(settoreDi({})).toBe('tracker');
    expect(settoreDi({ settore: 'serre' })).toBe('serre');
    act(() => { S.ui.set = 'tracker'; S.ui.area = ''; S.ui.tab = 'archivio'; commit(); });
    const { container } = render(<App />);
    const nav = container.querySelector('nav')!;
    for (const t of ['Energia', 'Vigneti', 'Serre', 'Recinzioni', 'Dati comuni']) expect(nav.textContent).toContain(t);
    expect(nav.textContent).not.toContain('Configura');   // aree chiuse
    fireEvent.click(within(nav).getByText('Serre'));
    fireEvent.click(within(nav).getByText('Configura'));
    expect(container.querySelector('main')!.textContent).toContain('in sviluppo');
    fireEvent.click(within(nav).getByText('Energia'));
    expect(nav.textContent).toContain('Impianti fissi');
    fireEvent.click(within(nav).getByText('Tracker solari'));
    fireEvent.click(within(nav).getByText('Configura'));
    expect(container.querySelector('main')!.textContent).not.toContain('in sviluppo');
    act(() => { S.ui.tab = 'archivio'; commit(); });
  });

  it('impianti fissi: con un preventivo tracker aperto si chiede di iniziarne uno nuovo; Configura, Distinta, Costi, Margini e Invia calcolano la 36', () => {
    const tracker = S.prev;
    act(() => { S.ui.set = 'tracker'; S.ui.area = ''; S.ui.tab = 'archivio'; commit(); });
    const { container } = render(<App />);
    const nav = container.querySelector('nav')!, main = () => container.querySelector('main')!.textContent!;
    fireEvent.click(within(nav).getByText('Energia'));
    fireEvent.click(within(nav).getByText('Impianti fissi'));
    fireEvent.click(within(nav).getByText('Configura'));
    expect(main()).toContain('è di Tracker solari');
    fireEvent.click(screen.getByText('Nuovo preventivo Impianti fissi'));
    expect(S.prev.settore).toBe('fisso');
    expect(main()).toContain('Composizione impianto');
    expect(container.querySelector('.kpi.main b')!.textContent).toBe('1.518,39 €');
    expect(container.querySelector('[data-fold="cf-ant"]')!.textContent).toContain('9 campate');
    fireEvent.click(within(nav).getByText('Distinte base'));
    expect(main()).toContain('Trave di falda');
    fireEvent.click(within(nav).getByText('Costi'));
    expect(main()).toContain('T1');
    expect(main()).toContain('ALLUMINIO');
    fireEvent.click(within(nav).getByText('Margini'));
    expect(main()).toContain('Prezzo / struttura');
    fireEvent.click(within(nav).getByText('Invia preventivo'));
    expect(main()).toContain('N.1 STRUTTURA.36 MODULI');
    expect(main()).toContain('Servizio gru per lo scarico');
    fireEvent.click(within(nav).getByText('Documenti'));
    expect(main()).toContain('in sviluppo');
    act(() => { S.prev = tracker; S.ui.set = 'tracker'; S.ui.tab = 'archivio'; commit(); });
  });
});

describe('salvataggio di un impianto fisso', () => {
  it("si salva nell'archivio e si riapre uguale: composizione, voci extra, offerta, costo e prezzo", async () => {
    const { archOpen, archSave, isDirty, newPreventivo } = await import('./store/actions');
    const st = await import('./store/state');
    const tracker = S.prev, conferme: string[] = [];
    window.prompt = () => 'DE VITA fisso';
    window.confirm = (m?: string) => { conferme.push(String(m)); return true; };
    act(() => { newPreventivo('fisso'); });
    Object.assign(S.prev, { cliente: 'DE VITA' });
    S.prev.fisso.taglie[0].n_strutture = 19;
    S.prev.extra = [{ desc: 'Trasporto', voce: 'altro', modo: 'corpo', val: 2000 }];
    Object.assign(S.prev.offerta, { referente: 'Mario Rossi', resa: 'DAP cantiere' });
    S.prev.offerta.prog.modulo_tipo = 'bifacciale';
    act(() => { commit(); archSave(false); commit(); });
    const e = S.arch[0], id = e.id, salvato = JSON.parse(JSON.stringify(S.prev));
    expect([e.nome, e.righe, e.nTracker, e.prev.settore]).toEqual(['DE VITA fisso', '19×36 fisso', 19, 'fisso']);
    expect(e.totale).toBeCloseTo(st.R.total, 6);
    expect(e.prezzo).toBeCloseTo(st.R.prezzo, 6);
    expect(e.prev.num).toMatch(/^\d{4}\/\d{3}$/);
    expect(isDirty()).toBe(false);
    // Un altro preventivo, un prezzo dei tracker cambiato nel listino: riaprendo il fisso non si chiede del listino.
    act(() => { newPreventivo('tracker'); });
    S.data.listino[0].acq += 0.01;
    conferme.length = 0;
    act(() => { archOpen(id); commit(); });
    expect(conferme.filter(m => /listino/.test(m))).toEqual([]);
    expect(JSON.parse(JSON.stringify(S.prev))).toEqual(salvato);
    expect([S.ui.set, S.ui.tab, isDirty()]).toEqual(['fisso', 'config', false]);
    expect(st.R.total).toBeCloseTo(e.totale, 6);
    expect(st.R.lines.filter((l: any) => l.riga === 'extra').map((l: any) => l.desc)).toEqual(['Trasporto']);
    S.data.listino[0].acq -= 0.01;
    window.confirm = () => true;
    act(() => { S.arch = S.arch.filter(x => x.id !== id); S.prev = tracker; S.ui.set = 'tracker'; S.ui.tab = 'archivio'; commit(); });
  });
});

describe('progressivo dei preventivi', () => {
  it('numera per anno e riparte da 001', async () => {
    const { nextNum } = await import('./store/actions');
    const arch: any[] = [{ prev: { num: '2026/007' } }, { prev: { num: '2026/012' } }, { prev: { num: '2025/040' } }, { prev: { num: 'XYZ' } }, { prev: {} }];
    expect(nextNum({ data: '2026-10-19' }, arch)).toBe('2026/013');
    expect(nextNum({ data: '2025-03-01' }, arch)).toBe('2025/041');
    expect(nextNum({ data: '2027-01-02' }, arch)).toBe('2027/001');
  });
});
