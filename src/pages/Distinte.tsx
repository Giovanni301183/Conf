// Scheda Distinte base: driver per taglia, blocco assi per taglia, distinta comune.
import { Fold, Inp, Sel, Seg, TabTools } from '../components/ui';
import { fL } from '../domain/format';
import { GROUPS, SIZES0, TEMPLATE0, clone } from '../domain/model';
import { S, commit, save } from '../store/state';

const done = () => { save(); commit(); };
const codeOpts = (extra: [string, string][]) => [...extra, ...S.data.listino.map(x => [x.c, `${x.c} — ${x.d}`] as [string, string])];
const assiTxt = (s: any) => s.assi.filter(a => a.c === '$ASSE').map(a => `${a.q}×${fL(a.L)} m`).join(' + ');
const PH: [string, string][] = [['$PROF', '$PROF — profilo pilastri (IPE/IPEA)'], ['$OMEGA', '$OMEGA — omega scelto (2,0/1,8)'], ['$ASSE', '$ASSE — asse scelto']];

export function Distinte() {
  const D = S.data, sizes = D.sizes, keys = Object.keys(sizes).sort((a: any, b: any) => a - b);
  if (!sizes[S.ui.sizeSel]) S.ui.sizeSel = keys[0];
  const sel = S.ui.sizeSel, s = sizes[sel];
  const resetDistinte = () => { if (!confirm("Ripristinare le distinte ai valori dell'Excel?")) return; D.template = clone(TEMPLATE0); D.sizes = clone(SIZES0); done(); };
  return (
    <>
      <TabTools />
      <Fold id="di-taglie" title="Taglie di tracker" sum={`${keys.length} taglie · ${keys.join(' / ')} moduli`} act={<button className="btn" onClick={resetDistinte}>Ripristina da Excel</button>}>{() => <>
        <p className="hint">I numeri sono i <b>driver</b> delle quantità: MOT = pilastri motore, CUSC = pilastri cuscinetto, OMEGA = kit omega, PANN = kit pannello (= numero di moduli).</p>
        <div className="wrap"><table><tbody>
          <tr><th>Taglia</th><th className="n">MOT</th><th className="n">CUSC</th><th className="n">OMEGA</th><th className="n">PANN</th><th>Assi</th></tr>
          {keys.map(k => (
            <tr key={k}><td><b>{k} moduli</b></td>
              {['mot', 'cusc', 'omega'].map(f => <td key={f} style={{ width: 100 }}><Inp path={`data.sizes.${k}.${f}`} /></td>)}
              <td className="n calc">{k}</td>
              <td>{assiTxt(sizes[k])} <button className="btn s" onClick={() => { S.ui.sizeSel = k; S.ui.folds['di-assi'] = true; commit(); }}>modifica</button></td></tr>
          ))}
        </tbody></table></div>
      </>}</Fold>

      <Fold id="di-assi" title="Blocco assi di rotazione" sum={`${sel} moduli: ${assiTxt(s)}`}
        act={<><Seg path="ui.sizeSel" opts={keys.map(k => [k, k] as const)} /><button className="btn" onClick={() => { s.assi.push({ c: '$ASSE', d: 'Asse', L: 6, q: '2' }); done(); }}>+ riga</button></>}>{() => <>
        <p className="hint">Codice <code>$ASSE</code> = asse scelto in configurazione (3,0 o 2,5 mm). Quantità per tracker.</p>
        <div className="wrap"><table><tbody>
          <tr><th>Codice</th><th>Descrizione</th><th className="n">Lungh. m</th><th className="n">Q.tà</th><th></th></tr>
          {s.assi.map((_, j) => { const p = `data.sizes.${sel}.assi.${j}.`; return (
            <tr key={j}>
              <td style={{ width: 340 }}><Sel path={p + 'c'} opts={codeOpts([['$ASSE', '$ASSE — asse scelto (3,0 / 2,5 mm)']])} /></td>
              <td><Inp path={p + 'd'} type="txt" ph="(da listino)" /></td><td style={{ width: 100 }}><Inp path={p + 'L'} type="lexpr" /></td>
              <td style={{ width: 120 }}><Inp path={p + 'q'} type="txt" cls="n" /></td>
              <td><button className="btn x" onClick={() => { s.assi.splice(j, 1); done(); }}>✕</button></td>
            </tr>); })}
        </tbody></table></div>
      </>}</Fold>

      {GROUPS.filter(g => g !== 'ASSI DI ROTAZIONE').map(g => {
        const rows = D.template.map((_, j) => j).filter(j => D.template[j].g === g);
        const addTpl = () => { let at = -1; D.template.forEach((t, j) => { if (t.g === g) at = j; }); D.template.splice(at + 1, 0, { g, c: D.listino[0].c, d: '', L: '', qa: 'MOT*1', qb: '' }); done(); };
        return (
          <Fold key={g} id={'di-g-' + g} title={g.charAt(0) + g.slice(1).toLowerCase()} sum={`${rows.length} righe · comuni a tutte le taglie`} act={<button className="btn" onClick={addTpl}>+ riga</button>}>{() => <>
            <p className="hint">Quantità come formula dei driver (es. <code>CUSC*2</code>, <code>OMEGA*4+PANN*4</code>). "Basso" vuoto = come Agrivoltaico, <code>0</code> = assente nel basso.
              Lunghezze in metri oppure <code>$LFOND</code>, <code>$LCUSC</code>, <code>$LMOT</code>.</p>
            <div className="wrap"><table><tbody>
              <tr><th>Codice</th><th>Descrizione</th><th className="n">Lungh.</th><th className="n">Q.tà Agrivoltaico</th><th className="n">Q.tà Basso</th><th>Gruppo</th><th></th></tr>
              {rows.map(j => { const p = `data.template.${j}.`; return (
                <tr key={j}>
                  <td style={{ width: 300 }}><Sel path={p + 'c'} opts={codeOpts(PH)} /></td>
                  <td><Inp path={p + 'd'} type="txt" ph="(da listino)" /></td><td style={{ width: 90 }}><Inp path={p + 'L'} type="lexpr" /></td>
                  <td style={{ width: 140 }}><Inp path={p + 'qa'} type="txt" cls="n" /></td><td style={{ width: 110 }}><Inp path={p + 'qb'} type="txt" cls="n" ph="= Agri" /></td>
                  <td style={{ width: 170 }}><Sel path={p + 'g'} opts={GROUPS} /></td>
                  <td><button className="btn x" onClick={() => { D.template.splice(j, 1); done(); }}>✕</button></td>
                </tr>); })}
            </tbody></table></div>
          </>}</Fold>
        );
      })}
    </>
  );
}
