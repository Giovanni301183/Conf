// Scheda Listino: componenti per categoria, tutti modificabili; sotto-distinte dei quadri.
import { Fragment, useState } from 'react';
import { Fold, Inp, SubFold, TabTools, Info } from '../components/ui';
import { costLine, tot, unitCost } from '../domain/compute';
import { exportListinoCSV } from '../domain/excel';
import { download, fN, vN } from '../domain/format';
import { CATS, num } from '../domain/model';
import { gruppiDistinte, inUso, isPil, sostituisci } from '../domain/referenze';
import { S, commit, save } from '../store/state';
import { pickFile, resetData } from '../store/actions';
import { ListinoFisso } from './Fisso';

const TIPI = { barra: 'Profili a barra — prezzati al metro', pezzo: 'Carpenteria e pezzi speciali — prezzati a pezzo', comm: 'Componenti — prezzati a pezzo' };
const done = () => { save(); commit(); };
// Riga nascosta dalla ricerca per codice o descrizione.
const hid = (it: any) => { const q = S.ui.filter.trim().toLowerCase(); return !!q && !(it.c + ' ' + (it.art || '') + ' ' + it.d).toLowerCase().includes(q) ? 'hide' : undefined; };

function delItem(i: number) {
  const D = S.data, it = D.listino[i];
  const used = inUso(D, it.c);
  if (!confirm(`Eliminare "${it.c} — ${it.d}"?` + (used ? '\n\nATTENZIONE: il codice è usato nelle distinte.' : ''))) return;
  D.listino.splice(i, 1); S.ui.openSd.clear(); done();
}
const CodeCell = ({ i }: { i: number }) => {
  const it = S.data.listino[i];
  // Codice articolo modificabile su tutte le voci; la chiave interna (usata da distinte e configuratore) resta sotto.
  const togli = () => { if (confirm(`Eliminare il codice articolo "${it.art}"? La voce torna a mostrare la chiave "${it.c}".`)) { delete it.art; done(); } };
  return <td style={{ minWidth: 140 }}><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Inp path={`data.listino.${i}.art`} type="txt" ph={it.c} />
    {it.art ? <button className="btn x" onClick={togli} title="Elimina il codice articolo">✕</button> : null}</div>
    <div className="muted small" title="Chiave interna usata da distinte e configuratore">{it.u ? <Inp path={`data.listino.${i}.c`} type="txt" /> : it.c}</div></td>;
};
const DelBtn = ({ i }: { i: number }) => <td><button className="btn x" onClick={() => delItem(i)} title="Elimina">✕</button></td>;

function TableBarre({ ii, t }: { ii: number[]; t: string }) {
  const L = S.data.listino, mz = num(S.data.params.maggZinc), u = t === 'barra' ? 'm' : 'pz';
  return (
    <div className="wrap"><table><tbody>
      <tr><th title="Codice articolo (modificabile) e, sotto, la chiave interna">Codice articolo</th><th>Descrizione</th><th>Sottogruppo</th><th className="n">{t === 'barra' ? 'kg/m teorico' : 'Peso netto kg'}</th><th className="n">€/kg acq.</th><th className="n">€/kg zinc.</th><th className="n">€/kg lav.</th>
        <th className="n">Mat. €/{u}</th><th className="n">Zinc. €/{u}</th><th className="n">Lavoraz. €/{u}</th><th className="n">Totale €/{u}</th>{t === 'barra' && <th title="Profilo che si può scegliere per i pilastri in Configura">Pilastro</th>}<th></th></tr>
      {ii.map(i => {
        const it = L[i], c = costLine(it, 1, 1, mz), p = `data.listino.${i}.`;
        return (
          <tr key={i} className={hid(it)}>
            <CodeCell i={i} />
            <td style={{ minWidth: 190 }}><Inp path={p + 'd'} type="txt" /></td><td style={{ minWidth: 105 }}><Inp path={p + 'sub'} type="txt" /></td>
            {['kg', 'acq', 'zn', 'lav'].map(k => <td key={k} style={{ width: 90 }}><Inp path={p + k} /></td>)}
            <td className="n calc">{fN(c.mat, 3)}</td><td className="n calc">{fN(c.zinc, 3)}</td><td className="n calc">{fN(c.lav, 3)}</td><td className="n calc"><b>{fN(tot(c), 3)}</b></td>
            {t === 'barra' && <td style={{ textAlign: 'center' }}><input type="checkbox" checked={isPil(it)} onChange={e => { it.pil = e.target.checked; done(); }} title="Si può scegliere per i pilastri in Configura" /></td>}
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
      <tr><th title="Codice articolo (modificabile) e, sotto, la chiave interna">Codice articolo</th><th>Descrizione</th><th>Sottogruppo</th><th className="n">Peso kg/pz</th><th className="n">Costo €/pz</th><th>Sotto-distinta</th><th></th></tr>
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

// Sostituisce uno o piu' codici nelle distinte base, in tutti i gruppi o solo in alcuni. Le quantita' restano quelle delle righe.
// Vale per i preventivi nuovi; quelli salvati tengono il loro listino finche' non li si ricalcola con quello attuale.
type Coppia = { da: string; a: string };
function Sostituisci() {
  const D = S.data, tutti = gruppiDistinte();
  const [cc, setCc] = useState<Coppia[]>([{ da: '', a: '' }]);
  const [gg, setGg] = useState<Set<string>>(() => new Set(tutti));
  const [elimina, setElimina] = useState(true);
  const coppie = cc.map(c => [c.da, c.a] as [string, string]);
  const conti = sostituisci(D, coppie, gg, true), nRighe = conti.reduce((s, c) => s + c.n, 0);
  const set = (i: number, k: keyof Coppia, v: string) => setCc(cc.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  // Codice nuovo: copia della voce da sostituire (stessi prezzi, da correggere poi nel listino).
  const nuovo = (i: number) => {
    const da = D.listino.find(x => x.c === cc[i].da);
    const c = prompt('Codice della nuova voce' + (da ? ` (copia di "${da.c}", prezzi e descrizione da correggere poi):` : ':'), da ? da.c : '')?.trim();
    if (!c) return;
    if (D.listino.some(x => x.c === c)) { alert(`Il codice "${c}" è già nel listino: sceglilo dall'elenco.`); return; }
    const it = da ? { ...JSON.parse(JSON.stringify(da)), c, u: true } : { c, d: 'Nuova voce', cat: 'BULLONERIA', sub: 'Bulloneria', t: 'comm', kg: 0, costo: 0, u: true };
    delete it.pil; delete it.art; D.listino.splice(da ? D.listino.indexOf(da) + 1 : D.listino.length, 0, it); save(); set(i, 'a', c);
  };
  const applica = () => {
    if (!nRighe) return;
    if (!confirm(`Sostituire ${nRighe} righe delle distinte base?\n\n` + conti.map(c => `${c.g}: ${c.da} → ${c.a} (${c.n})`).join('\n'))) return;
    sostituisci(D, coppie, gg);
    const via = elimina ? [...new Set(conti.map(c => c.da))].filter(c => !inUso(D, c)) : [];
    D.listino = D.listino.filter(x => !via.includes(x.c)); S.ui.openSd.clear();
    setCc([{ da: '', a: '' }]); done();
    alert(`Sostituite ${nRighe} righe.` + (via.length ? `\nTolti dal listino perché non più usati: ${via.join(', ')}.` : ''));
  };
  const opts = D.listino.map(x => <option key={x.c} value={x.c}>{x.art ? `${x.art} — ${x.d} (${x.c})` : `${x.c} — ${x.d}`}</option>);
  return <>
    <div className="wrap"><table><tbody>
      <tr><th>Codice da sostituire</th><th></th><th>Nuovo codice</th><th></th><th></th></tr>
      {cc.map((c, i) => (
        <tr key={i}>
          <td><select value={c.da} onChange={e => set(i, 'da', e.target.value)}><option value="">— scegli —</option>{opts}</select></td>
          <td style={{ textAlign: 'center' }}>→</td>
          <td><select value={c.a} onChange={e => set(i, 'a', e.target.value)}><option value="">— scegli —</option>{opts}</select></td>
          <td><button className="btn s" onClick={() => nuovo(i)} title="Crea nel listino una voce nuova copiando quella da sostituire">+ codice nuovo</button></td>
          <td>{cc.length > 1 && <button className="btn x" onClick={() => setCc(cc.filter((_, j) => j !== i))}>✕</button>}</td>
        </tr>
      ))}
    </tbody></table></div>
    <div className="toolbar"><button className="btn s" onClick={() => setCc([...cc, { da: '', a: '' }])}>+ altro codice</button>
      <span className="muted">Per esempio bullone, dado e rondella insieme.</span></div>
    <div className="toolbar"><span className="muted">Dove:</span>
      {tutti.map(g => <label key={g} className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={gg.has(g)} onChange={e => { const n = new Set(gg); if (e.target.checked) n.add(g); else n.delete(g); setGg(n); }} />
        {g.charAt(0) + g.slice(1).toLowerCase()}</label>)}
    </div>
    <div className="toolbar">
      {conti.length ? <span>Cambieranno <b>{nRighe}</b> righe: {conti.map(c => `${c.g.charAt(0) + c.g.slice(1).toLowerCase()} ${c.da} → ${c.a} ×${c.n}` + (c.taglie.length ? ` (taglie ${c.taglie.join(', ')})` : '')).join(' · ')}</span>
        : <span className="muted">{coppie.some(([da, a]) => da && a && da !== a) ? 'Nessuna riga usa questi codici nei gruppi scelti.' : 'Scegli il codice da sostituire e quello nuovo.'}</span>}
      <span style={{ flex: 1 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={elimina} onChange={e => setElimina(e.target.checked)} />togli dal listino i codici vecchi non più usati</label>
      <button className="btn p" disabled={!nRighe} onClick={applica}>Sostituisci</button>
    </div>
  </>;
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

/** Filtra il listino (anche dalla ricerca in alto). La ricerca apre le tendine del listino; cancellarla non le richiude. */
export function filtraListino(v: string) {
  if (!S.ui.filter.trim() && v.trim()) for (const c of CATS) { S.ui.folds['li-' + c] = true; for (const t of ['barra', 'pezzo', 'comm']) S.ui.folds[`li-${c}-${t}`] = true; }
  S.ui.filter = v; commit();
}

export function Listino() {
  const L = S.data.listino, mz = num(S.data.params.maggZinc);
  const onFilter = filtraListino;
  return (
    <>
      <div className="card head"><div className="headrow">
        <div><h2>Listino componenti<Info>Ogni valore è modificabile e il preventivo si ricalcola subito. Apri una categoria per vedere le voci.</Info></h2></div>
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
      <Fold id="li-sost" info={<>Cambia un codice in tutte le righe delle distinte base che lo usano, per esempio i bulloni del pilastro motore o un profilo. Quantità e formule restano uguali.
      Vale per i preventivi nuovi; uno già salvato, quando lo riapri, chiede se ricalcolarlo con il listino attuale.</>} title="Sostituisci referenza nelle distinte" sum="Cambia un codice in tutte le distinte base, o solo in alcuni gruppi">{() => <Sostituisci />}</Fold>
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
      <ListinoFisso />
    </>
  );
}
