// Email di aggiornamento da un appunto (nota dei documenti o nota di un evento): l'AI scrive la bozza, la si corregge qui
// e si apre già compilata nel Gmail di chi è collegato. I destinatari usati l'ultima volta per la stessa commessa restano in questo browser.
import { useEffect, useState } from 'react';
import { S } from '../store/state';
import { bozzaEmail, cloud } from '../store/remote';

const leggiA = (k: string) => { try { return localStorage.getItem('email-a:' + k) || ''; } catch { return ''; } };
const ricordaA = (k: string, a: string) => { try { localStorage.setItem('email-a:' + k, a); } catch { /* solo una comodità */ } };

/** Commessa e voce d'agenda in una riga, per dare all'AI il contesto dell'appunto. */
export function contestoEmail(preventivo_id?: string | null, scadenza_id?: string | null) {
  const e = preventivo_id ? S.arch.find(a => a.id === preventivo_id) : null, s = scadenza_id ? S.scad.find(x => x.id === scadenza_id) : null;
  return [e && `commessa "${e.nome}"${e.prev?.num ? ` (N° ${e.prev.num})` : ''}${e.cliente ? `, cliente ${e.cliente}` : ''}${e.rif ? `, riferimento ${e.rif}` : ''}`,
    s && `voce d'agenda "${s.titolo}" del ${s.giorno}`].filter(Boolean).join('; ');
}

/** Apre in una scheda nuova la finestra di scrittura di Gmail, sull'account di chi è collegato all'app. */
export function apriGmail(a: string, oggetto: string, testo: string) {
  const me = cloud.me?.email || cloud.session?.user.email || '0';
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: a.trim(), su: oggetto, body: testo });
  window.open(`https://mail.google.com/mail/u/${encodeURIComponent(me)}/?${q.toString().replace(/\+/g, '%20')}`, '_blank');
}

/** chiave = commessa o voce a cui legare i destinatari ricordati. */
export function ModuloEmail({ titolo, testo: appunto, contesto, chiave, chiudi }: { titolo: string; testo: string; contesto: string; chiave: string; chiudi: () => void }) {
  const [a, setA] = useState(() => leggiA(chiave)), [oggetto, setOggetto] = useState(''), [testo, setTesto] = useState('');
  const [richiesta, setRichiesta] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const scrivi = async () => {
    setBusy(true); setErr('');
    try { const r = await bozzaEmail({ titolo, testo: appunto, contesto, richiesta }); setOggetto(r.oggetto); setTesto(r.testo); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { scrivi(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const apri = () => { ricordaA(chiave, a.trim()); apriGmail(a, oggetto, testo); chiudi(); };
  return (
    <div className="cform">
      <label className="f wide">A <span className="muted small">(più indirizzi separati da virgola; puoi aggiungerli anche in Gmail)</span>
        <input value={a} placeholder="cliente@esempio.it" onChange={e => setA(e.target.value)} /></label>
      <label className="f wide">Oggetto<input value={oggetto} disabled={busy} onChange={e => setOggetto(e.target.value)} /></label>
      <label className="f wide">Testo<textarea rows={10} value={busy ? 'Scrivo la bozza…' : testo} disabled={busy} onChange={e => setTesto(e.target.value)} /></label>
      <label className="f wide">Indicazioni per l'AI <span className="muted small">(facoltativo, poi «Riscrivi»)</span>
        <input value={richiesta} placeholder="es. più breve, dai del tu, rivolta al fornitore" onChange={e => setRichiesta(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scrivi(); } }} /></label>
      {err && <div className="warn wide">Bozza non scritta: {err}</div>}
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !testo.trim()} onClick={apri}>Apri in Gmail</button>
        <button className="btn" disabled={busy} onClick={scrivi}>{busy ? 'Scrivo…' : 'Riscrivi'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}
