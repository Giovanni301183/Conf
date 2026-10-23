// Varianti di materiale di un preventivo dell'archivio (vedi domain/varianti.ts): si spuntano le combinazioni profilo × asse,
// si vede il confronto dei prezzi e si creano come preventivi nuovi, ciascuno col suo numero.
// La tabella di confronto la usa anche la proposta dell'assistente.
import { useState } from 'react';
import { eur, fN } from '../domain/format';
import { pilastri } from '../domain/referenze';
import { SPESSORI, etichetta, type Variante } from '../domain/varianti';
import { S, commit } from '../store/state';
import { anteprimaVarianti, archVarianti } from '../store/actions';

/** Confronto tra il base e le varianti; l'errore (profilo sconosciuto, …) al posto della tabella. */
export function TabellaVarianti({ id, vv }: { id: string; vv: Variante[] }) {
  let a: ReturnType<typeof anteprimaVarianti>;
  try { a = anteprimaVarianti(id, vv); } catch (e) { return <div className="warn">{(e as Error).message}</div>; }
  const riga = (P: any, R: any, nota: string) => (
    <tr key={nota + etichetta(P)}><td>{nota}</td><td>{etichetta(P)}</td><td className="n">{eur(R.prezzo)}</td>
      <td className="n">{R.kwp ? fN(R.prezzo / (R.kwp * 1000), 4) : '–'}</td><td className="n">{fN(R.steel / 1000, 1)} t</td></tr>);
  return <>
    <table className="arch small"><tbody>
      <tr><th></th><th>Materiale</th><th className="n">Prezzo</th><th className="n">€/Wp</th><th className="n">Acciaio</th></tr>
      {riga(a.base, a.R, `Base N° ${a.base.num || '–'}`)}
      {a.varianti.map(({ P, R }, i) => riga(P, R, `Nuovo ${i + 1}`))}
    </tbody></table>
    {a.uguali.length > 0 && <div className="muted small">{a.uguali[0]} è già il preventivo base: non viene duplicato.</div>}
  </>;
}

const chiave = (prof: string, asse: string) => `${prof}|${asse}`;

/** Griglia profilo × asse sotto la riga dell'archivio. */
export function ModuloVarianti({ id, chiudi }: { id: string; chiudi: () => void }) {
  const e = S.arch.find(a => a.id === id), [sel, setSel] = useState<string[]>([]);
  if (!e) return null;
  const profili = pilastri(e.dati || S.data).map(([c]) => c), base = new Set(e.prev.righe.map((r: any) => chiave(r.prof, r.asse)));
  const vv: Variante[] = sel.map(k => { const [prof, asse] = k.split('|'); return { prof, asse }; });
  const cambia = (k: string) => setSel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));
  return (
    <div className="cform">
      <div className="wide"><b>Varianti di materiale</b> <span className="muted small">Spunta le combinazioni da preparare: ognuna diventa un preventivo nuovo, con il numero successivo. Il resto (tracker, omega, fondazioni, margini, offerta) resta uguale.</span></div>
      <table className="arch small wide" style={{ width: 'auto' }}><tbody>
        <tr><th>Profilo</th>{SPESSORI.asse.map(a => <th key={a}>Asse {a} mm</th>)}</tr>
        {profili.map(p => <tr key={p}><td>{p}</td>{SPESSORI.asse.map(a => {
          const k = chiave(p, a);
          return <td key={a} style={{ textAlign: 'center' }}>{base.has(k) && base.size === 1 ? <span className="muted">base</span>
            : <input type="checkbox" checked={sel.includes(k)} onChange={() => cambia(k)} />}</td>;
        })}</tr>)}
      </tbody></table>
      {vv.length > 0 && <div className="wide"><TabellaVarianti id={id} vv={vv} /></div>}
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={!vv.length} onClick={() => { archVarianti(id, vv); commit(); chiudi(); }}>
          Crea {vv.length || ''} preventiv{vv.length === 1 ? 'o' : 'i'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}
