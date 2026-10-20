// Preventivo da Telegram (azioni "preventivo" e "offerta" di /api/agenda; il trattino basso tiene questo file fuori dalle route di Vercel).
// "preventivo" crea un preventivo nell'archivio, o ne cambia uno esistente, con i campi detti all'assistente; lo calcola e manda l'offerta.
// "offerta" rimanda l'offerta PowerPoint di un preventivo gia' salvato, cosi' com'e'.
// Il listino non si tocca mai da qui: un preventivo nuovo usa quello condiviso, uno esistente il listino salvato con lui.
// L'offerta arriva nella chat privata con il bot (mai nel gruppo: ci sono i prezzi), con TELEGRAM_BOT_TOKEN su Vercel.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compute } from '../src/domain/compute.js';
import { eur, fN, fP, fileName } from '../src/domain/format.js';
import { MCATS, MIN_CUSC, clone, defRiga, defaultData, newPrev, normPrev, num, numSucc, righeTxt } from '../src/domain/model.js';
import { compilaPptxBytes, dataUrlBytes, datiOfferta, offPrev } from '../src/domain/offerta.js';

type Db = SupabaseClient;
const fail = (errore: string) => ({ ok: false, errore });
const vuoto = (v: unknown) => v === '' || v == null;
// L'assistente manda gli elenchi come testo JSON; accetta anche l'oggetto gia' pronto.
const daJson = (v: unknown) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return undefined; } };

/** Applica al preventivo i campi detti all'assistente; quelli vuoti restano come sono. Ritorna l'errore da spiegare, se c'e'. */
export function applica(P: any, b: any, data: any): string | null {
  const O = offPrev(P);
  for (const [k, campo] of [['cliente', 'cliente'], ['rif', 'rif']] as const) if (!vuoto(b[k])) P[campo] = String(b[k]).trim().slice(0, 120);
  if (!vuoto(b.modulo)) P.modulo.marca = String(b.modulo).trim().slice(0, 120);
  if (!vuoto(b.wp)) { const wp = num(b.wp); if (!(wp >= 100 && wp <= 1000)) return 'Potenza del modulo non valida: va in W, es. 600.'; P.modulo.wp = wp; }
  if (!vuoto(b.localita)) P.luogo = { ...P.luogo, nome: String(b.localita).trim().slice(0, 120) };
  if (!vuoto(b.referente)) O.referente = String(b.referente).trim().slice(0, 120);

  if (!vuoto(b.righe)) {
    const rr = daJson(b.righe);
    if (!Array.isArray(rr) || !rr.length) return 'Righe tracker non leggibili: servono numero, taglia (moduli) e tipo per ogni riga.';
    const taglie = Object.keys(data.sizes);
    const righe: any[] = [];
    for (const r of rr) {
      const n = num(r?.n), taglia = String(num(r?.taglia)), tipo = /bass/i.test(String(r?.tipo ?? '')) ? 'Basso' : 'Agrivoltaico';
      if (!(n > 0 && Number.isInteger(n))) return `Numero di tracker non valido: ${r?.n ?? 'mancante'}.`;
      if (!taglie.includes(taglia)) return `Taglia ${r?.taglia ?? 'mancante'} non a listino: le taglie sono ${taglie.join(', ')} moduli.`;
      const riga: any = { ...defRiga(), taglia, n, tipo };
      if (riga.lCusc < MIN_CUSC[tipo]) riga.lCusc = MIN_CUSC[tipo];   // come fixRiga nell'app
      righe.push(riga);
    }
    P.righe = righe;
  }
  for (const [k, campo] of [['quadri_campo', 'quadA'], ['quadri_generali', 'quadGen']] as const)
    if (!vuoto(b[k])) { const q = num(b[k]); if (!(q >= 0 && Number.isInteger(q))) return `Numero di ${k.replace('_', ' ')} non valido.`; P.imp[campo] = q; }

  const ric = P.marg.modo === 'ricarico', okM = (v: number) => (ric ? v > -100 : v < 100);
  if (!vuoto(b.margine)) { const m = num(b.margine); if (!okM(m)) return 'Margine non valido: con il margine sul prezzo deve essere sotto il 100 %.'; P.marg.gen = m; }
  if (!vuoto(b.margini)) {
    const mm = daJson(b.margini);
    if (!mm || typeof mm !== 'object' || Array.isArray(mm)) return 'Margini per categoria non leggibili.';
    for (const [c0, v] of Object.entries(mm)) {
      const c = MCATS.find(x => x === String(c0).trim().toUpperCase());
      if (!c) return `Categoria "${c0}" sconosciuta: le categorie sono ${MCATS.join(', ')}.`;
      if (vuoto(v)) { P.marg.cat[c] = ''; continue; }   // vuoto = torna al margine generale
      if (!okM(num(v))) return `Margine di ${c} non valido.`;
      P.marg.cat[c] = num(v);
    }
  }
  // Prezzi dell'offerta: il trasporto e la posa scritti qui vanno tali e quali nell'offerta (0 = escluso / non inclusa).
  for (const k of ['trasporto', 'posa'] as const) if (!vuoto(b[k])) { const v = num(b[k]); if (!(v >= 0)) return `Importo del ${k} non valido.`; O[k] = v; }
  return null;
}

/** Riepilogo per la chat: numero, righe, kWp, costo, prezzo e margine. */
export function riepilogo(P: any, R: any) {
  const mg = R.prezzo - R.total;
  return [`📄 Preventivo N° ${P.num || '–'} · ${[P.cliente, P.rif].filter(Boolean).join(' · ') || 'senza nome'}`,
    `${righeTxt(P)} · ${fN(R.kwp, 2)} kWp`,
    `Costo ${eur(R.total)} · prezzo ${eur(R.prezzo)} · margine ${R.prezzo ? fP((mg / R.prezzo) * 100) : '–'}`,
    `€/Wp vendita ${R.kwp ? fN(R.prezzo / (R.kwp * 1000), 4) : '–'}`].join('\n');
}

// Modello PowerPoint: dal disco della funzione (vercel.json → includeFiles) o, se manca, dal sito stesso.
async function modello(): Promise<Uint8Array> {
  try { return await readFile(join(process.cwd(), 'public', 'offerta', 'modello-offerta.pptx')); } catch { /* sotto */ }
  const host = process.env.VERCEL_URL, by = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!host) throw new Error('modello dell\'offerta non trovato');
  const r = await fetch(`https://${host}/offerta/modello-offerta.pptx`, { headers: by ? { 'x-vercel-protection-bypass': by } : {} });
  if (!r.ok) throw new Error(`modello dell'offerta non trovato (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Compila l'offerta e la manda come documento nella chat privata con il bot. Ritorna l'errore, se c'e'. */
async function inviaOfferta(P: any, R: any, data: any, chat: number): Promise<{ errore?: string; avvisi: string[] }> {
  // La posa vuota nell'app viene dal totale della scheda Montaggio, che qui non si calcola: senza importo detto, "non inclusa".
  const D = datiOfferta(P, R, data, 0);
  const avvisi = D.avvisi.filter(a => !/salvalo per assegnarlo/.test(a));
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { errore: "Sul server manca TELEGRAM_BOT_TOKEN (Vercel → Settings → Environment Variables): l'offerta non si può mandare.", avvisi };
  const O = P.offerta, lay = O.layout ? { png: dataUrlBytes(O.layout), w: O.layoutW, h: O.layoutH } : undefined;
  const bytes = await compilaPptxBytes(await modello(), D, lay);
  const nome = `Offerta_${P.num ? fileName(P.num) + '_' : ''}${fileName(P.cliente || P._nome || 'cliente')}${O.rev && O.rev !== '0' ? '_rev' + fileName(O.rev) : ''}.pptx`;
  const fd = new FormData();
  fd.append('chat_id', String(chat));
  fd.append('caption', `Offerta N° ${P.num || '–'} · ${P.cliente || 'cliente'} · ${eur(R.prezzo)} + IVA`);
  fd.append('document', new Blob([bytes as BlobPart]), nome);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    return { errore: r.status === 403 ? 'Non posso scriverti in privato: apri la chat con il bot e premi Avvia, poi riprova.' : `Telegram non ha accettato il file: ${j.description || r.status}`, avvisi };
  }
  return { avvisi };
}

export async function preventivoBot(db: Db, b: any, email: string, chat: number, oggi: string): Promise<Record<string, unknown>> {
  const id = String(b.id ?? '').trim();
  let P: any, data: any, nuovo = !id;
  if (id) {
    const { data: e } = await db.from('preventivi').select('id, nome, prev, dati').eq('id', id).maybeSingle();
    if (!e) return fail("Preventivo non trovato: cercalo con cerca_commesse e usa il suo id.");
    P = normPrev(clone(e.prev)); P._id = e.id; P._nome = e.nome; data = e.dati;
  }
  if (!data) {
    const { data: l } = await db.from('listino').select('dati').maybeSingle();
    data = l?.dati || defaultData();
  }
  if (b.azione === 'offerta') {
    if (nuovo) return fail('Per mandare un\'offerta serve l\'id del preventivo (da cerca_commesse).');
  } else {
    if (nuovo) { P = newPrev(); P.data = oggi; P.righe = []; }
    const errore = applica(P, b, data);
    if (errore) return fail(errore);
    if (!P.righe.some((r: any) => num(r.n) > 0)) return fail('Mancano i tracker: dimmi quanti, di che taglia (moduli) e se agrivoltaico o basso.');
    if (nuovo && !P.cliente) return fail('Manca il cliente.');
  }
  const R = compute(data, P);

  if (b.azione !== 'offerta') {
    const salvato = new Date().toISOString();
    if (nuovo) {
      const { data: nn } = await db.from('preventivi').select('num:prev->>num');
      P.num = numSucc(P, (nn || []).map((x: any) => ({ prev: { num: x.num } })));
      P._id = 'p' + Date.now().toString(36); P._nome = [P.cliente, P.rif].filter(Boolean).join(' · ');
    }
    const riga: Record<string, unknown> = { id: P._id, nome: P._nome, cliente: P.cliente, rif: P.rif, data: P.data, salvato,
      totale: R.total, prezzo: R.prezzo, kwp: R.kwp, n_tracker: R.nTracker, righe: righeTxt(P), prev: P, dati: data, modificato_da: email };
    if (nuovo) riga.creato_da = email;
    const { error } = await db.from('preventivi').upsert(riga);
    if (error) return fail(error.message);
  }

  const testo = riepilogo(P, R);
  if (b.invia === false || b.invia === 'false') return { ok: true, id: P._id, numero: P.num, nuovo, testo, offerta: 'non richiesta' };
  const inv = await inviaOfferta(P, R, data, chat);
  return { ok: true, id: P._id, numero: P.num, nuovo, testo, avvisi: inv.avvisi,
    offerta: inv.errore ? `non inviata: ${inv.errore}` : 'inviata nella chat privata con il bot' };
}
