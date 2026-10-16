// Componenti comuni: campi legati allo stato, selettori, tendine.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { COLS, num } from '../domain/model';
import { vN } from '../domain/format';
import { S, commit, getP } from '../store/state';
import { bump, foldAll, foldIds, isOpen, setSeg, setVal, stepFor } from '../store/actions';

export type InpType = 'num' | 'optnum' | 'pct' | 'txt' | 'lexpr';

function parseVal(type: InpType, v: string) {
  if (type === 'num') return num(v);
  if (type === 'optnum') return v.trim() === '' ? '' : num(v);
  if (type === 'pct') return num(v) / 100;
  if (type === 'lexpr') { const s = v.trim(); return s.startsWith('$') ? s.toUpperCase() : s === '' ? '' : num(s); }
  return v;
}
function shown(v: any, type: InpType) {
  const isN = type === 'num' || type === 'optnum' || type === 'pct';
  return type === 'pct' ? vN(Math.round(num(v) * 1e6) / 1e4) : isN || (type === 'lexpr' && typeof v === 'number') ? vN(v) : String(v ?? '');
}

const ArrUp = () => <svg viewBox="0 0 10 10"><path d="M2 6.5L5 3.5L8 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ArrDn = () => <svg viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// Frecce: un clic cambia di un passo, tenendo premuto continua; Maiusc = passo ×10. Il fuoco resta nel campo.
let bumpT: number | undefined;
const bumpStop = () => { clearTimeout(bumpT); clearInterval(bumpT); bumpT = undefined; };
['pointerup', 'pointercancel', 'blur'].forEach(t => window.addEventListener(t, bumpStop));

/** Campo di testo legato a un percorso dello stato. Mentre si scrive mostra il testo digitato; il calcolo si aggiorna a ogni tasto. */
export function Inp({ path, type = 'num', cls = '', ph = '', w = '', list }: { path: string; type?: InpType; cls?: string; ph?: string; w?: string; list?: string }) {
  const v = getP(path);
  const isN = type === 'num' || type === 'optnum' || type === 'pct';
  // Frecce su ogni campo numerico (non sui segnaposto $LFOND ecc. delle distinte).
  const spin = isN || (type === 'lexpr' && !(typeof v === 'string' && v.startsWith('$')));
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const step = spin ? stepFor(path) : 0;
  const doBump = (dir: number) => {
    bump(path, type, step, dir);
    if (document.activeElement === ref.current) setDraft(shown(getP(path), type));
  };
  const el = (
    <input
      ref={ref}
      className={`${isN ? 'n ' : ''}${cls}`}
      value={draft ?? shown(v, type)}
      placeholder={ph}
      list={list}
      inputMode={isN ? 'decimal' : undefined}
      style={w && !spin ? { width: w } : undefined}
      onFocus={e => { setDraft(shown(v, type)); if (tabFocus) e.target.select(); }}
      onBlur={() => setDraft(null)}
      onChange={e => { setDraft(e.target.value); setVal(path, parseVal(type, e.target.value)); }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (spin && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); doBump((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
      }}
    />
  );
  if (!spin) return el;
  const press = (e: React.PointerEvent, d: number) => {
    e.preventDefault();
    const dir = d * (e.shiftKey ? 10 : 1);
    doBump(dir); bumpStop();
    bumpT = window.setTimeout(() => { bumpT = window.setInterval(() => doBump(dir), 70); }, 420);
  };
  return (
    <span className={`stp${w ? ' w' : ''}`} style={w ? { width: w } : undefined}>
      {el}
      <span className="spin">
        <button type="button" tabIndex={-1} title="Aumenta (Maiusc = ×10)" onMouseDown={e => e.preventDefault()} onPointerDown={e => press(e, 1)}><ArrUp /></button>
        <button type="button" tabIndex={-1} title="Diminuisci (Maiusc = ×10)" onMouseDown={e => e.preventDefault()} onPointerDown={e => press(e, -1)}><ArrDn /></button>
      </span>
    </span>
  );
}
// Tab passa al campo successivo con il contenuto selezionato (si scrive sopra); con il clic il cursore va dove si clicca.
let tabFocus = false;
window.addEventListener('keydown', e => { if (e.key === 'Tab') tabFocus = true; }, true);
window.addEventListener('pointerdown', () => { tabFocus = false; }, true);

export function DateInp({ path }: { path: string }) {
  return <input type="date" value={getP(path) ?? ''} onChange={e => setVal(path, e.target.value)} />;
}

type Opt = string | number | readonly [string | number, string];
export function Sel({ path, opts, type = 'txt' }: { path: string; opts: readonly Opt[]; type?: 'txt' | 'num' }) {
  return (
    <select value={String(getP(path))} onChange={e => setVal(path, type === 'num' ? num(e.target.value) : e.target.value)}>
      {opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return <option key={String(val)} value={String(val)}>{String(lab)}</option>; })}
    </select>
  );
}

export function Seg({ path, opts }: { path: string; opts: readonly Opt[] }) {
  const v = String(getP(path));
  return (
    <span className="seg">
      {opts.map(o => {
        const [val, lab] = Array.isArray(o) ? o : [o, o];
        return <button key={String(val)} className={String(val) === v ? 'on' : ''} onClick={() => setSeg(path, String(val))}>{String(lab)}</button>;
      })}
    </span>
  );
}

export const Chev = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);

function useFoldId(id: string) {
  useLayoutEffect(() => { foldIds.add(id); return () => { foldIds.delete(id); }; }, [id]);
}
const toggle = (id: string) => { S.ui.folds[id] = !isOpen(id); commit(); };

/** Tendina: chiusa mostra solo titolo + riepilogo in una riga; il contenuto si genera solo quando e' aperta. */
export function Fold({ id, title, sum, act, cls = '', step, children }: {
  id: string; title: ReactNode; sum?: ReactNode; act?: ReactNode; cls?: string; step?: number; children: () => ReactNode;
}) {
  useFoldId(id);
  const o = isOpen(id);
  return (
    <section className={`card fold ${o ? 'open' : ''} ${cls}`} data-fold={id}>
      <div className="fh" onClick={e => { if (!(e.target as Element).closest('input,select,textarea,.fact')) toggle(id); }}>
        {step != null && <span className="step">{step}</span>}
        <div className="ft">
          <h2>{title}</h2>
          {sum && <div className="fsum">{sum}</div>}
        </div>
        <span className="sp" />
        {o && act && <div className="fact">{act}</div>}
        <span className="chev"><Chev /></span>
      </div>
      {o && <div className="fb">{children()}</div>}
    </section>
  );
}
export function SubFold({ id, title, sum, children }: { id: string; title: ReactNode; sum: ReactNode; children: () => ReactNode }) {
  useFoldId(id);
  const o = isOpen(id);
  return (
    <div className={`sfold ${o ? 'open' : ''}`}>
      <div className="sfh" onClick={() => toggle(id)}><span className="chev"><Chev /></span><b>{title}</b><span className="fsum">{sum}</span></div>
      {o && <div className="sfb">{children()}</div>}
    </div>
  );
}
export const TabTools = () => (
  <div className="tabtools noprint">
    <button className="btn s" onClick={() => foldAll(true)}>Apri tutte</button>
    <button className="btn s" onClick={() => foldAll(false)}>Chiudi tutte</button>
  </div>
);
export function MiniBar({ T, total }: { T: any; total: number }) {
  return <span className="minibar">{COLS.map(([k, , c]) => (T[k] ? <i key={k} style={{ width: `${(T[k] / total) * 100}%`, background: `var(${c})` }} /> : null))}</span>;
}
export const Dot = ({ style }: { style?: React.CSSProperties }) => <span className="dot" style={style} />;
export const Muted = ({ children = '–' }: { children?: ReactNode }) => <span className="muted">{children}</span>;

export function useToastState() {
  const [msg, setMsg] = useState(''); const [show, setShow] = useState(false); const t = useRef<number>(undefined);
  const toast = (m: string) => { setMsg(m); setShow(true); clearTimeout(t.current); t.current = window.setTimeout(() => setShow(false), 2600); };
  useEffect(() => () => clearTimeout(t.current), []);
  return { toast, node: <div className={`toast ${show ? 'show' : ''}`}>{msg}</div> };
}
