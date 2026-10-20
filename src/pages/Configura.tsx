// Scheda Configura: commessa, modulo FV, righe tracker, componenti di impianto.
import { useState } from 'react';
import { DateInp, Fold, Inp, Sel, Seg, TabTools } from '../components/ui';
import { geocode } from '../lib/geo';
import { toast } from '../store/actions';
import { unitCost } from '../domain/compute';
import { eur, fDate, fL, fN } from '../domain/format';
import { IMP, MIN_CUSC, OPT_LCUSC, OPT_LFOND, STATI, clone, defRiga, num } from '../domain/model';
import { R, S, commit, save } from '../store/state';
import { AgendaPreventivo } from './Calendario';

const done = () => { save(); commit(); };

// Localita' dell'impianto: il testo resta quello scritto; "Trova" aggiunge le coordinate per la mappa.
function Luogo() {
  const lu = S.prev.luogo, [busy, setBusy] = useState(false), pos = lu.lat != null && lu.lng != null;
  const trova = async () => {
    setBusy(true);
    try {
      const r = await geocode(lu.nome);
      if (r) { lu.lat = r.lat; lu.lng = r.lng; toast(`Trovato: ${r.nome}`); } else toast(`"${lu.nome}" non trovato: prova con comune e provincia`);
    } catch (err) { toast('Ricerca della località non riuscita: ' + (err as Error).message); }
    setBusy(false); done();
  };
  return (
    <div className="f" style={{ gridColumn: 'span 2' }}>Località dell'impianto
      <span className="lrow">
        <Inp path="prev.luogo.nome" type="txt" ph="es. Foggia (FG)" />
        <button className="btn s" disabled={busy || !lu.nome.trim()} onClick={trova}>{busy ? 'Cerco…' : pos ? 'Ritrova' : 'Trova sulla mappa'}</button>
        {pos && <span className="muted small" title="Coordinate">{fN(lu.lat, 4)}, {fN(lu.lng, 4)} <button className="btn x" title="Togli le coordinate" onClick={() => { lu.lat = null; lu.lng = null; done(); }}>✕</button></span>}
      </span>
    </div>
  );
}

export function Configura() {
  const P = S.prev, sizes = Object.keys(S.data.sizes).sort((a: any, b: any) => a - b);
  const comm = [P.num && 'N° ' + P.num, P.cliente, P.rif].filter(Boolean).join(' · ');
  const rsum = P.righe.map((r, i) => `R${i + 1}: ${num(r.n)} × ${r.taglia} mod ${r.tipo}`).join(' · ');
  const map = new Map<string, any>(S.data.listino.map(x => [x.c, x]));
  const nImp = IMP.reduce((s, [k]) => s + num(P.imp[k]), 0);
  const addRiga = () => { P.righe.push(defRiga()); S.ui.folds['cf-trk'] = true; done(); };
  const delRiga = (i: number) => { if (P.righe.length > 1 || confirm("Eliminare l'ultima riga tracker?")) P.righe.splice(i, 1); done(); };
  return (
    <>
      <TabTools />
      <AgendaPreventivo />
      <Fold id="cf-comm" step={1} title="Commessa" sum={(comm || 'Da compilare') + ' · ' + fDate(P.data)}>{() => (
        <div className="grid">
          <label className="f">N° preventivo<Inp path="prev.num" type="txt" ph="assegnato al salvataggio" /></label>
          <label className="f">Cliente<Inp path="prev.cliente" type="txt" /></label>
          <label className="f">Riferimento commessa<Inp path="prev.rif" type="txt" /></label>
          <label className="f">Data<DateInp path="prev.data" /></label>
          <label className="f">Stato<Sel path="prev.stato" opts={STATI.map(([k, l, , ic]) => [k, `${ic} ${l}`] as const)} /></label>
          <Luogo />
          <label className="f" style={{ gridColumn: '1/-1' }}>Note<Inp path="prev.note" type="txt" /></label>
        </div>
      )}</Fold>

      <Fold id="cf-mod" step={2} title="Moduli fotovoltaici" sum={`${P.modulo.marca || 'Modulo'} · ${fN(R.wp, 0)} Wp → ${fN(R.kwp, 2)} kWp`}>{() => <>
        <p className="hint">Il modulo serve solo a calcolare la potenza (kWp) e il €/Wp.</p>
        <div className="grid">
          <label className="f">Marca / modello<Inp path="prev.modulo.marca" type="txt" ph="es. Marca XYZ 600W" /></label>
          <label className="f">Potenza modulo (Wp)<Inp path="prev.modulo.wp" /></label>
          <label className="f">Moduli totali<span className="stat">{fN(R.nModuli, 0)}</span></label>
          <label className="f">Potenza impianto<span className="stat">{fN(R.kwp, 2)} kWp</span></label>
        </div>
      </>}</Fold>

      <Fold id="cf-trk" step={3} title="Tracker" sum={rsum} act={<button className="btn p" onClick={addRiga}>+ Aggiungi riga</button>}>{() => <>
        <div className="wrap"><table className="rows"><tbody>
          <tr><th>#</th><th>Taglia</th><th className="n">N.</th><th>Tipo</th><th>Pilastri</th><th>Asse</th><th>Omega</th>
            <th>Fondazione</th><th>Cuscinetto</th><th className="n">Motore</th><th className="n">€ / tracker</th><th></th></tr>
          {P.righe.map((r, i) => {
            const rr = R.righe[i], p = `prev.righe.${i}.`;
            const lc = OPT_LCUSC.filter(x => x >= MIN_CUSC[r.tipo] - 1e-9);
            return (
              <tr key={i}>
                <td><span className="rid">R{i + 1}</span></td>
                <td style={{ minWidth: 112 }}><Sel path={p + 'taglia'} opts={sizes.map(k => [k, k + ' moduli'] as const)} /></td>
                <td style={{ width: 64 }}><Inp path={p + 'n'} /></td>
                <td><Seg path={p + 'tipo'} opts={['Agrivoltaico', 'Basso']} /></td>
                <td><Seg path={p + 'prof'} opts={[['IPE 140', 'IPE'], ['IPEA 140', 'IPEA']]} /></td>
                <td><Seg path={p + 'asse'} opts={[['3,0', '3,0 mm'], ['2,5', '2,5 mm']]} /></td>
                <td><Seg path={p + 'omega'} opts={[['2,0', '2,0 mm'], ['1,8', '1,8 mm']]} /></td>
                <td style={{ minWidth: 92 }}>{r.tipo === 'Basso' ? <span className="muted">—</span> : <Sel path={p + 'lFond'} type="num" opts={OPT_LFOND.map(x => [x, fL(x) + ' m'] as const)} />}</td>
                <td style={{ minWidth: 92 }}><Sel path={p + 'lCusc'} type="num" opts={lc.map(x => [x, fL(x) + ' m'] as const)} /></td>
                <td className="n calc">{fL(num(r.lCusc) - 0.08)} m</td>
                <td className="n"><b>{rr.n ? eur(rr.tot / rr.n) : '–'}</b></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn x" onClick={() => { P.righe.splice(i + 1, 0, clone(r)); done(); }} title="Duplica per confrontare varianti">⧉</button>
                  <button className="btn x" onClick={() => delRiga(i)} title="Elimina">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody></table></div>
        <p className="hint" style={{ margin: '10px 0 0' }}>Agrivoltaico = pilastro in 2 pezzi con piastre di giunzione, cuscinetto da 2,30 m · Basso = pilastro unico senza piastre, cuscinetto da 2,80 m · Motore = cuscinetto − 0,08 m.</p>
      </>}</Fold>

      <Fold id="cf-imp" step={4} title="Componenti di impianto" sum={`Quadri e centralina meteo · ${fN(nImp, 0)} pezzi`}>{() => <>
        <p className="hint">Quantità per l'intera commessa: non si moltiplicano per il numero di tracker.</p>
        <div className="grid imps">
          {IMP.map(([k, code]) => { const it = map.get(code); return (
            <label key={k} className="f imp"><span>{it ? it.d : code}<em>{eur(it ? unitCost(it) : 0)} / pz</em></span><Inp path={'prev.imp.' + k} /></label>
          ); })}
        </div>
      </>}</Fold>
    </>
  );
}
