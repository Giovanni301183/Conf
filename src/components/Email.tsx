// Email di aggiornamento da un appunto (nota dei documenti o nota di un evento): prima si danno all'AI le indicazioni
// (a chi, cosa dire in più, tono), poi l'AI scrive la bozza, la si corregge qui
// e si apre già compilata nel Gmail di chi è collegato. I destinatari usati l'ultima volta per la stessa commessa restano in questo browser.
// Dopo l'apertura si può lasciare in agenda un promemoria «Attesa risposta», da spuntare quando la risposta arriva.
import { useState } from 'react';
import { ATTESA, traGiorniLavorativi } from '../domain/calendario';
import { dFmt, dToday, isoDay } from '../domain/plan';
import { conCodice, linkPosta, telefono } from '../domain/posta';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { bozzaEmail, cloud, flussoDisponibile, salvaScadenza } from '../store/remote';

const leggiA = (k: string) => { try { return localStorage.getItem('email-a:' + k) || ''; } catch { return ''; } };
const ricordaA = (k: string, a: string) => { try { localStorage.setItem('email-a:' + k, a); } catch { /* solo una comodità */ } };
// Giorni lavorativi di attesa: 1 se non scelto, poi l'ultimo usato da chi scrive (in questo browser).
const leggiGiorni = () => { try { const n = parseInt(localStorage.getItem('email-attesa') || '', 10); return n >= 0 && n <= 60 ? n : 1; } catch { return 1; } };
const ricordaGiorni = (n: number) => { try { localStorage.setItem('email-attesa', String(n)); } catch { /* solo una comodità */ } };

/** Commessa e voce d'agenda in una riga, per dare all'AI il contesto dell'appunto. */
export function contestoEmail(preventivo_id?: string | null, scadenza_id?: string | null) {
  const e = preventivo_id ? S.arch.find(a => a.id === preventivo_id) : null, s = scadenza_id ? S.scad.find(x => x.id === scadenza_id) : null;
  return [e && `commessa "${e.nome}"${e.prev?.num ? ` (N° ${e.prev.num})` : ''}${e.cliente ? `, cliente ${e.cliente}` : ''}${e.rif ? `, riferimento ${e.rif}` : ''}`,
    s && `voce d'agenda "${s.titolo}" del ${s.giorno}`].filter(Boolean).join('; ');
}

/** Apre la mail compilata: sul telefono nell'app Gmail (come il pulsante di Telegram), sul computer in una scheda nuova
 *  con la finestra di scrittura di Gmail, sull'account di chi è collegato all'app. */
export function apriGmail(a: string, oggetto: string, testo: string) {
  const me = cloud.me?.email || cloud.session?.user.email || '0';
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: a.trim(), su: oggetto, body: testo });
  const web = `https://mail.google.com/mail/u/${encodeURIComponent(me)}/?${q.toString().replace(/\+/g, '%20')}`;
  if (!telefono(navigator.userAgent)) { window.open(web, '_blank'); return; }
  // Se l'app Gmail non c'è la pagina resta visibile: dopo un attimo si ripiega su Gmail web.
  let uscito = false;
  const via = () => { if (document.hidden) uscito = true; };
  document.addEventListener('visibilitychange', via);
  setTimeout(() => { document.removeEventListener('visibilitychange', via); if (!uscito && !document.hidden) window.open(web, '_blank'); }, 1500);
  location.href = linkPosta(a, oggetto, testo, navigator.userAgent).gmail;
}

/** chiave = commessa o voce a cui legare i destinatari ricordati; preventivo = commessa del promemoria «Attesa risposta». */
export function ModuloEmail({ titolo, testo: appunto, contesto, chiave, chiudi, preventivo = null, richiesta0 = '' }:
  { titolo: string; testo: string; contesto: string; chiave: string; chiudi: () => void; preventivo?: string | null; richiesta0?: string }) {
  const [a, setA] = useState(() => leggiA(chiave)), [oggetto, setOggetto] = useState(''), [testo, setTesto] = useState('');
  const [richiesta, setRichiesta] = useState(richiesta0), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [aperta, setAperta] = useState(false), [giorni, setGiorni] = useState(leggiGiorni);
  const scrivi = async () => {
    setBusy(true); setErr('');
    // Con la commessa, il codice [TN-numero] in fondo all'oggetto: la risposta del cliente si lega da sola (vedi posta.ts).
    try { const r = await bozzaEmail({ titolo, testo: appunto, contesto, richiesta }); setOggetto(conCodice(r.oggetto, S.arch.find(e => e.id === preventivo)?.prev?.num)); setTesto(r.testo); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const apri = () => { ricordaA(chiave, a.trim()); apriGmail(a, oggetto, testo); setAperta(true); };
  const attendi = async () => {
    const n = Math.max(0, Math.min(60, Math.round(giorni) || 0)), g = traGiorniLavorativi(n), chi = a.split(',')[0].trim() || 'destinatario';
    setBusy(true);
    const e = await salvaScadenza({ genere: flussoDisponibile() ? 'attivita' : 'promemoria', giorno: isoDay(g), titolo: (ATTESA + chi + (oggetto ? ' — ' + oggetto : '')).slice(0, 200), preventivo_id: preventivo,
      nota: `Email del ${dFmt(dToday())} a ${a.trim() || '—'}. Spunta quando arriva la risposta.`, stato: 'in_attesa', attesa_di: chi, sollecito: isoDay(g) });
    setBusy(false);
    if (e) { toast('Promemoria non salvato: ' + e); return; }
    ricordaGiorni(n); toast(`Ti ricordo la risposta il ${dFmt(g)}`); commit(); chiudi();
  };
  const pronta = !!(oggetto || testo);
  if (aperta) return (
    <div className="cform">
      <p className="wide" style={{ margin: 0 }}><b>Hai mandato l'email da Gmail?</b> Se aspetti una risposta, la metto in agenda: quando arriva, spunti la voce.</p>
      <label className="f">Ricordamelo tra (giorni lavorativi)<input type="number" min={0} max={60} value={giorni} onChange={e => setGiorni(+e.target.value)} />
        <span className="muted small">{giorni > 0 ? 'il ' + dFmt(traGiorniLavorativi(Math.min(60, Math.max(0, Math.round(giorni) || 0)))) : 'oggi'} · il numero resta come predefinito</span></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy} onClick={attendi}>{busy ? 'Salvo…' : 'Sì, aspetto risposta'}</button>
        <button className="btn" onClick={chiudi}>No, non serve</button>
      </div>
    </div>
  );
  return (
    <div className="cform">
      <label className="f wide">Indicazioni per l'AI <span className="muted small">(facoltativo: a chi è rivolta, cosa aggiungere, tono)</span>
        <textarea rows={3} value={richiesta} autoFocus placeholder="es. al cliente Rossi, dagli del lei, aggiungi che il montaggio parte il 10 novembre"
          onChange={e => setRichiesta(e.target.value)} /></label>
      {!pronta && <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy} onClick={scrivi}>{busy ? 'Scrivo la bozza…' : 'Prepara bozza'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>}
      {err && <div className="warn wide">Bozza non scritta: {err}</div>}
      {pronta && <>
      <label className="f wide">A <span className="muted small">(più indirizzi separati da virgola; puoi aggiungerli anche in Gmail)</span>
        <input value={a} placeholder="cliente@esempio.it" onChange={e => setA(e.target.value)} /></label>
      <label className="f wide">Oggetto<input value={oggetto} disabled={busy} onChange={e => setOggetto(e.target.value)} /></label>
      <label className="f wide">Testo<textarea rows={10} value={busy ? 'Scrivo la bozza…' : testo} disabled={busy} onChange={e => setTesto(e.target.value)} /></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !testo.trim()} onClick={apri}>Apri in Gmail</button>
        <button className="btn" disabled={busy} onClick={scrivi} title="Riscrive la bozza con le indicazioni qui sopra">{busy ? 'Scrivo…' : 'Riscrivi'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
      </>}
    </div>
  );
}
