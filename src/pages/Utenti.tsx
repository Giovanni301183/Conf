// Scheda Utenti (solo amministratore): invito di nuovi utenti, ruolo, attivazione, reset della password, reparti (mappa della Home).
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { toast } from '../store/actions';
import { CosaVedo } from './Calendario';
import { normVista, vedeTutto } from '../domain/vista';
import { REPARTI, nomeReparto } from '../domain/reparti';
import { cloud, invitaUtente, isAdmin, listUtenti, online, patchUtente, resetPassword, ultimiAccessi, type Utente } from '../store/remote';
import { Ic, IcReparto } from '../components/Icona';
import { Info } from '../components/ui';

const RUOLI = [['utente', 'Utente'], ['admin', 'Amministratore']] as const;
const DOMINIO = '@terranovasrl.net';
const fd = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Utenti() {
  const [list, setList] = useState<Utente[] | null>(null), [err, setErr] = useState('');
  const [email, setEmail] = useState(''), [nome, setNome] = useState(''), [ruolo, setRuolo] = useState('utente'), [busy, setBusy] = useState(false);
  const [accessi, setAccessi] = useState<Record<string, string> | null>(null), [vista, setVista] = useState<Utente | null>(null), [rep, setRep] = useState<string | null>(null);
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
    if (e) toast('Modifica non riuscita: ' + (/reparti/.test(e) ? 'manca la migrazione 20261030010000_reparti.sql nel database' : e)); else toast(msg);
    if (!e && u.email === me && cloud.me) cloud.me = { ...cloud.me, ...p };
    const c = cloud.colleghi.find(x => x.email === u.email); if (!e && c) Object.assign(c, p);
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
        <h2>Invita un utente<Info>Riceve un'email con il link per scegliere la password. Sono ammesse solo email {DOMINIO}.
          L'amministratore può anche eliminare preventivi dall'archivio e gestire gli utenti; gli utenti vedono, creano e modificano tutti i preventivi e il listino.</Info></h2>
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
            <tr><th>Utente</th><th>Ruolo</th><th>Reparti</th><th>Stato</th><th>Accesso</th><th>Aggiunto</th><th></th></tr>
            {list.map(u => {
              const io = u.email === me, rr = u.reparti || [];
              const togli = (k: string) => patch(u, { reparti: rr.includes(k) ? rr.filter(x => x !== k) : [...rr, k] }, `${u.nome || u.email}: reparti aggiornati`);
              return (<Fragment key={u.email}>
                <tr className={u.attivo ? '' : 'off'}>
                  <td><input defaultValue={u.nome ?? ''} placeholder="Nome e cognome" onBlur={e => { const v = e.target.value.trim(); if (v !== (u.nome ?? '')) patch(u, { nome: v || null }, 'Nome aggiornato'); }} />
                    <div className="muted small">{u.email}{io ? ' · sei tu' : ''}</div></td>
                  <td><select value={u.ruolo} disabled={io} title={io ? 'Non puoi cambiare il tuo ruolo' : ''} onChange={e => patch(u, { ruolo: e.target.value as Utente['ruolo'] }, `${u.email}: ruolo aggiornato`)}>
                    {RUOLI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="small"><button className={`btn s${rep === u.email ? ' on' : ''}`} onClick={() => setRep(rep === u.email ? null : u.email)} title="Reparti della mappa nella Home: può averne più di uno">
                    {rr.length ? rr.map(nomeReparto).join(', ') : 'Scegli…'}</button></td>
                  <td>{u.attivo ? <span className="tag on">Attivo</span> : <span className="tag">Disattivato</span>}</td>
                  <td className="small">{cloud.presenti.some(p => p.email === u.email) ? <><span className="dot on" />online ora</>
                    : <span className="muted">{!accessi ? '–' : accessi[u.email] ? 'ultimo: ' + fd(accessi[u.email]) : 'mai entrato'}</span>}</td>
                  <td className="small muted">{u.creato ? new Date(u.creato).toLocaleDateString('it-IT') : '–'}{u.invitato_da ? <div>da {u.invitato_da.split('@')[0]}</div> : null}</td>
                  <td className="acts">
                    <button className={`btn s${vedeTutto(normVista(u.vista)) ? '' : ' on'}`} onClick={() => setVista(u)} title="Cosa vede nel calendario e nel riepilogo Telegram"><Ic n="vedi" />Calendario{vedeTutto(normVista(u.vista)) ? '' : ' · filtrato'}</button>
                    <button className="btn s" onClick={async () => { const e = await resetPassword(u.email); toast(e ? 'Invio non riuscito: ' + e : `Email per la nuova password inviata a ${u.email}`); }}>Reset password</button>
                    {!io && <button className="btn s" onClick={() => (u.attivo ? confirm(`Disattivare ${u.email}? Non potrà più accedere ai preventivi né al listino.`) : true) && patch(u, { attivo: !u.attivo }, u.attivo ? `${u.email} disattivato` : `${u.email} riattivato`)}>{u.attivo ? 'Disattiva' : 'Riattiva'}</button>}
                  </td>
                </tr>
                {rep === u.email && <tr><td colSpan={7}><div className="etqs">
                  {REPARTI.map(r => <button key={r.k} type="button" className={`etq${rr.includes(r.k) ? ' on' : ''}`} onClick={() => togli(r.k)}><IcReparto k={r.k} />{r.nome}</button>)}
                  <button className="btn s" onClick={() => setRep(null)}>Fatto</button></div></td></tr>}
              </Fragment>);
            })}
          </tbody></table>
        )}
      </div></div>
    </>
  );
}
