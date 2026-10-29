// Finestra in primo piano con una nota o una voce d'agenda aperta per intero (aperta dalla ricerca con apriScheda):
// gli stessi pulsanti che hanno nei Documenti e nel calendario, Modifica sul posto, «Vai alla commessa» se è legata a un preventivo.
// Si chiude con Esc, ✕ o un clic fuori e si resta dove si era. Sul telefono occupa tutto lo schermo.
import { useEffect, useState } from 'react';
import { S, useStore } from '../store/state';
import { apriPrev } from '../pages/Cerca';
import { NotaScheda } from '../pages/Documenti';
import { VoceScheda } from '../pages/Calendario';
import { APRI_SCHEDA, type Aperta } from './pannelli';

export function SchedaAperta() {
  useStore();
  const [a, setA] = useState<Aperta | null>(null);
  useEffect(() => {
    const f = (e: Event) => setA((e as CustomEvent<Aperta>).detail);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setA(null); };
    window.addEventListener(APRI_SCHEDA, f); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener(APRI_SCHEDA, f); window.removeEventListener('keydown', esc); };
  }, []);
  if (!a) return null;

  const d = a.tipo === 'doc' ? S.docs.find(x => x.id === a.id) : null, s = a.tipo === 'voce' ? S.scad.find(x => x.id === a.id) : null;
  const pid = d?.preventivo_id || s?.preventivo_id || null, prev = pid ? S.arch.find(e => e.id === pid) : null;
  const titolo = a.tipo === 'voce' ? "Voce d'agenda" : d?.tipo === 'file' ? 'Documento' : 'Nota';
  return (
    <div className="sapscrim noprint" onMouseDown={e => { if (e.target === e.currentTarget) setA(null); }}>
      <div className="sapwin" role="dialog" aria-modal="true" aria-label={titolo}>
        <div className="saphead"><b>{titolo}</b>{prev && <span className="muted small">· {prev.nome}</span>}<span className="sp" />
          {prev && <button className="btn s" onClick={() => { apriPrev(prev.id, a.tipo === 'doc' ? 'docs' : undefined); setA(null); }}>Vai alla commessa</button>}
          <button className="btn x" onClick={() => setA(null)} title="Chiudi (Esc)" aria-label="Chiudi">✕</button></div>
        <div className="sapbody">
          {d ? <NotaScheda key={d.id} d={d} /> : s ? <VoceScheda key={s.id} s={s} />
            : <p className="hint">Non si trova più: forse è stata eliminata.</p>}
        </div>
      </div>
    </div>
  );
}
