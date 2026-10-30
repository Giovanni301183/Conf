// «In arrivo» in cima alla Home: le email etichettate «Conf/…» in Gmail (o inoltrate all'agenda) che aspettano una decisione.
// Per ognuna si sceglie cosa diventa: cosa da fare, attesa della risposta, appuntamento, nota, risposta a una voce in attesa, oppure niente.
// Titolo, commessa, temi, giorno e per chi si correggono prima di scegliere. Stessa logica dei pulsanti su Telegram (api/agenda.ts, sceltaPosta).
import { useEffect, useState } from 'react';
import { ETICHETTE } from '../domain/documenti';
import { ATTESA, traGiorniLavorativi } from '../domain/calendario';
import { fDate } from '../domain/format';
import { isoDay } from '../domain/plan';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { arrivo, cloud, loadInArrivo, mioEmail, online, sistemaArrivo, type Arrivo } from '../store/remote';
import { Etq, OpzioniPreventivi } from '../pages/Documenti';
import { ChevBarra, barraAperta, clicBarra, Info } from './ui';
import { Ic } from './Icona';

const scambia = (xx: string[], k: string) => xx.includes(k) ? xx.filter(x => x !== k) : [...xx, k];
// Scelta proposta dall'etichetta di Gmail: in evidenza.
const PROPOSTA: Record<string, string> = { f: 'Da fare', t: 'Attesa risposta', r: 'Riunione' };

// Domanda su un'email entrata da sola in una conversazione già legata a una voce: chiudere (risposta attesa) o riaprire (voce chiusa).
function Domanda({ a }: { a: Arrivo }) {
  const d = a.dati, [busy, setBusy] = useState('');
  const fai = async (scelta: string) => { setBusy(scelta); const r = await sistemaArrivo(a.id, scelta, {}); setBusy(''); toast(r.errore ? 'Non riuscito: ' + r.errore : r.testo || 'Fatto'); commit(); };
  const t = (d.collegata?.titolo || '').replace(ATTESA, '');
  return (
    <div className="arr">
      <div className="arrt">
        <b>{d.domanda === 'chiudi' ? <>È la risposta che aspettavi per «{t}»?</> : <>Nuova email su una voce chiusa: «{t}»</>}</b>
        <small className="muted">{d.mittente ? 'Da ' + d.mittente : ''}{d.oggetto ? ` · «${d.oggetto}»` : ''} · {fDate(a.creato.slice(0, 10))} · già salvata nella voce</small>
        {d.riassunto && <span className="small">{d.riassunto}</span>}
      </div>
      <div className="arrb">
        {d.domanda === 'chiudi'
          ? <><button className="btn s p" disabled={!!busy} onClick={() => fai('c')}><Ic n="conferma" />{busy === 'c' ? 'Salvo…' : 'Sì, chiudi con questo esito'}</button>
            <button className="btn s" disabled={!!busy} onClick={() => fai('k')}><Ic n="attesa" />No, resta in attesa</button></>
          : <><button className="btn s p" disabled={!!busy} onClick={() => fai('o')}><Ic n="riapri" />{busy === 'o' ? 'Salvo…' : 'Riapri la voce'}</button>
            <button className="btn s" disabled={!!busy} onClick={() => fai('k')}>Va bene così</button></>}
      </div>
    </div>
  );
}

function Email({ a }: { a: Arrivo }) {
  const d = a.dati, g = d.gmail;
  // «Collega a…»: una voce aperta scelta a mano (oggetto nuovo che fa parte di un flusso già aperto).
  const [lega, setLega] = useState(false), [voce, setVoce] = useState('');
  const aperte = S.scad.filter(s => !s.fatto).sort((x, y) => x.giorno.localeCompare(y.giorno));
  const [m, setM] = useState({ titolo: d.titolo, preventivo_id: d.preventivo_id || '', etichette: d.etichette || [], giorno: d.giorno || isoDay(traGiorniLavorativi(g?.azione === 't' ? 3 : 1)), ora: d.ora || '', assegnata_a: '' });
  const [corr, setCorr] = useState(false), [busy, setBusy] = useState('');
  const chiAtt = (g?.da_me ? g.a : '') || d.mittente || 'destinatario';
  const fai = async (scelta: string) => {
    setBusy(scelta);
    const r = await sistemaArrivo(a.id, scelta, m);
    setBusy('');
    toast(r.errore ? 'Email non sistemata: ' + r.errore : r.testo || 'Fatto'); commit();
  };
  const b = (scelta: string, ic: Parameters<typeof Ic>[0]['n'], testo: string, titolo: string) => (
    <button className={`btn s${g?.azione === scelta || (scelta === 'v' && d.attesa) ? ' p' : ''}`} disabled={!!busy} onClick={() => fai(scelta)} title={titolo}>
      <Ic n={ic} />{busy === scelta ? 'Salvo…' : testo}</button>);
  return (
    <div className="arr">
      <div className="arrt">
        <b>{m.titolo}</b>
        <small className="muted">{d.mittente ? (g?.da_me ? 'A ' + (g.a || d.mittente) : 'Da ' + d.mittente) : ''}{d.oggetto ? ` · «${d.oggetto}»` : ''} · {fDate(a.creato.slice(0, 10))}
          {d.allegati?.length ? <> · <Ic n="allega" />{d.allegati.length}</> : null}
          {g?.azione ? <> · etichetta <b>{PROPOSTA[g.azione]}</b></> : null}</small>
        {d.riassunto && <span className="small">{d.riassunto}</span>}
        <span className="arretq">{m.preventivo_id && <span className="tag">{S.arch.find(e => e.id === m.preventivo_id)?.nome || 'commessa'}</span>}
          {m.etichette.map(k => <Etq key={k} k={k} />)}</span>
        {d.attesa && <span className="small"><Ic n="attesa" />Sembra la risposta a: <b>{d.attesa.titolo.replace(ATTESA, '')}</b></span>}
        {d.filo?.length ? <span className="small"><Ic n="collega" />Sembra parte di: <b>{d.filo.map(f => f.titolo.replace(ATTESA, '')).join(' · ')}</b></span> : null}
      </div>
      {lega && <div className="cform">
        <label className="f wide"><span>Aggiungi a quale voce aperta<Info>L'email diventa un appunto della voce e le prossime email di questa conversazione entrano da sole.</Info></span><select value={voce} autoFocus onChange={e => setVoce(e.target.value)}>
          <option value="">— scegli —</option>{aperte.map(s => <option key={s.id} value={s.id}>{s.titolo.replace(ATTESA, '')} · {fDate(s.giorno)}</option>)}</select></label>
        <div className="wide" style={{ display: 'flex', gap: 8 }}>
          <button className="btn p" disabled={!voce || !!busy} onClick={async () => { setBusy('l'); const r = await sistemaArrivo(a.id, 'l', { ...m, voce_id: voce }); setBusy(''); toast(r.errore ? 'Email non collegata: ' + r.errore : r.testo || 'Fatto'); commit(); }}>{busy === 'l' ? 'Salvo…' : 'Aggiungi'}</button>
          <button className="btn" onClick={() => setLega(false)}>Annulla</button>
        </div>
      </div>}
      {corr && <div className="cform">
        <label className="f wide">Cosa<input value={m.titolo} maxLength={200} onChange={e => setM({ ...m, titolo: e.target.value })} /></label>
        <label className="f">Commessa<select value={m.preventivo_id} onChange={e => setM({ ...m, preventivo_id: e.target.value })}><option value="">— nessuna —</option><OpzioniPreventivi /></select></label>
        <label className="f">Giorno (o sollecito)<input type="date" value={m.giorno} onChange={e => setM({ ...m, giorno: e.target.value })} /></label>
        <label className="f">Ora (riunione)<input type="time" value={m.ora} onChange={e => setM({ ...m, ora: e.target.value })} /></label>
        {cloud.colleghi.length > 0 && <label className="f">Per chi<select value={m.assegnata_a} onChange={e => setM({ ...m, assegnata_a: e.target.value })}>
          <option value="">— chiunque —</option>
          {cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}</select></label>}
        <div className="f wide">Temi<div className="etqs">{ETICHETTE.map(([k]) => <Etq key={k} k={k} on={m.etichette.includes(k)} onClick={() => setM({ ...m, etichette: scambia(m.etichette, k) })} />)}</div></div>
      </div>}
      <div className="arrb">
        {d.attesa && b('v', 'conferma', 'È la risposta', 'Chiude la voce in attesa con il riassunto e salva l\'email come appunto della voce')}
        {(d.filo || []).map((f, i) => <button key={f.id} className="btn s p" disabled={!!busy} onClick={() => fai('l' + i)} title="L'email diventa un appunto della voce e le prossime email di questa conversazione entrano da sole">
          <Ic n="collega" />{busy === 'l' + i ? 'Salvo…' : 'Aggiungi a: ' + f.titolo.replace(ATTESA, '').slice(0, 40)}</button>)}
        {b('f', 'voce', 'Cosa da fare', `Voce da fare il ${fDate(m.giorno)}, con la nota e gli allegati dell'email`)}
        {b('t', 'attesa', 'Aspetto la risposta', `In attesa di ${chiAtt}, sollecito il ${fDate(m.giorno)}`)}
        {(d.giorno || m.ora) && b('r', 'giorno', 'Appuntamento', `Appuntamento il ${fDate(m.giorno)}${m.ora ? ' alle ' + m.ora : ''}`)}
        {b('a', 'nota', 'Nota', m.preventivo_id ? 'Appunto nei Documenti della commessa, con i temi' : 'Nota libera con i temi')}
        {aperte.length > 0 && <button className={`btn s${lega ? ' on' : ''}`} onClick={() => setLega(!lega)} title="Fa parte di un flusso già aperto: aggiungila a quella voce"><Ic n="collega" />Collega a…</button>}
        <button className={`btn s${corr ? ' on' : ''}`} onClick={() => setCorr(!corr)}>Correggi</button>
        <button className="btn s" disabled={!!busy} onClick={() => fai('x')} title="Non serve: l'email resta solo in Gmail">{busy === 'x' ? '…' : 'Ignora'}</button>
      </div>
    </div>
  );
}

/** Barra «In arrivo»: si rilegge appena c'è l'accesso, ogni minuto e quando si torna sull'app (es. dopo aver etichettato in Gmail).
 *  Senza server o senza email da sistemare non si vede. */
export function InArrivo() {
  const [, aggiorna] = useState(0), dentro = online() && !!cloud.session;
  useEffect(() => {
    if (!dentro) return;
    const leggi = () => loadInArrivo().then(() => aggiorna(x => x + 1), () => {});
    const torna = () => { if (document.visibilityState === 'visible') leggi(); };
    leggi(); const t = setInterval(leggi, 60_000);
    document.addEventListener('visibilitychange', torna);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', torna); };
  }, [dentro]);
  if (!online() || !cloud.session || (!arrivo.vv.length && !arrivo.err)) return null;
  const ap = barraAperta('arrivo');
  return (
    <div className={`card carr${ap ? '' : ' chiusa'}`}>
      <h2 className="hbh" onClick={clicBarra('arrivo')}>In arrivo<span className="tag on">{arrivo.vv.length} da sistemare</span>
        <span className="muted small">email con le etichette «Conf/…» di Gmail</span><span className="sp" /><ChevBarra k="arrivo" /></h2>
      {ap && <>{arrivo.err ? <p className="warn" style={{ margin: 0 }}>Email in arrivo non lette: {arrivo.err}</p> : arrivo.vv.map(a => a.dati.domanda ? <Domanda key={a.id} a={a} /> : <Email key={a.id} a={a} />)}</>}
    </div>
  );
}
