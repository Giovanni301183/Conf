// Funzione Vercel per la chat su Telegram (n8n): legge e scrive l'agenda per conto di un collega abbinato.
// n8n chiama POST /api/agenda con l'intestazione x-agenda-secret (variabile AGENDA_SECRET su Vercel) e un JSON
//   { azione, telegram_id, ...campi }
// Azioni: collega, chi_sono, commesse, colleghi, agenda, crea, aggiorna, prendi, risolvi, elimina (per un collega abbinato);
//         modulo (pulsante in chat privata che apre il modulo del preventivo, pagina modulo.html: vedi modulo.ts);
//         preventivo, offerta, layout, varianti, margini (preventivo creato o cambiato da Telegram, sue varianti di materiale e offerte in chat privata: vedi _preventivo.ts);
//         appunti, email (cerca un appunto e ne manda in chat privata la bozza di email scritta dall'AI, da aprire in Gmail: vedi _email.ts);
//         nota, nota_modifica (nota nei Documenti, libera o di una commessa, con le etichette del tema; cambio di etichette e commessa);
//         pe (pulsante sotto una email in arrivo: la trasforma in appunto, promemoria o riunione);
//         riepilogo, annuncio (del sistema: riepilogo del mattino e avviso nel gruppo di una voce nuova);
//         promemoria_email (del sistema, ogni mattina: a ogni collega le sue voci assegnate scadute o in scadenza, da mandare con Gmail);
//         avvisi_riunioni (del sistema, ogni 10 minuti: appuntamenti che iniziano tra poco, in privato a chi li ha creati e a chi sono assegnati);
//         posta (del sistema: email inoltrata all'indirizzo dell'agenda, letta dall'AI e proposta in chat privata a chi l'ha inoltrata: vedi _posta.ts).
// Regole come nell'app: crea chiunque; modifica ed elimina l'autore o un amministratore; chi ha la voce assegnata la segna fatta;
// un'urgenza o una voce senza assegnatario la puo' prendere chiunque.
// Gli errori "di dialogo" tornano con status 200 e { ok: false, errore }: cosi' l'assistente li legge e li spiega.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { marginiBot, preventivoBot, variantiBot } from './_preventivo.js';
import { linkGmail, scriviBozza } from './_email.js';
import { allegatiDaCaricare, indirizzo, leggiEmail, type Commessa, type Lettura } from './_posta.js';
import { chiaveAvviso, daAvvisare, linkRiunione, minutiA } from '../src/domain/riunione.js';
import { ETICHETTE, cartellaPer, nomeSicuro, nomiEtichette, pulisciEtichette } from '../src/domain/documenti.js';

export const GENERI = ['attivita', 'promemoria', 'scadenza', 'appuntamento', 'urgenza'] as const;
export const CATEGORIE = ['STRUTTURA', 'BULLONERIA', 'ELETTROMECCANICO', 'ELETTRONICO'] as const;
const ICONA: Record<string, string> = { urgenza: '🔴', attivita: '☑️', promemoria: '🔔', scadenza: '⏳', appuntamento: '📅', richiamo: '📞' };
const NOME_GENERE: Record<string, string> = { urgenza: 'Urgenza', attivita: 'Da fare', promemoria: 'Promemoria', scadenza: 'Scadenza', appuntamento: 'Appuntamento' };
export const RICHIAMO = 10;   // giorni dall'invio dell'offerta senza risposta (come nell'app)
const COLS = 'id, giorno, ora, genere, categoria, titolo, nota, preventivo_id, assegnata_a, fatto, origine, creato_da, creato';
const ANTICIPO_TG = 40;   // minuti: n8n chiama ogni 10 minuti, cosi' l'avviso arriva tra 30 e 40 minuti prima

export interface Me { email: string; nome: string | null; ruolo: 'admin' | 'utente' }
export interface Voce {
  id: string; giorno: string; ora: string | null; genere: string; categoria: string | null; titolo: string; nota: string | null;
  preventivo_id: string | null; assegnata_a: string | null; fatto: boolean; origine: string; creato_da: string; creato: string;
}

/* ---------- Date (fuso di Roma: il server gira in UTC) ---------- */
export const oggiISO = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
export const oraRoma = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const DAY = 864e5;
export const giornoNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;
export const isoDi = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const dataIt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const GSETT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const giornoIt = (s: string) => `${GSETT[new Date(giornoNum(s) * DAY).getUTCDay()]} ${dataIt(s)}`;
/** Primo giorno dal lunedi' al venerdi' dopo oggi. */
export function prossimoLavorativo(oggi: string) {
  let n = giornoNum(oggi) + 1;
  while ([0, 6].includes(new Date(n * DAY).getUTCDay())) n++;
  return isoDi(n);
}

/* ---------- Controllo dei campi ---------- */
// Accetta anche "oggi" e "domani"; l'assistente di solito manda AAAA-MM-GG.
function giornoDa(v: unknown, oggi: string): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'oggi') return oggi;
  if (s === 'domani') return isoDi(giornoNum(oggi) + 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(giornoNum(s)) ? s : null;
}
/** Campi di una voce nuova (o, con parziale, solo quelli presenti). Restituisce i campi puliti o il motivo dell'errore. */
export function pulisciVoce(b: any, oggi: string, parziale = false): { v?: Record<string, any>; errore?: string } {
  const v: Record<string, any> = {}, c = (k: string) => b[k] !== undefined;
  if (!parziale || c('genere')) {
    const g = String(b.genere ?? 'attivita').toLowerCase();
    if (!(GENERI as readonly string[]).includes(g)) return { errore: `Genere non valido: ${b.genere}. Validi: ${GENERI.join(', ')}.` };
    v.genere = g;
  }
  if (!parziale || c('titolo')) {
    const t = String(b.titolo ?? '').trim();
    if (!t || t.length > 200) return { errore: 'Serve una descrizione breve (titolo) di massimo 200 caratteri.' };
    v.titolo = t;
  }
  if (!parziale || c('giorno')) {
    // Un'urgenza senza data e' per oggi.
    const g = b.giorno == null || b.giorno === '' ? (v.genere === 'urgenza' ? oggi : null) : giornoDa(b.giorno, oggi);
    if (!g) return { errore: 'Serve il giorno nel formato AAAA-MM-GG (o "oggi", "domani").' };
    v.giorno = g;
  }
  if (c('ora')) {
    const o = String(b.ora ?? '').trim();
    if (o && !/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/.test(o)) return { errore: "L'ora va nel formato HH:MM." };
    v.ora = o || null;
  }
  if (c('categoria')) {
    const k = String(b.categoria ?? '').trim().toUpperCase();
    if (k && !(CATEGORIE as readonly string[]).includes(k)) return { errore: `Categoria non valida. Valide: ${CATEGORIE.join(', ')}.` };
    v.categoria = k || null;
  }
  if (c('nota')) v.nota = String(b.nota ?? '').trim() || null;
  if (c('preventivo_id')) v.preventivo_id = String(b.preventivo_id ?? '').trim() || null;
  if (c('assegnata_a')) v.assegnata_a = String(b.assegnata_a ?? '').trim().toLowerCase() || null;
  if (c('fatto')) v.fatto = b.fatto === true || b.fatto === 'true';
  return { v };
}

/** Chi puo' fare cosa su una voce esistente. */
export function permesso(azione: string, v: Voce, me: Me): boolean {
  const autore = v.creato_da === me.email || me.ruolo === 'admin';
  if (azione === 'aggiorna' || azione === 'elimina') return autore;
  if (azione === 'risolvi') return autore || v.assegnata_a === me.email;
  if (azione === 'prendi') return autore || !v.assegnata_a || v.assegnata_a === me.email;
  return false;
}

/* ---------- Testi per Telegram (testo semplice, niente Markdown da scappare) ---------- */
export interface Ctx { nomi: Map<string, string>; commesse: Map<string, { nome: string; num: string }> }
const chi = (ctx: Ctx, email: string) => ctx.nomi.get(email) || email.split('@')[0];
export function riga(v: Voce, ctx: Ctx, conData = true): string {
  const p = v.preventivo_id ? ctx.commesse.get(v.preventivo_id) : null;
  return [
    `${v.fatto ? '✅' : ICONA[v.genere] || '•'} ${conData ? giornoIt(v.giorno) + ' ' : ''}${v.ora ? v.ora.slice(0, 5) + ' ' : ''}${v.titolo}`,
    p ? ` · ${p.nome}` : '', v.categoria ? ` · ${v.categoria.toLowerCase()}` : '', v.assegnata_a ? ` · per ${chi(ctx, v.assegnata_a)}` : '',
  ].join('');
}
/** Preventivi inviati senza risposta da almeno RICHIAMO giorni. */
export function richiami(prev: { id: string; nome: string; stato: string | null; inviata: string | null; data: string | null }[], oggi: string) {
  return prev.filter(p => p.stato === 'inviato').flatMap(p => {
    const d = [p.inviata, p.data].find(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x));
    return d && giornoNum(oggi) - giornoNum(d) >= RICHIAMO ? [{ id: p.id, nome: p.nome, giorni: giornoNum(oggi) - giornoNum(d) }] : [];
  });
}
export function testoRiepilogo(vv: Voce[], ri: ReturnType<typeof richiami>, oggi: string, ctx: Ctx): string {
  const aperte = vv.filter(v => !v.fatto), urg = aperte.filter(v => v.genere === 'urgenza');
  const scad = aperte.filter(v => v.genere !== 'urgenza' && v.giorno < oggi), oggiV = aperte.filter(v => v.genere !== 'urgenza' && v.giorno === oggi);
  const pross = aperte.filter(v => v.genere !== 'urgenza' && v.giorno > oggi && giornoNum(v.giorno) <= giornoNum(oggi) + 3);
  const blocco = (t: string, l: string[]) => (l.length ? [`${t}`, ...l, ''] : []);
  const out = [`📋 Agenda di ${giornoIt(oggi)}`, '',
    ...blocco('🔴 Urgenze aperte', urg.map(v => riga(v, ctx))),
    ...blocco('⚠️ Scadute', scad.map(v => riga(v, ctx))),
    ...blocco('📅 Oggi', oggiV.map(v => riga(v, ctx, false))),
    ...blocco('🔜 Prossimi 3 giorni', pross.map(v => riga(v, ctx))),
    ...blocco('📞 Da richiamare (offerte senza risposta)', ri.map(r => `📞 ${r.nome} · inviata da ${r.giorni} giorni`))];
  return out.length > 2 ? out.join('\n').trim() : `📋 Agenda di ${giornoIt(oggi)}\nNiente in programma, nessuna urgenza. Buon lavoro!`;
}

/** Promemoria via email, uno per collega: le sue voci assegnate non fatte, scadute o in scadenza nei prossimi 3 giorni, e le urgenze aperte. */
export function emailPromemoria(vv: Voce[], oggi: string, ctx: Ctx, app: string) {
  const fra3 = giornoNum(oggi) + 3, perChi = new Map<string, Voce[]>();
  for (const v of vv) if (v.assegnata_a && !v.fatto && (v.genere === 'urgenza' || giornoNum(v.giorno) <= fra3)) perChi.set(v.assegnata_a, [...(perChi.get(v.assegnata_a) || []), v]);
  return [...perChi].map(([a, l]) => {
    const urg = l.filter(v => v.genere === 'urgenza'), scad = l.filter(v => v.genere !== 'urgenza' && v.giorno < oggi), pross = l.filter(v => v.genere !== 'urgenza' && v.giorno >= oggi);
    const rr = (v: Voce) => '- ' + riga(v, ctx).replace(/ · per [^·]+$/, '') + (v.nota ? `\n  ${v.nota.replace(/\s+/g, ' ').slice(0, 300)}` : '')
      + (v.creato_da && v.creato_da !== a ? `\n  (assegnata da ${chi(ctx, v.creato_da)})` : '');
    const blocco = (t: string, x: Voce[]) => (x.length ? [t, ...x.map(rr), ''] : []);
    const oggetto = `Promemoria: ${[urg.length ? `${urg.length} urgenz${urg.length === 1 ? 'a' : 'e'}` : '', scad.length ? `${scad.length} scadut${scad.length === 1 ? 'a' : 'e'}` : '',
      pross.length ? `${pross.length} in scadenza` : ''].filter(Boolean).join(', ')}`;
    const testo = [`Ciao ${chi(ctx, a)},`, '', "queste sono le voci dell'agenda assegnate a te che richiedono attenzione:", '',
      ...blocco('URGENZE APERTE', urg), ...blocco('SCADUTE', scad), ...blocco('IN SCADENZA (prossimi 3 giorni)', pross),
      `Quando le hai fatte spuntale nell'app: ${app}`, '', "Email automatica dell'agenda Terranova."].join('\n');
    return { a, nome: chi(ctx, a), oggetto, testo, voci: l.length };
  });
}

/* ---------- Accesso ai dati ---------- */
type Db = SupabaseClient;
const fail = (errore: string) => ({ ok: false, errore });
async function contesto(db: Db): Promise<Ctx> {
  const [{ data: u }, { data: p }] = await Promise.all([
    db.from('utenti').select('email, nome'), db.from('preventivi').select('id, nome, num:prev->>num'),
  ]);
  return { nomi: new Map((u || []).map(x => [x.email, x.nome || x.email.split('@')[0]])), commesse: new Map((p || []).map((x: any) => [x.id, { nome: x.nome, num: x.num || '' }])) };
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Manda in chat privata il pulsante che apre il modulo del preventivo dentro Telegram (mini app). origine = indirizzo dell'app. */
async function apriModulo(b: any, chat: number, origine: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail('Sul server manca TELEGRAM_BOT_TOKEN: non posso mandare il modulo.');
  const q = new URLSearchParams(), cliente = String(b.cliente ?? '').trim().slice(0, 120), id = String(b.id ?? '').trim();
  if (cliente) q.set('cliente', cliente);
  if (id) q.set('id', id);
  // L'anteprima Vercel e' protetta: il link porta il codice di bypass, che lascia anche il cookie per la pagina e le sue chiamate.
  const by = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (process.env.VERCEL_ENV === 'preview' && by) { q.set('x-vercel-protection-bypass', by); q.set('x-vercel-set-bypass-cookie', 'samesitenone'); }
  const testo = id ? '📝 Apri il modulo per correggere il preventivo, poi premi Anteprima e Crea e invia.'
    : `📝 Preventivo${cliente ? ' per ' + cliente : ''}: compila il modulo, controlla l'anteprima e premi Crea e invia.`;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: testo, reply_markup: { inline_keyboard: [[{ text: '📝 Compila preventivo', web_app: { url: `${origine}/modulo.html?${q}` } }]] } }) });
  if (!r.ok) return fail(r.status === 403 ? 'Non posso scriverti in privato: apri la chat con il bot e premi Avvia, poi riprova.' : 'Telegram non ha accettato il messaggio con il modulo.');
  return { ok: true, testo: 'Ti ho mandato in privato il pulsante «Compila preventivo».' };
}

/** Appunti (note dei documenti e note delle voci d'agenda) che contengono tutte le parole cercate, i più recenti prima. */
async function cercaAppunti(db: Db, b: any) {
  const pid = String(b.preventivo_id ?? '').trim();
  let qd = db.from('documenti').select('id, titolo, testo, preventivo_id, creato, etichette').eq('tipo', 'nota');
  const tema = pulisciEtichette(b.etichetta);
  if (tema.length) qd = qd.overlaps('etichette', tema);
  let qv = db.from('scadenze').select('id, titolo, nota, giorno, preventivo_id').not('nota', 'is', null);
  if (pid) { qd = qd.eq('preventivo_id', pid); qv = qv.eq('preventivo_id', pid); }
  const [{ data: dd, error }, { data: vv }, ctx] = await Promise.all([
    qd.order('creato', { ascending: false }).limit(300), qv.order('giorno', { ascending: false }).limit(300), contesto(db)]);
  if (error) return fail(error.message);
  const comm = (id: string | null) => (id ? ctx.commesse.get(id)?.nome || null : null);
  const tutti = [
    ...(dd || []).map((d: any) => ({ id: d.id, fonte: 'documenti', titolo: d.titolo, testo: d.testo || '', data: String(d.creato).slice(0, 10), commessa: comm(d.preventivo_id), temi: nomiEtichette(d.etichette) })),
    // Le note dell'agenda non hanno etichette: con un tema scelto restano fuori.
    ...(tema.length ? [] : vv || []).map((v: any) => ({ id: v.id, fonte: 'agenda', titolo: v.titolo, testo: v.nota || '', data: v.giorno, commessa: comm(v.preventivo_id), temi: '' })),
  ].sort((a, x) => x.data.localeCompare(a.data));
  const parole = norm(String(b.cerca ?? '')).split(/\s+/).filter(Boolean);
  const trovati = tutti.filter(a => { const t = norm([a.titolo, a.testo, a.commessa, a.temi].join(' ')); return parole.every(w => t.includes(w)); })
    .slice(0, 10).map(({ testo, ...a }) => ({ ...a, estratto: testo.length > 300 ? testo.slice(0, 300) + '…' : testo }));
  return { ok: true, trovati };
}

/** Bozza di email da un appunto (id da cercaAppunti) o da un testo dettato, mandata nella chat privata con il pulsante che la apre in Gmail. */
async function emailDaAppunto(db: Db, b: any, io: Me, chat: number, origine: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail('Sul server manca TELEGRAM_BOT_TOKEN: non posso mandare la bozza.');
  const id = String(b.id ?? '').trim();
  let ap = { titolo: '', testo: String(b.appunto ?? '').trim() }, pid: string | null = null, voce: { titolo: string; giorno: string } | null = null;
  if (id) {
    // Gli id sono uuid: uno che non lo e' non trova niente (l'errore si ignora).
    const { data: d } = await db.from('documenti').select('titolo, testo, preventivo_id, scadenza_id').eq('id', id).eq('tipo', 'nota').maybeSingle();
    const { data: v } = d ? { data: null } : await db.from('scadenze').select('titolo, nota, giorno, preventivo_id').eq('id', id).maybeSingle();
    if (!d && !v) return fail("Appunto non trovato: cercalo prima con l'azione appunti e usa il suo id.");
    ap = d ? { titolo: d.titolo, testo: d.testo || '' } : { titolo: v!.titolo, testo: v!.nota || '' };
    pid = (d || v)!.preventivo_id;
    if (d?.scadenza_id) voce = (await db.from('scadenze').select('titolo, giorno').eq('id', d.scadenza_id).maybeSingle()).data;
    else if (v) voce = { titolo: v.titolo, giorno: v.giorno };
  } else if (!ap.testo) return fail("Serve l'appunto: l'id di uno trovato con appunti, oppure il testo da cui scrivere l'email.");
  if (!pid && b.preventivo_id) pid = String(b.preventivo_id).trim();
  const p = pid ? (await db.from('preventivi').select('nome, cliente, rif, num:prev->>num').eq('id', pid).maybeSingle()).data as any : null;
  const ctxEmail = [p && `commessa "${p.nome}"${p.num ? ` (N° ${p.num})` : ''}${p.cliente ? `, cliente ${p.cliente}` : ''}${p.rif ? `, riferimento ${p.rif}` : ''}`,
    voce && `voce d'agenda "${voce.titolo}" del ${voce.giorno}`].filter(Boolean).join('; ');

  const r = await scriviBozza({ ...ap, contesto: ctxEmail, richiesta: String(b.richiesta ?? '') }, io.nome || io.email.split('@')[0]);
  if ('errore' in r) return fail(r.errore);
  const a = String(b.a ?? '').trim();
  // Telefono: pagina ponte che apre l'app Gmail con la mail compilata (vedi posta.ts). Computer: Gmail sul web.
  const posta = (testo: string) => {
    const q = new URLSearchParams({ a, su: r.oggetto, body: testo }), by = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (process.env.VERCEL_ENV === 'preview' && by) q.set('x-vercel-protection-bypass', by);   // l'anteprima Vercel e' protetta
    return `${origine}/api/posta?${q.toString().replace(/\+/g, '%20')}`;
  };
  // Un indirizzo troppo lungo puo' non passare come pulsante: allora i link portano solo destinatari e oggetto, il testo si copia dal messaggio.
  const lungo = Math.max(posta(r.testo).length, linkGmail(io.email, a, r.oggetto, r.testo).length) > 2000, corpo = lungo ? '' : r.testo;
  const msg = [`✉️ Bozza email${a ? ' per ' + a : ''}`, `Oggetto: ${r.oggetto}`, '', r.testo, '',
    lungo ? 'Il testo è lungo: incollalo nella mail copiandolo da qui.' : 'Rileggila prima di premere Invia.'].join('\n').slice(0, 4000);
  const t = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: msg, reply_markup: { inline_keyboard: [
      [{ text: '📱 Apri in Gmail (telefono)', url: posta(corpo) }], [{ text: '💻 Apri in Gmail (computer)', url: linkGmail(io.email, a, r.oggetto, corpo) }]] } }) });
  if (!t.ok) return fail(t.status === 403 ? 'Non posso scriverti in privato: apri la chat con il bot e premi Avvia, poi riprova.' : 'Telegram non ha accettato il messaggio con la bozza.');
  return { ok: true, oggetto: r.oggetto, testo: `Ti ho mandato in privato la bozza «${r.oggetto}» con i pulsanti per aprirla in Gmail, dal telefono o dal computer.` };
}

/* ---------- Note (Documenti) ---------- */
const temiTesto = (kk: string[]) => (kk.length ? ` · temi: ${nomiEtichette(kk)}` : '');
/** Nota nuova nei Documenti, scritta da Telegram: libera o legata a una commessa, con le etichette del tema. */
async function creaNota(db: Db, b: any, io: Me) {
  const titolo = String(b.titolo ?? '').trim().slice(0, 200), testo = String(b.testo ?? '').trim().slice(0, 20_000) || null;
  if (!titolo) return fail('Serve un titolo breve per la nota.');
  const pid = String(b.preventivo_id ?? '').trim() || null, etichette = pulisciEtichette(b.etichette);
  const p = pid ? (await db.from('preventivi').select('id, nome').eq('id', pid).maybeSingle()).data : null;
  if (pid && !p) return fail("Preventivo non trovato: cercalo prima con l'azione commesse e usa il suo id, oppure salva la nota libera.");
  const { data, error } = await db.from('documenti').insert({ tipo: 'nota', cartella: 'altro', titolo, testo, etichette, preventivo_id: pid, creato_da: io.email }).select('id').single();
  if (error) return fail(error.message);
  return { ok: true, id: data.id, testo: `📝 Nota salvata${p ? ' in ' + p.nome : ' (libera)'}: ${titolo}${temiTesto(etichette)}` };
}
/** Cambia etichette (aggiunge/toglie) e, se detta, la commessa di una nota. Come nell'app: solo l'autore o un amministratore. */
async function modificaNota(db: Db, b: any, io: Me) {
  const { data: d } = await db.from('documenti').select('id, titolo, etichette, preventivo_id, scadenza_id, creato_da').eq('id', String(b.id ?? '')).eq('tipo', 'nota').maybeSingle();
  if (!d) return fail("Nota non trovata: cercala con l'azione appunti e usa il suo id (solo le note dei documenti, non quelle dell'agenda).");
  if (d.creato_da !== io.email && io.ruolo !== 'admin') return fail("Può cambiarla solo chi l'ha scritta o un amministratore.");
  const togli = pulisciEtichette(b.togli), patch: Record<string, unknown> = {};
  const etichette = [...new Set([...(d.etichette || []).filter((k: string) => !togli.includes(k)), ...pulisciEtichette(b.aggiungi)])];
  if (etichette.join() !== (d.etichette || []).join()) patch.etichette = etichette;
  const pid = String(b.preventivo_id ?? '').trim();
  if (pid === 'nessuno') patch.preventivo_id = null;
  else if (pid) {
    if (!(await db.from('preventivi').select('id').eq('id', pid).maybeSingle()).data) return fail("Preventivo non trovato: cercalo con l'azione commesse.");
    patch.preventivo_id = pid;
  }
  if (!Object.keys(patch).length) return fail('Niente da cambiare: la nota ha già queste etichette.');
  const { error } = await db.from('documenti').update(patch).eq('id', d.id);
  if (error) return fail(error.message);
  return { ok: true, testo: `🏷 Nota aggiornata: ${d.titolo}${temiTesto(etichette) || ' · nessuna etichetta'}` };
}

/* ---------- Email in arrivo ---------- */
// allegati: file dell'email caricati da n8n nello Storage (cartella posta/...), legati alla nota o alla voce quando si sceglie.
export interface AllegatoPosta { nome: string; mime: string; percorso: string }
export type Proposta = Lettura & { oggetto: string; link?: string; allegati?: AllegatoPosta[] };
/** Messaggio in chat privata con la lettura dell'email e i pulsanti "pe:<id>:<scelta>" (a appunto, p promemoria, r riunione, x ignora). */
export function propostaTelegram(id: string, l: Proposta, commessa: string | null, oggi: string) {
  const giorno = l.giorno || prossimoLavorativo(oggi), b = (text: string, s: string) => [{ text, callback_data: `pe:${id}:${s}` }];
  const text = [`📧 Email${l.mittente ? ' di ' + l.mittente : ''}`, l.oggetto ? `Oggetto: ${l.oggetto}` : '', '', `👉 ${l.titolo}`, l.riassunto, '',
    l.link ? `🎥 ${l.link}` : '', commessa ? `Commessa: ${commessa}` : 'Commessa: non riconosciuta (l\'appunto resta libero)',
    l.etichette?.length ? `Temi: ${nomiEtichette(l.etichette)}` : '',
    l.allegati?.length ? `📎 ${l.allegati.length} allegat${l.allegati.length === 1 ? 'o' : 'i'}: ${l.allegati.map(a => a.nome).join(', ')}`.slice(0, 600) : '', '', 'Cosa ne faccio?']
    .filter((x, i, a) => x || (i > 0 && a[i - 1])).join('\n').slice(0, 4000);
  const tasti = [b(commessa ? '📝 Appunto nella commessa' : '📝 Appunto', 'a'), b(`🔔 Promemoria ${giornoIt(giorno)}`, 'p'),
    ...(l.giorno ? [b(`📅 Riunione ${giornoIt(l.giorno)}${l.ora ? ' ' + l.ora : ''}`, 'r')] : []), b('🗑 Ignora', 'x')];
  return { text, reply_markup: { inline_keyboard: tasti } };
}

/** Email inoltrata all'indirizzo dell'agenda: la legge l'AI e la propone in chat privata a chi l'ha inoltrata (se e' un collega abbinato). */
async function postaInArrivo(db: Db, b: any, oggi: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail('Sul server manca TELEGRAM_BOT_TOKEN.');
  const da = indirizzo(String(b.da ?? '')), gid = String(b.gmail_id ?? '').trim().slice(0, 200) || null, oggetto = String(b.oggetto ?? '').trim().slice(0, 300);
  const { data: u } = await db.from('utenti').select('email, telegram_id, attivo').eq('email', da).maybeSingle();
  if (!u || !u.attivo) return fail(`${da || 'Il mittente'} non è un utente attivo dell'app: email ignorata.`);
  if (!u.telegram_id) return fail(`${da} non ha collegato Telegram: non so dove mandargli la proposta.`);
  // La stessa email riletta da n8n non fa una seconda proposta.
  if (gid && (await db.from('posta_proposte').select('id').eq('gmail_id', gid).maybeSingle()).data) return { ok: true, doppia: true };
  const { data: cc } = await db.from('preventivi').select('id, nome, cliente, rif, num:prev->>num').order('salvato', { ascending: false }).limit(300);
  const commesse = (cc || []) as Commessa[];
  const l = await leggiEmail({ da: String(b.da ?? ''), oggetto, testo: String(b.testo ?? ''), data: String(b.data ?? '') }, commesse, oggi);
  if ('errore' in l) return fail(l.errore);
  // Allegati: ognuno ha il suo posto nello Storage; n8n li carica con i link firmati che tornano nella risposta.
  const cartellaPosta = `posta/${crypto.randomUUID()}`;
  const scelti = allegatiDaCaricare(Array.isArray(b.allegati) ? b.allegati : [])
    .map((a, i) => ({ chiave: a.chiave, nome: a.nome.slice(0, 200), mime: a.mime || '', percorso: `${cartellaPosta}/${i + 1}_${nomeSicuro(a.nome)}` }));
  const dati: Proposta = { ...l, oggetto, link: linkRiunione(String(b.testo ?? '')), allegati: scelti.map(({ chiave, ...a }) => a) };
  const { data: p, error } = await db.from('posta_proposte').insert({ email: u.email, gmail_id: gid, dati }).select('id').single();
  if (error) return error.code === '23505' ? { ok: true, doppia: true } : fail(error.message);
  const c = commesse.find(x => x.id === l.preventivo_id);
  const t = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: u.telegram_id, ...propostaTelegram(p.id, dati, c ? c.nome + (c.num ? ` (N° ${c.num})` : '') : null, oggi) }) });
  if (!t.ok) return fail('Telegram non ha accettato la proposta' + (t.status === 403 ? ': il collega deve aprire la chat con il bot e premere Avvia.' : '.'));
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const caricamenti: { chiave: string; url: string; mime: string; apikey: string }[] = [];
  for (const a of scelti) {
    const { data: u } = await db.storage.from(BUCKET).createSignedUploadUrl(a.percorso);
    if (u) caricamenti.push({ chiave: a.chiave, url: u.signedUrl, mime: a.mime || 'application/octet-stream', apikey });
  }
  return { ok: true, id: p.id, titolo: l.titolo, caricamenti };
}

/** Messaggio di avviso di una riunione che sta per iniziare, con il pulsante per entrare se c'e' il link. */
export function avvisoRiunione(v: Voce, adesso: string, ctx: Ctx) {
  const min = minutiA(v.ora!, adesso), link = linkRiunione(v.nota), p = v.preventivo_id ? ctx.commesse.get(v.preventivo_id) : null;
  const text = [`⏰ Tra ${min} minuti: ${v.titolo} (ore ${v.ora!.slice(0, 5)})`, p ? `Commessa: ${p.nome}` : '',
    v.nota ? v.nota.slice(0, 500) : ''].filter(Boolean).join('\n');
  return { text, ...(link ? { reply_markup: { inline_keyboard: [[{ text: '🎥 Entra nella riunione', url: link }]] } } : {}) };
}

/** Appuntamenti che iniziano entro ANTICIPO_TG minuti: avviso in privato a chi li ha creati e a chi sono assegnati, una volta sola. */
async function avvisiRiunioni(db: Db, oggi: string, adesso: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail('Sul server manca TELEGRAM_BOT_TOKEN.');
  const { data, error } = await db.from('scadenze').select(COLS + ', avvisata_per').eq('genere', 'appuntamento').eq('fatto', false).eq('giorno', oggi).not('ora', 'is', null);
  if (error) return fail(error.message);
  const vv = daAvvisare((data || []) as unknown as (Voce & { avvisata_per: string | null })[], oggi, adesso, ANTICIPO_TG).filter(v => v.avvisata_per !== chiaveAvviso(v));
  if (!vv.length) return { ok: true, avvisati: 0 };
  const [{ data: uu }, ctx] = await Promise.all([db.from('utenti').select('email, telegram_id').eq('attivo', true).not('telegram_id', 'is', null), contesto(db)]);
  const tg = new Map((uu || []).map(u => [u.email, u.telegram_id as number]));
  let n = 0;
  for (const v of vv) {
    const msg = avvisoRiunione(v, adesso, ctx);
    for (const chat of new Set([v.creato_da, v.assegnata_a].flatMap(e => (e && tg.get(e) ? [tg.get(e)!] : [])))) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, ...msg }) });
      if (r.ok) n++;
    }
    await db.from('scadenze').update({ avvisata_per: chiaveAvviso(v) }).eq('id', v.id);
  }
  return { ok: true, avvisati: n };
}

const BUCKET = 'documenti';
/** Allegati arrivati davvero nello Storage, legati alla nota o alla voce d'agenda appena creata. Ritorna quanti. */
async function legaAllegati(db: Db, d: Proposta, dove: { nota_id: string } | { scadenza_id: string }, cartella: string | null, io: Me) {
  const aa = d.allegati || [];
  if (!aa.length) return 0;
  const cart = aa[0].percorso.split('/').slice(0, 2).join('/');
  const { data: ff } = await db.storage.from(BUCKET).list(cart, { limit: 100 });
  const ci = new Map((ff || []).map((f: any) => [`${cart}/${f.name}`, f]));
  const righe = aa.filter(a => ci.has(a.percorso)).map(a => ({ ...dove, tipo: 'file', cartella: cartella || cartellaPer(a.nome, a.mime), titolo: a.nome,
    percorso: a.percorso, mime: a.mime || null, dimensione: ci.get(a.percorso)?.metadata?.size ?? null, creato_da: io.email }));
  if (!righe.length) return 0;
  const { error } = await db.from('documenti').insert(righe);
  return error ? 0 : righe.length;
}
const conAllegati = (n: number) => (n ? ` · 📎 ${n} allegat${n === 1 ? 'o' : 'i'}` : '');

/** Pulsante sotto la proposta: appunto nei documenti della commessa, promemoria o riunione in agenda, oppure niente. */
async function sceltaPosta(db: Db, b: any, io: Me, oggi: string) {
  const { data: p } = await db.from('posta_proposte').select('id, email, dati, usata').eq('id', String(b.id ?? '')).maybeSingle();
  if (!p || p.email !== io.email) return fail('Proposta non trovata: era per un altro collega o è stata cancellata.');
  if (p.usata) return fail("Questa email l'hai già sistemata.");
  const d = p.dati as Proposta, scelta = String(b.scelta ?? '');
  const nota = [d.riassunto, d.link && `🎥 ${d.link}`, `✉ Email${d.mittente ? ' di ' + d.mittente : ''}${d.oggetto ? `: «${d.oggetto}»` : ''}`].filter(Boolean).join('\n\n');
  let testo: string;
  if (scelta === 'x') {
    const pp = (d.allegati || []).map(a => a.percorso);
    if (pp.length) await db.storage.from(BUCKET).remove(pp);
    testo = 'Ok, email ignorata.';
  }
  else if (scelta === 'a') {
    const etichette = pulisciEtichette(d.etichette);
    const cartella = d.preventivo_id ? 'cliente' : 'altro';
    const { data: n, error } = await db.from('documenti').insert({ preventivo_id: d.preventivo_id || null, tipo: 'nota', cartella,
      titolo: d.titolo, testo: nota, etichette, creato_da: io.email }).select('id').single();
    if (error) return fail(error.message);
    const na = await legaAllegati(db, d, { nota_id: n.id }, cartella, io);
    const { data: c } = d.preventivo_id ? await db.from('preventivi').select('nome').eq('id', d.preventivo_id).maybeSingle() : { data: null };
    testo = `📝 Appunto salvato${c ? ' in Documenti di ' + c.nome : ' tra le note (libero)'}: ${d.titolo}${temiTesto(etichette)}${conAllegati(na)}`;
  } else if (scelta === 'p' || scelta === 'r') {
    if (scelta === 'r' && !d.giorno) return fail("Nell'email non c'è la data della riunione: scegli promemoria e correggila nell'app.");
    const { data: v, error } = await db.from('scadenze').insert({ genere: scelta === 'r' ? 'appuntamento' : 'promemoria', giorno: d.giorno || prossimoLavorativo(oggi),
      ora: d.ora || null, titolo: d.titolo, nota, preventivo_id: d.preventivo_id || null, creato_da: io.email, origine: 'telegram' }).select(COLS).single();
    if (error) return fail(error.message);
    const na = await legaAllegati(db, d, { scadenza_id: (v as Voce).id }, null, io);
    testo = `Aggiunto: ${riga(v as Voce, await contesto(db))}${conAllegati(na)}`;
  } else return fail('Scelta sconosciuta.');
  await db.from('posta_proposte').update({ usata: new Date().toISOString() }).eq('id', p.id);
  return { ok: true, testo };
}

export async function esegui(db: Db, b: any, adesso = new Date(), origine = ''): Promise<Record<string, unknown>> {
  const oggi = oggiISO(adesso), az = String(b.azione || '');

  // --- Azioni del sistema (senza utente) ---
  if (az === 'riepilogo') {
    const [{ data: vv, error }, { data: pp }, ctx] = await Promise.all([
      db.from('scadenze').select(COLS).eq('fatto', false).lte('giorno', isoDi(giornoNum(oggi) + 3)).order('giorno').order('ora', { nullsFirst: true }),
      db.from('preventivi').select('id, nome, data, stato:prev->>stato, inviata:prev->offerta->>inviata'), contesto(db)]);
    if (error) return fail(error.message);
    return { ok: true, testo: testoRiepilogo(vv as Voce[], richiami((pp || []) as any, oggi), oggi, ctx) };
  }
  if (az === 'promemoria_email') {
    // Ogni mattina: una email per collega con le sue voci assegnate scadute, in scadenza o urgenti (n8n la manda con Gmail).
    const [{ data: vv, error }, ctx] = await Promise.all([
      db.from('scadenze').select(COLS).eq('fatto', false).not('assegnata_a', 'is', null).or(`giorno.lte.${isoDi(giornoNum(oggi) + 3)},genere.eq.urgenza`).order('giorno').order('ora', { nullsFirst: true }),
      contesto(db)]);
    if (error) return fail(error.message);
    return { ok: true, email: emailPromemoria(vv as Voce[], oggi, ctx, process.env.APP_URL || 'https://conf-five.vercel.app') };
  }
  if (az === 'annuncio') {
    // Voce appena creata (dall'app o da Telegram): si annunciano nel gruppo le urgenze e le voci assegnate a qualcuno.
    const { data: v } = await db.from('scadenze').select(COLS).eq('id', b.id).maybeSingle();
    if (!v || v.fatto || (v.genere !== 'urgenza' && !v.assegnata_a)) return { ok: true, invia: false };
    const ctx = await contesto(db), urg = v.genere === 'urgenza';
    const testo = [urg ? '🔴 URGENTE' : `🆕 ${NOME_GENERE[v.genere] || 'Voce'} per ${chi(ctx, v.assegnata_a)}`,
      riga(v as Voce, ctx), v.nota ? `📝 ${v.nota}` : '', `Segnalata da ${chi(ctx, v.creato_da)}${v.origine === 'telegram' ? ' (Telegram)' : ''}`].filter(Boolean).join('\n');
    return { ok: true, invia: true, urgente: urg, id: v.id, testo, pulsanti: urg || !!v.assegnata_a };
  }

  if (az === 'posta') return postaInArrivo(db, b, oggi);
  if (az === 'avvisi_riunioni') return avvisiRiunioni(db, oggi, oraRoma(adesso));

  // --- Abbinamento dell'account ---
  const tid = Number(b.telegram_id);
  if (!tid) return fail('Manca telegram_id.');
  if (az === 'collega') {
    const codice = String(b.codice ?? '').replace(/\D/g, '');
    const { data: c } = await db.from('telegram_codici').select('email, scade').eq('codice', codice).maybeSingle();
    if (!codice || !c || new Date(c.scade) < adesso) return fail("Codice non valido o scaduto: generane uno nuovo nell'app (menu in basso a sinistra, pulsante Telegram).");
    await db.from('utenti').update({ telegram_id: null }).eq('telegram_id', tid);   // un account Telegram = un utente
    const { error } = await db.from('utenti').update({ telegram_id: tid }).eq('email', c.email);
    if (error) return fail(error.message);
    await db.from('telegram_codici').delete().eq('email', c.email);
    const { data: u } = await db.from('utenti').select('nome').eq('email', c.email).maybeSingle();
    return { ok: true, testo: `✅ Ciao ${u?.nome || c.email.split('@')[0]}, il tuo Telegram è collegato all'app. Ora puoi scrivermi cosa aggiungere in agenda.` };
  }

  // --- Da qui serve un collega abbinato e attivo ---
  const { data: me } = await db.from('utenti').select('email, nome, ruolo, attivo').eq('telegram_id', tid).maybeSingle();
  if (!me || !me.attivo) return fail("Questo account Telegram non è collegato a un utente attivo dell'app. Nell'app premi il pulsante Telegram (in basso a sinistra) e scrivimi /collega seguito dal codice.");
  const io: Me = { email: me.email, nome: me.nome, ruolo: me.ruolo };

  if (az === 'chi_sono') return { ok: true, email: io.email, nome: io.nome, ruolo: io.ruolo, oggi, giorno_settimana: giornoIt(oggi) };

  if (az === 'modulo') return apriModulo(b, tid, origine);
  if (az === 'preventivo' || az === 'offerta' || az === 'layout') return preventivoBot(db, b, io.email, tid, oggi);
  if (az === 'varianti') return variantiBot(db, b, io.email, tid);
  if (az === 'margini') return marginiBot(db, b, tid);
  if (az === 'appunti') return cercaAppunti(db, b);
  if (az === 'email') return emailDaAppunto(db, b, io, tid, origine);
  if (az === 'pe') return sceltaPosta(db, b, io, oggi);
  if (az === 'nota') return creaNota(db, b, io);
  if (az === 'nota_modifica') return modificaNota(db, b, io);
  if (az === 'etichette') return { ok: true, etichette: ETICHETTE.map(([k, l]) => ({ chiave: k, nome: l })) };

  if (az === 'colleghi') {
    const { data } = await db.from('utenti').select('email, nome').eq('attivo', true).order('nome');
    return { ok: true, colleghi: data };
  }

  if (az === 'commesse') {
    const { data, error } = await db.from('preventivi').select('id, nome, cliente, rif, data, salvato, stato:prev->>stato, num:prev->>num, luogo:prev->luogo->>nome');
    if (error) return fail(error.message);
    const parole = norm(String(b.cerca ?? '')).split(/\s+/).filter(Boolean);
    const trovati = (data || []).filter((p: any) => { const t = norm([p.nome, p.cliente, p.rif, p.num, p.luogo].join(' ')); return parole.every(w => t.includes(w)); })
      .sort((a: any, x: any) => Number(x.stato === 'vinto') - Number(a.stato === 'vinto') || String(x.salvato).localeCompare(String(a.salvato)))
      .slice(0, 15).map((p: any) => ({ id: p.id, nome: p.nome, numero: p.num, data: p.data, cliente: p.cliente, riferimento: p.rif, luogo: p.luogo, stato: p.stato || 'bozza', commessa: p.stato === 'vinto' }));
    return { ok: true, trovati, nota: 'commessa = preventivo vinto' };
  }

  if (az === 'agenda') {
    const da = giornoDa(b.da, oggi) || oggi, a = giornoDa(b.a, oggi) || isoDi(giornoNum(da) + 7);
    let q = db.from('scadenze').select(COLS).or(`and(giorno.gte.${da},giorno.lte.${a}),and(fatto.eq.false,giorno.lt.${oggi}),and(fatto.eq.false,genere.eq.urgenza)`);
    if (b.solo_mie) q = q.or(`creato_da.eq.${io.email},assegnata_a.eq.${io.email}`);
    const [{ data, error }, ctx] = await Promise.all([q.order('giorno').order('ora', { nullsFirst: true }), contesto(db)]);
    if (error) return fail(error.message);
    const vv = data as Voce[];
    return { ok: true, da, a, voci: vv.map(v => ({ ...v, commessa: v.preventivo_id ? ctx.commesse.get(v.preventivo_id)?.nome : null })),
      testo: vv.length ? vv.map(v => riga(v, ctx)).join('\n') : 'Niente in agenda in questo periodo.' };
  }

  if (az === 'crea') {
    const { v, errore } = pulisciVoce(b, oggi);
    if (errore) return fail(errore);
    if (v!.preventivo_id) {
      const { data: p } = await db.from('preventivi').select('id').eq('id', v!.preventivo_id).maybeSingle();
      if (!p) return fail('Preventivo non trovato: cercalo prima con l\'azione commesse e usa il suo id.');
    }
    if (v!.assegnata_a) {
      const { data: u } = await db.from('utenti').select('email').eq('email', v!.assegnata_a).eq('attivo', true).maybeSingle();
      if (!u) return fail('Collega non trovato: usa l\'email presa dall\'azione colleghi.');
    }
    const { data, error } = await db.from('scadenze').insert({ ...v, creato_da: io.email, origine: 'telegram' }).select(COLS).single();
    if (error) return fail(error.message);
    return { ok: true, voce: data, testo: `Aggiunto: ${riga(data as Voce, await contesto(db))}` };
  }

  // --- Azioni su una voce esistente ---
  if (!['aggiorna', 'prendi', 'risolvi', 'elimina'].includes(az)) return fail(`Azione sconosciuta: ${az}`);
  const { data: v0 } = await db.from('scadenze').select(COLS).eq('id', String(b.id ?? '')).maybeSingle();
  if (!v0) return fail('Voce non trovata: rileggi l\'agenda per avere l\'id giusto.');
  if (!permesso(az, v0 as Voce, io)) return fail(az === 'prendi' ? `Se ne occupa già ${v0.assegnata_a}.`
    : az === 'risolvi' ? "Può segnarla fatta solo chi l'ha creata, chi ce l'ha assegnata o un amministratore." : "Può modificarla o eliminarla solo chi l'ha creata o un amministratore.");
  if (az === 'elimina') {
    const { error } = await db.from('scadenze').delete().eq('id', v0.id);
    return error ? fail(error.message) : { ok: true, testo: `Eliminata: ${v0.titolo}` };
  }
  let patch: Record<string, any>;
  if (az === 'prendi') patch = { assegnata_a: io.email };
  else if (az === 'risolvi') patch = { fatto: true };
  else { const r = pulisciVoce(b, oggi, true); if (r.errore) return fail(r.errore); patch = r.v!; }
  if (!Object.keys(patch).length) return fail('Niente da cambiare.');
  const { data, error } = await db.from('scadenze').update(patch).eq('id', v0.id).select(COLS).single();
  if (error) return fail(error.message);
  const ctx = await contesto(db);
  return { ok: true, voce: data, chi: chi(ctx, io.email),
    testo: az === 'prendi' ? `🙋 Se ne occupa ${chi(ctx, io.email)}: ${v0.titolo}` : az === 'risolvi' ? `✅ Risolta da ${chi(ctx, io.email)}: ${v0.titolo}` : `Aggiornata: ${riga(data as Voce, ctx)}` };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const segreto = process.env.AGENDA_SECRET;
  if (!segreto || req.headers.get('x-agenda-secret') !== segreto) return json(401, { ok: false, errore: 'Non autorizzato' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { ok: false, errore: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY.' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const b = await req.json().catch(() => ({}));
  try { return json(200, await esegui(db, b, new Date(), new URL(req.url).origin)); } catch (e) { return json(200, fail((e as Error).message)); }
}
