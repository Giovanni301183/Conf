// Funzione Vercel per il modulo "Compila preventivo" che si apre dentro Telegram (mini app, pagina modulo.html).
// Il modulo manda { initData, azione, campi }: initData e' firmato da Telegram con il token del bot e dice chi lo sta usando,
// quindi qui non serve il segreto di n8n. Il collega deve avere il Telegram collegato all'app (come per la chat).
// Azioni: dati (opzioni e, con id, i campi di un preventivo salvato), sito (proposta delle condizioni di progetto dalla localita'),
//         spot (margini che portano al prezzo scritto),
//         anteprima (calcolo senza salvare), crea (salva e manda l'offerta).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { MCATS, clone, defaultData, normPrev } from '../src/domain/model.js';
import { PROGETTO } from '../src/domain/offerta.js';
import { IMPIANTO, anteprima, opzioni, campiModulo, preventivoBot, spot } from './_preventivo.js';
import { propostaSito } from './_sito.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (errore: string) => ({ ok: false, errore });
const oggiISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const VALIDO = 24 * 3600;   // secondi: oltre, il modulo va riaperto dal pulsante in chat

/** Utente Telegram dai dati firmati della mini app; null se la firma non torna o sono scaduti. */
export function verificaInitData(initData: string, token: string, adesso = Date.now()): { id: number; first_name?: string } | null {
  const q = new URLSearchParams(initData), hash = q.get('hash') || '';
  q.delete('hash');
  const testo = [...q].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const chiave = createHmac('sha256', 'WebAppData').update(token).digest();
  const atteso = createHmac('sha256', chiave).update(testo).digest();
  const dato = Buffer.from(hash, 'hex');
  if (dato.length !== atteso.length || !timingSafeEqual(dato, atteso)) return null;
  if (adesso / 1000 - Number(q.get('auth_date') || 0) > VALIDO) return null;
  try { const u = JSON.parse(q.get('user') || ''); return Number(u?.id) ? u : null; } catch { return null; }
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !key) return json(500, fail('Sul server mancano TELEGRAM_BOT_TOKEN o SUPABASE_SERVICE_ROLE_KEY.'));
  const b = await req.json().catch(() => ({}));
  const tu = verificaInitData(String(b.initData || ''), token);
  if (!tu) return json(401, fail('Modulo scaduto o aperto fuori da Telegram: riaprilo dal pulsante in chat.'));
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me } = await db.from('utenti').select('email, attivo').eq('telegram_id', tu.id).maybeSingle();
  if (!me || !me.attivo) return json(200, fail("Il tuo Telegram non è collegato a un utente attivo dell'app: nell'app premi il pulsante Telegram e scrivi al bot /collega seguito dal codice."));
  const campi = b.campi && typeof b.campi === 'object' ? b.campi : {};
  try {
    if (b.azione === 'dati') {
      const { data: l } = await db.from('listino').select('dati').maybeSingle();
      let prev: ReturnType<typeof campiModulo> | null = null, numero = '';
      if (campi.id) {
        const { data: e } = await db.from('preventivi').select('id, prev').eq('id', String(campi.id)).maybeSingle();
        if (!e) return json(200, fail('Preventivo non trovato.'));
        prev = campiModulo(normPrev(clone(e.prev))); numero = e.prev?.num || '';
      }
      return json(200, { ok: true, taglie: Object.keys(l?.dati?.sizes || { 12: 1, 18: 1, 20: 1, 22: 1, 36: 1, 40: 1 }), opzioni: opzioni(l?.dati || defaultData()), categorie: MCATS, impianto: IMPIANTO.map(([k, , nome]) => [k, nome]), progetto: PROGETTO, prev, numero });
    }
    if (b.azione === 'sito') return json(200, await propostaSito(String(campi.localita || ''), campi.lat ? Number(campi.lat) : null, campi.lng ? Number(campi.lng) : null));
    if (b.azione === 'anteprima') return json(200, await anteprima(db, campi, oggiISO()));
    if (b.azione === 'spot') return json(200, await spot(db, campi, oggiISO()));
    if (b.azione === 'crea') return json(200, await preventivoBot(db, { ...campi, azione: 'preventivo', file_id: undefined }, me.email, tu.id, oggiISO()));
    return json(200, fail(`Azione sconosciuta: ${b.azione}`));
  } catch (e) { return json(200, fail((e as Error).message)); }
}
