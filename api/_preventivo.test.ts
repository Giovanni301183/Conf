import { afterEach, describe, expect, it, vi } from 'vitest';
import { applica, preventivoBot } from './_preventivo';
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
