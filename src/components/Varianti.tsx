// Varianti di materiale di un preventivo dell'archivio (vedi domain/varianti.ts): si spuntano le combinazioni profilo × asse,
// si vede il confronto dei prezzi e si creano come preventivi nuovi, ciascuno col suo numero.
// La tabella di confronto la usa anche la proposta dell'assistente.
import { useState } from 'react';
import { compute } from '../domain/compute';
import { download, eur, fN, fileName } from '../domain/format';
import { clone, normPrev } from '../domain/model';
import { bloccoOfferta, compilaPptx, datiOfferta, layoutImg, offPrev } from '../domain/offerta';
import { buildMont } from '../domain/plan';
import { pilastri } from '../domain/referenze';
import { SPESSORI, etichetta, type Variante } from '../domain/varianti';
import { S, commit } from '../store/state';
import { anteprimaVarianti, archVarianti, toast } from '../store/actions';
import { online, pdfOfferta } from '../store/remote';

const MODELLO = `${import.meta.env.BASE_URL}offerta/modello-offerta.pptx`;
/** Offerte in PDF (senza collegamento: PowerPoint) del base e delle varianti, una dopo l'altra, come le manda il bot;
 *  senza varianti, la sola offerta del preventivo (pulsante PDF dell'archivio).
 *  La posa vuota prende il totale della scheda Montaggio solo se il base e' il preventivo aperto, uguale per tutte;
 *  altrimenti risulta "non inclusa", come da Telegram. */
export async function scaricaOfferte(baseId: string, ids: string[]) {
  const tutti = [baseId, ...ids], mont = S.prev._id === baseId ? buildMont().tot : 0;
  let modello: ArrayBuffer;
  try { const r = await fetch(MODELLO); if (!r.ok) throw new Error(`modello non trovato (${r.status})`); modello = await r.arrayBuffer(); }
  catch (err) { toast('Offerte non generate: ' + (err as Error).message); return; }
  const errori: string[] = [];
  for (const [i, id] of tutti.entries()) {
    const e = S.arch.find(a => a.id === id); if (!e) continue;
    const P = normPrev(clone(e.prev)), dati = e.dati || S.data, O = offPrev(P);
    toast(`Preparo l'offerta ${i + 1} di ${tutti.length}: N° ${P.num || '–'}…`);
    try {
      const D = datiOfferta(P, compute(dati, P), dati, mont), blocco = bloccoOfferta(D);
      if (blocco) throw new Error(blocco);
      const blob = await compilaPptx(modello.slice(0), D, layoutImg(O));
      const nome = `Offerta_${P.num ? fileName(P.num) + '_' : ''}${fileName(P.cliente || e.nome || 'cliente')}${O.rev && O.rev !== '0' ? '_rev' + fileName(O.rev) : ''}`;
      if (online()) download(nome + '.pdf', await pdfOfferta(blob)); else download(nome + '.pptx', blob);
    } catch (err) { errori.push(`N° ${P.num || '–'}: ${(err as Error).message}`); }
  }
  toast(errori.length ? `Offert${tutti.length === 1 ? 'a' : 'e'} non generat${tutti.length === 1 ? 'a' : 'e'}: ` + errori.join('; ')
    : `${tutti.length === 1 ? "Scaricata l'offerta" : `Scaricate ${tutti.length} offerte`}${online() ? ' in PDF' : ' (PowerPoint: il PDF serve il collegamento)'}`);
}

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
        <button className="btn p" disabled={!vv.length} onClick={() => { const r = archVarianti(id, vv); commit(); chiudi(); if (r.ids.length) scaricaOfferte(id, r.ids); }}>
          Crea {vv.length || ''} preventiv{vv.length === 1 ? 'o' : 'i'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}
