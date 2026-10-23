// Scheda Margini: margine generale e per categoria, prezzo di vendita; prezzo spot che ricalcola i margini.
import { useState } from 'react';
import { Fold, Inp, Seg, TabTools } from '../components/ui';
import { eur, fN, fP } from '../domain/format';
import { margineSpot, perCategoria } from '../domain/margini';
import { LAV_CAT, MCATS, ZINC_CAT, normPrev, num } from '../domain/model';
import { R, S, commit, save } from '../store/state';

export function Margini() {
  const P = normPrev(S.prev), M = P.marg, C = R.total, V = R.prezzo, mg = V - C, ric = M.modo === 'ricarico';
  // Prezzo spot: si scrive il totale voluto, si vede di quanti punti cambiano i margini e si applica.
  const [spot, setSpot] = useState(''), sv = num(spot.replace(/\./g, '').replace(',', '.'));
  const prova = spot.trim() ? margineSpot(S.data, P, sv) : null;
  const applica = () => { if (!prova || 'errore' in prova) return; S.prev.marg = prova.marg; setSpot(''); save(); commit(); };
  const wpS = (x: number) => (R.kwp ? fN(x / (R.kwp * 1000), 4) : '–');
  // Lavorazione e zincatura si contano a parte, nella loro categoria: le altre categorie mostrano il costo senza di esse.
  const byCat = perCategoria(R);
  const own = MCATS.filter(c => M.cat[c] !== '' && M.cat[c] != null);
  const sum = (k: string) => R.lines.filter(l => l.riga === k).reduce((s, l) => s + l.prezzo, 0), pImp = sum('imp'), pEx = sum('extra');
  return (
    <>
      <TabTools />
      <Fold id="mg-imp" step={1} title="Margine generale" sum={`${ric ? 'Ricarico sul costo' : 'Margine sul prezzo'} · ${fP(num(M.gen))}`}>{() => <>
        <div className="grid">
          <div className="f">Come si calcola<Seg path="prev.marg.modo" opts={[['margine', 'Margine sul prezzo'], ['ricarico', 'Ricarico sul costo']]} /></div>
          <label className="f">{ric ? 'Ricarico' : 'Margine'} generale (%)<Inp path="prev.marg.gen" /></label>
          <label className="f">Margine risultante<span className="stat">{eur(mg)}</span></label>
          <label className="f">Prezzo di vendita<span className="stat">{eur(V)}</span></label>
        </div>
        <p className="hint" style={{ margin: '12px 0 0' }}>{ric ? 'Ricarico: prezzo = costo × (1 + %). Es. costo 100 €, ricarico 25 % → prezzo 125 €.' : 'Margine sul prezzo: prezzo = costo ÷ (1 − %). Es. costo 100 €, margine 20 % → prezzo 125 € (il margine è il 20 % del prezzo).'}
          {' '}Vale per tutte le categorie, salvo quelle con un valore proprio al passo 2.</p>
        <div className="grid" style={{ marginTop: 14, alignItems: 'end' }}>
          <label className="f">Prezzo spot (€)<input value={spot} inputMode="decimal" placeholder={fN(V, 0)} onChange={e => setSpot(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applica(); }} /></label>
          {prova && ('errore' in prova ? <div className="f wide warn">{prova.errore}</div> : <>
            <div className="f wide">Margini {prova.delta >= 0 ? '+' : ''}{fN(prova.delta, 2)} punti: generale {fP(num(prova.marg.gen))}
              {MCATS.filter(c => M.cat[c] !== '' && M.cat[c] != null).map(c => ` · ${c.toLowerCase()} ${fP(num(prova.marg.cat[c]))}`).join('')}
              {' '}→ prezzo <b>{eur(prova.prezzo)}</b>{sv < C ? <span style={{ color: 'var(--bad)' }}> · sotto il costo ({eur(C)})</span> : null}</div>
            <div className="f"><button className="btn p" onClick={applica}>Applica</button></div>
          </>)}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>Scrivi il prezzo totale che vuoi fare: il margine generale e quelli per categoria si spostano tutti degli stessi punti, così le differenze tra categorie restano.</p>
      </>}</Fold>

      <Fold id="mg-cat" step={2} title="Margine per categoria" sum={own.length ? own.map(c => `${c.toLowerCase()} ${fP(num(M.cat[c]))}`).join(' · ') : 'Tutte le categorie usano il valore generale'}>{() => <>
        <p className="hint">Lascia vuoto per usare il valore generale ({fP(num(M.gen))}). Serve per esempio a tenere un margine più alto sulla carpenteria e più basso sui componenti acquistati. Le righe <b>ZINCATURA</b> e <b>LAVORAZIONE</b> raccolgono il costo di zincatura e di lavorazione di tutte le categorie (la struttura è mostrata senza): se le lasci vuote seguono il margine della categoria di ogni pezzo.</p>
        <div className="wrap"><table><tbody>
          <tr><th>Categoria</th><th className="n">Costo €</th><th className="n" style={{ width: 130 }}>{ric ? 'Ricarico' : 'Margine'} %</th><th className="n">Margine €</th><th className="n">Prezzo €</th><th className="n">Margine sul prezzo</th></tr>
          {[...MCATS, 'NON TROVATO'].map(c => {
            const n = byCat[c] || { c: 0, p: 0 }; if (c === 'NON TROVATO' && !byCat[c]) return null;
            return (
              <tr key={c}><td className={`cat-${c.split(' ')[0]}`}><span className="dot" /><b>{c}</b></td><td className="n">{fN(n.c)}</td>
                <td>{c === 'NON TROVATO' ? <span className="muted">generale</span> : <Inp path={`prev.marg.cat.${c}`} type="optnum" ph={c === LAV_CAT || c === ZINC_CAT ? 'come categoria' : String(num(M.gen)).replace('.', ',')} />}</td>
                <td className="n">{fN(n.p - n.c)}</td><td className="n"><b>{fN(n.p)}</b></td><td className="n muted">{n.p ? fP(((n.p - n.c) / n.p) * 100) : '–'}</td></tr>
            );
          })}
          <tr className="tot"><td>TOTALE</td><td className="n">{fN(C)}</td><td></td><td className="n">{fN(mg)}</td><td className="n">{fN(V)}</td><td className="n">{V ? fP((mg / V) * 100) : '–'}</td></tr>
        </tbody></table></div>
      </>}</Fold>

      <Fold id="mg-prezzo" step={3} title="Prezzo di vendita" sum={<><b>{eur(V)}</b> · margine {eur(mg)} ({V ? fP((mg / V) * 100) : '–'}) · {wpS(V)} €/Wp</>}>{() => <>
        <div className="meta"><div>Costo<b>{eur(C)}</b></div><div>Margine<b>{eur(mg)}</b></div><div>Prezzo di vendita<b>{eur(V)}</b></div>
          <div>Margine sul prezzo<b>{V ? fP((mg / V) * 100) : '–'}</b></div><div>Ricarico sul costo<b>{C ? fP((mg / C) * 100) : '–'}</b></div>
          <div>€/Wp costo → vendita<b>{wpS(C)} → {wpS(V)}</b></div></div>
        <div className="wrap"><table><tbody>
          <tr><th>Riga</th><th>Configurazione</th><th className="n">N.</th><th className="n">Costo / tracker</th><th className="n">Prezzo / tracker</th><th className="n">Prezzo totale €</th><th className="n">€/Wp vendita</th></tr>
          {P.righe.map((r, i) => { const rr = R.righe[i], kw = (rr.moduli * R.wp) / 1000; return (
            <tr key={i}><td><span className="rid">R{i + 1}</span></td><td>{r.taglia} moduli · {r.tipo}</td><td className="n">{fN(rr.n, 0)}</td>
              <td className="n">{rr.n ? fN(rr.tot / rr.n) : '–'}</td><td className="n"><b>{rr.n ? fN(rr.prezzo / rr.n) : '–'}</b></td><td className="n">{fN(rr.prezzo)}</td><td className="n">{kw ? fN(rr.prezzo / (kw * 1000), 4) : '–'}</td></tr>); })}
          <tr><td></td><td>Componenti di impianto</td><td colSpan={3}></td><td className="n">{fN(pImp)}</td><td></td></tr>
          {pEx ? <tr><td></td><td>Voci extra</td><td colSpan={3}></td><td className="n">{fN(pEx)}</td><td></td></tr> : null}
          <tr className="tot"><td colSpan={2}>TOTALE</td><td className="n">{fN(R.nTracker, 0)}</td><td></td><td></td><td className="n">{fN(V)}</td><td className="n">{wpS(V)}</td></tr>
        </tbody></table></div>
      </>}</Fold>
    </>
  );
}
