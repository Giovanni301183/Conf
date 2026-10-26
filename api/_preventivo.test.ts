import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { anteprima, applica, campiModulo, preventivoBot } from './_preventivo';
import { verificaInitData } from './modulo';
import { categoria, corrosivita, zonaVento } from './_sito';
import { dimensioni, rasterizza } from './_layout';
import { leggiDxf } from '../src/domain/dxf';
import JSZip from 'jszip';
import { defaultData, newPrev } from '../src/domain/model';

describe('preventivo da Telegram: campi', () => {
  it('righe, margini e prezzi dell\'offerta', () => {
    const P: any = newPrev(), d = defaultData();
    expect(applica(P, { cliente: 'Rossi', righe: '[{"n":40,"taglia":36,"tipo":"agri"},{"n":10,"taglia":"24","tipo":"basso"}]' }, d)).toMatch(/Taglia 24/);
    expect(applica(P, { righe: [{ n: 40, taglia: 36 }, { n: 10, taglia: 20, tipo: 'basso' }], margine: '18', margini: '{"zincatura": 10, "Struttura": ""}', trasporto: '4000' }, d)).toBeNull();
    expect(P.righe.map((r: any) => [r.n, r.taglia, r.tipo, r.lCusc])).toEqual([[40, '36', 'Agrivoltaico', 2.3], [10, '20', 'Basso', 2.8]]);
    expect([P.marg.gen, P.marg.cat.ZINCATURA, P.marg.cat.STRUTTURA, P.offerta.trasporto]).toEqual([18, 10, '', 4000]);
    expect(applica(P, { margine: 100 }, d)).toMatch(/sotto il 100/);
    expect(applica(P, { margini: { LISTINO: 5 } }, d)).toMatch(/sconosciuta/);
  });
  it('servizi opzionali dal modulo: si salvano, si rileggono, null torna allo standard', () => {
    const P: any = newPrev(), d = defaultData();
    expect(applica(P, { servizi: [{ k: 'posa', voce: ' Posa in opera ', prezzo: '', on: true }, { voce: 'Pull-out test', prezzo: '900', on: false }, { voce: '' }] }, d)).toBeNull();
    expect(P.offerta.servizi).toEqual([{ k: 'posa', voce: 'Posa in opera', prezzo: '', on: true }, { voce: 'Pull-out test', prezzo: '900', on: false }]);
    expect(campiModulo(P).servizi).toEqual(P.offerta.servizi);
    expect(applica(P, { servizi: 'non è un elenco' }, d)).toMatch(/Servizi opzionali/);
    expect(applica(P, { servizi: null }, d)).toBeNull();
    expect([P.offerta.servizi, campiModulo(P).servizi]).toEqual([undefined, null]);
  });
  it("informazioni generali e condizioni commerciali dell'offerta, anche nel modulo", () => {
    const P: any = newPrev(), d = defaultData();
    expect(applica(P, { email: ' mario@rossi.it ', zona: 'Periferia', resa: 'DAP cantiere', pagamento: "30% all'ordine", consegna: '8 settimane', validita: '30 giorni' }, d)).toBeNull();
    expect(campiModulo(P)).toMatchObject({ email: 'mario@rossi.it', zona: 'Periferia', resa: 'DAP cantiere', pagamento: "30% all'ordine", consegna: '8 settimane', validita: '30 giorni' });
  });
});

// Database finto: una tabella in memoria per "preventivi" e "listino".
function finto() {
  const righe: any[] = [{ id: 'pvecchio', nome: 'Vecchio', prev: { num: '2026/007' }, dati: null }];
  const upsert = vi.fn(async (r: any) => { righe.push(r); return { error: null }; });
  const db: any = {
    from: (t: string) => ({
      upsert,
      select: () => {
        const q: any = { eq: (_: string, v: string) => ({ maybeSingle: async () => ({ data: righe.find(r => r.id === v) || null }) }),
          maybeSingle: async () => ({ data: null }) };
        q.then = (ok: any) => ok({ data: t === 'preventivi' ? righe.map(r => ({ num: r.prev?.num })) : [] });
        return q;
      },
    }),
  };
  return { db, upsert };
}

describe('preventivo da Telegram: salvataggio e offerta', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('salva con il numero successivo e manda il PowerPoint in privato', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok');
    const invio = vi.fn(async (..._: any[]) => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', invio);
    const { db, upsert } = finto();
    const r: any = await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi', righe: [{ n: 5, taglia: 36 }], margine: 20 }, 'a@terranovasrl.net', 42, '2026-10-20');
    expect(r.ok).toBe(true);
    expect(r.numero).toBe('2026/008');
    const riga = upsert.mock.calls[0][0];
    expect([riga.cliente, riga.righe, riga.creato_da]).toEqual(['Rossi', '5×36 Agri', 'a@terranovasrl.net']);
    expect(riga.prezzo).toBeCloseTo(riga.totale / 0.8, 6);
    expect(r.offerta).toMatch(/inviata/);
    const [url, req] = invio.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottok/sendDocument');
    const fd = req.body as FormData, doc = fd.get('document') as File;
    expect([fd.get('chat_id'), doc.name]).toEqual(['42', 'Offerta_2026_008_Rossi.pptx']);
    expect(new Uint8Array(await doc.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));   // zip
  });
  it('senza tracker o senza token lo dice', async () => {
    const { db } = finto();
    expect(await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi' }, 'a@x', 1, '2026-10-20')).toMatchObject({ ok: false, errore: expect.stringMatching(/tracker/) });
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    const r: any = await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi', righe: [{ n: 1, taglia: 12 }] }, 'a@x', 1, '2026-10-20');
    expect(r.offerta).toMatch(/TELEGRAM_BOT_TOKEN/);
  });
});

describe('layout mandato al bot', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  // Telegram finto: getFile, download del file e invio del documento.
  const telegram = (file: Uint8Array, path: string) => vi.fn(async (url: any) =>
    /getFile/.test(url) ? new Response(JSON.stringify({ ok: true, result: { file_path: path } }))
      : /\/file\/bot/.test(url) ? new Response(file as BodyInit) : new Response('{"ok":true}'));
  it('foto: resta JPG e va nel PowerPoint', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok');
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 30, 0, 40, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(dimensioni(jpg)).toEqual({ tipo: 'jpeg', w: 40, h: 30 });
    const tg = telegram(jpg, 'photos/file_1.jpg'); vi.stubGlobal('fetch', tg);
    const { db, upsert } = finto();
    const r: any = await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi', righe: [{ n: 2, taglia: 12 }], file_id: 'F1' }, 'a@x', 7, '2026-10-20');
    expect(r.ok).toBe(true);
    const O = upsert.mock.calls[0][0].prev.offerta;
    expect([O.layout.slice(0, 23), O.layoutW, O.layoutH, O.layoutNome]).toEqual(['data:image/jpeg;base64,', 40, 30, 'file_1.jpg']);
    const doc = (tg.mock.calls.at(-1)![1] as any).body.get('document') as File;
    const zip = await JSZip.loadAsync(await doc.arrayBuffer());
    expect(Object.keys(zip.files).some(n => /^ppt\/media\/layout_\d+\.jpeg$/.test(n))).toBe(true);
    expect(await zip.file('[Content_Types].xml')!.async('string')).toMatch(/Extension="jpeg"/);
  });
  it('DXF: disegnato in PNG e tracker contati; senza righe le prende dal DXF', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok');
    const g = (...a: any[]) => a.join('\n');
    const ins = (x: number) => g(0, 'INSERT', 8, 'Inseguitore 36', 2, 'T36', 10, x, 20, 0, 30, 0);
    const dxf = g(0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 8, 0, 2, 'T36', 70, 0, 10, 0, 20, 0, 30, 0, 3, 'T36',
      0, 'LINE', 8, 0, 10, 0, 20, 0, 30, 0, 11, 1, 21, 20, 31, 0, 0, 'ENDBLK', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES', ins(0), ins(5), ins(10), 0, 'ENDSEC', 0, 'EOF');
    const L = leggiDxf(dxf), img = rasterizza(L, 200);
    expect(L.tracker).toEqual({ 36: 3 });
    expect(dimensioni(img.png)).toEqual({ tipo: 'png', w: img.w, h: img.h });
    vi.stubGlobal('fetch', telegram(new TextEncoder().encode(dxf), 'documents/file_2'));
    const { db, upsert } = finto();
    const r: any = await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi', file_id: 'F2', file_nome: 'impianto.dxf' }, 'a@x', 7, '2026-10-20');
    expect(r.ok).toBe(true);
    expect(r.avvisi[0]).toMatch(/dal DXF.*3×36 Agri/);
    const P = upsert.mock.calls[0][0].prev;
    expect([P.offerta.layout.slice(0, 22), P.offerta.dxf, P.righe.length]).toEqual(['data:image/png;base64,', { 36: 3 }, 1]);
  });
  it('layout su un preventivo esistente: servono id e file', async () => {
    const { db } = finto();
    expect(await preventivoBot(db, { azione: 'layout', file_id: 'F' }, 'a@x', 1, '2026-10-20')).toMatchObject({ ok: false, errore: expect.stringMatching(/id del preventivo/) });
    expect(await preventivoBot(db, { azione: 'layout', id: 'pvecchio' }, 'a@x', 1, '2026-10-20')).toMatchObject({ ok: false, errore: expect.stringMatching(/Manca il file/) });
  });
});

describe('dati tecnici e riferimento', () => {
  it('profilo, asse, omega, fondazione e cuscinetto vanno nella riga e nel calcolo', () => {
    const d = defaultData(), P: any = newPrev(), Q: any = newPrev();
    expect(applica(P, { righe: [{ n: 4, taglia: 36, prof: 'IPEA', asse: '3', omega: 1.8, lFond: '3,2', lCusc: 2.5 }] }, d)).toBeNull();
    expect(P.righe[0]).toMatchObject({ prof: 'IPEA 140', asse: '3,0', omega: '1,8', lFond: 3.2, lCusc: 2.5 });
    expect(applica(Q, { righe: [{ n: 4, taglia: 36 }] }, d)).toBeNull();
    expect(Q.righe[0]).toMatchObject({ prof: 'IPE 140', asse: '2,5', omega: '2,0' });
    expect(applica(P, { righe: [{ n: 1, taglia: 36, omega: 1.5 }] }, d)).toMatch(/omega/);
    expect(applica(P, { righe: [{ n: 1, taglia: 36, tipo: 'basso', lCusc: 2.5 }] }, d)).toMatch(/Cuscinetto/);
  });
  it('profili dei pilastri: quelli spuntati nel listino, per codice o per famiglia', () => {
    const d = defaultData(), P: any = newPrev();
    d.listino.push({ c: 'IPE 180', d: 'Profilo IPE 180', cat: 'STRUTTURA', sub: 'Profili a barra', t: 'barra', kg: 18.8, acq: 0.95, zn: 0.5, lav: 0.3, pil: true });
    expect(applica(P, { righe: [{ n: 1, taglia: 36, prof: 'ipe180' }] }, d)).toBeNull();
    expect(P.righe[0].prof).toBe('IPE 180');
    expect(applica(P, { righe: [{ n: 1, taglia: 36, prof: 'IPE' }] }, d)).toMatch(/IPE 140 o IPE 180/);
    expect(applica(P, { righe: [{ n: 1, taglia: 36, prof: 'IPEA' }] }, d)).toBeNull();
    d.listino.find((x: any) => x.c === 'IPEA 140').pil = false;
    expect(applica(P, { righe: [{ n: 1, taglia: 36, prof: 'IPEA' }] }, d)).toMatch(/sconosciuto: IPE 140, IPE 180/);
  });
  it('il riferimento è un titolo breve, non un posto per le note', () => {
    const P: any = newPrev();
    expect(applica(P, { rif: 'Note: IPE; asse 120x120x2,5 mm; omega 1,8 mm; fondazione 3 m; pannelli bifacciali da 730 W' }, defaultData())).toMatch(/nome breve/);
    expect(applica(P, { rif: 'Impianto Foggia' }, defaultData())).toBeNull();
    expect(P.rif).toBe('Impianto Foggia');
  });
});

describe('modulo in Telegram', () => {
  it('anteprima: calcolo e testi dell\'offerta senza salvare', async () => {
    const { db, upsert } = finto();
    const r: any = await anteprima(db, { cliente: 'Rossi', righe: [{ n: 5, taglia: 36 }], margine: 20, trasporto: 3000 }, '2026-10-20');
    expect(r.ok).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(r.offerta.titolo).toBe('Rossi');
    expect(r.offerta.prezzi.find((p: any) => p.label === 'Trasporto').value).toBe('€ 3.000,00 + IVA');
    expect(r.prezzo).toBeCloseTo(r.costo / 0.8, 6);
  });
  it('la firma di Telegram identifica chi apre il modulo', () => {
    const token = '123:abc', user = JSON.stringify({ id: 42, first_name: 'Gio' }), auth = String(Math.floor(Date.now() / 1000));
    const q = new URLSearchParams({ auth_date: auth, query_id: 'Q', user });
    const testo = [...q].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const chiave = createHmac('sha256', 'WebAppData').update(token).digest();
    q.set('hash', createHmac('sha256', chiave).update(testo).digest('hex'));
    expect(verificaInitData(q.toString(), token)?.id).toBe(42);
    expect(verificaInitData(q.toString(), '123:altro')).toBeNull();
    expect(verificaInitData(q.toString().replace('Gio', 'Eva'), token)).toBeNull();
    expect(verificaInitData(q.toString(), token, Date.now() + 2 * 86400e3)).toBeNull();
  });
});

describe('condizioni di progetto, sensori e PDF', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('categoria di esposizione (NTC 2018), zona del vento e corrosività', () => {
    expect(zonaVento('Sicilia', 'Trapani', 37.8, 12.4)).toBe(4);
    expect(zonaVento('Sardegna', 'Cagliari', 39.22, 9.12)).toBe(5);
    expect(zonaVento('Sardegna', 'Oristano', 39.9, 8.59)).toBe(6);
    expect(zonaVento('Friuli-Venezia Giulia', 'Trieste', 45.6, 13.8)).toBe(8);
    expect(zonaVento('Puglia', 'Foggia', 41.4, 15.5)).toBe(3);
    expect([categoria(4, 'D', 10, 20), categoria(3, 'D', Infinity, 600), categoria(1, 'D', Infinity, 900), categoria(9, 'C', 1, 0)]).toEqual(['II', 'III', 'IV', 'I']);
    expect([corrosivita(0.3), corrosivita(1), corrosivita(10), corrosivita(Infinity)]).toEqual(['C5', 'C4', 'C3', 'C2']);
  });
  it('sensori, campi della slide e coordinate vanno nel preventivo', () => {
    const P: any = newPrev();
    expect(applica(P, { piranometro: '2', centralina: 1, prog: { vento_ms: '27', categoria_terreno: 'II', sconosciuto: 'x' }, lat: '37,8', lng: '12,44' }, defaultData())).toBeNull();
    expect([P.imp.piran, P.imp.box, P.offerta.prog.vento_ms, P.offerta.prog.categoria_terreno, P.offerta.prog.sconosciuto, P.luogo.lat]).toEqual([2, 1, '27', 'II', undefined, 37.8]);
    expect(applica(P, { lat: '51', lng: '0' }, defaultData())).toMatch(/Coordinate/);
  });
  it('con il token di ConvertAPI arriva il PDF', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok'); vi.stubEnv('CONVERTAPI_TOKEN', 'cv');
    const tg = vi.fn(async (url: any) => /convertapi/.test(url)
      ? new Response(JSON.stringify({ Files: [{ FileName: 'x.pdf', FileData: Buffer.from('%PDF-1.7').toString('base64') }] })) : new Response('{"ok":true}'));
    vi.stubGlobal('fetch', tg);
    const { db } = finto();
    const r: any = await preventivoBot(db, { azione: 'preventivo', cliente: 'Rossi', righe: [{ n: 1, taglia: 12 }] }, 'a@x', 3, '2026-10-20');
    expect(r.offerta).toMatch(/inviata/);
    expect(tg.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer cv' });
    const doc = (tg.mock.calls[1][1] as any).body.get('document') as File;
    expect(doc.name).toBe('Offerta_2026_008_Rossi.pdf');
    expect(await doc.text()).toBe('%PDF-1.7');
  });
});
