// «📥 Da smistare» nella mappa dei reparti: un riquadro con tutto quello che non ha reparto (note e file liberi senza temi, voci d'agenda
// aperte senza reparto) e, su ogni riga, i reparti da cliccare. Una nota prende il primo tema del reparto (vedi reparti.ts),
// una voce d'agenda il reparto scelto. ✦ = reparto proposto leggendo titolo e testo. Si smista solo quello che si può modificare.
import { useState, type ReactNode } from 'react';
import type { Voce } from '../domain/calendario';
import { etichetteDi, libero, suggerisciEtichette, type Documento } from '../domain/documenti';
import { dFmt } from '../domain/plan';
import { REPARTI, SMISTARE, repartiDaTemi, repartiNota, repartiVoce, type Reparto } from '../domain/reparti';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { aggiornaDoc, puoGestireDoc, puoModificare, repartiDi, repartiVociDisponibili, salvaScadenza } from '../store/remote';
import { apriScheda } from './pannelli';
import { Ic, IcReparto } from './Icona';
import { Info } from './ui';

/** Reparti proposti per un testo: quelli dei temi riconosciuti. */
const proposti = (testo: string) => repartiDaTemi(suggerisciEtichette(testo));

function Riga({ ic, titolo, sotto, ok, perche, sug, onApri, onScegli }:
  { ic: ReactNode; titolo: string; sotto: string; ok: boolean; perche: string; sug: string[]; onApri: () => void; onScegli: (r: Reparto) => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const ordinati = [...REPARTI].sort((a, b) => +!sug.includes(a.k) - +!sug.includes(b.k));
  return (
    <div className="smriga">
      <div className="smt"><button className="smtit" onClick={onApri} title="Apri per intero">{ic}{titolo}</button><small>{sotto}</small></div>
      {ok ? <div className="etqs">{ordinati.map(r => (
        <button key={r.k} type="button" className={`etq${sug.includes(r.k) ? ' on' : ''}`} disabled={!!busy}
          title={sug.includes(r.k) ? 'Proposto leggendo il testo' : undefined}
          onClick={async () => { setBusy(r.k); await onScegli(r); setBusy(''); }}>
          {busy === r.k ? '…' : <>{sug.includes(r.k) ? '✦ ' : ''}<IcReparto k={r.k} />{r.nome}</>}</button>))}</div>
        : <small className="muted">{perche}</small>}
    </div>
  );
}

export function Smistamento({ vv }: { vv: Voce[] }) {
  const note = S.docs.filter(d => (d.tipo === 'nota' || libero(d)) && repartiNota(d)[0] === SMISTARE)
    .sort((a, b) => (b.modificato || b.creato).localeCompare(a.modificato || a.creato));
  const voci = vv.filter(v => v.s && !v.s.fatto && repartiVoce(v, repartiDi)[0] === SMISTARE);
  const comm = (id: string | null) => (id && S.arch.find(e => e.id === id)?.nome) || '';

  const nota = async (d: Documento, r: Reparto) => {
    const e = await aggiornaDoc(d.id, { etichette: [...etichetteDi(d), r.temi[0]] });
    toast(e ? 'Non smistata: ' + e : `«${d.titolo}» → ${r.nome}`); commit();
  };
  const voce = async (v: Voce, r: Reparto) => {
    const e = await salvaScadenza({ ...v.s!, reparti: [r.k] });
    toast(e ? 'Non smistata: ' + e : `«${v.s!.titolo}» → ${r.nome}`); commit();
  };

  return (
    <div className="card smist">
      <h2><Ic n="smistare" s={16} />Smistamento<Info>Clicca il reparto giusto su ogni riga: la riga sparisce da qui e va in quel reparto.
        ✦ = proposto leggendo il testo. Una nota prende il tema del reparto (lo cambi poi con <Ic n="collega" />Collega); una voce d'agenda il reparto (lo cambi in Modifica).</Info><span className="tag">{note.length + voci.length} da smistare</span></h2>
      {!note.length && !voci.length && <div className="empty"><Ic n="festa" />Niente da smistare.</div>}
      {note.length > 0 && <h3>Note e file</h3>}
      {note.map(d => <Riga key={d.id} ic={<Ic n={d.tipo === 'nota' ? 'nota' : 'allega'} />} titolo={d.titolo}
        sotto={[dFmt(Math.floor(Date.parse(d.creato) / 864e5)), comm(d.preventivo_id), (d.testo || '').slice(0, 90)].filter(Boolean).join(' · ')}
        ok={puoGestireDoc(d)} perche="La smista chi l'ha scritta o l'amministratore." sug={proposti(`${d.titolo} ${d.testo || ''}`)}
        onApri={() => apriScheda({ tipo: 'doc', id: d.id })} onScegli={r => nota(d, r)} />)}
      {voci.length > 0 && <h3>Voci d'agenda</h3>}
      {voci.map(v => <Riga key={v.key} ic={<Ic n="voce" />} titolo={v.s!.titolo}
        sotto={[dFmt(v.giorno), comm(v.s!.preventivo_id), 'nessuno con un reparto la deve fare'].filter(Boolean).join(' · ')}
        ok={puoModificare(v.s!) && repartiVociDisponibili()} perche={repartiVociDisponibili() ? "La smista chi l'ha creata o l'amministratore." : 'Manca la migrazione 20261030010000_reparti.sql.'}
        sug={proposti(`${v.s!.titolo} ${v.s!.nota || ''}`)} onApri={() => apriScheda({ tipo: 'voce', id: v.s!.id })} onScegli={r => voce(v, r)} />)}
    </div>
  );
}
