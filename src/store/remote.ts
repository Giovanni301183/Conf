// Archivio e listino condivisi su Supabase. Senza Supabase configurato tutto resta nel browser come prima.
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { linkType, supabase } from '../lib/supabase';
import { KEY_ARCH, KEY_DRAFT, S, commit, load, setSaveHook, store, unstore } from './state';

type Fase = 'locale' | 'avvio' | 'login' | 'password' | 'carico' | 'pronto' | 'negato' | 'errore';
export interface Utente { email: string; nome: string | null; ruolo: 'admin' | 'utente'; attivo: boolean; creato?: string; invitato_da?: string | null }
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

/* ---------- Accesso ---------- */
async function loadAll() {
  cloud.fase = 'carico'; cloud.err = ''; commit();
  try {
    if (!(await loadMe())) { cloud.fase = 'negato'; commit(); return; }
    await Promise.all([loadArch(), loadListino(true)]);
    if (S.prev._id && !S.arch.some(e => e.id === S.prev._id)) delete S.prev._id;
    cloud.fase = 'pronto';
    joinPresenza();
  } catch (err) { cloud.fase = 'errore'; cloud.err = (err as Error).message; }
  commit();
}
// Al ritorno sulla finestra si rileggono archivio e listino, per vedere il lavoro dei colleghi.
async function refresh() {
  if (cloud.fase !== 'pronto') return;
  try { await Promise.all([loadArch(), loadListino(false)]); commit(); } catch { /* si riprova al prossimo ritorno */ }
}

export function initCloud() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((ev, session) => {
    const prima = cloud.session?.user.id;
    cloud.session = session;
    if (ev === 'PASSWORD_RECOVERY' || (session && linkType && cloud.fase === 'avvio')) { cloud.fase = 'password'; commit(); return; }
    if (!session) { leavePresenza(); cloud.fase = 'login'; commit(); return; }
    if (session.user.id !== prima && cloud.fase !== 'password') { leavePresenza(); setTimeout(loadAll); }   // fuori dalla callback: evita blocchi del client
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
  leavePresenza();
  await supabase!.auth.signOut();
  S.arch = []; synced = ''; listinoTs = ''; cloud.me = null;
}
