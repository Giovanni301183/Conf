// Scheda Listino: componenti per categoria, tutti modificabili; sotto-distinte dei quadri.
import { Fragment, useState } from 'react';
import { Fold, Inp, SubFold, TabTools } from '../components/ui';
import { costLine, tot, unitCost } from '../domain/compute';
import { exportListinoCSV } from '../domain/excel';
import { download, fN, vN } from '../domain/format';
import { CATS, IMP, num } from '../domain/model';
import { S, commit, save } from '../store/state';
import { pickFile, resetData } from '../store/actions';

const TIPI = { barra: 'Profili a barra — prezzati al metro', pezzo: 'Carpenteria e pezzi speciali — prezzati a pezzo', comm: 'Componenti — prezzati a pezzo' };
const done = () => { save(); commit(); };
// Riga nascosta dalla ricerca per codice o descrizione.
const hid = (it: any) => { const q = S.ui.filter.trim().toLowerCase(); return !!q && !(it.c + ' ' + it.d).toLowerCase().includes(q) ? 'hide' : undefined; };

function delItem(i: number) {
  const D = S.data, it = D.listino[i];
  const used = D.template.some(t => t.c === it.c) || Object.values(D.sizes).some((s: any) => s.assi.some(x => x.c === it.c)) || IMP.some(x => x[1] === it.c);
  if (!confirm(`Eliminare "${it.c} — ${it.d}"?` + (used ? '\n\nATTENZIONE: il codice è usato nelle distinte.' : ''))) return;
  D.listino.splice(i, 1); S.ui.openSd.clear(); done();
}
const CodeCell = ({ i }: { i: number }) => {
  const it = S.data.listino[i];
  return <td style={{ minWidth: 120 }}>{it.u ? <Inp path={`data.listino.${i}.c`} type="txt" /> : <span className="code">{it.c}</span>}</td>;
};
const DelBtn = ({ i }: { i: number }) => <td><button className="btn x" onClick={() => delItem(i)} title="Elimina">✕</button></td>;

function TableBarre({ ii, t }: { ii: number[]; t: string }) {
  const L = S.data.listino, mz = num(S.data.params.maggZinc), u = t === 'barra' ? 'm' : 'pz';
  return (
    <div className="wrap"><table><tbody>
      <tr><th>Codice</th><th>Descrizione</th><th>Sottogruppo</th><th className="n">{t === 'barra' ? 'kg/m teorico' : 'Peso netto kg'}</th><th className="n">€/kg acq.</th><th className="n">€/kg zinc.</th><th className="n">€/kg lav.</th>
        <th className="n">Mat. €/{u}</th><th className="n">Zinc. €/{u}</th><th className="n">Lavoraz. €/{u}</th><th className="n">Totale €/{u}</th><th></th></tr>
      {ii.map(i => {
        const it = L[i], c = costLine(it, 1, 1, mz), p = `data.listino.${i}.`;
        return (
          <tr key={i} className={hid(it)}>
            <CodeCell i={i} />
            <td style={{ minWidth: 190 }}><Inp path={p + 'd'} type="txt" /></td><td style={{ minWidth: 105 }}><Inp path={p + 'sub'} type="txt" /></td>
            {['kg', 'acq', 'zn', 'lav'].map(k => <td key={k} style={{ width: 90 }}><Inp path={p + k} /></td>)}
            <td className="n calc">{fN(c.mat, 3)}</td><td className="n calc">{fN(c.zinc, 3)}</td><td className="n calc">{fN(c.lav, 3)}</td><td className="n calc"><b>{fN(tot(c), 3)}</b></td>
            <DelBtn i={i} />
          </tr>
        );
      })}
    </tbody></table></div>
  );
}

function TableComm({ ii }: { ii: number[] }) {
  const L = S.data.listino, open = S.ui.openSd;
  const toggleSd = (i: number) => {
    const it = L[i];
    if (!it.sd || !it.sd.length) { it.sd = [{ c: '', d: 'Componente', q: 1, p: num(it.costo) }]; open.add(i); }
    else if (open.has(i)) open.delete(i); else open.add(i);
    done();
  };
  const delSd = (i: number, j: number) => { const it = L[i]; it.sd.splice(j, 1); if (!it.sd.length) { delete it.sd; open.delete(i); } done(); };
  return (
    <div className="wrap"><table><tbody>
      <tr><th>Codice</th><th>Descrizione</th><th>Sottogruppo</th><th className="n">Peso kg/pz</th><th className="n">Costo €/pz</th><th>Sotto-distinta</th><th></th></tr>
      {ii.map(i => {
        const it = L[i], hasSd = it.sd && it.sd.length, p = `data.listino.${i}.`;
        return (
          <Fragment key={i}>
            <tr className={hid(it)}>
              <CodeCell i={i} />
              <td style={{ minWidth: 190 }}><Inp path={p + 'd'} type="txt" /></td><td style={{ minWidth: 105 }}><Inp path={p + 'sub'} type="txt" /></td>
              <td style={{ width: 90 }}><Inp path={p + 'kg'} /></td>
              <td style={{ width: 110 }}>{hasSd ? <div className="n calc right" title="Somma della sotto-distinta">{fN(unitCost(it))}</div> : <Inp path={p + 'costo'} />}</td>
              <td><button className="btn s" onClick={() => toggleSd(i)}>{hasSd ? `Sotto-distinta (${it.sd.length}) ${open.has(i) ? '▴' : '▾'}` : '+ crea sotto-distinta'}</button></td>
              <DelBtn i={i} />
            </tr>
            {hasSd && open.has(i) && (
              <tr className={hid(it)}><td colSpan={7} className="sdbox"><table><tbody>
                <tr><th>Codice</th><th>Descrizione</th><th className="n">Q.tà</th><th className="n">Prezzo unit. €</th><th className="n">Importo €</th><th></th></tr>
                {it.sd.map((r, j) => (
                  <tr key={j}>
                    <td style={{ width: 160 }}><Inp path={`${p}sd.${j}.c`} type="txt" /></td><td><Inp path={`${p}sd.${j}.d`} type="txt" /></td>
                    <td style={{ width: 80 }}><Inp path={`${p}sd.${j}.q`} /></td><td style={{ width: 100 }}><Inp path={`${p}sd.${j}.p`} /></td>
                    <td className="n calc">{fN(num(r.q) * num(r.p))}</td><td><button className="btn x" onClick={() => delSd(i, j)}>✕</button></td>
                  </tr>
                ))}
                <tr className="tot"><td colSpan={4}>Totale €/pz <button className="btn s" onClick={() => { it.sd.push({ c: '', d: '', q: 1, p: 0 }); done(); }}>+ riga</button></td><td className="n">{fN(unitCost(it))}</td><td></td></tr>
              </tbody></table></td></tr>
            )}
          </Fragment>
        );
      })}
    </tbody></table></div>
  );
}

// Applica a tutta la Struttura un €/kg di acquisto, zincatura o lavorazione. La zincatura solo sulle voci gia' zincate.
function Bulk() {
  const [vals, setVals] = useState<Record<string, string>>({ acq: '', zn: '', lav: '' });
  const apply = (k: string) => {
    const x = vals[k]; if (x.trim() === '') return; const val = num(x);
    const its = S.data.listino.filter(it => it.cat === 'STRUTTURA' && it.t !== 'comm' && (k !== 'zn' || num(it.zn) > 0));
    if (!confirm(`Impostare ${val} €/kg (${{ acq: 'acquisto', zn: 'zincatura', lav: 'lavorazione' }[k]}) su ${its.length} voci di Struttura?`)) return;
    its.forEach(it => (it[k] = val)); done();
  };
  const f = (k: string, label: string, title?: string) => <>
    {label} <input inputMode="decimal" value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /> <button className="btn s" onClick={() => apply(k)} title={title}>Applica</button>
  </>;
  return <div className="toolbar noprint"><span className="muted">Applica a tutta la Struttura:</span>
    {f('acq', '€/kg acquisto')}{f('zn', '€/kg zincatura', 'Solo sulle voci già zincate')}{f('lav', '€/kg lavorazione')}</div>;
}

function AddItem({ cat }: { cat: string }) {
  const [t, setT] = useState(cat === 'STRUTTURA' ? 'barra' : 'comm');
  const add = () => {
    S.data.listino.push({ c: 'NUOVO-' + (Date.now() % 100000), d: 'Nuova voce', cat, sub: t === 'barra' ? 'Profili a barra' : t === 'pezzo' ? 'Carpenteria' : 'Componenti', t, kg: 0, acq: 0, zn: 0, lav: 0.3, costo: 0, u: true });
    S.ui.filter = ''; S.ui.folds['li-' + cat] = true; S.ui.folds[`li-${cat}-${t}`] = true; done();
  };
  return <>
    <select value={t} onChange={e => setT(e.target.value)}>
      {cat === 'STRUTTURA' && <><option value="barra">Profilo a barra (€/m)</option><option value="pezzo">Pezzo di carpenteria (€/pz)</option></>}
      <option value="comm">Componente (€/pz)</option>
    </select>
    <button className="btn" onClick={add}>+ Aggiungi voce</button>
  </>;
}

export function Listino() {
  const L = S.data.listino, mz = num(S.data.params.maggZinc);
  const onFilter = (v: string) => {
    // La ricerca apre le tendine del listino; cancellarla non le richiude.
    if (!S.ui.filter.trim() && v.trim()) for (const c of CATS) { S.ui.folds['li-' + c] = true; for (const t of ['barra', 'pezzo', 'comm']) S.ui.folds[`li-${c}-${t}`] = true; }
    S.ui.filter = v; commit();
  };
  return (
    <>
      <div className="card head"><div className="headrow">
        <div><h2>Listino componenti</h2><p className="hint" style={{ margin: 0 }}>Ogni valore è modificabile e il preventivo si ricalcola subito. Apri una categoria per vedere le voci.</p></div>
        <span className="sp" />
        <input placeholder="Cerca codice o descrizione…" value={S.ui.filter} onChange={e => onFilter(e.target.value)} style={{ width: 250 }} />
      </div></div>
      <TabTools />
      <Fold id="li-param" title="Parametri generali e dati" sum={`Maggiorazione peso zincatura ${vN(Math.round(mz * 10000) / 100)} % · esporta, importa o ripristina il listino`}>{() => <>
        <div className="toolbar"><label className="f">Maggiorazione peso zincatura (%)<Inp path="data.params.maggZinc" type="pct" /></label></div>
        <div className="toolbar">
          <button className="btn" onClick={exportListinoCSV}>Esporta CSV</button>
          <button className="btn" onClick={() => download('listino_distinte_tracker.json', JSON.stringify({ tipo: 'dati', data: S.data }, null, 1))}>Esporta dati (JSON)</button>
          <button className="btn" onClick={() => pickFile('data')}>Importa dati</button>
          <button className="btn" onClick={resetData}>Ripristina da Excel</button>
          <span className="muted">I dati restano salvati in questo browser; "Esporta dati" ne fa una copia.</span>
        </div>
      </>}</Fold>
      {CATS.map(cat => {
        const idx = L.map((_, i) => i).filter(i => L[i].cat === cat);
        const types = ['barra', 'pezzo', 'comm'].filter(t => idx.some(i => L[i].t === t));
        return (
          <Fold key={cat} id={'li-' + cat} cls={`cat cat-${cat}`} title={<><span className="dot" />{cat}</>}
            sum={`${idx.length} voci` + (types.length > 1 ? ' · ' + types.map(t => ({ barra: 'profili', pezzo: 'carpenteria', comm: 'componenti' })[t]).join(', ') : '')}
            act={<AddItem cat={cat} />}>
            {() => <>
              {cat === 'STRUTTURA' && <Bulk />}
              {types.map(t => {
                const ii = idx.filter(i => L[i].t === t);
                const tb = () => (t === 'comm' ? <TableComm ii={ii} /> : <TableBarre ii={ii} t={t} />);
                return types.length > 1 ? <SubFold key={t} id={`li-${cat}-${t}`} title={TIPI[t]} sum={`${ii.length} voci`}>{tb}</SubFold> : <Fragment key={t}>{tb()}</Fragment>;
              })}
            </>}
          </Fold>
        );
      })}
    </>
  );
}
