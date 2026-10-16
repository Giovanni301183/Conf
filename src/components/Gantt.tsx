// Tendina con il Gantt: barre trascinabili, date e durate modificabili, fasi tolte e aggiunte.
import { useState, type ReactNode } from 'react';
import { Fold, Inp, SubFold } from './ui';
import { DAY, FASI, dDate, dFmt, dNum, dToday, gPrev, isoDay, isoWeek, nWorkDays, nextWork, commName } from '../domain/plan';
import { S, commit, getP, save, setP } from '../store/state';

export interface GanttOpts {
  id: string; step: number; title: string; pd: string; endLabel: string; hint: ReactNode; onPrint: () => void;
  par: { id: string; title: string; sum: string; keys: [string, string][]; base: string };
}

const done = () => { save(); commit(); };
const cc = (t: any) => ({ '--cc': `var(${FASI[t.fase][1]})` }) as React.CSSProperties;

// Barre trascinabili: al centro spostano l'inizio, il bordo destro cambia la durata.
function onBarDown(e: React.PointerEvent<HTMLElement>, t: any, pd: string, nd: number) {
  if (e.button) return; e.preventDefault();
  const b = e.currentTarget, td = b.closest('td.tl') as HTMLElement;
  const orig = { left: b.style.left, width: b.style.width, title: b.title };
  const d = { mode: (e.target as Element).classList.contains('gh') ? 'end' : 'move', x0: e.clientX, px: td.clientWidth / nd, left: parseFloat(b.style.left), width: parseFloat(b.style.width) || 0, k: 0 };
  b.classList.add('drag'); b.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    d.k = Math.round((ev.clientX - d.x0) / d.px); const step = (d.k / nd) * 100;
    if (d.mode === 'move') b.style.left = d.left + step + '%'; else b.style.width = Math.max(100 / nd, d.width + step) + '%';
    const l = Math.max(t.s, t.last + d.k);
    b.title = d.mode === 'move' ? `Inizio: ${dFmt(nextWork(t.s + d.k))}` : `Fine: ${dFmt(l)} · ${nWorkDays(t.s, l)} gg`;
  };
  const up = () => {
    b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
    b.classList.remove('drag'); Object.assign(b.style, { left: orig.left, width: orig.width }); b.title = orig.title;
    if (!d.k) return;
    const g = getP(pd);
    if (d.mode === 'move') g.da[t.id] = isoDay(nextWork(t.s + d.k)); else g.dur[t.id] = Math.max(1, nWorkDays(t.s, Math.max(t.s, t.last + d.k)));
    done();
  };
  b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
}

// Inizio fissa la partenza della fase, Fine ne ricava la durata. Data cancellata = torna al calcolo.
function onDate(pd: string, x: any, k: 's' | 'f', value: string) {
  const g = getP(pd), n = dNum(value);
  if (k === 's') { if (n == null) delete g.da[x.id]; else g.da[x.id] = value; }
  else { if (n == null) delete g.dur[x.id]; else g.dur[x.id] = Math.max(1, nWorkDays(x.s, n)); }
  done();
}

function AddPhase({ G, pd }: { G: any; pd: string }) {
  const [grp, setGrp] = useState(G.groups[0]?.key ?? 'extra');
  const add = () => { const g = getP(pd); (g.extra = g.extra || []).push({ id: 'x' + Date.now().toString(36), name: '', grp }); done(); };
  return (
    <div className="toolbar"><span className="muted">Aggiungi una fase in</span>
      <select value={grp} onChange={e => setGrp(e.target.value)}>
        {G.groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
        {G.groups.some(g => g.key === 'extra') ? null : <option value="extra">Fasi aggiunte</option>}
      </select>
      <button className="btn" onClick={add}>+ Aggiungi fase</button>
    </div>
  );
}

export function GanttFold({ G, o }: { G: any; o: GanttOpts }) {
  if (!G.tasks.length && !G.hidden.length) return null;
  const P = S.prev, pg = gPrev(), ov = getP(o.pd), today = dToday();
  const { a, nd } = G.view, pos = (n: number) => ((n - a) / nd) * 100;
  const tl = (inner: ReactNode) => <td className="tl">{today >= a && today < a + nd ? <i className="gtoday" style={{ left: `${pos(today)}%` }} /> : null}{inner}</td>;
  const bar = (t: any) => t.dur
    ? <i className="gb" onPointerDown={e => onBarDown(e, t, o.pd, nd)} style={{ left: `${pos(t.s)}%`, width: `${((t.last + 1 - t.s) / nd) * 100}%`, ...cc(t) }}
        title={`${t.name}: ${dFmt(t.s)} → ${dFmt(t.last)} · ${t.dur} gg\nTrascina per spostare, dal bordo destro per allungare`}><b className="gh" /></i>
    : <i className="gm" onPointerDown={e => onBarDown(e, t, o.pd, nd)} style={{ left: `${pos(t.s)}%`, ...cc(t) }} title={`${t.name}: ${dFmt(t.s)}\nTrascina per spostare`} />;
  // Campo data per Inizio / Fine: mostra il calcolato; in oro se scritto a mano.
  const dIn = (x: any, k: 's' | 'f', n: number, man: boolean, tip: string) => <>
    <span className="noprint"><input type="date" className={man ? 'ovr' : ''} value={isoDay(n)} title={tip} onChange={e => onDate(o.pd, x, k, e.target.value)} /></span>
    <span className="onlyprint">{dFmt(n)}</span>
  </>;
  // Intestazione: mesi sopra, settimane (lunedi') sotto.
  const mh: ReactNode[] = [], wh: ReactNode[] = [];
  for (let n = a; n < a + nd;) {
    const d = dDate(n), nx = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY, e = Math.min(nx, a + nd);
    mh.push(<span key={n} style={{ left: `${pos(n)}%`, width: `${((e - n) / nd) * 100}%` }}>{d.toLocaleDateString('it-IT', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>); n = e;
  }
  const nw = nd / 7, ws = Math.ceil(nw / 26);
  for (let w = 0; w < nw; w += ws) { const n = a + w * 7; wh.push(<span key={n} style={{ left: `${pos(n)}%`, width: `${(ws / nw) * 100}%` }} title={`Settimana ${isoWeek(n)}`}>{dFmt(n).slice(0, 5)}</span>); }

  const nOv = Object.values(ov.dur).filter(v => v !== '' && v != null).length + Object.values(ov.da).filter(Boolean).length;
  const rowReset = (id: string) => { delete ov.dur[id]; delete ov.da[id]; done(); };
  const hide = (x: any) => {
    const i = (ov.extra || []).findIndex(e => e.id === x.id);
    if (i >= 0) { if (!confirm(`Eliminare la fase "${ov.extra[i].name || 'Nuova fase'}"?`)) return; ov.extra.splice(i, 1); } else (ov.hid = ov.hid || {})[x.id] = true;
    rowReset(x.id);
  };
  const resetAll = () => { if (!confirm('Cancellare le durate e le date scritte a mano e tornare ai valori calcolati?')) return; ov.dur = {}; ov.da = {}; done(); };

  return (
    <Fold id={o.id} step={o.step} title={o.title} cls="pcard"
      sum={`Avvio ${dFmt(G.start)} · fine ${dFmt(G.end)} · ${G.nWork} giorni lavorativi${nOv ? ` · ${nOv} modific${nOv === 1 ? 'a' : 'he'} a mano` : ''}`}
      act={<>
        <label className="small muted">Avvio commessa</label>
        <input type="date" value={pg.inizio || P.data} onChange={e => { setP('prev.gantt.inizio', e.target.value); done(); }} />
        <button className="btn" onClick={o.onPrint}>Stampa / PDF</button>
      </>}>{() => <>
      <div className="onlyprint gtitle"><b>{o.title}</b> · {commName()} · avvio {dFmt(G.start)} · fine {dFmt(G.end)} · {G.nWork} giorni lavorativi · emesso il {dFmt(today)}</div>
      <p className="hint noprint">{o.hint}</p>
      <div className="glegend">{[...new Set<string>(G.tasks.map(x => x.fase))].map(k => <span key={k}><i style={{ background: `var(${FASI[k][1]})` }} />{FASI[k][0]}</span>)}<span><i className="lt" />Oggi</span></div>
      <div className="wrap"><table className="gt" style={{ '--nw': nw } as React.CSSProperties}><tbody>
        <tr><th>Fase</th><th>Base di calcolo</th><th className="n">Durata gg</th><th className="n">Inizio</th><th className="n">Fine</th><th className="np"></th>
          <th className="tl"><div className="tlh"><div>{mh}</div><div>{wh}</div></div></th></tr>
        {G.groups.map(gr => {
          const ts = G.tasks.filter(x => x.grp === gr.key), on = ts.filter(x => x.dur); if (!ts.length) return null;
          const gs = on.length ? Math.min(...on.map(x => x.s)) : null, ge = on.length ? Math.max(...on.map(x => x.last)) : null;
          return [
            <tr key={gr.key} className="g1"><td colSpan={5}>{gr.label}</td><td className="np"></td>{tl(gs != null ? <i className="gs" style={{ left: `${pos(gs)}%`, width: `${((ge! + 1 - gs) / nd) * 100}%` }} /> : null)}</tr>,
            ...ts.map(x => (
              <tr key={x.id}>
                <td className={x.xi != null ? 'gname' : ''}><span className="dot" style={cc(x)} />
                  {x.xi != null ? <><span className="noprint"><Inp path={`${o.pd}.extra.${x.xi}.name`} type="txt" ph="Nome della fase" /></span><span className="onlyprint">{x.name}</span></> : x.name}</td>
                <td className="muted small">{x.base}</td>
                <td className="dur"><span className="noprint"><Inp path={`${o.pd}.dur.${x.id}`} type="optnum" ph={String(x.auto)} cls={x.ov ? 'ovr' : ''} /></span><span className="onlyprint">{x.dur}</span></td>
                <td className="n dt">{dIn(x, 's', x.s, !!x.daMan, x.daMan ? `Inizio fissato a mano. Calcolato: ${dFmt(x.ready)}` : 'Calcolato in automatico: scegli una data per fissarlo')}</td>
                <td className="n dt">{x.dur || x.auto ? dIn(x, 'f', x.last, x.ov, x.ov ? `Durata scritta a mano: ${x.dur} gg (calcolata ${x.auto} gg)` : 'Calcolata in automatico: scegli una data per cambiare la durata') : '–'}</td>
                <td className="np">
                  {x.daMan || x.ov ? <button className="btn s" onClick={() => rowReset(x.id)} title="Torna alle date calcolate">↺</button> : null}
                  <button className="btn s x" onClick={() => hide(x)} title={x.xi != null ? 'Elimina la fase' : 'Togli dal Gantt (si può rimettere)'}>✕</button>
                </td>
                {tl(bar(x))}
              </tr>
            )),
          ];
        })}
        <tr className="end"><td colSpan={2}>{o.endLabel}</td><td className="n">{G.nWork}</td><td className="n">{dFmt(G.start)}</td><td className="n">{dFmt(G.end)}</td><td className="np"></td>
          {tl(<i className="gm" style={{ left: `${pos(G.end + 1)}%`, '--cc': 'var(--ink)' } as React.CSSProperties} />)}</tr>
      </tbody></table></div>
      <div className="noprint">
        <AddPhase G={G} pd={o.pd} />
        {G.hidden.length ? <div className="toolbar"><span className="muted">Fasi tolte (non competono):</span>
          {G.hidden.map(x => <button key={x.id} className="btn s" onClick={() => { delete ov.hid[x.id]; done(); }} title="Rimetti nel Gantt">↺ {x.name}</button>)}</div> : null}
        {nOv ? <div className="toolbar"><span className="muted">{nOv} modific{nOv === 1 ? 'a' : 'he'} a mano su durate o date.</span><button className="btn s" onClick={resetAll}>Ripristina tutto calcolato</button></div> : null}
        <SubFold id={o.par.id} title={o.par.title} sum={o.par.sum}>{() => (
          <div className="grid">{o.par.keys.map(([k, l]) => <label key={k} className="f">{l}<Inp path={o.par.base + '.' + k} type="optnum" ph="–" /></label>)}</div>
        )}</SubFold>
      </div>
    </>}</Fold>
  );
}

export const GHint = () => <>Tutto è calcolato in automatico, ma puoi correggere a mano: scrivi la <b>durata</b>, la data di <b>inizio</b> o di <b>fine</b>, oppure <b>trascina le barre</b> (al centro per spostarle, dal bordo destro per allungarle). Le date a mano sono libere: le fasi si possono sovrapporre. I valori a mano sono in oro, <b>↺</b> riporta la riga al calcolo; le fasi ancora automatiche si accodano a quelle da cui dipendono. Con <b>✕</b> togli le fasi che non vi competono (si rimettono dall'elenco sotto il grafico), con <b>+ Aggiungi fase</b> ne inserisci di vostre.</>;
