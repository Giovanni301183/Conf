// Scheda Voci extra: costi aggiuntivi manuali (trasporto, montaggio, imballo, ...).
import { Fold, Inp, Sel } from '../components/ui';
import { eur, fN } from '../domain/format';
import { EXTRA_MODI, EXTRA_VOCI } from '../domain/model';
import { S, commit, save } from '../store/state';

const done = () => { save(); commit(); };

export function Extra() {
  const X = S.prev.extra, s = X.reduce((a, e) => a + (e._imp || 0), 0), n = X.length;
  const add = (desc: string) => { S.ui.folds['ex'] = true; X.push({ desc, voce: 'altro', modo: desc === 'Montaggio' ? 'tracker' : 'corpo', val: 0 }); done(); };
  return (
    <Fold id="ex" title="Voci di costo extra" sum={n ? `${n} ${n === 1 ? 'voce' : 'voci'} · ${eur(s)}` : 'Nessuna voce · apri per aggiungere trasporto, montaggio, imballo…'}
      act={<>
        <button className="btn" onClick={() => add('Trasporto')}>+ Trasporto</button><button className="btn" onClick={() => add('Montaggio')}>+ Montaggio</button>
        <button className="btn" onClick={() => add('Imballo')}>+ Imballo</button><button className="btn p" onClick={() => add('')}>+ Voce libera</button>
      </>}>{() => <>
      <p className="hint">"% sul costo" si calcola su tracker + impianto (senza le altre voci extra). Il tipo di costo decide in quale colonna finisce l'importo.</p>
      {!n ? <div className="empty">Nessuna voce extra. Usa i pulsanti in alto a destra.</div> : (
        <div className="wrap"><table><tbody>
          <tr><th>Descrizione</th><th>Tipo di costo</th><th>Modalità</th><th className="n">Valore</th><th className="n">Importo €</th><th></th></tr>
          {X.map((e, i) => { const p = `prev.extra.${i}.`; return (
            <tr key={i}>
              <td><Inp path={p + 'desc'} type="txt" /></td><td style={{ width: 150 }}><Sel path={p + 'voce'} opts={EXTRA_VOCI as [string, string][]} /></td>
              <td style={{ width: 240 }}><Sel path={p + 'modo'} opts={EXTRA_MODI as [string, string][]} /></td><td style={{ width: 110 }}><Inp path={p + 'val'} /></td>
              <td className="n"><b>{fN(e._imp)}</b></td><td><button className="btn x" onClick={() => { X.splice(i, 1); done(); }}>✕</button></td>
            </tr>); })}
          <tr className="tot"><td colSpan={4}>Totale voci extra</td><td className="n">{fN(s)}</td><td></td></tr>
        </tbody></table></div>
      )}
    </>}</Fold>
  );
}
