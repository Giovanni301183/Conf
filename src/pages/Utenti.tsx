// Scheda Utenti (solo amministratore): invito di nuovi utenti, ruolo, attivazione, reset della password.
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from '../store/actions';
import { CosaVedo } from './Calendario';
import { normVista, vedeTutto } from '../domain/vista';
import { cloud, invitaUtente, isAdmin, listUtenti, online, patchUtente, resetPassword, ultimiAccessi, type Utente } from '../store/remote';

const RUOLI = [['utente', 'Utente'], ['admin', 'Amministratore']] as const;
const DOMINIO = '@terranovasrl.net';
const fd = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Utenti() {
  const [list, setList] = useState<Utente[] | null>(null), [err, setErr] = useState('');
  const [email, setEmail] = useState(''), [nome, setNome] = useState(''), [ruolo, setRuolo] = useState('utente'), [busy, setBusy] = useState(false);
  const [accessi, setAccessi] = useState<Record<string, string> | null>(null), [vista, setVista] = useState<Utente | null>(null);
  const reload = () => { listUtenti().then(setList, e => setErr((e as Error).message)); ultimiAccessi().then(setAccessi); };
  useEffect(() => { if (online() && isAdmin()) reload(); }, []);

  if (!online()) return (
    <div className="card"><div className="empty">La gestione degli utenti è disponibile solo con l'archivio condiviso sul server (Supabase).
      In questa versione i dati restano nel browser e non ci sono account né ruoli.</div></div>
  );
  if (!isAdmin()) return <div className="card"><div className="empty">Solo l'amministratore può gestire gli utenti. Se ti serve un nuovo account o un cambio di ruolo, chiedi a lui.</div></div>;

  const me = cloud.me?.email;
  const patch = async (u: Utente, p: Partial<Utente>, msg: string) => {
    const e = await patchUtente(u.email, p);
    if (e) toast('Modifica non riuscita: ' + e); else toast(msg);
    reload();
  };
  const invita = async (ev: FormEvent) => {
    ev.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em.endsWith(DOMINIO)) { toast(`Serve un'email aziendale ${DOMINIO}`); return; }
    setBusy(true);
    const r = await invitaUtente(em, nome, ruolo);
    setBusy(false);
    if (r.error) { toast(r.error); return; }
    toast(r.esistente ? `${em} aveva già un account: ora è abilitato` : `Invito inviato a ${em}: riceverà un'email per scegliere la password`);
    setEmail(''); setNome(''); setRuolo('utente'); reload();
  };

  return (
    <>
      <div className="card head">
        <h2>Invita un utente</h2>
        <p className="hint">Riceve un'email con il link per scegliere la password. Sono ammesse solo email {DOMINIO}.
          L'amministratore può anche eliminare preventivi dall'archivio e gestire gli utenti; gli utenti vedono, creano e modificano tutti i preventivi e il listino.</p>
        <form className="grid" onSubmit={invita}>
          <label className="f">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={'nome.cognome' + DOMINIO} required /></label>
          <label className="f">Nome<input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome e cognome" /></label>
          <label className="f">Ruolo<select value={ruolo} onChange={e => setRuolo(e.target.value)}>{RUOLI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div className="f" style={{ justifyContent: 'flex-end' }}><button className="btn p" disabled={busy}>{busy ? 'Invio…' : 'Invia invito'}</button></div>
        </form>
      </div>

      {vista && <div className="card"><CosaVedo key={vista.email} utente={vista} chiudi={() => { setVista(null); reload(); }} /></div>}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="wrap" style={{ border: 0, borderRadius: 0 }}>
        {err ? <div className="empty">Impossibile leggere l'elenco utenti: {err}</div> : !list ? <div className="empty">Caricamento…</div> : (
          <table className="arch"><tbody>
            <tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Accesso</th><th>Aggiunto</th><th></th></tr>
            {list.map(u => {
              const io = u.email === me;
              return (
                <tr key={u.email} className={u.attivo ? '' : 'off'}>
                  <td><input defaultValue={u.nome ?? ''} placeholder="Nome e cognome" onBlur={e => { const v = e.target.value.trim(); if (v !== (u.nome ?? '')) patch(u, { nome: v || null }, 'Nome aggiornato'); }} />
                    <div className="muted small">{u.email}{io ? ' · sei tu' : ''}</div></td>
                  <td><select value={u.ruolo} disabled={io} title={io ? 'Non puoi cambiare il tuo ruolo' : ''} onChange={e => patch(u, { ruolo: e.target.value as Utente['ruolo'] }, `${u.email}: ruolo aggiornato`)}>
                    {RUOLI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td>{u.attivo ? <span className="tag on">Attivo</span> : <span className="tag">Disattivato</span>}</td>
                  <td className="small">{cloud.presenti.some(p => p.email === u.email) ? <><span className="dot on" />online ora</>
                    : <span className="muted">{!accessi ? '–' : accessi[u.email] ? 'ultimo: ' + fd(accessi[u.email]) : 'mai entrato'}</span>}</td>
                  <td className="small muted">{u.creato ? new Date(u.creato).toLocaleDateString('it-IT') : '–'}{u.invitato_da ? <div>da {u.invitato_da.split('@')[0]}</div> : null}</td>
                  <td className="acts">
                    <button className={`btn s${vedeTutto(normVista(u.vista)) ? '' : ' on'}`} onClick={() => setVista(u)} title="Cosa vede nel calendario e nel riepilogo Telegram">👁 Calendario{vedeTutto(normVista(u.vista)) ? '' : ' · filtrato'}</button>
                    <button className="btn s" onClick={async () => { const e = await resetPassword(u.email); toast(e ? 'Invio non riuscito: ' + e : `Email per la nuova password inviata a ${u.email}`); }}>Reset password</button>
                    {!io && <button className="btn s" onClick={() => (u.attivo ? confirm(`Disattivare ${u.email}? Non potrà più accedere ai preventivi né al listino.`) : true) && patch(u, { attivo: !u.attivo }, u.attivo ? `${u.email} disattivato` : `${u.email} riattivato`)}>{u.attivo ? 'Disattiva' : 'Riattiva'}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </div></div>
    </>
  );
}
