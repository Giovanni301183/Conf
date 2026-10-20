import { afterEach, describe, expect, it, vi } from 'vitest';
import { applica, preventivoBot } from './_preventivo';
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
