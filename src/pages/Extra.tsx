// Scheda Voci extra: costi aggiuntivi manuali (trasporto, montaggio, imballo, ...).
// Impianti fissi: ogni voce va sempre a parte nell'offerta, con la sua riga e il suo prezzo di vendita, fuori dal prezzo delle strutture.
import { Fold, Inp, Sel } from '../components/ui';
import { eur, fN } from '../domain/format';
import { EXTRA_MODI, EXTRA_VOCI } from '../domain/model';
import { R, S, commit, save } from '../store/state';
// Nei fissi la modalità «per tracker» conta le strutture.
const modi = () => (R.settore === 'fisso' ? EXTRA_MODI.map(([k, l]) => [k, k === 'tracker' ? 'Per struttura (€ × n. strutture)' : l]) : EXTRA_MODI) as [string, string][];

const done = () => { save(); commit(); };

export function Extra() {
  const X = S.prev.extra, s = X.reduce((a, e) => a + (e._imp || 0), 0), n = X.length, fisso = R.settore === 'fisso';
  const add = (desc: string) => {
    S.ui.folds['ex'] = true;
    X.push({ desc, voce: 'altro', modo: desc === 'Montaggio' ? 'tracker' : 'corpo', val: 0 }); done();
  };
  const pr = (i: number) => R.lines.filter(l => l.riga === 'extra')[i]?.prezzo ?? 0;
  return (
    <Fold id="ex" title="Voci di costo extra" sum={n ? `${n} ${n === 1 ? 'voce' : 'voci'} · ${eur(s)}` : 'Nessuna voce · apri per aggiungere trasporto, montaggio, imballo…'}
      act={<>
        <button className="btn" onClick={() => add('Trasporto')}>+ Trasporto</button><button className="btn" onClick={() => add('Montaggio')}>+ Montaggio</button>
        {fisso && <button className="btn" onClick={() => add('Servizio gru')}>+ Servizio gru</button>}
        <button className="btn" onClick={() => add('Imballo')}>+ Imballo</button><button className="btn p" onClick={() => add('')}>+ Voce libera</button>
      </>}>{() => <>
      <p className="hint">"% sul costo" si calcola su {R.settore === 'fisso' ? 'strutture' : 'tracker + impianto'} (senza le altre voci extra). Il tipo di costo decide in quale colonna finisce l'importo.
        {fisso ? <> Nell'offerta ogni voce va <b>a parte</b>, con la sua riga e il suo prezzo di vendita: non entra nel prezzo delle strutture.</> : null}</p>
      {!n ? <div className="empty">Nessuna voce extra. Usa i pulsanti in alto a destra.</div> : (
        <div className="wrap"><table><tbody>
          <tr><th>Descrizione</th><th>Tipo di costo</th><th>Modalità</th><th className="n">Valore</th><th className="n">Importo €</th>{fisso && <th className="n">Prezzo in offerta €</th>}<th></th></tr>
          {X.map((e, i) => { const p = `prev.extra.${i}.`; return (
            <tr key={i}>
              <td><Inp path={p + 'desc'} type="txt" /></td><td style={{ width: 150 }}><Sel path={p + 'voce'} opts={EXTRA_VOCI as [string, string][]} /></td>
              <td style={{ width: 240 }}><Sel path={p + 'modo'} opts={modi()} /></td><td style={{ width: 110 }}><Inp path={p + 'val'} /></td>
              <td className="n"><b>{fN(e._imp)}</b></td>
              {fisso && <td className="n muted">{fN(pr(i))}</td>}
              <td><button className="btn x" onClick={() => { X.splice(i, 1); done(); }}>✕</button></td>
            </tr>); })}
          <tr className="tot"><td colSpan={4}>Totale voci extra</td><td className="n">{fN(s)}</td>{fisso && <td />}<td></td></tr>
        </tbody></table></div>
      )}
    </>}</Fold>
  );
}
