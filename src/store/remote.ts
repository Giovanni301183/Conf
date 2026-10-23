// Archivio e listino condivisi su Supabase. Senza Supabase configurato tutto resta nel browser come prima.
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { linkType, supabase } from '../lib/supabase';
import type { Scadenza } from '../domain/calendario';
import { LIMITE_MB, percorsoPer, type Documento } from '../domain/documenti';
import { KEY_ARCH, KEY_DRAFT, KEY_SCAD, S, commit, load, setSaveHook, store, unstore } from './state';

type Fase = 'locale' | 'avvio' | 'login' | 'password' | 'carico' | 'pronto' | 'negato' | 'errore';
export interface Utente { email: string; nome: string | null; ruolo: 'admin' | 'utente'; attivo: boolean; creato?: string; invitato_da?: string | null; telegram_id?: number | null }
export const cloud = {
  fase: (supabase ? 'avvio' : 'locale') as Fase,
  session: null as Session | null,
  // Riga dell'elenco utenti di chi e' collegato: ruolo e attivazione.
  me: null as Utente | null,
  // Chi ha l'app aperta in questo momento (presenza in tempo reale), un elemento per persona.
  presenti: [] as { email: string; nome: string | null }[],
  sync: 'ok' as 'ok' | 'salvo' | 'errore',
  err: '',
  // Preventivi rimasti nell'archivio del browser e non ancora caricati sul server.
  locali: [] as any[],
  // Errore nel leggere le scadenze (es. tabella non ancora creata): il resto dell'app funziona lo stesso.
  scadErr: '',
  // Colleghi attivi, per assegnare le voci dell'agenda.
  colleghi: [] as Utente[],
  // Errore nel leggere i documenti (es. migrazione 20261022000000_documenti.sql non ancora eseguita).
  docErr: '',
};
export const online = () => !!supabase;
let toastFn = (_: string) => {};
export function setCloudToast(f: (m: string) => void) { toastFn = f; }

/* ---------- Righe del database ⇄ voci dell'archivio ---------- */
const toRow = (e: any) => ({
  id: e.id, nome: e.nome, cliente: e.cliente ?? null, rif: e.rif ?? null, data: e.data ?? null, salvato: e.salvato,
  totale: e.totale ?? null, prezzo: e.prezzo ?? null, kwp: e.kwp ?? null, n_tracker: e.nTracker ?? null, righe: e.righe ?? null,
  prev: e.prev, dati: e.dati ?? null, modificato_da: cloud.session?.user.email ?? null,
});
const fromRow = (r: any) => ({
  id: r.id, nome: r.nome, cliente: r.cliente ?? '', rif: r.rif ?? '', data: r.data ?? '', salvato: r.salvato,
  totale: r.totale, prezzo: r.prezzo, kwp: r.kwp, nTracker: r.n_tracker, righe: r.righe ?? '', prev: r.prev, dati: r.dati,
  autore: r.modificato_da || r.creato_da || '',
});

function fail(what: string, err: { message: string }) {
  cloud.sync = 'errore'; commit();
  toastFn(`Errore di rete (${what}): ${err.message}`);
}

/* ---------- Archivio ---------- */
const snap = (o: unknown) => JSON.stringify(o, (k, v) => (k === '_imp' ? undefined : v));
export async function pushArch(entries: any[]) {
  if (!supabase || !entries.length) return true;
  cloud.sync = 'salvo'; commit();
  const { error } = await supabase.from('preventivi').upsert(entries.map(toRow));
  if (error) { fail('salvataggio preventivo', error); return false; }
  cloud.sync = 'ok'; commit(); return true;
}
export async function delArch(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('preventivi').delete().eq('id', id);
  if (error) fail('eliminazione preventivo', error);
}
async function loadArch() {
  const { data, error } = await supabase!.from('preventivi').select('*').order('salvato', { ascending: false });
  if (error) throw error;
  S.arch = data.map(fromRow);
  const ids = new Set(S.arch.map(e => e.id));
  cloud.locali = (load(KEY_ARCH) || []).filter((e: any) => !ids.has(e.id));
  // La bozza di un preventivo già salvato identico sul server non è una bozza.
  const dr = load(KEY_DRAFT), e = dr?._id && S.arch.find(x => x.id === dr._id);
  if (e && snap(e.prev) === snap(dr)) unstore(KEY_DRAFT);
}
/** Carica sul server i preventivi dell'archivio del browser; la copia locale resta come backup. */
export async function uploadLocali() {
  const n = cloud.locali.length;
  if (!(await pushArch(cloud.locali))) return;
  store(KEY_ARCH + '_caricato', load(KEY_ARCH)); unstore(KEY_ARCH);
  await loadArch(); commit();
  toastFn(`${n} preventiv${n === 1 ? 'o caricato' : 'i caricati'} sul server`);
}

/* ---------- Listino ---------- */
// Il listino si salva sul server poco dopo l'ultima modifica; "synced" è l'ultima versione nota al server.
let synced = '', listinoTs = '', timer: number | undefined;
async function pushListino() {
  const j = JSON.stringify(S.data);
  if (j === synced) return;
  cloud.sync = 'salvo'; commit();
  const { data, error } = await supabase!.from('listino').upsert({ id: 1, dati: S.data, aggiornato: new Date().toISOString(), modificato_da: cloud.session?.user.email }).select('aggiornato').single();
  if (error) { fail('salvataggio listino', error); return; }
  synced = j; listinoTs = data.aggiornato; cloud.sync = 'ok'; commit();
}
async function loadListino(force: boolean) {
  const { data, error } = await supabase!.from('listino').select('dati, aggiornato').maybeSingle();
  if (error) throw error;
  if (!data) { await pushListino(); return; }                 // primo accesso: il server prende il listino di questo browser
  if (data.aggiornato === listinoTs) return;
  // Le modifiche di un collega arrivano solo se qui non ci sono modifiche al listino ancora da inviare.
  if (!force && JSON.stringify(S.data) !== synced) return;
  S.data = data.dati; synced = JSON.stringify(S.data); listinoTs = data.aggiornato;
  store('tracker_prev_data_v1', S.data);
}
setSaveHook(() => {
  if (cloud.fase !== 'pronto') return;
  clearTimeout(timer); timer = window.setTimeout(pushListino, 1200);
});

/* ---------- Utenti e ruoli ---------- */
// Senza server (solo browser) non ci sono ruoli: chi usa l'app puo' fare tutto.
export const isAdmin = () => !supabase || cloud.me?.ruolo === 'admin';
async function loadMe() {
  const email = cloud.session?.user.email?.toLowerCase() ?? '';
  const { data, error } = await supabase!.from('utenti').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  cloud.me = data;
  return !!data?.attivo;
}
export async function listUtenti(): Promise<Utente[]> {
  const { data, error } = await supabase!.from('utenti').select('*').order('email');
  if (error) throw error;
  return data;
}
export async function patchUtente(email: string, patch: Partial<Utente>) {
  const { error } = await supabase!.from('utenti').update(patch).eq('email', email);
  return error ? (error.message.includes('amministratore attivo') ? 'Serve almeno un amministratore attivo.' : error.message) : '';
}
// L'invito passa dalla funzione /api/utenti, l'unica con la chiave segreta per creare account.
export async function invitaUtente(email: string, nome: string, ruolo: string): Promise<{ error?: string; esistente?: boolean }> {
  try {
    const r = await fetch('/api/utenti', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cloud.session?.access_token}` }, body: JSON.stringify({ email, nome, ruolo }) });
    const j = await r.json().catch(() => ({ error: `Risposta non valida dal server (${r.status})` }));
    return r.ok ? j : { error: j.error || `Errore ${r.status}` };
  } catch (err) { return { error: (err as Error).message }; }
}
// Il PDF dell'offerta passa dalla funzione /api/pdf, l'unica con la chiave di ConvertAPI (la stessa del bot Telegram).
export async function pdfOfferta(pptx: Blob): Promise<Blob> {
  const r = await fetch('/api/pdf', { method: 'POST', headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${cloud.session?.access_token}` }, body: pptx });
  if (r.ok) return r.blob();
  if (r.status === 413) throw new Error('il PowerPoint è troppo grande da convertire (prova con un layout più leggero)');
  const j = await r.json().catch(() => ({}));
  throw new Error(j.error || `errore ${r.status}`);
}

// Condizioni di progetto dalla localita' (categoria di esposizione, corrosivita', altitudine): /api/sito, come il modulo Telegram.
export async function propostaSito(localita: string, lat: number | null, lng: number | null): Promise<any> {
  const r = await fetch('/api/sito', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cloud.session?.access_token}` }, body: JSON.stringify({ localita, lat, lng }) });
  const j = await r.json().catch(() => ({ ok: false, errore: `Risposta non valida dal server (${r.status})` }));
  if (!j.ok) throw new Error(j.errore || `errore ${r.status}`);
  return j;
}

// L'assistente passa dalla funzione /api/assistente, l'unica con la chiave di Anthropic.
export async function chiediAssistente(body: unknown): Promise<{ messages: unknown[]; testo: string; proposte: any[] }> {
  const r = await fetch('/api/assistente', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cloud.session?.access_token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `Risposta non valida dal server (${r.status})` }));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}
// Bozza dell'email di aggiornamento scritta dall'AI a partire da un appunto.
export async function bozzaEmail(body: { titolo: string; testo: string; contesto?: string; richiesta?: string }): Promise<{ oggetto: string; testo: string }> {
  const r = await fetch('/api/email', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cloud.session?.access_token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `Risposta non valida dal server (${r.status})` }));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

// Presenza: ogni finestra aperta si annuncia sul canale; chiudendola (o uscendo) sparisce dall'elenco.
let presenza: RealtimeChannel | null = null;
function joinPresenza() {
  const me = cloud.me; if (!me || presenza) return;
  const ch = supabase!.channel('presenza', { config: { presence: { key: me.email } } });
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState<{ email: string; nome: string | null }>();
    cloud.presenti = Object.values(st).map(v => v[0]).filter(Boolean).sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
    commit();
  }).subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ email: me.email, nome: me.nome }); });
  presenza = ch;
}
function leavePresenza() { if (presenza) supabase!.removeChannel(presenza); presenza = null; cloud.presenti = []; }
// Ultimo accesso per ogni email (solo per l'amministratore; null se la funzione sul database manca).
export async function ultimiAccessi(): Promise<Record<string, string> | null> {
  const { data, error } = await supabase!.rpc('ultimi_accessi');
  return error || !data ? null : Object.fromEntries(data.map((r: any) => [r.email, r.ultimo_accesso]));
}

/* ---------- Scadenze del calendario ---------- */
// Senza server le scadenze restano nel browser; con il server si rileggono a ogni modifica, anche dei colleghi.
const SCAD_COLS = 'id, giorno, ora, genere, categoria, titolo, nota, preventivo_id, assegnata_a, fatto, origine, creato_da, creato';
export const mioEmail = () => cloud.session?.user.email?.toLowerCase() ?? '';
export const puoModificare = (s: Scadenza) => isAdmin() || s.creato_da === mioEmail();
// Chi ha la voce assegnata puo' solo segnarla come fatta (lo garantisce anche il database).
export const puoSpuntare = (s: Scadenza) => puoModificare(s) || s.assegnata_a === mioEmail();
async function loadScadenze() {
  listUtenti().then(u => { cloud.colleghi = u.filter(x => x.attivo); }, () => {});
  const { data, error } = await supabase!.from('scadenze').select(SCAD_COLS).order('giorno');
  if (error) { cloud.scadErr = error.message; S.scad = []; return; }
  cloud.scadErr = ''; S.scad = data;
}
export async function salvaScadenza(s: Partial<Scadenza>): Promise<string> {
  const v = { giorno: s.giorno, ora: s.ora || null, genere: s.genere || 'attivita', categoria: s.categoria || null, titolo: (s.titolo || '').trim(), nota: s.nota?.trim() || null,
    preventivo_id: s.preventivo_id || null, assegnata_a: s.assegnata_a || null, fatto: !!s.fatto };
  if (!v.titolo || !v.giorno) return 'Servono titolo e data.';
  if (!supabase) {
    const i = S.scad.findIndex(x => x.id === s.id);
    if (i >= 0) S.scad[i] = { ...S.scad[i], ...v };
    else S.scad.push({ ...v, id: 's' + Date.now().toString(36), origine: 'app', creato_da: '', creato: new Date().toISOString() });
    store(KEY_SCAD, S.scad); return '';
  }
  const { error } = s.id ? await supabase.from('scadenze').update(v).eq('id', s.id) : await supabase.from('scadenze').insert(v);
  if (error) return error.message;
  await loadScadenze(); return '';
}
export async function spuntaScadenza(s: Scadenza): Promise<string> {
  if (!supabase) return salvaScadenza({ ...s, fatto: !s.fatto });
  const { error } = await supabase.from('scadenze').update({ fatto: !s.fatto }).eq('id', s.id);
  if (error) return error.message;
  await loadScadenze(); return '';
}
export async function eliminaScadenza(id: string): Promise<string> {
  if (!supabase) { S.scad = S.scad.filter(x => x.id !== id); store(KEY_SCAD, S.scad); return ''; }
  const { error } = await supabase.from('scadenze').delete().eq('id', id);
  if (error) return error.message;
  await loadScadenze(); return '';
}
let scadCh: RealtimeChannel | null = null;
function joinScadenze() {
  if (scadCh) return;
  scadCh = supabase!.channel('scadenze').on('postgres_changes', { event: '*', schema: 'public', table: 'scadenze' }, async () => { await loadScadenze(); commit(); }).subscribe();
}
function leaveScadenze() { if (scadCh) supabase!.removeChannel(scadCh); scadCh = null; }

/* ---------- Documenti e note ---------- */
// I file vanno nello Storage (cartella privata "documenti"), i dati nella tabella documenti.
// Prima si carica il file, poi la riga; se la riga non si salva, il file si toglie. Eliminando: prima il file, poi la riga.
const BUCKET = 'documenti';
export const puoGestireDoc = (d: Documento) => isAdmin() || d.creato_da === mioEmail();
async function loadDocumenti() {
  const { data, error } = await supabase!.from('documenti').select('*').order('creato', { ascending: false });
  if (error) { cloud.docErr = error.message; S.docs = []; return; }
  cloud.docErr = ''; S.docs = data;
}
const dbErr = (m: string) => (/documenti_legato/.test(m) ? "il documento deve restare legato a un preventivo o a una voce d'agenda" : m);
export async function caricaFile(f: File, dove: { preventivo_id?: string | null; scadenza_id?: string | null }, cartella: string): Promise<string> {
  if (!supabase) return 'I documenti si salvano solo con il server.';
  if (f.size > LIMITE_MB * 1024 * 1024) return `"${f.name}" supera ${LIMITE_MB} MB.`;
  const percorso = percorsoPer(dove.preventivo_id || null, crypto.randomUUID(), f.name);
  const up = await supabase.storage.from(BUCKET).upload(percorso, f, { contentType: f.type || undefined, upsert: false });
  if (up.error) return `"${f.name}" non caricato: ${up.error.message}`;
  const { error } = await supabase.from('documenti').insert({ preventivo_id: dove.preventivo_id || null, scadenza_id: dove.scadenza_id || null, cartella, tipo: 'file',
    titolo: f.name.slice(0, 200), percorso, mime: f.type || null, dimensione: f.size });
  if (error) { await supabase.storage.from(BUCKET).remove([percorso]); return `"${f.name}" non salvato: ${dbErr(error.message)}`; }
  return '';
}
export async function salvaNota(n: { id?: string; titolo: string; testo: string; cartella: string; preventivo_id?: string | null; scadenza_id?: string | null }): Promise<string> {
  if (!supabase) return 'Le note si salvano solo con il server.';
  const v = { titolo: n.titolo.trim().slice(0, 200), testo: n.testo.trim() || null, cartella: n.cartella };
  if (!v.titolo) return 'Serve un titolo.';
  const { error } = n.id ? await supabase.from('documenti').update(v).eq('id', n.id)
    : await supabase.from('documenti').insert({ ...v, tipo: 'nota', preventivo_id: n.preventivo_id || null, scadenza_id: n.scadenza_id || null });
  if (error) return dbErr(error.message);
  await loadDocumenti(); return '';
}
export async function aggiornaDoc(id: string, patch: Partial<Pick<Documento, 'titolo' | 'cartella' | 'testo'>>): Promise<string> {
  const { error } = await supabase!.from('documenti').update(patch).eq('id', id);
  if (error) return dbErr(error.message);
  await loadDocumenti(); return '';
}
export async function eliminaDoc(d: Documento): Promise<string> {
  if (d.percorso) { const { error } = await supabase!.storage.from(BUCKET).remove([d.percorso]); if (error) return error.message; }
  const { error } = await supabase!.from('documenti').delete().eq('id', d.id);
  if (error) return error.message;
  await loadDocumenti(); return '';
}
export async function ricaricaDocumenti() { if (supabase) await loadDocumenti(); }
/** Link temporaneo (1 ora) per aprire o scaricare un file. */
export async function linkDoc(d: Documento, scarica = false): Promise<string> {
  const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(d.percorso!, 3600, scarica ? { download: d.titolo } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
/** Anteprime delle foto: link temporanei per piu' file in una sola richiesta. */
export async function linkAnteprime(dd: Documento[]): Promise<Record<string, string>> {
  const pp = dd.filter(d => d.percorso).map(d => d.percorso!);
  if (!supabase || !pp.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(pp, 3600);
  return Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
}
let docCh: RealtimeChannel | null = null;
function joinDocumenti() {
  if (docCh) return;
  docCh = supabase!.channel('documenti').on('postgres_changes', { event: '*', schema: 'public', table: 'documenti' }, async () => { await loadDocumenti(); commit(); }).subscribe();
}
function leaveDocumenti() { if (docCh) supabase!.removeChannel(docCh); docCh = null; }

/* ---------- Telegram ---------- */
// Codice di 6 cifre (valido 10 minuti) da scrivere al bot come "/collega 123456"; lo abbina /api/agenda.
export async function codiceTelegram(): Promise<{ codice?: string; error?: string }> {
  const { data, error } = await supabase!.rpc('codice_telegram');
  return error ? { error: /codice_telegram/.test(error.message) ? "Al database manca l'aggiornamento per Telegram (migrazione 20261021000000_telegram.sql)." : error.message } : { codice: data };
}
export async function scollegaTelegram() {
  const { error } = await supabase!.rpc('scollega_telegram');
  if (!error) await loadMe();
  return error ? error.message : '';
}
export async function ricaricaMe() { await loadMe().catch(() => {}); }

/* ---------- Accesso ---------- */
async function loadAll() {
  cloud.fase = 'carico'; cloud.err = ''; commit();
  try {
    if (!(await loadMe())) { cloud.fase = 'negato'; commit(); return; }
    await Promise.all([loadArch(), loadListino(true), loadScadenze(), loadDocumenti()]);
    if (S.prev._id && !S.arch.some(e => e.id === S.prev._id)) delete S.prev._id;
    cloud.fase = 'pronto';
    joinPresenza(); joinScadenze(); joinDocumenti();
  } catch (err) { cloud.fase = 'errore'; cloud.err = (err as Error).message; }
  commit();
}
// Al ritorno sulla finestra si rileggono archivio e listino, per vedere il lavoro dei colleghi.
async function refresh() {
  if (cloud.fase !== 'pronto') return;
  try { await Promise.all([loadArch(), loadListino(false), loadScadenze(), loadDocumenti()]); commit(); } catch { /* si riprova al prossimo ritorno */ }
}

export function initCloud() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((ev, session) => {
    const prima = cloud.session?.user.id;
    cloud.session = session;
    if (ev === 'PASSWORD_RECOVERY' || (session && linkType && cloud.fase === 'avvio')) { cloud.fase = 'password'; commit(); return; }
    if (!session) { leavePresenza(); leaveScadenze(); leaveDocumenti(); cloud.fase = 'login'; commit(); return; }
    if (session.user.id !== prima && cloud.fase !== 'password') { leavePresenza(); leaveScadenze(); leaveDocumenti(); setTimeout(loadAll); }   // fuori dalla callback: evita blocchi del client
  });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

export async function login(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
  return error ? (error.message === 'Invalid login credentials' ? 'Email o password non corretti.' : error.message) : '';
}
export async function resetPassword(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
  return error ? error.message : '';
}
export async function setPassword(password: string) {
  const { error } = await supabase!.auth.updateUser({ password });
  if (error) return error.message;
  history.replaceState(null, '', location.pathname);
  await loadAll();
  return '';
}
export async function logout() {
  if (cloud.sync === 'salvo' || (cloud.fase === 'pronto' && JSON.stringify(S.data) !== synced)) await pushListino();
  leavePresenza(); leaveScadenze(); leaveDocumenti();
  await supabase!.auth.signOut();
  S.arch = []; S.scad = []; S.docs = []; synced = ''; listinoTs = ''; cloud.me = null;
}
