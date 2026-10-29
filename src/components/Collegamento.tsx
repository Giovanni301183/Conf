// Chat di squadra legata a note e voci d'agenda: l'etichetta cliccabile sul messaggio (apre la nota o la voce in primo piano),
// la scelta di cosa collegare (📌 nella chat) e, sulla nota o sulla voce, «💬 Discuti» con i messaggi che ne parlano.
import { useState } from 'react';
import { GENERI, inAttesa } from '../domain/calendario';
import { fDate } from '../domain/format';
import { messaggiDi, nomeDi, type Rif } from '../domain/squadra';
import { S } from '../store/state';
import { cloud, online, squadra } from '../store/remote';
import { apriChat, apriScheda } from './pannelli';
import { Ic, type NomeIcona } from './Icona';

const parole = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const tutte = (t: string, pp: string[]) => { const s = t.toLowerCase(); return pp.every(p => s.includes(p)); };

/** Icona e nome di quello a cui è legato il messaggio; null se non c'è più. */
export function nomeRif(r: Rif): { ic: NomeIcona; t: string } | null {
  if (r.tipo === 'doc') {
    const d = S.docs.find(x => x.id === r.id);
    return d ? { ic: d.tipo === 'nota' ? 'nota' : 'allega', t: `${d.tipo === 'nota' ? 'Nota' : 'File'}: ${d.titolo}` } : null;
  }
  const s = S.scad.find(x => x.id === r.id);
  return s ? { ic: 'voce', t: `${inAttesa(s) ? 'Attesa risposta' : GENERI[s.genere]?.[0] || 'Voce'}: ${inAttesa(s) ? s.titolo.replace(/^✉ Attesa risposta · /, '') : s.titolo}${s.fatto ? ' · ✓ fatta' : ''}` } : null;
}

/** Etichetta sul messaggio: apre la nota o la voce in primo piano. */
export function RifChip({ r, onTogli }: { r: Rif; onTogli?: () => void }) {
  const n = nomeRif(r);
  return <span className="sqrif">
    <button type="button" onClick={e => { e.stopPropagation(); if (n) apriScheda(r); }} disabled={!n} title={n ? 'Apri' : 'Non c\'è più: è stata eliminata'}>
      {n ? <><Ic n={n.ic} />{n.t}</> : <><Ic n="lega" />eliminata</>}</button>
    {onTogli && <button type="button" className="sqact" onClick={e => { e.stopPropagation(); onTogli(); }} title="Togli il collegamento">✕</button>}
  </span>;
}

/** Scelta di cosa collegare: note e voci d'agenda (anche fatte). Senza parole, prima quelle della stanza aperta, poi le più recenti. */
export function ScegliRif({ stanza, onScegli, chiudi }: { stanza: string | null; onScegli: (r: Rif) => void; chiudi: () => void }) {
  const [q, setQ] = useState(''), pp = parole(q);
  const comm = (id: string | null) => (id && S.arch.find(e => e.id === id)?.nome) || '';
  const qui = (id: string | null) => (stanza && id === stanza ? 0 : 1);
  const note = S.docs.filter(d => d.tipo === 'nota' && tutte(`${d.titolo} ${d.testo || ''} ${comm(d.preventivo_id)}`, pp))
    .sort((a, b) => qui(a.preventivo_id) - qui(b.preventivo_id) || (b.modificato || b.creato).localeCompare(a.modificato || a.creato)).slice(0, 6);
  const voci = S.scad.filter(s => tutte(`${s.titolo} ${s.nota || ''} ${comm(s.preventivo_id)} ${GENERI[s.genere]?.[0] || ''}`, pp))
    .sort((a, b) => qui(a.preventivo_id) - qui(b.preventivo_id) || +a.fatto - +b.fatto || b.giorno.localeCompare(a.giorno)).slice(0, 6);
  const riga = (r: Rif, sotto: string) => { const n = nomeRif(r)!; return (
    <button key={r.id} type="button" className="qsr" onClick={() => onScegli(r)}><i><Ic n={n.ic} className="solo" /></i><span><b>{n.t}</b><small>{sotto}</small></span></button>); };
  return (
    <div className="sqscegli">
      <div className="sqscegli-h"><input autoFocus value={q} placeholder="Collega a una nota o a una voce d'agenda: scrivi due parole…" onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') chiudi(); }} />
        <button type="button" className="btn x" onClick={chiudi} title="Chiudi">✕</button></div>
      <div className="sqscegli-l">
        {note.length > 0 && <h4>Note</h4>}
        {note.map(d => riga({ tipo: 'doc', id: d.id }, [fDate(d.creato.slice(0, 10)), comm(d.preventivo_id) || 'libera'].join(' · ')))}
        {voci.length > 0 && <h4>Agenda e allarmi</h4>}
        {voci.map(s => riga({ tipo: 'voce', id: s.id }, [fDate(s.giorno), comm(s.preventivo_id), s.assegnata_a ? 'per ' + nomeDi(s.assegnata_a, cloud.colleghi) : ''].filter(Boolean).join(' · ')))}
        {!note.length && !voci.length && <div className="qsvuoto">Niente trovato.</div>}
      </div>
    </div>
  );
}

/** Sulla nota o sulla voce: «💬 Discuti» apre la chat con il messaggio già legato; se se ne è già parlato, «💬 N» mostra i messaggi. */
export function Discuti({ r, stanza }: { r: Rif; stanza: string | null }) {
  const [vedi, setVedi] = useState(false);
  if (!online() || !cloud.session || squadra.err) return null;
  const mm = messaggiDi(squadra.mm, r);
  return <>
    <button className="btn s" onClick={() => (mm.length ? setVedi(!vedi) : apriChat(stanza, r))}
      title={mm.length ? 'Vedi i messaggi della chat di squadra che ne parlano' : 'Scrivi in chat di squadra un messaggio legato a questa voce'}>
      <Ic n="chat" />{mm.length ? mm.length : 'Discuti'}</button>
    {vedi && <div className="sqdisc">
      {mm.map(m => <div key={m.id} className="small"><b>{nomeDi(m.creato_da, cloud.colleghi)}</b> <span className="muted">{fDate(m.creato.slice(0, 10))} {new Date(m.creato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
        <div>{m.testo || (m.documento_id ? <><Ic n="allega" />{S.docs.find(d => d.id === m.documento_id)?.titolo || 'file'}</> : '')}</div></div>)}
      <button className="btn s p" onClick={() => apriChat(stanza, r)}><Ic n="chat" />Scrivi in chat</button>
    </div>}
  </>;
}
