// Cruscotto dell'archivio: filtri, indicatori (KPI) e grafici cliccabili. Ogni clic su un grafico filtra tutto il resto.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { eur, fDate, fN, fP } from '../domain/format';
import { MESI, anni, eAnno, eCliente, eData, eStato, filtra, perCliente, perMese, perStato, totali, type KFiltro } from '../domain/kpi';
import { STATI, num, statoOf } from '../domain/model';
import { S, commit } from '../store/state';
import { archOpen, archPatch } from '../store/actions';
import { Info } from '../components/ui';

const kf = () => S.ui.kf;
const setF = (k: keyof KFiltro, v: string) => { kf()[k] = kf()[k] === v ? '' : v; commit(); };
const kEur = (v: number) => (Math.abs(v) >= 1e6 ? fN(v / 1e6, 2) + ' M€' : Math.abs(v) >= 1e3 ? fN(v / 1e3, 0) + ' k€' : fN(v, 0) + ' €');
const kPow = (kwp: number) => (kwp >= 1000 ? fN(kwp / 1000, 2) + ' MWp' : fN(kwp, 1) + ' kWp');

/* ---------- Tooltip che segue il puntatore ---------- */
type Tip = { x: number; y: number; body: ReactNode } | null;
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const on = (body: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => setTip({ x: e.clientX, y: e.clientY, body }),
    onPointerLeave: () => setTip(null),
  });
  const node = tip && <div className="ktip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 240), top: tip.y + 14 }}>{tip.body}</div>;
  return { on, node };
}
const TipRow = ({ c, l, v }: { c?: string; l: ReactNode; v: ReactNode }) => <div className="tr">{c && <i style={{ background: c }} />}<span>{l}</span><b>{v}</b></div>;

export const StatoTag = ({ k }: { k: string }) => { const [, l, c, ic] = statoOf(k); return <span className="stag" style={{ '--sc': c } as React.CSSProperties}><i>{ic}</i>{l}</span>; };
export function StatoSel({ id, k }: { id: string; k: string }) {
  return (
    <select className="ssel" value={k} style={{ '--sc': statoOf(k)[2] } as React.CSSProperties} onClick={e => e.stopPropagation()}
      onChange={e => { const v = e.target.value; archPatch(id, p => { p.stato = v; }); commit(); }}>
      {STATI.map(([v, l, , ic]) => <option key={v} value={v}>{ic} {l}</option>)}
    </select>
  );
}

/** Barra dei filtri, comune a cruscotto e mappa. */
export function KFiltri({ arch }: { arch: any[] }) {
  const f = kf(), act = f.anno || f.mese !== '' || f.stato || f.cliente || S.ui.aq;
  const clienti = [...new Set(arch.map(eCliente))].sort((a, b) => a.localeCompare(b));
  const set = (k: keyof KFiltro) => (e: React.ChangeEvent<HTMLSelectElement>) => { f[k] = e.target.value; commit(); };
  return (
    <div className="card kfilt noprint">
      <input placeholder="Cerca nome, cliente, località…" value={S.ui.aq} onChange={e => { S.ui.aq = e.target.value; commit(); }} />
      <select value={f.anno} onChange={set('anno')}><option value="">Tutti gli anni</option>{anni(arch).map(a => <option key={a}>{a}</option>)}</select>
      <select value={f.mese} onChange={set('mese')}><option value="">Tutti i mesi</option>{MESI.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
      <select value={f.cliente} onChange={set('cliente')}><option value="">Tutti i clienti</option>{clienti.map(c => <option key={c}>{c}</option>)}</select>
      <span className="chips">{STATI.map(([k, l, c, ic]) => (
        <button key={k} className={`chip ${f.stato === k ? 'on' : ''}`} style={{ '--sc': c } as React.CSSProperties} onClick={() => setF('stato', k)}><i>{ic}</i>{l}</button>))}</span>
      <span className="sp" />
      {act ? <button className="btn s" onClick={() => { S.ui.kf = { anno: '', mese: '', stato: '', cliente: '' }; S.ui.aq = ''; commit(); }}>Azzera filtri</button> : null}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
// Valori "tondi" per l'asse: 1, 2, 2,5, 5 × 10^n.
function niceMax(v: number) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v)!; }

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="ktile"><small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}</div>;
}

export function Cruscotto() {
  const { on, node } = useTip();
  const f = kf(), q = S.ui.aq;
  const list = filtra(S.arch, q, f);
  const T = totali(list);
  const mesi = perMese(filtra(S.arch, q, f, 'mese')), stati = perStato(filtra(S.arch, q, f, 'stato')), clienti = perCliente(filtra(S.arch, q, f, 'cliente'));
  const mMax = niceMax(Math.max(...mesi.map(m => m.tot))), sMax = Math.max(1, ...stati.map(s => s.v)), cMax = Math.max(1, ...clienti.map(c => c.v));
  if (!S.arch.length) return <div className="card"><div className="empty">L'archivio è vuoto: il cruscotto si riempie quando salvi i preventivi.</div></div>;
  return (
    <>
      <KFiltri arch={S.arch} />
      <div className="ktiles">
        <Tile label="Preventivi" value={fN(T.n, 0)} sub={`${fN(T.trk, 0)} tracker`} />
        <Tile label="Valore offerto" value={kEur(T.prezzo)} sub={`costo ${kEur(T.costo)}`} />
        <Tile label="Potenza" value={kPow(T.kwp)} sub={T.n ? `media ${kPow(T.kwp / T.n)}` : '–'} />
        <Tile label="€/Wp vendita" value={T.wpVend != null ? fN(T.wpVend, 4) : '–'} sub={T.wpCosto != null ? `costo ${fN(T.wpCosto, 4)} €/Wp` : ''} />
        <Tile label="Margine medio" value={T.margPct != null ? fP(T.margPct) : '–'} sub={kEur(T.margine)} />
        <Tile label="Tasso di successo" value={T.successo != null ? fP(T.successo) : '–'} sub={`${T.vinti} vinti · ${T.persi} persi · vinto ${kEur(T.vValore)}`} />
        <Tile label="In attesa di risposta" value={kEur(T.aValore)} sub={`${T.aperti} inviat${T.aperti === 1 ? 'o' : 'i'}`} />
      </div>

      <div className="kgrid">
        <section className="card kc wide">
          <h2>Valore offerto per mese · {f.anno || 'tutti gli anni'}<Info>Prezzo di vendita per mese della data del preventivo, diviso per stato. Clic su un mese per filtrare.</Info></h2>
          <div className="mbars">
            <div className="yax">{[1, 0.5, 0].map(k => <span key={k}>{kEur(mMax * k)}</span>)}</div>
            <div className="plot">
              <div className="gl" style={{ bottom: '50%' }} /><div className="gl" style={{ bottom: '100%' }} />
              {mesi.map(m => (
                <button key={m.i} className={`mcol ${f.mese === String(m.i) ? 'on' : f.mese !== '' ? 'dim' : ''}`} onClick={() => setF('mese', String(m.i))}
                  {...on(<><b>{MESI[m.i]}{f.anno ? ' ' + f.anno : ''}</b><TipRow l="Totale" v={eur(m.tot)} /><TipRow l="Preventivi" v={m.n} />
                    {STATI.filter(([k]) => m.s[k]).map(([k, l, c]) => <TipRow key={k} c={c} l={l} v={eur(m.s[k])} />)}</>)}>
                  <span className="stack" style={{ height: `${(m.tot / mMax) * 100}%` }}>
                    {[...STATI].reverse().map(([k, , c]) => (m.s[k] ? <i key={k} style={{ flexGrow: m.s[k], background: c }} /> : null))}
                  </span>
                  <small>{MESI[m.i]}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="klegend">{STATI.map(([k, l, c, ic]) => <span key={k}><i style={{ background: c }} />{ic} {l}</span>)}</div>
        </section>

        <section className="card kc">
          <h2>Per stato<Info>Clic su uno stato per filtrare.</Info></h2>
          {stati.map(s => (
            <button key={s.k} className={`hbar ${f.stato === s.k ? 'on' : f.stato ? 'dim' : ''}`} onClick={() => setF('stato', s.k)}
              {...on(<><b>{s.ic} {s.l}</b><TipRow l="Preventivi" v={s.n} /><TipRow l="Valore" v={eur(s.v)} /></>)}>
              <span className="hl"><StatoTag k={s.k} /><em>{s.n}</em></span>
              <span className="track"><i style={{ width: `${(s.v / sMax) * 100}%`, background: s.c }} /></span>
              <b>{kEur(s.v)}</b>
            </button>
          ))}
        </section>

        <section className="card kc">
          <h2>Clienti principali<Info>Per valore offerto. Clic su un cliente per filtrare.</Info></h2>
          {clienti.length ? clienti.map(c => (
            <button key={c.k} className={`hbar ${f.cliente === c.k ? 'on' : f.cliente ? 'dim' : ''}`} disabled={(c as any).altri} onClick={() => setF('cliente', c.k)}
              {...on(<><b>{c.k}</b><TipRow l="Preventivi" v={c.n} /><TipRow l="Valore" v={eur(c.v)} /><TipRow l="Potenza" v={kPow(c.kwp)} /></>)}>
              <span className="hl">{c.k}<em>{c.n}</em></span>
              <span className="track"><i style={{ width: `${(c.v / cMax) * 100}%` }} /></span>
              <b>{kEur(c.v)}</b>
            </button>
          )) : <div className="empty">Nessun preventivo nel filtro.</div>}
        </section>

        <Scatter list={list} on={on} />
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px 6px' }}><h2>Preventivi nel filtro · {list.length}<Info>I dati dei grafici in tabella, ordinati per valore. Lo stato si cambia da qui.</Info></h2></div>
        <div className="wrap" style={{ border: 0, borderRadius: 0 }}><table className="arch"><tbody>
          <tr><th>Preventivo</th><th>Data</th><th>Stato</th><th className="n">kWp</th><th className="n">Costo</th><th className="n">Prezzo</th><th className="n">Margine</th><th className="n">€/Wp</th><th></th></tr>
          {[...list].sort((a, b) => num(b.prezzo) - num(a.prezzo)).map(e => {
            const p = num(e.prezzo ?? e.totale), c = num(e.totale);
            return (
              <tr key={e.id}><td><b>{e.nome}</b><div className="muted small">{eCliente(e)}{e.prev?.luogo?.nome ? ' · ' + e.prev.luogo.nome : ''}</div></td>
                <td className="small">{fDate(eData(e))}</td><td><StatoSel id={e.id} k={eStato(e)} /></td>
                <td className="n">{fN(e.kwp, 2)}</td><td className="n">{eur(c)}</td><td className="n"><b>{eur(p)}</b></td>
                <td className="n">{p ? fP(((p - c) / p) * 100) : '–'}</td><td className="n">{num(e.kwp) ? fN(p / (num(e.kwp) * 1000), 4) : '–'}</td>
                <td className="acts"><button className="btn s p" onClick={() => { archOpen(e.id); commit(); }}>Apri</button></td></tr>);
          })}
        </tbody></table></div>
      </section>
      {node}
    </>
  );
}

/** Dispersione: potenza dell'impianto (kWp) contro €/Wp di vendita, colore = stato. */
function Scatter({ list, on }: { list: any[]; on: (b: ReactNode) => any }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const pts = list.filter(e => num(e.kwp) > 0).map(e => ({ e, x: num(e.kwp), y: num(e.prezzo ?? e.totale) / (num(e.kwp) * 1000) }));
  const H = 240, m = { l: 52, r: 12, t: 10, b: 30 }, iw = Math.max(50, w - m.l - m.r), ih = H - m.t - m.b;
  const xM = niceMax(Math.max(0, ...pts.map(p => p.x)) * 1.05), yM = niceMax(Math.max(0, ...pts.map(p => p.y)) * 1.1);
  const X = (v: number) => m.l + (v / xM) * iw, Y = (v: number) => m.t + ih - (v / yM) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <section className="card kc">
      <h2>€/Wp e potenza<Info>Ogni punto è un preventivo: più a destra è grande, più in alto costa al Wp. Clic su un punto per aprirlo.</Info></h2>
      <div ref={ref} className="scat">
        {pts.length ? (
          <svg width={w} height={H} role="img" aria-label="Dispersione kWp contro €/Wp di vendita">
            {ticks.map(t => <g key={t}><line className="g" x1={m.l} x2={m.l + iw} y1={Y(yM * t)} y2={Y(yM * t)} /><text className="ax" x={m.l - 6} y={Y(yM * t) + 4} textAnchor="end">{fN(yM * t, 3)}</text></g>)}
            {ticks.map(t => <text key={'x' + t} className="ax" x={X(xM * t)} y={H - 10} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>{fN(xM * t, 0)}{t === 1 ? ' kWp' : ''}</text>)}
            {pts.map(p => (
              <g key={p.e.id} className="pt" onClick={() => { archOpen(p.e.id); commit(); }}
                {...on(<><b>{p.e.nome}</b><TipRow l="Cliente" v={eCliente(p.e)} /><TipRow l="Potenza" v={fN(p.x, 2) + ' kWp'} /><TipRow l="€/Wp vendita" v={fN(p.y, 4)} /><TipRow c={statoOf(eStato(p.e))[2]} l="Stato" v={statoOf(eStato(p.e))[1]} /><TipRow l="Anno" v={eAnno(p.e)} /></>)}>
                <circle cx={X(p.x)} cy={Y(p.y)} r={14} fill="transparent" />
                <circle cx={X(p.x)} cy={Y(p.y)} r={5.5} fill={statoOf(eStato(p.e))[2]} stroke="var(--card)" strokeWidth={2} />
              </g>
            ))}
          </svg>
        ) : <div className="empty">Nessun preventivo con potenza nel filtro.</div>}
      </div>
    </section>
  );
}
