// Casella 🔍 nella barra in alto, su ogni pagina (Ctrl+K): mentre si scrive mostra i primi risultati su tutto
// (note e documenti, chat di squadra, agenda, preventivi, listino) con la stessa ricerca della scheda Cerca.
// Invio o «Vedi tutti» apre la scheda Cerca con le stesse parole; «✦ Chiedi all'assistente» gli passa la domanda già scritta.
// Sugli schermi stretti è solo l'icona 🔍, che si apre sopra la barra.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fDate } from '../domain/format';
import { nomeDi } from '../domain/squadra';
import { S, commit } from '../store/state';
import { cloud } from '../store/remote';
import { Hl, apriArticolo, apriPrev, brano, risultati } from '../pages/Cerca';
import { apriFile } from '../pages/Documenti';
import { apriChat, chiediAI } from './pannelli';

const N = 4;   // risultati per gruppo nella tendina
const nomePrev = (id: string | null | undefined) => (id && S.arch.find(e => e.id === id)?.nome) || '';

export function CercaRapida() {
  const [q, setQ] = useState(''), [su, setSu] = useState(false);
  const box = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSu(true); setTimeout(() => inp.current?.select()); }
    };
    const fuori = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setSu(false); };
    window.addEventListener('keydown', tasto); document.addEventListener('mousedown', fuori);
    return () => { window.removeEventListener('keydown', tasto); document.removeEventListener('mousedown', fuori); };
  }, []);

  const r = su && q.trim() ? risultati(q) : null, pp = r?.pp || [];
  const chiudi = () => { setSu(false); setQ(''); inp.current?.blur(); };
  const vai = (f: () => void) => () => { f(); chiudi(); commit(); };
  const tutti = vai(() => { S.ui.cerca = { q: q.trim(), stato: '', anno: '' }; S.ui.av = 'cerca'; S.ui.tab = 'prev'; window.scrollTo(0, 0); });
  const ai = () => { chiediAI(`Cosa sappiamo su «${q.trim()}»? Cerca negli appunti, nei documenti e nella chat e fammi un riassunto.`); chiudi(); };
  const n = r ? r.docs.length + r.chat.length + r.scad.length + r.prev.length + r.art.length : 0;

  const Voce = ({ ic, t, sub, onClick }: { ic: string; t: string; sub?: ReactNode; onClick: () => void }) => (
    <button className="qsr" onClick={onClick}><i>{ic}</i><span><b><Hl t={t} pp={pp} /></b>{sub ? <small>{sub}</small> : null}</span></button>);
  const Gruppo = ({ titolo, tot, children }: { titolo: string; tot: number; children: ReactNode }) => tot ? <>
    <h4>{titolo} <span>{tot > N ? `${N} di ${tot}` : tot}</span></h4>{children}</> : null;

  return (
    <div ref={box} className={`qs noprint${su ? ' on' : ''}`}>
      <button className="btn qsbtn" onClick={() => { setSu(true); setTimeout(() => inp.current?.focus()); }} title="Cerca (Ctrl+K)" aria-label="Cerca">🔍</button>
      <div className="qsf">
        <span className="qsi">🔍</span>
        <input ref={inp} type="search" value={q} placeholder="Cerca note, chat, clienti, commesse, codici…" aria-label="Cerca in tutto"
          onFocus={() => setSu(true)} onChange={e => { setQ(e.target.value); setSu(true); }}
          onKeyDown={e => { if (e.key === 'Enter' && q.trim()) tutti(); if (e.key === 'Escape') chiudi(); }} />
        {!q && <kbd>Ctrl K</kbd>}
        <button className="btn x qsx" onClick={chiudi} title="Chiudi" aria-label="Chiudi la ricerca">✕</button>
      </div>
      {r && <div className="qsdrop">
        {!n && <div className="qsvuoto">Nessun risultato per «{q.trim()}».</div>}
        <Gruppo titolo="Note e documenti" tot={r.docs.length}>{r.docs.slice(0, N).map(d => <Voce key={d.id} ic={d.tipo === 'nota' ? '✎' : '📎'} t={d.titolo}
          sub={<>{fDate(d.creato.slice(0, 10))}{nomePrev(d.preventivo_id) ? ` · ${nomePrev(d.preventivo_id)}` : ''}{d.testo ? <> · <Hl t={brano(d.testo, pp, 90)} pp={pp} /></> : null}</>}
          onClick={d.preventivo_id && nomePrev(d.preventivo_id) ? vai(() => apriPrev(d.preventivo_id!, 'docs')) : d.tipo === 'file' ? vai(() => { apriFile(d); }) : tutti} />)}</Gruppo>
        <Gruppo titolo="Chat di squadra" tot={r.chat.length}>{r.chat.slice(0, N).map(m => <Voce key={m.id} ic="💬" t={nomeDi(m.creato_da, cloud.colleghi)}
          sub={<>{fDate(m.creato.slice(0, 10))} · {nomePrev(m.preventivo_id) || 'Generale'} · <Hl t={brano(m.testo || '', pp, 90)} pp={pp} /></>}
          onClick={vai(() => apriChat(m.preventivo_id || null))} />)}</Gruppo>
        <Gruppo titolo="Agenda" tot={r.scad.length}>{[...r.scad].sort((a, b) => b.giorno.localeCompare(a.giorno)).slice(0, N).map(s => <Voce key={s.id} ic="📅" t={s.titolo}
          sub={<>{fDate(s.giorno)}{s.fatto ? ' · ✓ fatto' : ''}{nomePrev(s.preventivo_id) ? ` · ${nomePrev(s.preventivo_id)}` : ''}</>}
          onClick={s.preventivo_id && nomePrev(s.preventivo_id) ? vai(() => apriPrev(s.preventivo_id!)) : tutti} />)}</Gruppo>
        <Gruppo titolo="Preventivi" tot={r.prev.length}>{r.prev.slice(0, N).map(e => <Voce key={e.id} ic="📄" t={e.nome}
          sub={<>{e.prev?.num ? `N° ${e.prev.num} · ` : ''}<Hl t={e.cliente || '–'} pp={pp} />{e.rif ? <> · <Hl t={e.rif} pp={pp} /></> : null}</>}
          onClick={vai(() => apriPrev(e.id))} />)}</Gruppo>
        <Gruppo titolo="Listino" tot={r.art.length}>{r.art.slice(0, N).map((it: any) => <Voce key={it.c} ic="🔩" t={it.c}
          sub={<Hl t={it.d || ''} pp={pp} />} onClick={vai(() => apriArticolo(it.c))} />)}</Gruppo>
        <div className="qsfoot">
          {n > 0 && <button className="btn s" onClick={tutti}>Vedi tutti i risultati ({n}) ↵</button>}
          {cloud.session && <button className="btn s" onClick={ai}>✦ Chiedi all'assistente</button>}
        </div>
      </div>}
    </div>
  );
}
