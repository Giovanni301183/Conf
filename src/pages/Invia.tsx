// Scheda Invia preventivo: controllo dei dati, intestazione, layout (DXF o immagine), dati di progetto, prezzi, voci incluse; PowerPoint compilato.
// Comune ai settori: gli impianti fissi hanno il loro modello (domain/offertaFisso.ts), i loro campi obbligatori e le loro voci incluse.
import { useState } from 'react';
import { DateInp, Fold, Inp, TabTools } from '../components/ui';
import { eur, fP } from '../domain/format';
import { disegna, immagineInPng, leggiDxf } from '../domain/dxf';
import { fDate, fN, fileName, download } from '../domain/format';
import { DOVE, GARANZIE0, INCLUSI0, OBBLIGATORI, PROGETTO, bloccoOfferta, compilaPptx, layoutImg, offCfg, offPrev, prezzoServizio, servizi0, serviziDi, type DatiOfferta, type Servizio } from '../domain/offerta';
import { DOVE_FISSO, GARANZIE_FISSO0, INCLUSI_FISSO0, OBBLIGATORI_FISSO, PROGETTO_FISSO, datiOffertaDi, modelloOfferta, offCfgFisso, offPrevFisso } from '../domain/offertaFisso';
import { buildMont } from '../domain/plan';
import { R, S, commit, save } from '../store/state';
import { archPatch, archSave, isDirty, toast, vaiA } from '../store/actions';
import { online, pdfOfferta, propostaSito } from '../store/remote';
import { StatoTag } from './Cruscotto';
import { Ic } from '../components/Icona';

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
    <button className="btn s" disabled={busy} onClick={proponi}>{busy ? 'Cerco…' : <><Ic n="luogo" />Proponi dalla località</>}</button>
    <span className="muted small"> Compila categoria di esposizione, corrosività e altitudine; il vento lo inserisci tu.</span>
    {motivo ? <p className="hint" style={{ margin: '6px 0 0' }}>{motivo}</p> : null}
  </div>;
}

// Campo obbligatorio: compilato oppure segnato «non disponibile» (in rosso finché non è nessuna delle due).
function Obbl({ D, k, l, path, ph }: { D: DatiOfferta; k: string; l: string; path: string; ph?: string }) {
  const O = offPrev(S.prev), manca = D.mancanti.includes(obbligatori().find(o => o[0] === k)![1]);
  return <label className={`f${manca ? ' manca' : ''}`}>{l}<Inp path={path} type="txt" ph={O.nd[k] ? 'non disponibile' : ph} />
    <span className="ndck"><input type="checkbox" checked={!!O.nd[k]} onChange={e => { O.nd[k] = e.target.checked; save(); commit(); }} /> non disponibile</span></label>;
}
const fissoAperto = () => S.prev.settore === 'fisso';
const obbligatori = () => (fissoAperto() ? OBBLIGATORI_FISSO : OBBLIGATORI);
const ndAll = (keys: string[]) => { const O = offPrev(S.prev); keys.forEach(k => { O.nd[k] = true; }); save(); commit(); };

/** Slide «Forniture e servizi opzionali»: quali servizi vanno nell'offerta, con che nome e che prezzo. Vale per questo preventivo. */
function Servizi({ D }: { D: DatiOfferta }) {
  const set = S.prev.settore, O = offPrev(S.prev), ss = serviziDi(O, set), auto = { trasporto: D.campi.trasporto_opzionale, posa: D.campi.posa_opzionale, gru: D.campi.gru_opzionale };
  const cambia = (f: (l: Servizio[]) => void) => { const l = serviziDi(O, set); f(l); O.servizi = l; save(); commit(); };
  const sposta = (i: number, d: number) => cambia(l => { const j = i + d; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; });
  const standard = JSON.stringify(ss) === JSON.stringify(servizi0(set));
  return <>
    <p className="hint">Togli la spunta ai servizi da non proporre, correggi i nomi e i prezzi. Prezzo vuoto: trasporto e posa{set === 'fisso' ? ' (e la gru)' : ''} prendono i prezzi qui sopra, gli altri «Su richiesta»;
      un numero diventa «€ … + IVA» (0 = «Incluso»), un testo va tale e quale. Vale solo per questo preventivo.</p>
    <div className="wrap"><table className="servizi"><tbody>
      <tr><th>In offerta</th><th>Servizio</th><th>Prezzo</th><th>Nell'offerta</th><th></th></tr>
      {ss.map((x, i) => <tr key={i} className={x.on === false ? 'spento' : ''}>
        <td><input type="checkbox" checked={x.on !== false} onChange={e => cambia(l => { l[i].on = e.target.checked; })} aria-label="In offerta" /></td>
        <td><input value={x.voce} onChange={e => cambia(l => { l[i].voce = e.target.value; })} placeholder="Nome del servizio" /></td>
        <td><input value={x.prezzo} onChange={e => cambia(l => { l[i].prezzo = e.target.value; })} placeholder={(x.k && auto[x.k]) || 'Su richiesta'} /></td>
        <td className="small">{x.on === false ? <span className="muted">non proposto</span> : prezzoServizio(x, auto)}</td>
        <td className="acts"><button className="btn s" disabled={!i} onClick={() => sposta(i, -1)} title="Sposta su">↑</button>
          <button className="btn s" disabled={i === ss.length - 1} onClick={() => sposta(i, 1)} title="Sposta giù">↓</button>
          <button className="btn x" onClick={() => cambia(l => { l.splice(i, 1); })} title="Togli dall'elenco">✕</button></td>
      </tr>)}
    </tbody></table></div>
    <div className="toolbar"><button className="btn s" onClick={() => cambia(l => { l.push({ voce: '', prezzo: '', on: true }); })}>+ Aggiungi servizio</button>
      {!standard && <button className="btn s" onClick={() => { if (confirm("Tornare all'elenco standard dei servizi?")) { delete O.servizi; save(); commit(); } }}>Ripristina elenco standard</button>}
      {D.liste.servizi.length > 8 && <span className="muted small">Oltre 8 servizi le righe nella slide si stringono.</span>}</div>
  </>;
}

const modello = (P: any) => `${import.meta.env.BASE_URL}offerta/${modelloOfferta(P)}`;
const oggi = () => new Date().toISOString().slice(0, 10);

async function caricaLayout(f: File) {
  const O = offPrev(S.prev);
  try {
    if (/\.dxf$/i.test(f.name)) {
      const L = leggiDxf(await f.text());
      const img = disegna(L);
      // Nei fissi il DXF serve solo per il disegno: i layer contano i tracker.
      const trk: Record<string, number> = fissoAperto() ? {} : L.tracker;
      Object.assign(O, { layout: img.url, layoutW: img.w, layoutH: img.h, layoutNome: f.name, dxf: Object.keys(trk).length ? trk : null });
      const n = Object.values(trk).reduce((s, v) => s + v, 0);
      toast(fissoAperto() ? 'Layout caricato' : n ? `Layout caricato: ${n} tracker riconosciuti nel DXF` : 'Layout caricato (nessun tracker riconosciuto dai layer)');
    } else {
      const img = await immagineInPng(f);
      Object.assign(O, { layout: img.url, layoutW: img.w, layoutH: img.h, layoutNome: f.name, dxf: null });
      toast('Layout caricato');
    }
  } catch (err) { toast('File non leggibile: ' + (err as Error).message); return; }
  save(); commit();
}

/** Dati di progetto di un impianto fisso: sito, vento, modulo e struttura vengono da Configura; qui solo tipo di modulo e materiali. */
function ProgettoFisso({ D }: { D: DatiOfferta }) {
  const c = D.campi, da = (k: string) => (D.senza.includes(k) ? <span className="muted">{c[k]}</span> : c[k]);
  return (
    <Fold id="in-prog" step={4} title="Dati di progetto" sum={`${c.localita_zona} · vento ${c.vento_ms} m/s · ${c.modulo_modello} · tipo ${c.modulo_tipo}`}>{() => <>
      <p className="hint">Slide «Dati di progetto». Località, vento NTC, modulo e struttura vengono da Configura (lì «Proponi dalla località» compila anche la corrosività): per cambiarli usa i collegamenti in Controllo dei dati o la scheda Configura.</p>
      <div className="meta" style={{ marginTop: 0 }}>
        <div>Località<b>{da('localita')}</b><span className="muted small">{c.coordinate}</span></div>
        <div>Vento NTC 2018<b>{da('vento_ms')} m/s</b><span className="muted small">zona {c.zona_vento} · cat. {c.categoria_terreno} · {c.altitudine_m} m s.l.m.</span></div>
        <div>Modulo<b>{da('modulo_modello')}</b><span className="muted small">{c.modulo_dimensioni} mm · {c.modulo_peso_kg} kg · {c.potenza_modulo_w} W</span></div>
        <div>Struttura<b>{c.inclinazione}° · bordo {c.altezza_min_modulo_m} / {c.altezza_max_modulo_m} m</b><span className="muted small">infissione {c.infissione_m} m</span></div>
        <div>Verifica carichi<b className="small">{c.verifica_carichi}</b></div>
      </div>
      <div className="grid">
        {PROGETTO_FISSO.filter(([k]) => !k.startsWith('materiale')).map(([k, l, ph]) => <Obbl key={k} D={D} k={k} l={l} path={`prev.offerta.prog.${k}`} ph={'es. ' + ph} />)}
        {PROGETTO_FISSO.filter(([k]) => k.startsWith('materiale')).map(([k, l, ph]) => (
          <label key={k} className="f" style={{ gridColumn: 'span 2' }}>{l}<Inp path={`prev.offerta.prog.${k}`} type="txt" ph={`vuoto = riga tolta (es. ${ph})`} /></label>))}
      </div>
    </>}</Fold>
  );
}

/** Calcolo strutturale di un impianto fisso, com'è nella slide: vento NTC 2018, azioni sui moduli, struttura e geometria per taglia. */
function CalcoloFisso({ D }: { D: DatiOfferta }) {
  const c = D.campi, g = D.liste.geometria;
  const righe = (rr: [string, string][]) => rr.map(([l, v]) => <tr key={l}><td>{l}</td><td className="n"><b>{v}</b></td></tr>);
  return (
    <Fold id="in-calc" step={5} title="Calcolo strutturale" sum={`vr ${c.vento_ms} m/s · qp ${c.pressione_picco} kN/m² · basso ${c.p_giu} / sollevamento ${c.p_su} kN/m² · ${g.length} ${g.length === 1 ? 'taglia' : 'taglie'}`}>{() => <>
      <p className="hint">Slide «Calcolo strutturale» dell'offerta. Valori da Configura → Sito e vento (NTC 2018 § 3.3, terreno pianeggiante) e dalla composizione dell'impianto; i cp netti della falda li dà il progettista.</p>
      <div className="grid" style={{ alignItems: 'start' }}>
        <div className="wrap"><table><tbody><tr><th colSpan={2}>Vento · NTC 2018 § 3.3</th></tr>{righe([
          ['Zona vento · altitudine', `${c.zona_vento} · ${c.altitudine_m} m`], ['vb0 · a0 · ks', `${c.vb0} m/s · ${c.a0} m · ${c.ks}`], ['Coeff. di altitudine ca', c.ca],
          ['Velocità base vb', `${c.vb} m/s`], ['Periodo di ritorno · cr', `${c.tr} anni · ${c.cr}`], ['Velocità di riferimento vr', `${c.vento_ms} m/s`],
          ['Pressione cinetica qr', `${c.qr} kN/m²`], ['Esposizione · quota z', `cat. ${c.categoria_terreno} · ${c.z_vento} m`], ['Coeff. di esposizione ce', c.ce],
          ['Pressione di picco qp', `${c.pressione_picco} kN/m²`]])}</tbody></table></div>
        <div className="wrap"><table><tbody><tr><th colSpan={2}>Azioni sui moduli</th></tr>{righe([
          ['cp verso il basso · in sollevamento', `${c.cp_giu} · ${c.cp_su}`], ['Coeff. dinamico cd', c.cd], ['Pressione verso il basso', `${c.p_giu} kN/m² · ${c.p_giu_modulo} kN/modulo`],
          ['Pressione in sollevamento', `${c.p_su} kN/m² · ${c.p_su_modulo} kN/modulo`], ['Superficie del modulo', `${c.area_modulo} m²`], ['Carico neve verificato', c.neve]])}</tbody></table></div>
        <div className="wrap"><table><tbody><tr><th colSpan={2}>Struttura</th></tr>{righe([
          ['Inclinazione · file di moduli', `${c.inclinazione}° · ${c.file_verticali} in verticale`], ['Bordo basso / alto', `${c.altezza_min_modulo_m} / ${c.altezza_max_modulo_m} m`],
          ['Infissione ant. / post.', `${c.infissione_m} m`], ['Distanza pali ant. / post.', `${c.distanza_pali_m} m`], ['Fuga tra i moduli', `${c.fuga_mm} mm`], ['Massa delle strutture', c.peso_totale]])}</tbody></table></div>
      </div>
      <div className="wrap"><table><tbody>
        <tr><th>Taglia</th><th className="n">Strutture</th><th className="n">Campate</th><th className="n">Telai</th><th className="n">Lunghezza</th><th className="n">1° – ultimo telaio</th><th className="n">Controventi</th><th className="n">Massa / str.</th><th className="n">Potenza / str.</th></tr>
        {g.map(x => <tr key={x.moduli}><td>{x.moduli} moduli</td><td className="n">{x.quantita}</td><td className="n">{x.campate}</td><td className="n">{x.telai}</td><td className="n">{x.lunghezza} m</td>
          <td className="n">{x.interasse} m</td><td className="n">{x.controventi}</td><td className="n">{x.massa} kg</td><td className="n">{x.potenza_struttura} kWp</td></tr>)}
      </tbody></table></div>
    </>}</Fold>
  );
}

export function Invia() {
  const P = S.prev, fisso = P.settore === 'fisso', O = fisso ? offPrevFisso(P) : offPrev(P), cfg = fisso ? offCfgFisso(S.data) : offCfg(S.data);
  const mont = fisso ? 0 : buildMont().tot;
  const D = datiOffertaDi(P, R, S.data, mont), DV = fisso ? DOVE_FISSO : DOVE;
  const st = fisso ? 1 : 0;   // i fissi hanno in più il passo Calcolo strutturale
  const [busy, setBusy] = useState('');
  const isTr = (l: any) => l.riga === 'extra' && /traspor/i.test(l.desc || '');
  const traspAuto = R.lines.filter(isTr).reduce((s: number, l: any) => s + l.prezzo, 0);
  // Nei fissi le voci extra di posa o montaggio danno la posa in opera.
  const posaAuto = fisso ? R.lines.filter((l: any) => l.riga === 'extra' && !/traspor/i.test(l.desc || '') && /posa|montagg/i.test(l.desc || '')).reduce((s: number, l: any) => s + l.prezzo, 0) : 0;
  const manc = obbligatori().filter(o => D.mancanti.includes(o[1]));
  const [INC0, GAR0] = fisso ? [INCLUSI_FISSO0, GARANZIE_FISSO0] : [INCLUSI0, GARANZIE0], garP = fisso ? 'data.fisso.offerta.garanzie' : 'data.params.offerta.garanzie';
  const inclusiDefault = cfg.inclusi.join('\n') === INC0.join('\n') && JSON.stringify(cfg.garanzie) === JSON.stringify(GAR0);

  // Il PDF si fa sul server (ConvertAPI) dal PowerPoint compilato qui.
  async function scarica(pdf: boolean) {
    const blocco = bloccoOfferta(D);
    if (blocco) { toast('Offerta non generata: ' + blocco); return; }
    setBusy(pdf ? 'pdf' : 'pptx');
    try {
      const r = await fetch(modello(P)); if (!r.ok) throw new Error(`modello non trovato (${r.status})`);
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
        {D.avvisi.length ? <div className="warn" style={{ marginTop: 0 }}>{D.avvisi.map((a, i) => { const d = DV[D.avvisiDove[i]]; return <div key={i} className="avvrow"><span>{a}</span>{d && <button className="btn s" onClick={() => vaiA(d)} title={'Apre ' + d.nome}>Vai →</button>}</div>; })}</div> : <p className="hint">Tutti i dati necessari ci sono.</p>}
        {manc.length ? <>
          <h3>Campi obbligatori</h3>
          <p className="hint">Finché questi campi non sono compilati o segnati «non disponibile», l'offerta non si genera. Nel PDF i campi non disponibili compaiono come «Non disponibile».</p>
          <div className="wrap"><table><tbody>
            <tr><th>Campo</th><th>Dove si compila</th><th></th></tr>
            {manc.map(([k, l, dove]) => <tr key={k}><td>{l}</td><td className="small">{DV[k] ? <a href="#" onClick={e => { e.preventDefault(); vaiA(DV[k]); }}>{DV[k].nome} →</a> : dove}</td>
              <td className="acts"><button className="btn s" onClick={() => ndAll([k])}>Non disponibile</button></td></tr>)}
          </tbody></table></div>
          {manc.length > 1 && <div className="toolbar"><button className="btn s" onClick={() => { if (confirm(`Segnare come «non disponibile» tutti i ${manc.length} campi mancanti?`)) ndAll(manc.map(o => o[0])); }}>Segna tutti non disponibili</button></div>}
        </> : null}
        <div className="meta">
          <div>Offerta n.<b>{D.campi.numero_offerta} rev. {D.campi.revisione}</b></div><div>Cliente<b>{P.cliente || '–'}</b></div>
          <div>Potenza<b>{D.campi.potenza_kwp} kWp</b></div><div>Modulo<b>{D.campi.potenza_modulo_w} W</b></div>
          <div>Struttura<b>{fisso ? `${D.campi.n_strutture} struttur${D.campi.n_strutture === '1' ? 'a' : 'e'}` : D.campi.profilo_acciaio || '–'} · {D.campi.peso_struttura_ton} t</b></div>
        </div>
        <h3>Slide del layout</h3>
        <ul className="olist">{D.righe.map(r => <li key={r.taglia}>N.{fN(r.n, 0)} {fisso ? `STRUTTUR${r.n === 1 ? 'A' : 'E'}` : 'TRACKER TTS'}.{r.taglia} MODULI</li>)}</ul>
      </>}</Fold>

      <Fold id="in-int" step={2} title="Intestazione dell'offerta" sum={`N. ${D.campi.numero_offerta} rev. ${D.campi.revisione} · ${D.campi.data_offerta} · ${D.campi.nome_impianto || '–'}`}>{() => <>
        <p className="hint">Il numero è il progressivo del preventivo, assegnato al primo salvataggio (si cambia in Configura → Commessa). Per una nuova versione della stessa offerta aumenta la revisione.</p>
        <div className="grid">
          <label className="f">Numero offerta<span className="stat">{P.num || 'salva il preventivo'}</span></label>
          <label className="f">Revisione<Inp path="prev.offerta.rev" type="txt" /></label>
          <label className="f">Data dell'offerta<DateInp path="prev.offerta.data" /><span className="muted small">{O.data ? '' : `vuota = data del preventivo (${fDate(P.data)})`}</span></label>
          <label className="f">Nome dell'impianto<Inp path="prev.offerta.nome" type="txt" ph={P.rif || P.cliente || 'es. Impianto agrivoltaico Foggia'} /></label>
          <Obbl D={D} k="referente" l="Referente del cliente" path="prev.offerta.referente" ph="Nome e cognome" />
          <Obbl D={D} k="email_referente" l="E-mail del referente" path="prev.offerta.email" ph="nome@cliente.it" />
          <Obbl D={D} k="zona" l="Zona" path="prev.offerta.zona" ph="es. Periferia, Zona industriale" />
        </div>
      </>}</Fold>

      <Fold id="in-lay" step={3} title="Layout dell'impianto" sum={O.layoutNome ? `${O.layoutNome}${O.dxf ? ' · ' + Object.entries(O.dxf).map(([t, n]) => `${n}×${t}`).join(', ') : ''}` : 'Da caricare: DXF, PNG o JPG'}>{() => <>
        {fisso ? <p className="hint">Carica il DXF del layout (oppure un'immagine): l'app ne disegna la pianta per la slide del layout. Le campiture (aree piene) non vengono disegnate.</p>
          : <p className="hint">Carica il DXF del layout (oppure un'immagine). Dal DXF l'app disegna la pianta e conta i tracker dai layer "Inseguitore 40", "Inseguitore 20"… o dai blocchi "Struttura 40 moduli". Le campiture (aree piene) non vengono disegnate.</p>}
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

      {fisso ? <><ProgettoFisso D={D} /><CalcoloFisso D={D} /></> : <Fold id="in-prog" step={4} title="Dati di progetto" sum={`${PROGETTO.filter(([k]) => String(O.prog[k] ?? '').trim()).length} di ${PROGETTO.length} compilati`}>{() => <>
        <p className="hint">Slide "Dati di progetto". Località, coordinate e modello del modulo vengono da Configura (<b>{P.luogo?.nome || 'località non indicata'}</b> · <b>{P.modulo?.marca || 'modulo non indicato'}</b>). Ogni campo va compilato o segnato «non disponibile».</p>
        <ProponiSito />
        <div className="grid">{PROGETTO.map(([k, l, ph]) => <Obbl key={k} D={D} k={k} l={l} path={`prev.offerta.prog.${k}`} ph={'es. ' + ph} />)}</div>
      </>}</Fold>}

      <Fold id="in-prz" step={5 + st} title="Prezzi nell'offerta" sum={D.prezzi.map(c => `${c.label}: ${c.value}`).join(' · ')}>{() => <>
        <p className="hint">Nell'offerta vanno sempre i <b>prezzi di vendita</b> (costo + margine), mai i costi. {fisso
          ? <>Strutture = prezzo di vendita della sola fornitura. Trasporto, posa e <b>tutte le voci extra</b> stanno sempre a parte, ognuna con la sua riga e il suo prezzo; trasporto e posa scritti qui sostituiscono le loro voci («Incluso» mette il trasporto nelle strutture).</>
          : <>Struttura e componenti = prezzo di vendita senza il trasporto, che resta a parte. La posa in opera è indicata a parte e non entra nel totale.</>}</p>
        <div className={`grid${R.prezzo - R.total < 0.5 ? ' margwarn' : ''}`} style={{ marginBottom: 14 }}>
          <label className="f">{P.marg.modo === 'ricarico' ? 'Ricarico' : 'Margine'} generale (%)<Inp path="prev.marg.gen" /></label>
          <label className="f">Costo<span className="stat">{eur(R.total)}</span></label>
          <label className="f">Prezzo di vendita<span className="stat">{eur(R.prezzo)}</span></label>
          <label className="f">Margine sul prezzo<span className="stat">{R.prezzo ? fP(((R.prezzo - R.total) / R.prezzo) * 100) : '–'}</span>
            <button className="btn s" style={{ alignSelf: 'flex-start' }} onClick={() => { S.ui.tab = 'margini'; commit(); }}>Margini per categoria →</button></label>
        </div>
        <div className="grid">
          <label className="f">Trasporto € (o «Incluso»)<Inp path="prev.offerta.trasporto" type="numtxt" ph={traspAuto > 0 ? String(Math.round(traspAuto)) + ' (voci extra)' : 'escluso'} /></label>
          <label className="f">Posa in opera €<Inp path="prev.offerta.posa" type="optnum" ph={mont > 0 ? String(Math.round(mont)) + ' (montaggio)' : posaAuto > 0 ? String(Math.round(posaAuto)) + ' (voci extra)' : 'non inclusa'} /></label>
          <label className="f">Nota posa in opera<Inp path="prev.offerta.posaNota" type="txt" ph="es. (esclusa trivellazione)" /></label>
          <label className="f" style={{ gridColumn: 'span 2' }}>Modalità di posa<Inp path="prev.offerta.posaModo" type="txt" ph="es. con preassemblato in campo" /></label>
        </div>
        <div className="pills">{D.prezzi.map((c, i) => (
          <div key={i} className="pill"><span className="pl">{c.label}</span><span className="pv">{c.strike ? <s>{c.strike}</s> : null}<b>{c.value}</b>{c.nota ? <em>{c.nota}</em> : null}</span></div>))}</div>
      </>}</Fold>

      <Fold id="in-serv" step={6 + st} title="Forniture e servizi opzionali" sum={`${D.liste.servizi.length} in offerta: ${D.liste.servizi.map(x => x.voce).join(', ') || 'nessuno'}`}>{() => <Servizi D={D} />}</Fold>

      <Fold id="in-comm" step={7 + st} title="Condizioni commerciali" sum={`Pagamento: ${D.campi.pagamento} · validità ${D.campi.validita}`}>{() => <>
        <p className="hint">Slide «Condizioni commerciali». Valuta (EUR) e prezzi IVA esclusa sono fissi; resa, consegna e validità vanno compilate o segnate «non disponibile» (il pagamento vuoto diventa «Da concordare»).</p>
        <div className="grid">
          <Obbl D={D} k="resa" l="Resa (Incoterms 2020)" path="prev.offerta.resa" ph="es. DAP cantiere, EXW Marsala" />
          <label className="f">Condizioni di pagamento<Inp path="prev.offerta.pagamento" type="txt" ph="Da concordare" /></label>
          <Obbl D={D} k="consegna" l="Tempi di consegna" path="prev.offerta.consegna" ph="es. 8-10 settimane dall'ordine" />
          <Obbl D={D} k="validita" l="Validità dell'offerta" path="prev.offerta.validita" ph="es. 30 giorni" />
        </div>
      </>}</Fold>

      <Fold id="in-incl" step={8 + st} title="Incluso nel prezzo e garanzie" sum={`${D.liste.inclusi.length} voci incluse · garanzia ${cfg.garanzie.struttura} anni · vale per tutti i preventivi`}>{() => <>
        {fisso ? <p className="hint">Elenco "Incluso nel prezzo" della slide Forniture e servizi opzionali (una voce per riga) e anni della slide Garanzie. Valgono per tutti i preventivi di impianti fissi.</p>
          : <p className="hint">Elenco "Incluso nel prezzo" della slide Investimento (una voce per riga) e anni della slide Garanzie. Sono impostazioni comuni: valgono per tutti i preventivi. Nelle voci, <code>{'{{profilo_pilastri}}'}</code> e <code>{'{{spessore_asse}}'}</code> diventano il profilo e lo spessore dell'asse del preventivo (es. IPEA 140, 2,5).</p>}
        <label className="f" style={{ marginBottom: 14 }}>Incluso nel prezzo
          <textarea rows={7} value={cfg.inclusi.join('\n')} onChange={e => { cfg.inclusi = e.target.value.split('\n'); save(); commit(); }} /></label>
        <div className="grid">
          <label className="f">Garanzia struttura e componenti (anni)<Inp path={garP + '.struttura'} /></label>
          <label className="f">Garanzia componenti commerciali (anni)<Inp path={garP + '.commerciali'} /></label>
          <label className="f">Assistenza gratuita (anni)<Inp path={garP + '.assistenza'} /></label>
        </div>
        {!inclusiDefault && <div className="toolbar"><button className="btn s" onClick={() => { cfg.inclusi = [...INC0]; cfg.garanzie = { ...GAR0 }; save(); commit(); }}>Ripristina testi e anni originali</button></div>}
      </>}</Fold>
    </>
  );
}
