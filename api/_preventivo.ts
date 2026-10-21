// Preventivo da Telegram (azioni "preventivo", "offerta" e "layout" di /api/agenda, e modulo di /api/modulo; il trattino basso tiene
// questo file fuori dalle route di Vercel).
// "preventivo" crea un preventivo nell'archivio, o ne cambia uno esistente, con i campi detti all'assistente o scritti nel modulo;
// lo calcola e manda l'offerta. "offerta" rimanda l'offerta PowerPoint di un preventivo gia' salvato, cosi' com'e'.
// "layout" mette nel preventivo il DXF o l'immagine mandati al bot (file_id di Telegram); anche "preventivo" accetta file_id.
// Da un DXF si contano i tracker: un preventivo nuovo senza righe le prende da li' (agrivoltaico).
// Il listino non si tocca mai da qui: un preventivo nuovo usa quello condiviso, uno esistente il listino salvato con lui.
// L'offerta arriva in PDF nella chat privata con il bot (mai nel gruppo: ci sono i prezzi), con TELEGRAM_BOT_TOKEN e CONVERTAPI_TOKEN su Vercel.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compute } from '../src/domain/compute.js';
import { eur, fN, fP, fileName } from '../src/domain/format.js';
import { MCATS, MIN_CUSC, OPT_LCUSC, OPT_LFOND, clone, defRiga, defaultData, newPrev, normPrev, num, numSucc, righeTxt } from '../src/domain/model.js';
import { pilastri } from '../src/domain/referenze.js';
import { PROGETTO, compilaPptxBytes, datiOfferta, layoutImg, offPrev } from '../src/domain/offerta.js';
import { layoutDaTelegram } from './_layout.js';

type Db = SupabaseClient;
const fail = (errore: string) => ({ ok: false, errore });
const vuoto = (v: unknown) => v === '' || v == null;
// L'assistente manda gli elenchi come testo JSON; accetta anche l'oggetto gia' pronto.
const daJson = (v: unknown) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return undefined; } };
const breve = (v: unknown, max: number) => String(v).trim().slice(0, max);
const MAX_RIF = 60;   // il riferimento e' il titolo della copertina e della slide Layout: solo un nome breve

// Opzioni della configurazione di una riga, come nella scheda Configura: [valore salvato, come si scrive].
// I profili dei pilastri sono quelli spuntati nel listino (opzioni(data)).
export const OPZIONI = {
  asse: [['2,5', '2,5 mm'], ['3,0', '3,0 mm']],
  omega: [['2,0', '2,0 mm'], ['1,8', '1,8 mm']],
  lFond: OPT_LFOND, lCusc: OPT_LCUSC, minCusc: MIN_CUSC,
};
// Componenti di impianto nel modulo: [campo del modulo, chiave in prev.imp, nome]. Quadri e sensori della parte elettronica.
export const IMPIANTO = [['quadri_campo', 'quadA', 'quadri di campo'], ['quadri_generali', 'quadGen', 'quadri generali'],
  ['centralina', 'box', 'centraline meteo'], ['piranometro', 'piran', 'piranometri'], ['anemometro', 'anem', 'anemometri'],
  ['temp_aria', 'termAria', "sensori di temperatura dell'aria"], ['temp_pannello', 'termCont', 'sensori di temperatura dei pannelli']] as const;
export const opzioni = (data: any) => ({ prof: pilastri(data), ...OPZIONI });
// Profilo detto o scritto: il codice esatto ("IPE 180", "hea160") o la sola famiglia ("IPE") se nel listino ce n'e' uno solo.
const norm = (v: unknown) => String(v).toUpperCase().replace(/[\s.]/g, '');
function profDa(v: unknown, data: any): string {
  const pp = pilastri(data).map(([c]) => c), x = norm(v);
  const esatto = pp.find(c => norm(c) === x); if (esatto) return esatto;
  const fam = pp.filter(c => norm(c).replace(/[\d,x]+$/i, '') === x);
  if (fam.length === 1) return fam[0];
  throw new Error(fam.length ? `Profilo "${v}": quale? ${fam.join(' o ')}.` : `Profilo "${v}" sconosciuto: ${pp.join(', ')}.`);
}
const vicino = (lista: number[], v: number) => lista.find(x => Math.abs(x - v) < 1e-6);

/** Una riga tracker dai campi detti o scritti nel modulo; i dati tecnici non detti restano quelli predefiniti. Stringa = errore. */
function rigaDa(r: any, taglie: string[], data: any): any {
  const n = num(r?.n), taglia = String(num(r?.taglia)), tipo = /bass/i.test(String(r?.tipo ?? '')) ? 'Basso' : 'Agrivoltaico';
  if (!(n > 0 && Number.isInteger(n))) return `Numero di tracker non valido: ${r?.n ?? 'mancante'}.`;
  if (!taglie.includes(taglia)) return `Taglia ${r?.taglia ?? 'mancante'} non a listino: le taglie sono ${taglie.join(', ')} moduli.`;
  const riga: any = { ...defRiga(), taglia, n, tipo };
  if (!vuoto(r.prof)) { try { riga.prof = profDa(r.prof, data); } catch (e) { return (e as Error).message; } }
  for (const k of ['asse', 'omega'] as const) if (!vuoto(r[k])) {
    const o = OPZIONI[k].find(([v]) => Math.abs(num(v) - num(r[k])) < 1e-6);
    if (!o) return `Spessore ${k} ${r[k]} non previsto: ${OPZIONI[k].map(x => x[1]).join(' o ')}.`;
    riga[k] = o[0];
  }
  if (!vuoto(r.lFond) && tipo !== 'Basso') {
    const v = vicino(OPT_LFOND, num(r.lFond)); if (v == null) return `Fondazione ${r.lFond} m non prevista: da ${fN(OPT_LFOND[0], 1)} a ${fN(OPT_LFOND.at(-1), 1)} m.`;
    riga.lFond = v;
  }
  if (!vuoto(r.lCusc)) {
    const v = vicino(OPT_LCUSC, num(r.lCusc));
    if (v == null || v < MIN_CUSC[tipo] - 1e-9) return `Cuscinetto ${r.lCusc} m non previsto per ${tipo.toLowerCase()}: da ${fN(MIN_CUSC[tipo], 1)} a ${fN(OPT_LCUSC.at(-1), 1)} m.`;
    riga.lCusc = v;
  }
  if (riga.lCusc < MIN_CUSC[tipo]) riga.lCusc = MIN_CUSC[tipo];   // come fixRiga nell'app
  return riga;
}

/** Applica al preventivo i campi detti all'assistente o scritti nel modulo; quelli vuoti restano come sono. Ritorna l'errore da spiegare. */
export function applica(P: any, b: any, data: any): string | null {
  const O = offPrev(P);
  if (!vuoto(b.cliente)) P.cliente = breve(b.cliente, 120);
  if (b.rif != null) {
    const r = String(b.rif).trim();
    if (r.length > MAX_RIF) return `Il riferimento è il titolo della copertina: solo un nome breve (massimo ${MAX_RIF} caratteri). I dati tecnici (profilo, asse, omega, fondazione) vanno nelle righe tracker.`;
    P.rif = r;
  }
  if (!vuoto(b.modulo)) P.modulo.marca = breve(b.modulo, 80);
  if (!vuoto(b.wp)) { const wp = num(b.wp); if (!(wp >= 100 && wp <= 1000)) return 'Potenza del modulo non valida: va in W, es. 600.'; P.modulo.wp = wp; }
  if (b.localita != null) P.luogo = { ...P.luogo, nome: breve(b.localita, 80) };
  if (b.referente != null) O.referente = breve(b.referente, 80);
  if (!vuoto(b.rev)) O.rev = breve(b.rev, 5);

  if (!vuoto(b.righe)) {
    const rr = daJson(b.righe);
    if (!Array.isArray(rr) || !rr.length) return 'Righe tracker non leggibili: servono numero, taglia (moduli) e tipo per ogni riga.';
    const righe: any[] = [];
    for (const r of rr) { const x = rigaDa(r, Object.keys(data.sizes), data); if (typeof x === 'string') return x; righe.push(x); }
    P.righe = righe;
  }
  for (const [k, campo, nome] of IMPIANTO)
    if (!vuoto(b[k])) { const q = num(b[k]); if (!(q >= 0 && Number.isInteger(q))) return `Numero di ${nome} non valido.`; P.imp[campo] = q; }
  // Condizioni di progetto e dati del modulo (slide "Dati di progetto"): testi brevi, vuoto = «–» nell'offerta.
  if (b.prog && typeof b.prog === 'object') for (const [k] of PROGETTO) if (b.prog[k] != null) O.prog[k] = breve(b.prog[k], 40);
  if (b.lat != null && b.lng != null) {
    const lat = num(b.lat), lng = num(b.lng);
    if (b.lat === '' || b.lng === '') P.luogo = { ...P.luogo, lat: null, lng: null };
    else if (lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19) P.luogo = { ...P.luogo, lat, lng };
    else return 'Coordinate non valide: devono essere in Italia (es. 37,80 e 12,44).';
  }

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
  // Prezzi dell'offerta: trasporto e posa vanno tali e quali nell'offerta (0 = escluso / non inclusa); pieno = prezzo barrato.
  for (const k of ['trasporto', 'posa', 'pieno'] as const) if (b[k] != null) {
    if (b[k] === '') { O[k] = ''; continue; }
    const v = num(b[k]); if (!(v >= 0)) return `Importo ${k === 'pieno' ? 'del prezzo pieno' : 'del ' + k} non valido.`; O[k] = v;
  }
  // Layout preparato nel modulo (DXF disegnato o immagine ridotta nel telefono); false = toglierlo.
  if (b.layout === false) Object.assign(O, { layout: '', layoutW: 0, layoutH: 0, layoutNome: '', dxf: null });
  else if (b.layout && typeof b.layout === 'object') {
    const L = b.layout;
    if (!/^data:image\/(png|jpeg);base64,/.test(String(L.url)) || String(L.url).length > 4e6 || !(num(L.w) > 0 && num(L.h) > 0)) return 'Layout non valido: ricaricalo (DXF, PNG o JPG).';
    const dxf = L.dxf && typeof L.dxf === 'object' ? Object.fromEntries(Object.entries(L.dxf).map(([t, n]) => [String(num(t)), num(n)])) : null;
    Object.assign(O, { layout: L.url, layoutW: num(L.w), layoutH: num(L.h), layoutNome: breve(L.nome || 'layout', 120), dxf });
  }
  return null;
}

/** Campi del modulo da un preventivo salvato, per riaprirlo e correggerlo. */
export function campiModulo(P: any) {
  const O = offPrev(P), s = (v: unknown) => (v == null ? '' : String(v));
  return {
    cliente: s(P.cliente), rif: s(P.rif), localita: s(P.luogo?.nome), referente: s(O.referente), rev: s(O.rev || '0'),
    wp: s(P.modulo?.wp), modulo: s(P.modulo?.marca),
    righe: P.righe.map((r: any) => ({ n: s(r.n), taglia: s(r.taglia), tipo: r.tipo, prof: r.prof, asse: r.asse, omega: r.omega, lFond: num(r.lFond), lCusc: num(r.lCusc) })),
    ...Object.fromEntries(IMPIANTO.map(([k, c]) => [k, num(P.imp?.[c]) ? s(P.imp[c]) : ''])),
    prog: Object.fromEntries(PROGETTO.map(([k]) => [k, s(O.prog[k])])), lat: s(P.luogo?.lat), lng: s(P.luogo?.lng),
    margine: s(P.marg?.gen), margini: Object.fromEntries(MCATS.map(c => [c, s(P.marg?.cat?.[c])])),
    trasporto: s(O.trasporto), posa: s(O.posa), pieno: s(O.pieno),
    layout: O.layout ? { url: O.layout, w: O.layoutW, h: O.layoutH, nome: O.layoutNome, dxf: O.dxf } : null,
  };
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

// La posa vuota nell'app viene dal totale della scheda Montaggio, che qui non si calcola: senza importo detto, "non inclusa".
const offertaDi = (P: any, R: any, data: any) => {
  const D = datiOfferta(P, R, data, 0);
  return { D, avvisi: D.avvisi.filter(a => !/salvalo per assegnarlo/.test(a)) };
};

/** PowerPoint → PDF con ConvertAPI (usa i caratteri incorporati nel modello). null se non c'e' il token o la conversione non riesce. */
async function inPdf(pptx: Uint8Array, nome: string): Promise<Uint8Array | null> {
  const token = process.env.CONVERTAPI_TOKEN;
  if (!token) return null;
  const fd = new FormData();
  fd.append('File', new Blob([pptx as BlobPart]), nome);
  const r = await fetch('https://v2.convertapi.com/convert/pptx/to/pdf', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).catch(() => null);
  const j: any = r?.ok ? await r.json().catch(() => null) : null;
  const dati = j?.Files?.[0]?.FileData;
  return dati ? new Uint8Array(Buffer.from(dati, 'base64')) : null;
}

/** Compila l'offerta e la manda in PDF nella chat privata con il bot (il PowerPoint solo se il PDF non riesce). Ritorna l'errore, se c'e'. */
async function inviaOfferta(P: any, R: any, data: any, chat: number): Promise<{ errore?: string; avvisi: string[] }> {
  const { D, avvisi } = offertaDi(P, R, data);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { errore: "Sul server manca TELEGRAM_BOT_TOKEN (Vercel → Settings → Environment Variables): l'offerta non si può mandare.", avvisi };
  const O = P.offerta;
  const bytes = await compilaPptxBytes(await modello(), D, layoutImg(O));
  const nome = `Offerta_${P.num ? fileName(P.num) + '_' : ''}${fileName(P.cliente || P._nome || 'cliente')}${O.rev && O.rev !== '0' ? '_rev' + fileName(O.rev) : ''}`;
  const pdf = await inPdf(bytes, nome + '.pptx');
  if (!pdf) avvisi.unshift('PDF non disponibile in questo momento: ti ho mandato il PowerPoint.');
  const fd = new FormData();
  fd.append('chat_id', String(chat));
  fd.append('caption', `Offerta N° ${P.num || '–'} · ${P.cliente || 'cliente'} · ${eur(R.prezzo)} + IVA`);
  fd.append('document', new Blob([(pdf || bytes) as BlobPart]), nome + (pdf ? '.pdf' : '.pptx'));
  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    return { errore: r.status === 403 ? 'Non posso scriverti in privato: apri la chat con il bot e premi Avvia, poi riprova.' : `Telegram non ha accettato il file: ${j.description || r.status}`, avvisi };
  }
  return { avvisi };
}

/** Preventivo pronto da calcolare: caricato (id) o nuovo, con i campi applicati e l'eventuale layout da Telegram. */
async function prepara(db: Db, b: any, oggi: string): Promise<{ errore: string } | { P: any; data: any; nuovo: boolean; daDxf: string }> {
  const id = String(b.id ?? '').trim(), nuovo = !id;
  let P: any, data: any;
  if (id) {
    const { data: e } = await db.from('preventivi').select('id, nome, prev, dati').eq('id', id).maybeSingle();
    if (!e) return { errore: 'Preventivo non trovato: cercalo con cerca_commesse e usa il suo id.' };
    P = normPrev(clone(e.prev)); P._id = e.id; P._nome = e.nome; data = e.dati;
  }
  if (!data) {
    const { data: l } = await db.from('listino').select('dati').maybeSingle();
    data = l?.dati || defaultData();
  }
  if (b.azione === 'offerta' || b.azione === 'layout') {
    if (nuovo) return { errore: `Per ${b.azione === 'layout' ? 'mettere il layout' : "mandare un'offerta"} serve l'id del preventivo (da cerca_commesse).` };
    if (b.azione === 'offerta') return { P, data, nuovo, daDxf: '' };
    if (vuoto(b.file_id)) return { errore: 'Manca il file: mandami il DXF (come file) o una foto del layout.' };
  }
  let daDxf = '';
  if (nuovo) { P = newPrev(); P.data = oggi; P.righe = []; }
  const errore = applica(P, b, data);
  if (errore) return { errore };
  if (!vuoto(b.file_id)) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { errore: 'Sul server manca TELEGRAM_BOT_TOKEN: non posso scaricare il file da Telegram.' };
    try { Object.assign(offPrev(P), await layoutDaTelegram(token, String(b.file_id), String(b.file_nome ?? ''))); }
    catch (e) { return { errore: 'Layout non caricato: ' + (e as Error).message }; }
    const T = P.offerta.dxf as Record<string, number> | null;
    if (T && !P.righe.length) {
      P.righe = Object.entries(T).filter(([t]) => data.sizes[t]).map(([taglia, n]) => ({ ...defRiga(), taglia, n }));
      daDxf = 'Righe tracker prese dal DXF (agrivoltaico): ' + righeTxt(P) + '. Falle confermare.';
    }
  }
  if (!P.righe.some((r: any) => num(r.n) > 0)) return { errore: 'Mancano i tracker: dimmi quanti, di che taglia (moduli) e se agrivoltaico o basso.' };
  if (!P.cliente) return { errore: 'Manca il cliente.' };
  return { P, data, nuovo, daDxf };
}

/** Anteprima per il modulo: calcolo e testi dell'offerta, senza salvare ne' mandare niente. */
export async function anteprima(db: Db, b: any, oggi: string): Promise<Record<string, unknown>> {
  const p = await prepara(db, { ...b, azione: 'preventivo', file_id: undefined }, oggi);
  if ('errore' in p) return fail(p.errore);
  const { P, data } = p, R = compute(data, P), { D, avvisi } = offertaDi(P, R, data), c = D.campi;
  return { ok: true, testo: riepilogo(P, R), costo: R.total, prezzo: R.prezzo, kwp: R.kwp,
    offerta: { titolo: c.nome_impianto, potenza: `${c.potenza_kwp} kWp · pannelli ${c.potenza_modulo_w} W`,
      tracker: D.righe.map(r => `${r.n} × ${r.taglia} moduli`), prezzi: D.prezzi, layout: P.offerta.layoutNome || '' },
    avvisi: [...new Set([...R.warn, ...avvisi])] };
}

export async function preventivoBot(db: Db, b: any, email: string, chat: number, oggi: string): Promise<Record<string, unknown>> {
  const p = await prepara(db, b, oggi);
  if ('errore' in p) return fail(p.errore);
  const { P, data, nuovo, daDxf } = p, R = compute(data, P);

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
  if (b.invia === false || b.invia === 'false') return { ok: true, id: P._id, numero: P.num, nuovo, testo, avvisi: daDxf ? [daDxf] : [], offerta: 'non richiesta' };
  const inv = await inviaOfferta(P, R, data, chat);
  return { ok: true, id: P._id, numero: P.num, nuovo, testo, avvisi: daDxf ? [daDxf, ...inv.avvisi] : inv.avvisi,
    offerta: inv.errore ? `non inviata: ${inv.errore}` : 'inviata nella chat privata con il bot' };
}
