// Scheda Invia preventivo: controllo dei dati, intestazione, layout (DXF o immagine), dati di progetto, prezzi, voci incluse; PowerPoint compilato.
import { useState } from 'react';
import { DateInp, Fold, Inp, TabTools } from '../components/ui';
import { eur, fP } from '../domain/format';
import { disegna, immagineInPng, leggiDxf } from '../domain/dxf';
import { fDate, fN, fileName, download } from '../domain/format';
import { GARANZIE0, INCLUSI0, PROGETTO, compilaPptx, datiOfferta, layoutImg, offCfg, offPrev } from '../domain/offerta';
import { buildMont } from '../domain/plan';
import { R, S, commit, save } from '../store/state';
import { archPatch, archSave, isDirty, toast } from '../store/actions';
import { online, pdfOfferta, propostaSito } from '../store/remote';
import { StatoTag } from './Cruscotto';

// Categoria di esposizione, corrosivita' e altitudine proposte dalla localita' di Configura, come "Proponi dalla località" su Telegram.
function ProponiSito() {
  const [busy, setBusy] = useState(false), [motivo, setMotivo] = useState('');
  const P = S.prev, lu = P.luogo || {}, pos = lu.lat != null && lu.lng != null;
  const proponi = async () => {
    if (!online()) { toast('La proposta usa il server: non disponibile nella versione solo-browser.'); return; }
    if (!String(lu.nome || '').trim() && !pos) { toast('Scrivi prima la località in Configura.'); return; }
    setBusy(true);
    try {
      const r = await propostaSito(lu.nome || '', pos ? lu.lat : null, pos ? lu.lng : null), O = offPrev(P);
      if (!pos) P.luogo = { ...lu, lat: +(+r.lat).toFixed(5), lng: +(+r.lng).toFixed(5) };
      Object.assign(O.prog, { categoria_terreno: r.categoria_terreno, classe_corrosivita: r.classe_corrosivita, altitudine_m: r.altitudine_m });
      setMotivo('Proposta: ' + r.motivo); commit();
    } catch (e) { toast('Proposta non riuscita: ' + (e as Error).message); }
    setBusy(false);
  };
  return <div style={{ marginBottom: 12 }}>
    <button className="btn s" disabled={busy} onClick={proponi}>{busy ? 'Cerco…' : '📍 Proponi dalla località'}</button>
    <span className="muted small"> Compila categoria di esposizione, corrosività e altitudine; il vento lo inserisci tu.</span>
    {motivo ? <p className="hint" style={{ margin: '6px 0 0' }}>{motivo}</p> : null}
  </div>;
}

const MODELLO = `${import.meta.env.BASE_URL}offerta/modello-offerta.pptx`;
const oggi = () => new Date().toISOString().slice(0, 10);

async function caricaLayout(f: File) {
  const O = offPrev(S.prev);
  try {
    if (/\.dxf$/i.test(f.name)) {
      const L = leggiDxf(await f.text());
      const img = disegna(L);
      Object.assign(O, { layout: img.url, layoutW: img.w, layoutH: img.h, layoutNome: f.name, dxf: Object.keys(L.tracker).length ? L.tracker : null });
      const n = Object.values(L.tracker).reduce((s, v) => s + v, 0);
      toast(n ? `Layout caricato: ${n} tracker riconosciuti nel DXF` : 'Layout caricato (nessun tracker riconosciuto dai layer)');
    } else {
      const img = await immagineInPng(f);
      Object.assign(O, { layout: img.url, layoutW: img.w, layoutH: img.h, layoutNome: f.name, dxf: null });
      toast('Layout caricato');
    }
  } catch (err) { toast('File non leggibile: ' + (err as Error).message); return; }
  save(); commit();
}

export function Invia() {
  const P = S.prev, O = offPrev(P), cfg = offCfg(S.data);
  const mont = buildMont().tot;
  const D = datiOfferta(P, R, S.data, mont);
  const [busy, setBusy] = useState('');
  const traspAuto = R.lines.filter((l: any) => l.riga === 'extra' && /traspor/i.test(l.desc || '')).reduce((s: number, l: any) => s + l.prezzo, 0);
  const inclusiDefault = cfg.inclusi.join('\n') === INCLUSI0.join('\n') && JSON.stringify(cfg.garanzie) === JSON.stringify(GARANZIE0);

  // Il PDF si fa sul server (ConvertAPI) dal PowerPoint compilato qui.
  async function scarica(pdf: boolean) {
    setBusy(pdf ? 'pdf' : 'pptx');
    try {
      const r = await fetch(MODELLO); if (!r.ok) throw new Error(`modello non trovato (${r.status})`);
      const blob = await compilaPptx(await r.arrayBuffer(), D, layoutImg(O));
      const nome = `Offerta_${P.num ? fileName(P.num) + '_' : ''}${fileName(P.cliente || P._nome || 'cliente')}${O.rev && O.rev !== '0' ? '_rev' + fileName(O.rev) : ''}`;
      if (pdf) download(nome + '.pdf', await pdfOfferta(blob)); else download(nome + '.pptx', blob);
    } catch (err) { toast(`${pdf ? 'PDF' : 'Offerta'} non generato: ` + (err as Error).message); }
    setBusy('');
  }
  function inviato() {
    if (!P._id || isDirty()) { archSave(false); if (!S.prev._id) return; }
    archPatch(S.prev._id, p => { p.stato = 'inviato'; (p.offerta ??= {}).inviata = oggi(); });
    toast('Preventivo segnato come inviato'); commit();
  }

  return (
    <>
      <div className="card head"><div className="headrow">
        <div><h2>Invia preventivo</h2>
          <p className="hint" style={{ margin: 0 }}>Genera l'offerta tecnico-economica dal modello PowerPoint: copertina (con numero e revisione), dati di progetto, layout, garanzie e investimento si compilano dal preventivo; le altre slide restano quelle del modello.{online() ? ' Il PDF è lo stesso che manda il bot Telegram.' : ' Per il PDF: in PowerPoint File → Salva come → PDF.'}</p></div>
        <span className="sp" />
        <span className="muted small">{O.inviata ? <>Inviato il {fDate(O.inviata)} · </> : null}<StatoTag k={P.stato || 'bozza'} /></span>
        <button className="btn" onClick={inviato}>Segna come inviato</button>
        <button className={online() ? 'btn' : 'btn p'} onClick={() => scarica(false)} disabled={!!busy}>{busy === 'pptx' ? 'Preparo…' : 'Scarica PowerPoint'}</button>
        {online() && <button className="btn p" onClick={() => scarica(true)} disabled={!!busy}>{busy === 'pdf' ? 'Preparo il PDF…' : 'Scarica PDF'}</button>}
      </div></div>
      <TabTools />

      <Fold id="in-ck" step={1} title="Controllo dei dati" sum={D.avvisi.length ? <span style={{ color: 'var(--warn)' }}>{D.avvisi.length} da verificare</span> : '✓ Tutto pronto'}>{() => <>
        {D.avvisi.length ? <div className="warn" style={{ marginTop: 0 }}>{D.avvisi.map((a, i) => <div key={i}>{a}</div>)}</div> : <p className="hint">Tutti i dati necessari ci sono.</p>}
        <div className="meta">
          <div>Offerta n.<b>{D.campi.numero_offerta} rev. {D.campi.revisione}</b></div><div>Cliente<b>{P.cliente || '–'}</b></div>
          <div>Potenza<b>{D.campi.potenza_kwp} kWp</b></div><div>Modulo<b>{D.campi.potenza_modulo_w} W</b></div>
          <div>Struttura<b>{D.campi.profilo_acciaio || '–'} · {D.campi.peso_struttura_ton} t</b></div>
        </div>
        <h3>Slide del layout</h3>
        <ul className="olist">{D.righe.map(r => <li key={r.taglia}>N.{fN(r.n, 0)} TRACKER TTS.{r.taglia} MODULI</li>)}</ul>
      </>}</Fold>

      <Fold id="in-int" step={2} title="Intestazione dell'offerta" sum={`N. ${D.campi.numero_offerta} rev. ${D.campi.revisione} · ${D.campi.data_offerta} · ${D.campi.nome_impianto || '–'}`}>{() => <>
        <p className="hint">Il numero è il progressivo del preventivo, assegnato al primo salvataggio (si cambia in Configura → Commessa). Per una nuova versione della stessa offerta aumenta la revisione.</p>
        <div className="grid">
          <label className="f">Numero offerta<span className="stat">{P.num || 'salva il preventivo'}</span></label>
          <label className="f">Revisione<Inp path="prev.offerta.rev" type="txt" /></label>
          <label className="f">Data dell'offerta<DateInp path="prev.offerta.data" /><span className="muted small">{O.data ? '' : `vuota = data del preventivo (${fDate(P.data)})`}</span></label>
          <label className="f">Nome dell'impianto<Inp path="prev.offerta.nome" type="txt" ph={P.rif || P.cliente || 'es. Impianto agrivoltaico Foggia'} /></label>
          <label className="f">Referente del cliente<Inp path="prev.offerta.referente" type="txt" ph="Nome e cognome" /></label>
          <label className="f">E-mail del referente<Inp path="prev.offerta.email" type="txt" ph="nome@cliente.it" /></label>
          <label className="f">Zona<Inp path="prev.offerta.zona" type="txt" ph="es. Periferia, Zona industriale" /></label>
        </div>
      </>}</Fold>

      <Fold id="in-lay" step={3} title="Layout dell'impianto" sum={O.layoutNome ? `${O.layoutNome}${O.dxf ? ' · ' + Object.entries(O.dxf).map(([t, n]) => `${n}×${t}`).join(', ') : ''}` : 'Da caricare: DXF, PNG o JPG'}>{() => <>
        <p className="hint">Carica il DXF del layout (oppure un'immagine). Dal DXF l'app disegna la pianta e conta i tracker dai layer "Inseguitore 40", "Inseguitore 20"… o dai blocchi "Struttura 40 moduli". Le campiture (aree piene) non vengono disegnate.</p>
        <div className="toolbar">
          <label className="btn p" style={{ cursor: 'pointer' }}>Carica DXF o immagine…<input type="file" accept=".dxf,.png,.jpg,.jpeg" className="hide" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) caricaLayout(f); }} /></label>
          {O.layout ? <button className="btn" onClick={() => { Object.assign(O, { layout: '', layoutW: 0, layoutH: 0, layoutNome: '', dxf: null }); save(); commit(); }}>Rimuovi</button> : null}
        </div>
        {O.layout ? (
          <div className="laywrap">
            <img src={O.layout} alt="Layout dell'impianto" className="layimg" />
            {O.dxf ? (
              <div className="wrap"><table><tbody>
                <tr><th>Tracker</th><th className="n">Nel DXF</th><th className="n">Nel preventivo</th><th></th></tr>
                {[...new Set([...Object.keys(O.dxf), ...D.righe.map(r => r.taglia)])].sort((a, b) => +b - +a).map(t => {
                  const a = O.dxf![t] || 0, b = D.righe.find(r => r.taglia === t)?.n || 0;
                  return <tr key={t}><td>{t} moduli</td><td className="n">{a}</td><td className="n">{b}</td><td>{a === b ? <span style={{ color: 'var(--c-acq)' }}>✓</span> : <span style={{ color: 'var(--warn)' }}>diverso</span>}</td></tr>;
                })}
              </tbody></table></div>
            ) : null}
          </div>
        ) : null}
      </>}</Fold>

      <Fold id="in-prog" step={4} title="Dati di progetto" sum={`${PROGETTO.filter(([k]) => String(O.prog[k] ?? '').trim()).length} di ${PROGETTO.length} compilati`}>{() => <>
        <p className="hint">Slide "Dati di progetto". Località, coordinate e modello del modulo vengono da Configura (<b>{P.luogo?.nome || 'località non indicata'}</b> · <b>{P.modulo?.marca || 'modulo non indicato'}</b>). I campi vuoti compaiono come «–».</p>
        <ProponiSito />
        <div className="grid">{PROGETTO.map(([k, l, ph]) => <label key={k} className="f">{l}<Inp path={`prev.offerta.prog.${k}`} type="txt" ph={'es. ' + ph} /></label>)}</div>
      </>}</Fold>

      <Fold id="in-prz" step={5} title="Prezzi nell'offerta" sum={D.prezzi.map(c => `${c.label}: ${c.value}`).join(' · ')}>{() => <>
        <p className="hint">Nell'offerta vanno sempre i <b>prezzi di vendita</b> (costo + margine), mai i costi. Struttura e componenti = prezzo di vendita senza il trasporto, che resta a parte. La posa in opera è indicata a parte e non entra nel totale.</p>
        <div className={`grid${R.prezzo - R.total < 0.5 ? ' margwarn' : ''}`} style={{ marginBottom: 14 }}>
          <label className="f">{P.marg.modo === 'ricarico' ? 'Ricarico' : 'Margine'} generale (%)<Inp path="prev.marg.gen" /></label>
          <label className="f">Costo<span className="stat">{eur(R.total)}</span></label>
          <label className="f">Prezzo di vendita<span className="stat">{eur(R.prezzo)}</span></label>
          <label className="f">Margine sul prezzo<span className="stat">{R.prezzo ? fP(((R.prezzo - R.total) / R.prezzo) * 100) : '–'}</span>
            <button className="btn s" style={{ alignSelf: 'flex-start' }} onClick={() => { S.ui.tab = 'margini'; commit(); }}>Margini per categoria →</button></label>
        </div>
        <div className="grid">
          <label className="f">Prezzo di listino barrato (facoltativo)<Inp path="prev.offerta.pieno" type="optnum" ph="nessuno" /></label>
          <label className="f">Trasporto €<Inp path="prev.offerta.trasporto" type="optnum" ph={traspAuto > 0 ? String(Math.round(traspAuto)) + ' (voci extra)' : 'escluso'} /></label>
          <label className="f">Posa in opera €<Inp path="prev.offerta.posa" type="optnum" ph={mont > 0 ? String(Math.round(mont)) + ' (montaggio)' : 'non inclusa'} /></label>
          <label className="f">Nota posa in opera<Inp path="prev.offerta.posaNota" type="txt" ph="es. (esclusa trivellazione)" /></label>
          <label className="f" style={{ gridColumn: 'span 2' }}>Modalità di posa<Inp path="prev.offerta.posaModo" type="txt" ph="es. con preassemblato in campo" /></label>
        </div>
        <div className="pills">{D.prezzi.map((c, i) => (
          <div key={i} className="pill"><span className="pl">{c.label}</span><span className="pv">{c.strike ? <s>{c.strike}</s> : null}<b>{c.value}</b>{c.nota ? <em>{c.nota}</em> : null}</span></div>))}</div>
      </>}</Fold>

      <Fold id="in-comm" step={6} title="Condizioni commerciali" sum={`Pagamento: ${D.campi.pagamento} · validità ${D.campi.validita}`}>{() => <>
        <p className="hint">Slide «Condizioni commerciali». Valuta (EUR) e prezzi IVA esclusa sono fissi; i campi vuoti compaiono come «–» (il pagamento come «Da concordare»).</p>
        <div className="grid">
          <label className="f">Resa (Incoterms 2020)<Inp path="prev.offerta.resa" type="txt" ph="es. DAP cantiere, EXW Marsala" /></label>
          <label className="f">Condizioni di pagamento<Inp path="prev.offerta.pagamento" type="txt" ph="Da concordare" /></label>
          <label className="f">Tempi di consegna<Inp path="prev.offerta.consegna" type="txt" ph="es. 8-10 settimane dall'ordine" /></label>
          <label className="f">Validità dell'offerta<Inp path="prev.offerta.validita" type="txt" ph="es. 30 giorni" /></label>
        </div>
      </>}</Fold>

      <Fold id="in-incl" step={7} title="Incluso nel prezzo e garanzie" sum={`${D.liste.inclusi.length} voci incluse · garanzia ${cfg.garanzie.struttura} anni · vale per tutti i preventivi`}>{() => <>
        <p className="hint">Elenco "Incluso nel prezzo" della slide Investimento (una voce per riga) e anni della slide Garanzie. Sono impostazioni comuni: valgono per tutti i preventivi. Nelle voci, <code>{'{{profilo_pilastri}}'}</code> e <code>{'{{spessore_asse}}'}</code> diventano il profilo e lo spessore dell'asse del preventivo (es. IPEA 140, 2,5).</p>
        <label className="f" style={{ marginBottom: 14 }}>Incluso nel prezzo
          <textarea rows={7} value={cfg.inclusi.join('\n')} onChange={e => { cfg.inclusi = e.target.value.split('\n'); save(); commit(); }} /></label>
        <div className="grid">
          <label className="f">Garanzia struttura e componenti (anni)<Inp path="data.params.offerta.garanzie.struttura" /></label>
          <label className="f">Garanzia componenti commerciali (anni)<Inp path="data.params.offerta.garanzie.commerciali" /></label>
          <label className="f">Assistenza gratuita (anni)<Inp path="data.params.offerta.garanzie.assistenza" /></label>
        </div>
        {!inclusiDefault && <div className="toolbar"><button className="btn s" onClick={() => { cfg.inclusi = [...INCLUSI0]; cfg.garanzie = { ...GARANZIE0 }; save(); commit(); }}>Ripristina testi e anni originali</button></div>}
      </>}</Fold>
    </>
  );
}
