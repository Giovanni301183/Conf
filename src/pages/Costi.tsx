// Scheda Costi: riepilogo, costi per categoria e voce, esplosione ad albero.
import type { ReactNode } from 'react';
import { Fold, MiniBar, Seg, TabTools } from '../components/ui';
import { VIEWS, addTo, buildTree, tot, zero } from '../domain/compute';
import { exportCSV } from '../domain/excel';
import { eur, fDate, fL, fN, fQ, pct } from '../domain/format';
import { CATS, COLS, num } from '../domain/model';
import { R, S, commit } from '../store/state';

export const vCols = () => COLS.filter(([k]) => k !== 'altro' || (R && R.T.altro));
export const CostHead = () => <>{vCols().map(([k, l]) => <th key={k} className="n">{l} €</th>)}<th className="n">Totale €</th><th className="n">%</th></>;
export const CostCells = ({ n, total }: { n: any; total: number }) => <>
  {vCols().map(([k]) => <td key={k} className="n">{n[k] ? fN(n[k]) : <span className="muted">–</span>}</td>)}
  <td className="n"><b>{fN(tot(n))}</b></td><td className="n muted">{pct(tot(n), total)}</td>
</>;

export function getTree(v: string) {
  const V = VIEWS[v]; const root = buildTree(R.lines, V.levels);
  root.children = new Map([...root.children.entries()].sort((a, b) => V.order(a[0]) - V.order(b[0])));
  return root;
}
function expandAll() {
  const walk = (n, p) => { if (n.children.size || n.sd) S.ui.open.add(p); n.children.forEach(k => walk(k, p + '/' + k.key)); };
  getTree(S.ui.view).children.forEach(k => walk(k, S.ui.view + '/' + k.key)); commit();
}
const tog = (p: string) => { if (S.ui.open.has(p)) S.ui.open.delete(p); else S.ui.open.add(p); commit(); };

function treeRows(v: string, total: number) {
  const out: ReactNode[] = [];
  const walk = (n, path: string, d: number) => {
    const kids = [...n.children.values()]; const has = kids.length || (n.sd && n.sd.length); const open = S.ui.open.has(path);
    out.push(
      <tr key={path} className={`d${d} ${has ? 'click' : ''}`} onClick={has ? () => tog(path) : undefined}>
        <td><span className="tg">{has ? (open ? '▾' : '▸') : ''}</span><span className="lbl">{n.label}</span>{n.sub && <> <span className="code">{n.sub}</span></>}</td>
        <td className="n">{n.leaf ? fQ(n.q) : ''}</td><td className="n">{n.peso ? fN(n.peso, 1) : ''}</td><CostCells n={n} total={total} />
      </tr>);
    if (!open) return;
    if (n.sd) n.sd.forEach((c, j) => {
      const q = n.q * num(c.q), a = q * num(c.p);
      out.push(<tr key={path + '#' + j} className="sd"><td>↳ {c.d} <span className="code">{c.c}</span></td><td className="n">{fQ(q)}</td><td></td><td colSpan={3}></td><td className="n">{fN(a)}</td>{R.T.altro ? <td></td> : null}<td className="n">{fN(a)}</td><td className="n">{pct(a, total)}</td></tr>);
    });
    kids.forEach(k => walk(k, path + '/' + k.key, d + 1));
  };
  for (const k of getTree(v).children.values()) walk(k, v + '/' + k.key, 0);
  return out;
}

export function Costi() {
  const P = S.prev, T = R.T, total = R.total;
  const big = COLS.filter(([k]) => T[k]).sort((a, b) => T[b[0]] - T[a[0]]).slice(0, 2).map(([k, l]) => `${l} ${pct(T[k], total)}`).join(' · ');
  const sImp = R.lines.filter(l => l.riga === 'imp').reduce((s, l) => s + tot(l), 0), sEx = R.lines.filter(l => l.riga === 'extra').reduce((s, l) => s + tot(l), 0);
  const v = S.ui.view;
  return (
    <>
      <TabTools />
      <Fold id="co-riep" step={1} title="Riepilogo preventivo" sum={<><b>{eur(total)}</b> · {fN(R.kwp, 2)} kWp · {R.kwp ? fN(total / (R.kwp * 1000), 4) : '–'} €/Wp</>}
        act={<button className="btn noprint" onClick={exportCSV}>Esporta CSV</button>}>{() => <>
        <div className="meta">
          <div>Cliente<b>{P.cliente || '–'}</b></div><div>Commessa<b>{P.rif || '–'}</b></div>
          <div>Data<b>{fDate(P.data)}</b></div><div>Modulo<b>{P.modulo.marca || '–'} · {fN(R.wp, 0)} Wp</b></div>
          <div>Acciaio<b>{fN(R.steel / 1000, 2)} t</b></div>
        </div>
        <div className="wrap"><table><tbody>
          <tr><th>Riga</th><th>Configurazione</th><th className="n">N.</th><th className="n">kWp</th><th className="n">€ / tracker</th><th className="n">Totale €</th></tr>
          {P.righe.map((r, i) => { const rr = R.righe[i], kw = (rr.moduli * R.wp) / 1000; return (
            <tr key={i}><td><span className="rid">R{i + 1}</span></td>
              <td>{r.taglia} moduli · {r.tipo} · {r.prof} · asse {r.asse} · omega {r.omega}{r.tipo === 'Basso' ? '' : ' · fond. ' + fL(r.lFond) + ' m'} · cusc. {fL(r.lCusc)} m</td>
              <td className="n">{fN(rr.n, 0)}</td><td className="n">{fN(kw, 2)}</td><td className="n">{rr.n ? fN(rr.tot / rr.n) : '–'}</td><td className="n">{fN(rr.tot)}</td></tr>); })}
          <tr><td></td><td>Componenti di impianto (quadri, centralina meteo)</td><td colSpan={3}></td><td className="n">{fN(sImp)}</td></tr>
          {sEx ? <tr><td></td><td>Voci extra</td><td colSpan={3}></td><td className="n">{fN(sEx)}</td></tr> : null}
          <tr className="tot"><td colSpan={2}>TOTALE · {fN(R.nModuli, 0)} moduli</td><td className="n">{fN(R.nTracker, 0)}</td><td className="n">{fN(R.kwp, 2)}</td><td></td><td className="n">{fN(total)}</td></tr>
        </tbody></table></div>
      </>}</Fold>

      <Fold id="co-cat" step={2} title="Costi per categoria e voce" sum={<><MiniBar T={T} total={total} />{big}</>}>{() => {
        const byCat: Record<string, any> = {}; for (const l of R.lines) { (byCat[l.cat] ??= zero()); addTo(byCat[l.cat], l); }
        return <>
          <div className="bar">{COLS.map(([k, , c]) => (T[k] ? <div key={k} style={{ width: `${(T[k] / total) * 100}%`, background: `var(${c})` }} /> : null))}</div>
          <div className="legend">{COLS.filter(([k]) => T[k]).map(([k, l, c]) => <span key={k}><i style={{ background: `var(${c})` }} />{l}<b>{eur(T[k])}</b>{pct(T[k], total)}</span>)}</div>
          <div className="wrap"><table><tbody>
            <tr><th>Categoria</th><th className="n">Peso kg</th><CostHead /></tr>
            {[...CATS, 'VOCI EXTRA', 'NON TROVATO'].map(c => { const n = byCat[c]; if (!n) return null; return (
              <tr key={c}><td className={`cat-${c.split(' ')[0]}`}><span className="dot" /><b>{c}</b></td><td className="n">{fN(n.peso, 1)}</td><CostCells n={n} total={total} /></tr>); })}
            <tr className="tot"><td>TOTALE</td><td className="n">{fN(T.peso, 1)}</td><CostCells n={T} total={total} /></tr>
          </tbody></table></div>
        </>;
      }}</Fold>

      <Fold id="co-tree" step={3} title="Esplosione dei costi" sum="Apri le voci una alla volta, fino al singolo componente"
        act={<><Seg path="ui.view" opts={[['cat', 'Per categoria'], ['grp', 'Per gruppo']]} /><button className="btn s" onClick={expandAll}>Espandi tutto</button><button className="btn s" onClick={() => { S.ui.open = new Set(); commit(); }}>Comprimi</button></>}>{() => (
        <div className="wrap"><table className="tree"><tbody>
          <tr><th>Voce</th><th className="n">Q.tà</th><th className="n">Peso kg</th><CostHead /></tr>
          {treeRows(v, total)}
          <tr className="tot"><td>TOTALE</td><td></td><td className="n">{fN(T.peso, 1)}</td><CostCells n={T} total={total} /></tr>
        </tbody></table></div>
      )}</Fold>
    </>
  );
}
