// Scheda Distinta di lavorazione: produzione, lista di taglio, ordini, Gantt di produzione. Export Excel.
import type { ReactNode } from 'react';
import { Fold, TabTools } from '../components/ui';
import { GHint, GanttFold } from '../components/Gantt';
import { downloadLavorXlsx } from '../domain/excel';
import { eur, fL, fN, fQ } from '../domain/format';
import { num } from '../domain/model';
import { GPAR, LAV_T, buildGantt, buildLavor, gPar, rigaCfg } from '../domain/plan';
import { printPage } from '../store/actions';

const yn = (b: boolean) => (b ? 'Sì' : 'No');
const kz = (v: number) => (v ? fN(v, 1) : <span className="muted">–</span>);

export function Lavorazione() {
  const D = buildLavor();
  const vuota = !D.righe.length && !D.imp.length;
  const head = (
    <div className="card head"><div className="headrow">
      <div><h2>Distinta di lavorazione</h2>
        <p className="hint" style={{ margin: 0 }}>Per la produzione e per l'ufficio acquisti. Il file Excel ha sei fogli: Commessa, Produzione, Lista di taglio, Ordini, Gantt (modificabile, si ricalcola da solo) e Calendario.</p></div>
      <span className="sp" />
      <button className="btn p" onClick={downloadLavorXlsx} disabled={vuota}>Scarica Excel</button>
    </div></div>
  );
  if (vuota) return <>{head}<div className="card"><div className="empty">La distinta è vuota. In <b>Configura</b> imposta almeno un tracker o un componente di impianto.</div></div></>;
  const nota = <p className="hint">Peso nero = peso teorico del listino (acquisto acciaio e lavorazione). Peso zincato = nero + {fN(D.mz * 100, 1)} % di maggiorazione, solo sui pezzi che vanno allo zincatore.</p>;
  const row = (x: any, k: string) => (
    <tr key={k}><td><span className="code">{x.code}</span></td><td>{x.desc}</td><td className="muted">{LAV_T[x.t]}</td><td className="n">{x.L !== '' ? fL(x.L) : ''}</td><td className="n">{fQ(x.qPer)}</td>
      <td className="n"><b>{fQ(x.q)}</b></td><td className="n">{fN(x.kgU, 2)}</td><td className="n">{fN(x.kgT, 1)}</td><td className="n">{kz(x.kgZ)}</td><td className="c">{yn(x.zinc)}</td></tr>
  );
  const G = buildGantt(D);
  return (
    <>
      {head}
      <TabTools />
      <Fold id="dl-prod" step={1} title="Produzione" sum={`${D.righe.map(x => `R${x.i + 1}: ${fN(x.n, 0)} × ${x.r.taglia} mod`).join(' · ') || 'Solo impianto'} · ${fN(D.kg, 1)} kg neri · ${fN(D.kgZ, 1)} kg zincati`}>{() => {
        const rows: ReactNode[] = [];
        for (const R1 of D.righe) {
          rows.push(<tr key={'r' + R1.i} className="g1"><td colSpan={10}>R{R1.i + 1} · {fN(R1.n, 0)} tracker · {rigaCfg(R1.r)}</td></tr>);
          for (const Gr of R1.gruppi) { rows.push(<tr key={`r${R1.i}-${Gr.nome}`} className="g2"><td colSpan={10}>{Gr.nome}</td></tr>); Gr.items.forEach((x, j) => rows.push(row(x, `r${R1.i}-${Gr.nome}-${j}`))); }
          rows.push(<tr key={'t' + R1.i} className="tot"><td colSpan={7}>Totale R{R1.i + 1}</td><td className="n">{fN(R1.kg, 1)}</td><td className="n">{fN(R1.kgZ, 1)}</td><td></td></tr>);
        }
        if (D.imp.length) { rows.push(<tr key="imp" className="g1"><td colSpan={10}>Impianto · per l'intera commessa</td></tr>); D.imp.forEach((x, j) => rows.push(row(x, 'imp' + j))); }
        return <>
          <p className="hint">Pezzi per ogni riga tracker, divisi per gruppo di assieme. Nessun prezzo: è il foglio per l'officina.</p>{nota}
          <div className="wrap"><table className="dl"><tbody>
            <tr><th>Codice</th><th>Descrizione</th><th>Lavorazione</th><th className="n">L (m)</th><th className="n">Q.tà / tracker</th><th className="n">Q.tà totale</th><th className="n">Peso unit. nero kg</th><th className="n">Peso tot. nero kg</th><th className="n">Peso tot. zincato kg</th><th className="c">Zincatura</th></tr>
            {rows}
            <tr className="tot"><td colSpan={7}>TOTALE COMMESSA</td><td className="n">{fN(D.kg, 1)}</td><td className="n">{fN(D.kgZ, 1)}</td><td></td></tr>
          </tbody></table></div>
        </>;
      }}</Fold>

      <Fold id="dl-taglio" step={2} title="Lista di taglio" sum={`${D.taglio.length} misure · ${fN(D.taglio.reduce((a, x) => a + x.pz, 0), 0)} pezzi · ${fN(D.taglio.reduce((a, x) => a + x.pz * x.L, 0), 1)} m`}>{() => <>
        <p className="hint">Profili a barra raggruppati per profilo e lunghezza, sommando tutte le righe tracker.</p>
        <div className="wrap"><table className="dl"><tbody>
          <tr><th>Profilo</th><th>Descrizione</th><th className="n">Lunghezza m</th><th className="n">Pezzi</th><th className="n">Metri totali</th><th className="n">Peso nero kg</th><th className="n">Peso zincato kg</th><th className="c">Zincatura</th><th>Righe</th></tr>
          {D.taglio.map((x, j) => (
            <tr key={j}><td><b>{x.code}</b></td><td>{x.desc}</td><td className="n">{fL(x.L)}</td><td className="n"><b>{fQ(x.pz)}</b></td><td className="n">{fN(x.pz * x.L, 2)}</td><td className="n">{fN(x.kg, 1)}</td><td className="n">{kz(x.kgZ)}</td><td className="c">{yn(x.zinc)}</td><td className="muted">{[...x.righe].join(', ')}</td></tr>
          ))}
        </tbody></table></div>
      </>}</Fold>

      <Fold id="dl-ord" step={3} title="Ordini" sum={`${D.ordini.reduce((a, g) => a + g.items.length, 0)} codici · ${eur(D.cost)} di costo stimato · ${fN(D.kgZ, 1)} kg da zincare`}>{() => {
        const rows: ReactNode[] = [];
        for (const g of D.ordini) {
          rows.push(<tr key={g.cat} className={`g1 cat-${g.cat.split(' ')[0]}`}><td colSpan={9}><span className="dot" />{g.cat}</td></tr>);
          for (const x of g.items) {
            rows.push(<tr key={g.cat + x.code}><td><span className="code">{x.code}</span></td><td>{x.desc}</td><td>{x.um}</td><td className="n"><b>{x.um === 'm' ? fN(x.qty, 2) : fQ(x.qty)}</b></td><td className="n">{fN(x.kg, 1)}</td><td className="n">{kz(x.kgZ)}</td>
              <td className="c">{x.t === 'comm' ? '' : yn(x.zinc)}</td><td className="n">{x.qty ? fN(x.cost / x.qty) : '–'}</td><td className="n">{fN(x.cost)}</td></tr>);
            if (x.sd) x.sd.forEach((c, j) => rows.push(<tr key={g.cat + x.code + '#' + j} className="sd"><td>↳ {c.c}</td><td>{c.d}</td><td>pz</td><td className="n">{fQ(x.qty * num(c.q))}</td><td></td><td></td><td></td><td className="n">{fN(num(c.p))}</td><td className="n">{fN(x.qty * num(c.q) * num(c.p))}</td></tr>));
          }
        }
        return <>
          <p className="hint">Fabbisogno totale della commessa per codice: profili in metri, il resto in pezzi. I quadri sono esplosi nei loro componenti. L'acciaio si ordina sul peso nero; il peso zincato è quello da consegnare allo zincatore.</p>
          <div className="wrap"><table className="dl"><tbody>
            <tr><th>Codice</th><th>Descrizione</th><th>U.M.</th><th className="n">Quantità</th><th className="n">Peso nero kg</th><th className="n">Peso zincato kg</th><th className="c">Zincatura</th><th className="n">Costo unit. €</th><th className="n">Costo tot. €</th></tr>
            {rows}
            <tr className="tot"><td colSpan={4}>TOTALE</td><td className="n">{fN(D.kg, 1)}</td><td className="n">{fN(D.kgZ, 1)}</td><td></td><td></td><td className="n">{fN(D.cost)}</td></tr>
          </tbody></table></div>
        </>;
      }}</Fold>

      <GanttFold G={G} o={{
        id: 'dl-gantt', step: 4, title: 'Gantt di produzione', pd: 'prev.gantt', endLabel: 'Fine produzione e consegne', onPrint: () => printPage(['dl-gantt']),
        hint: <>Durate in giorni lavorativi (lun–ven, festività nazionali escluse), calcolate dalla distinta e dai parametri di produttività qui sotto. <GHint /></>,
        par: { id: 'dl-gpar', title: 'Parametri di produttività', sum: `valgono per tutti i preventivi · ${fN(num(gPar().kgLav), 0)} kg/giorno in officina`, keys: GPAR as [string, string][], base: 'data.params.gantt' },
      }} />
    </>
  );
}
