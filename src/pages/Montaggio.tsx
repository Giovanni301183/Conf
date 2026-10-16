// Scheda Montaggio: computo, Gantt di cantiere e listino montaggio. Separata dal costo del preventivo.
import { useState, type ReactNode } from 'react';
import { Fold, Inp, TabTools } from '../components/ui';
import { GHint, GanttFold } from '../components/Gantt';
import { downloadMontXlsx } from '../domain/excel';
import { eur, fN, fQ, vN } from '../domain/format';
import { MDRV, MPAR, defMont, num } from '../domain/model';
import { buildMont, commName, dFmt, dToday, gMont, opt } from '../domain/plan';
import { S, commit, save } from '../store/state';
import { printPage } from '../store/actions';

const done = () => { save(); commit(); };
const eu = (v: unknown) => (opt(v) ? fN(num(v)) : '–');
// Le voci con formula che da' zero (es. taglie non presenti) non si mostrano; quelle a quantita' manuale si'.
const hideRow = (r: any) => !r.q && !r.qMan && String(r.v.q ?? '').trim() !== '';

function Cell({ path, val, ph, man }: { path: string; val: string; ph: string; man: boolean }) {
  return <td className="in"><span className="noprint"><Inp path={path} type="optnum" ph={ph} cls={man ? 'ovr' : ''} /></span><span className="onlyprint">{val}</span></td>;
}

function MontList() {
  const M = gMont(), gs = [...new Set<string>(M.voci.map(v => v.g))];
  const [newG, setNewG] = useState(gs[0] ?? '');
  const add = () => {
    let g = newG;
    if (!g) { const x = prompt('Nome del nuovo gruppo:', 'ALTRO'); if (!x || !x.trim()) return; g = x.trim().toUpperCase(); }
    let at = M.voci.length - 1; M.voci.forEach((x, j) => { if (x.g === g) at = j; });
    M.voci.splice(at + 1, 0, { id: 'u' + Date.now().toString(36), g, c: '', d: 'Nuova voce', um: 'n', q: '', pf: '', pp: '' }); S.ui.folds['mo-list'] = true; done();
  };
  const del = (i: number) => { const x = M.voci[i]; if (!confirm(`Eliminare la voce "${x.c} ${x.d}" dal listino montaggio?`)) return; M.voci.splice(i, 1); done(); };
  const reset = () => { if (!confirm('Ripristinare il listino montaggio predefinito? Prezzi, parametri del cantiere e voci aggiunte andranno persi.')) return; S.data.mont = defMont(); done(); };
  return <>
    <p className="hint">Prezzi unitari di <b>fornitura</b> e di <b>posa</b>, uguali per tutti i preventivi: lascia vuoto dove non serve. <b>Quantità</b> = formula sui dati della configurazione (vuota = la scrivi nel computo del preventivo).
      Puoi usare: {MDRV.map(([k, l], i) => <span key={k}>{i ? ' · ' : ''}<code>{k}</code> {l}</span>)}. Esempi: <code>PALI</code>, <code>T36</code>, <code>GG*SQ</code>, <code>1</code> (a corpo).</p>
    <datalist id="mgr">{gs.map(g => <option key={g} value={g} />)}</datalist>
    <div className="wrap"><table className="rows"><tbody>
      <tr><th>Gruppo</th><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Quantità</th><th className="n">Fornitura €/u</th><th className="n">Posa €/u</th><th></th></tr>
      {M.voci.map((_, i) => { const p = `data.mont.voci.${i}.`; return (
        <tr key={i}>
          <td style={{ minWidth: 170 }}><Inp path={p + 'g'} type="txt" list="mgr" /></td><td style={{ width: 100 }}><Inp path={p + 'c'} type="txt" /></td><td style={{ minWidth: 320 }}><Inp path={p + 'd'} type="txt" /></td>
          <td style={{ width: 80 }}><Inp path={p + 'um'} type="txt" /></td><td style={{ width: 110 }}><Inp path={p + 'q'} type="txt" ph="nel preventivo" /></td>
          <td style={{ width: 115 }}><Inp path={p + 'pf'} type="optnum" ph="–" /></td><td style={{ width: 115 }}><Inp path={p + 'pp'} type="optnum" ph="–" /></td>
          <td><button className="btn x" onClick={() => del(i)} title="Elimina">✕</button></td>
        </tr>); })}
    </tbody></table></div>
    <div className="toolbar"><span className="muted">Nuova voce nel gruppo</span>
      <select value={newG} onChange={e => setNewG(e.target.value)}>{gs.map(g => <option key={g} value={g}>{g}</option>)}<option value="">Nuovo gruppo…</option></select>
      <button className="btn" onClick={add}>+ Aggiungi voce</button><span style={{ flex: 1 }} /><button className="btn s" onClick={reset}>Ripristina voci predefinite</button></div>
  </>;
}

export function Montaggio() {
  const M = buildMont();
  const nHid = M.rows.filter(hideRow).length;
  return (
    <>
      <div className="card head"><div className="headrow">
        <div><h2>Montaggio</h2>
          <p className="hint" style={{ margin: 0 }}>Computo e pianificazione del cantiere, dalla progettazione al collaudo. È separato dal preventivo: non entra nel costo totale né nel prezzo di vendita.</p></div>
        <span className="sp" />
        <button className="btn" onClick={() => printPage(['mo-comp', 'mo-gantt'])}>Stampa / PDF</button><button className="btn p" onClick={downloadMontXlsx}>Scarica Excel</button>
      </div></div>
      <TabTools />
      <Fold id="mo-comp" step={1} title="Computo montaggio" cls="pcard"
        sum={<>{M.rows.filter(r => r.q > 0).length} voci con quantità · fornitura {eur(M.tf)} · posa {eur(M.tp)} · <b>&nbsp;totale {eur(M.tot)}</b>{M.miss ? <>&nbsp;· <span style={{ color: 'var(--warn)' }}>{M.miss} voci senza prezzo</span></> : null}</>}>{() => {
        const rows: ReactNode[] = [];
        for (const g of M.gruppi) {
          const t = (k: string) => g.rows.reduce((a, r) => a + r[k], 0), vis = g.rows.filter(r => !hideRow(r)); if (!vis.length) continue;
          rows.push(<tr key={g.g} className="g1"><td colSpan={9}>{g.g}</td></tr>);
          for (const r of vis) {
            const id = r.v.id;
            rows.push(
              <tr key={id} className={`${r.q ? '' : 'zero'}${r.miss ? ' miss' : ''}`}><td><span className="code">{r.v.c}</span></td><td className="desc">{r.v.d}</td><td>{r.v.um}</td>
                <Cell path={'prev.mont.q.' + id} val={fQ(r.q)} ph={fQ(r.auto)} man={r.qMan} />
                <Cell path={'prev.mont.pf.' + id} val={eu(r.pf)} ph={opt(r.v.pf) ? vN(r.v.pf) : '–'} man={r.fMan} />
                <Cell path={'prev.mont.pp.' + id} val={eu(r.pp)} ph={opt(r.v.pp) ? vN(r.v.pp) : '–'} man={r.pMan} />
                <td className="n">{fN(r.tf)}</td><td className="n">{fN(r.tp)}</td><td className="n"><b>{fN(r.tot)}</b></td></tr>);
          }
          rows.push(<tr key={g.g + '-tot'} className="tot"><td colSpan={6}>Totale · {g.g}</td><td className="n">{fN(t('tf'))}</td><td className="n">{fN(t('tp'))}</td><td className="n">{fN(t('tot'))}</td></tr>);
        }
        return <>
          <div className="onlyprint gtitle"><b>Computo montaggio</b> · {commName()} · emesso il {dFmt(dToday())}</div>
          <p className="hint noprint">Quantità calcolate dalla configurazione, prezzi dal <b>Listino montaggio</b> (tendina 3). Qui li correggi solo per questo preventivo: in grigio il valore calcolato o di listino. Le voci senza prezzo hanno il bordo dorato.</p>
          <div className="wrap"><table className="dl mc"><tbody>
            <tr><th>Codice</th><th>Descrizione</th><th>U.M.</th><th className="n">Q.tà</th><th className="n">Fornitura €/u</th><th className="n">Posa €/u</th><th className="n">Fornitura €</th><th className="n">Posa €</th><th className="n">Totale €</th></tr>
            {rows}
            <tr className="tot"><td colSpan={6}>TOTALE MONTAGGIO</td><td className="n">{fN(M.tf)}</td><td className="n">{fN(M.tp)}</td><td className="n">{fN(M.tot)}</td></tr>
          </tbody></table></div>
          {nHid ? <p className="hint noprint" style={{ margin: '10px 0 0' }}>{nHid} voci a zero non mostrate (taglie o componenti non presenti nel preventivo): restano nel listino montaggio.</p> : null}
        </>;
      }}</Fold>

      <GanttFold G={M.G} o={{
        id: 'mo-gantt', step: 2, title: 'Gantt di montaggio', pd: 'prev.mont', endLabel: 'Fine montaggio', onPrint: () => printPage(['mo-gantt']),
        hint: <>Progettazione, pull-out test e tracciamento partono dall'avvio commessa. Il cantiere comincia dopo il tracciamento e la <b>prima consegna</b>; gli assi dopo l'<b>ultima consegna</b> (date prese dal Gantt di produzione). Durate in giorni lavorativi; le fasi a quantità si dividono per il numero di squadre. <GHint />{' '}
          {M.G.gg ? <>Giorni di cantiere (driver <code>GG</code> del computo): <b>{M.G.gg}</b>.</> : 'Compila i parametri del cantiere qui sotto per ottenere le durate.'}</>,
        par: { id: 'mo-gpar', title: 'Parametri del cantiere', sum: 'valgono per tutti i preventivi', keys: MPAR as [string, string][], base: 'data.mont.par' },
      }} />

      <Fold id="mo-list" step={3} title="Listino montaggio" sum={`${M.rows.length} voci · ${M.rows.filter(r => opt(r.v.pf) || opt(r.v.pp)).length} con prezzo · valgono per tutti i preventivi`}>{() => <MontList />}</Fold>
    </>
  );
}
