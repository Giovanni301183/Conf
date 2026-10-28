// Impianti fissi: schede Configura (commessa, sito e vento, moduli, struttura, composizione per taglie, anteprima) e Distinta base.
// Il calcolo e' quello di domain/fisso.ts; il DXF (tavole DE VITA adattate alla taglia) lo prepara la funzione Python api/dxf_fisso.py.
import { useState } from 'react';
import { DateInp, Fold, Inp, Sel, TabTools } from '../components/ui';
import { fDate, fN, fileName } from '../domain/format';
import { TAGLIE, calcolaFisso, comuniDi, nuovaTaglia, proponiImpianto, sitoDi, type Risultato, type Riga } from '../domain/fisso';
import { CATEGORIE, pressioni, vento } from '../domain/vento';
import { NOMI_FISSO, PREZZI_FISSO0, normListinoFisso } from '../domain/fissoCosti';
import { offPrevFisso } from '../domain/offertaFisso';
import { STATI } from '../domain/model';
import { toast } from '../store/actions';
import { S, commit, save } from '../store/state';
import { AgendaPreventivo } from './Calendario';

const done = () => { save(); commit(); };
const n0 = (x: number) => fN(x, 0), kn = (nm2: number) => `${fN(nm2 / 1000, 2)} kN/m²`;
const mare = (km: number) => (km < 1 ? `${Math.round(km * 10) * 100} m` : `${n0(km)} km`);
/** Campo numerico con l'unità di misura a destra. */
const U = ({ path, um, type = 'num', ph }: { path: string; um: string; type?: 'num' | 'optnum'; ph?: string }) =>
  <span className="um"><Inp path={path} type={type} ph={ph} /><em>{um}</em></span>;

// Taglia mostrata nell'anteprima: non fa parte del preventivo (cambiarla non lo segna come modificato).
let sel = 0;

/* ---------- DXF ---------- */
// In locale serve il server Python (npm run dev:dxf, porta 8000), chiamato direttamente; su Vercel e' una funzione del progetto.
const URL_DXF = import.meta.env.DEV ? 'http://127.0.0.1:8000/api/dxf_fisso' : '/api/dxf_fisso';
export const MAX_TAGLIE_DXF = 3;   // un DXF compresso pesa circa 1,3 MB e le risposte delle funzioni arrivano a 4,5 MB
// Le regole restano solo qui: al server va il risultato del calcolo di ogni taglia, il Python disegna e basta.
async function scaricaDxf(P: any, idx: number[], setBusy: (s: string) => void) {
  const tt = (calcolaFisso(P).r?.taglie || []).filter((_, i) => idx.includes(i));
  if (!tt.length) return;
  setBusy(idx.length > 1 ? 'tutti' : String(idx[0]));
  try {
    const r = await fetch(URL_DXF, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ risultati: tt, nome: P.cliente }) });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      throw new Error(j?.errore || `errore ${r.status}`);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = tt.length > 1 ? `impianto_${fileName(P.cliente || 'fisso')}.zip` : `struttura_${tt[0].input.moduli}_moduli.zip`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) {
    const spento = import.meta.env.DEV && e instanceof TypeError;   // fetch senza risposta: server locale non avviato
    toast('DXF non pronto: ' + (spento ? 'avvia il server del DXF con npm run dev:dxf (porta 8000)' : (e as Error).message));
  }
  setBusy('');
}

/* ---------- Disegni ---------- */
function Pianta({ r }: { r: Risultato }) {
  const g = r.geometria, pad = 600;
  return (
    <figure className="disegno">
      <figcaption>Pianta · {r.campate} campate, {r.telai} telai</figcaption>
      <svg viewBox={`${-pad} ${-pad} ${g.lunghezza + 2 * pad} ${g.profondita + 2 * pad + 700}`} role="img" aria-label="Pianta della struttura">
        {g.moduli.map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} className="modulo" />)}
        {g.telai_x.map((x, i) => <line key={i} x1={x} x2={x} y1={-250} y2={g.profondita + 250} className="telaio" />)}
        <line x1={0} x2={g.lunghezza} y1={g.profondita + 500} y2={g.profondita + 500} className="quota" />
        <text x={g.lunghezza / 2} y={g.profondita + 950} className="quota-testo">{n0(g.lunghezza)} mm</text>
      </svg>
    </figure>
  );
}
function Sezione({ r }: { r: Risultato }) {
  const s = r.geometria.sezione, [[x0, y0], [x1, y1]] = s.falda, H = s.altezza_alta + 400, pad = 500, Y = (y: number) => H - y;
  return (
    <figure className="disegno sezione">
      <figcaption>Sezione telaio · bordo basso {n0(s.altezza_bassa)} mm, bordo alto {n0(s.altezza_alta)} mm da terra</figcaption>
      <svg viewBox={`${-pad} 0 ${x1 + 2 * pad} ${H + 300}`} role="img" aria-label="Sezione del telaio">
        <line x1={-pad} x2={x1 + pad} y1={Y(0)} y2={Y(0)} className="terreno" />
        <line x1={x0} x2={x1} y1={Y(y0)} y2={Y(y1)} className="falda" />
        <line x1={x0 + 150} x2={x0 + 150} y1={Y(0)} y2={Y(y0 + 70)} className="montante" />
        <line x1={x1 - 150} x2={x1 - 150} y1={Y(0)} y2={Y(y1 - 70)} className="montante" />
      </svg>
    </figure>
  );
}

/* ---------- Sito e vento (NTC 2018) ---------- */
function SitoVento({ step, z }: { step: number; z: number | null }) {
  const P = S.prev, F = P.fisso, lu = P.luogo, s = sitoDi(P), [busy, setBusy] = useState(''), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const v = z == null ? null : vento(s, z), p = pressioni(s, v), coord = s.lat != null && s.lng != null;
  const mod = (num(F.comuni.lunghezza_modulo) * num(F.comuni.larghezza_modulo)) / 1e6;
  // Stessa proposta del modulo Telegram e di Invia preventivo (api/_sito.ts), fatta dal browser: va anche in locale, senza server.
  const trova = async (da: 'localita' | 'coordinate') => {
    setBusy(da); setMsg(null);
    try {
      const { propostaSito } = await import('../../api/_sito');
      const r: any = await propostaSito(lu.nome || '', da === 'coordinate' ? s.lat : null, da === 'coordinate' ? s.lng : null);
      if (!r.ok) throw new Error(r.errore);
      P.luogo = { ...lu, lat: +(+r.lat).toFixed(5), lng: +(+r.lng).toFixed(5) };
      Object.assign(F.sito, { luogo: r.luogo, zona_vento: r.zona_vento ?? '', altitudine: +r.altitudine_m, km_mare: Math.round(r.km_mare * 10) / 10, categoria: r.categoria_terreno || '' });
      if (r.classe_corrosivita) offPrevFisso(P).prog.classe_corrosivita = r.classe_corrosivita;
      setMsg({ ok: !!r.zona_vento, t: `Trovato: ${r.luogo} · ${r.altitudine_m} m s.l.m. · a circa ${mare(r.km_mare)} dal mare.` + (r.zona_vento ? '' : ' Zona vento non riconosciuta: sceglila a mano.') });
    } catch (e) { setMsg({ ok: false, t: 'Ricerca non riuscita: ' + (e as Error).message }); }
    setBusy(''); done();
  };
  const sum = s.zona_vento
    ? [lu.nome || String(F.sito.luogo).split(',')[0], `zona ${s.zona_vento}${s.categoria ? `, cat. ${s.categoria}` : ''}`, v && `qp ${kn(v.qp)}`,
      p.giu != null && `basso ${kn(p.giu)}`, p.su != null && `sollevamento ${kn(p.su)}`].filter(Boolean).join(' · ')
    : 'Scrivi la località: coordinate, zona, quota e vento si propongono da soli';
  return (
    <Fold id="cf-sito" step={step} title="Sito e vento (NTC 2018)" sum={sum}>{() => <>
      <div className="grid">
        <div className="f" style={{ gridColumn: 'span 2' }}>Località dell'impianto
          <span className="lrow">
            <Inp path="prev.luogo.nome" type="txt" ph="es. Cerignola (FG)" />
            <button className="btn s p" disabled={!!busy || !String(lu.nome || '').trim()} onClick={() => trova('localita')}>{busy === 'localita' ? 'Cerco…' : 'Proponi dalla località'}</button>
          </span>
        </div>
        <label className="f">Latitudine<U path="prev.luogo.lat" type="optnum" um="°N" ph="es. 41,2648" /></label>
        <label className="f">Longitudine<U path="prev.luogo.lng" type="optnum" um="°E" ph="es. 15,8997" /></label>
        <div className="f">Dalle coordinate
          <span className="lrow">
            <button className="btn s" disabled={!!busy || !coord} onClick={() => trova('coordinate')} title="Ricalcola zona, quota e categoria dalle coordinate scritte">{busy === 'coordinate' ? 'Cerco…' : 'Proponi'}</button>
            {coord && <a className="btn s" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer">Mappa ↗</a>}
          </span>
        </div>
        <label className="f">Zona vento<Sel path="prev.fisso.sito.zona_vento" type="num" opts={[['', '—'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => [x, `Zona ${x}`] as const)]} /></label>
        <label className="f">Categoria di esposizione<Sel path="prev.fisso.sito.categoria" opts={[['', '—'], ...CATEGORIE]} /></label>
        <label className="f">Altitudine<U path="prev.fisso.sito.altitudine" type="optnum" um="m" ph="da inserire" /></label>
        <label className="f">Distanza dal mare<span className="stat">{s.km_mare != null ? mare(s.km_mare) : '–'}</span></label>
        <label className="f">Periodo di ritorno<U path="prev.fisso.sito.tr" um="anni" /></label>
      </div>
      {msg && <p className={msg.ok ? 'hint' : 'warn'} style={{ margin: '12px 0 0' }}>{msg.t}</p>}

      <h3>Vento · § 3.3</h3>
      {v ? <>
        <div className="meta" style={{ marginTop: 0 }}>
          <div>vb0 · a0 · ks<b>{n0(v.vb0)} m/s · {n0(v.a0)} m · {fN(v.ks, 2)}</b></div>
          <div>Velocità base vb<b>{fN(v.vb, 2)} m/s</b></div>
          <div>Velocità di riferimento vr<b>{fN(v.vr, 2)} m/s</b><span className="muted small">cr {fN(v.cr, 3)} · TR {s.tr} anni</span></div>
          <div>Pressione cinetica qr<b>{kn(v.qr)}</b></div>
          <div>Coeff. di esposizione ce<b>{fN(v.ce, 2)}</b><span className="muted small">z = {fN(Math.max(v.z, v.zmin), 1)} m{v.z < v.zmin ? ' (zmin)' : ''}</span></div>
          <div>Pressione di picco qp<b>{kn(v.qp)}</b></div>
        </div>
        <div className="grid" style={{ marginTop: 16 }}>
          <label className="f">cp verso il basso<Inp path="prev.fisso.sito.cp_giu" type="optnum" ph="dal progettista" /></label>
          <label className="f">cp in sollevamento<Inp path="prev.fisso.sito.cp_su" type="optnum" ph="dal progettista, in valore assoluto" /></label>
          <label className="f">Coeff. dinamico cd<Inp path="prev.fisso.sito.cd" /></label>
        </div>
        <div className="meta">
          <div>Pressione verso il basso<b>{p.giu != null ? kn(p.giu) : '–'}</b>{p.giu != null && <span className="muted small">{fN((p.giu * mod) / 1000, 2)} kN per modulo</span>}</div>
          <div>Pressione in sollevamento<b>{p.su != null ? kn(Math.abs(p.su)) : '–'}</b>{p.su != null && <span className="muted small">{fN((Math.abs(p.su) * mod) / 1000, 2)} kN per modulo</span>}</div>
        </div>
      </> : <p className="hint" style={{ margin: 0 }}>Servono zona vento, categoria di esposizione e altitudine.</p>}
      <p className="hint" style={{ margin: '14px 0 0' }}>
        Proposta da far verificare al progettista. Zona vento dalla regione, categoria per campagna aperta (rugosità D) secondo la distanza dal mare e la quota.
        La pressione sui moduli è qp × cp × cd, con cp netti della falda dati dal progettista; per modulo = pressione × superficie del modulo.
      </p>
    </>}</Fold>
  );
}
const num = (v: unknown) => (isFinite(Number(v)) ? Number(v) : 0);

/* ---------- Configura ---------- */
export function ConfiguraFisso() {
  const P = S.prev, F = P.fisso, { r, errore } = calcolaFisso(P), [busy, setBusy] = useState('');
  const [ob, setOb] = useState({ v: '', u: 'kwp' as 'kwp' | 'moduli' }), [prop, setProp] = useState('');
  const i = Math.min(sel, F.taglie.length - 1), rt = r?.taglie[i], z = r?.taglie[0] ? r.taglie[0].geometria.sezione.altezza_alta / 1000 : null;
  const libere = TAGLIE.filter(m => !F.taglie.some((x: any) => num(x.moduli) === m));
  const vedi = (j: number) => { sel = j; commit(); };
  const aggiungi = () => { F.taglie.push({ ...nuovaTaglia(libere[libere.length - 1]), controventi: '', lunghezza_arc_unico: '' }); sel = F.taglie.length - 1; S.ui.folds['cf-comp'] = true; done(); };
  const togli = (j: number) => { F.taglie.splice(j, 1); if (sel >= j) sel = Math.max(0, sel - 1); done(); };
  const proponi = () => {
    try {
      const v = num(ob.v.replace(',', '.')), p = proponiImpianto(ob.u === 'kwp' ? { kwp: v } : { moduli: Math.round(v) }, num(F.comuni.potenza_modulo));
      F.taglie = p.taglie.map(t => ({ ...t, controventi: '', lunghezza_arc_unico: '' })); sel = 0;
      setProp([...p.note, `Proposta: ${p.moduli} moduli, ${fN(p.potenza, 2)} kWp. Puoi modificarla nella tabella.`].join(' ')); done();
    } catch (e) { setProp((e as Error).message); }
  };
  const comm = [P.num && 'N° ' + P.num, P.cliente, P.rif].filter(Boolean).join(' · ');
  const C = comuniDi(P);
  return (
    <>
      <TabTools />
      <AgendaPreventivo />
      {errore && <div className="warn">{errore}</div>}
      <Fold id="cf-comm" step={1} title="Commessa" sum={(comm || 'Da compilare') + ' · ' + fDate(P.data)}>{() => (
        <div className="grid">
          <label className="f">N° preventivo<Inp path="prev.num" type="txt" ph="assegnato al salvataggio" /></label>
          <label className="f">Cliente<Inp path="prev.cliente" type="txt" ph="es. DE VITA" /></label>
          <label className="f">Riferimento commessa<Inp path="prev.rif" type="txt" /></label>
          <label className="f">Data<DateInp path="prev.data" /></label>
          <label className="f">Stato<Sel path="prev.stato" opts={STATI.map(([k, l, , ic]) => [k, `${ic} ${l}`] as const)} /></label>
          <label className="f" style={{ gridColumn: '1/-1' }}>Note<Inp path="prev.note" type="txt" /></label>
        </div>
      )}</Fold>

      <SitoVento step={2} z={z} />

      <Fold id="cf-mod" step={3} title="Moduli fotovoltaici"
        sum={`${P.modulo?.marca ? P.modulo.marca + ' · ' : ''}${n0(C.lunghezza_modulo)} × ${n0(C.larghezza_modulo)} mm · ${n0(C.potenza_modulo * 1000)} Wp${r ? ` → ${fN(r.totali.potenza, 2)} kWp` : ''}`}>{() => (
        <div className="grid">
          <label className="f" style={{ gridColumn: 'span 2' }}>Modello del modulo<Inp path="prev.modulo.marca" type="txt" ph="es. Marca XYZ 735 W bifacciale" /></label>
          <label className="f">Lunghezza modulo<U path="prev.fisso.comuni.lunghezza_modulo" um="mm" /></label>
          <label className="f">Larghezza modulo<U path="prev.fisso.comuni.larghezza_modulo" um="mm" /></label>
          <label className="f">Potenza modulo<U path="prev.fisso.comuni.potenza_modulo" um="kWp" /></label>
          <label className="f">Peso modulo<U path="prev.fisso.comuni.peso_modulo" type="optnum" um="kg" ph="da inserire" /></label>
          <label className="f">Fuga tra moduli<U path="prev.fisso.comuni.fuga" um="mm" /></label>
          <label className="f">Moduli totali<span className="stat">{r ? n0(r.totali.moduli) : '–'}</span></label>
          <label className="f">Potenza impianto<span className="stat">{r ? `${fN(r.totali.potenza, 2)} kWp` : '–'}</span></label>
        </div>
      )}</Fold>

      <Fold id="cf-str" step={4} title="Struttura"
        sum={`${n0(C.inclinazione)}° · bordo basso ${n0(C.altezza_min_terra)} mm · infissione ${n0(C.infissione_ant)} / ${n0(C.infissione_post)} mm`}>{() => (
        <div className="grid">
          <label className="f">Inclinazione<U path="prev.fisso.comuni.inclinazione" um="°" /></label>
          <label className="f">Altezza min. da terra<U path="prev.fisso.comuni.altezza_min_terra" um="mm" /></label>
          <label className="f">Infissione pilastro ant.<U path="prev.fisso.comuni.infissione_ant" um="mm" /></label>
          <label className="f">Infissione pilastro post.<U path="prev.fisso.comuni.infissione_post" um="mm" /></label>
        </div>
      )}</Fold>

      <Fold id="cf-comp" step={5} title="Composizione impianto"
        sum={`${F.taglie.map((x: any) => `${x.moduli} × ${x.n_strutture}`).join(' · ')} → ${r ? `${r.totali.strutture} strutture, ${n0(r.totali.moduli)} moduli` : '…'}`}
        act={<button className="btn p" disabled={!libere.length} onClick={aggiungi}>+ Aggiungi taglia</button>}>{() => <>
        <form className="toolbar" onSubmit={e => { e.preventDefault(); proponi(); }}>
          <b>Proposta automatica</b>
          <span className="prop">
            <input className="n" inputMode="decimal" value={ob.v} placeholder={ob.u === 'kwp' ? 'es. 570' : 'es. 776'} onChange={e => setOb({ ...ob, v: e.target.value })} />
            <select value={ob.u} onChange={e => setOb({ ...ob, u: e.target.value as 'kwp' | 'moduli' })}><option value="kwp">kWp</option><option value="moduli">moduli</option></select>
            <button type="submit" className="btn s p" disabled={!ob.v}>Proponi</button>
          </span>
          <span className="muted">36 moduli finché si può, poi una taglia per il resto.</span>
        </form>
        {prop && <p className="hint" style={{ margin: '8px 0 12px' }}>{prop}</p>}
        <div className="wrap" style={{ marginTop: 12 }}><table className="rows"><tbody>
          <tr><th>#</th><th>Taglia</th><th className="n">N. strutture</th><th className="n">Controventi</th><th className="n">Arcareccio unico</th>
            <th className="n">Colonne</th><th className="n">Campate</th><th className="n">Telai</th><th className="n">Lunghezza</th>
            <th className="n">kWp / str.</th><th className="n">Massa / str.</th><th></th></tr>
          {F.taglie.map((x: any, j: number) => {
            const q = r?.taglie[j], p = `prev.fisso.taglie.${j}.`;
            return (
              <tr key={j} className={`click${j === i ? ' sel' : ''}`} onClick={e => { if (!(e.target as Element).closest('input,select,button')) vedi(j); }}>
                <td><span className="rid">T{j + 1}</span></td>
                <td style={{ minWidth: 112 }}>
                  <select value={x.moduli} onChange={e => { x.moduli = +e.target.value; done(); }}>
                    {TAGLIE.map(m => <option key={m} value={m} disabled={m !== num(x.moduli) && !libere.includes(m)}>{m} moduli</option>)}
                  </select>
                </td>
                <td className="in"><Inp path={p + 'n_strutture'} /></td>
                <td className="in"><Inp path={p + 'controventi'} type="optnum" ph="proposta" /></td>
                <td className="in">{num(x.moduli) === 4 ? <Inp path={p + 'lunghezza_arc_unico'} type="optnum" ph="2731" /> : <span className="muted">—</span>}</td>
                <td className="n calc">{q ? q.colonne : '–'}</td>
                <td className="n calc">{q ? q.campate : '–'}</td>
                <td className="n calc">{q ? q.telai : '–'}</td>
                <td className="n calc">{q ? `${fN(q.lunghezza / 1000, 2)} m` : '–'}</td>
                <td className="n calc">{q ? fN(q.potenza, 2) : '–'}</td>
                <td className="n calc">{q ? `${n0(q.massa_struttura)} kg` : '–'}</td>
                <td><button className="btn x" title="Togli taglia" disabled={F.taglie.length === 1} onClick={() => togli(j)}>✕</button></td>
              </tr>
            );
          })}
          <tr className="tot">
            <td colSpan={2}>TOTALE</td><td className="n">{r ? r.totali.strutture : ''}</td>
            <td colSpan={6} /><td className="n">{r ? `${fN(r.totali.potenza, 2)} kWp` : ''}</td><td className="n">{r ? `${n0(r.totali.massa)} kg` : ''}</td><td />
          </tr>
        </tbody></table></div>
        <p className="hint" style={{ margin: '10px 0 0' }}>Clic su una riga per vederla nell'anteprima · Controventi vuoto = 6 sulla 36, proposta sulle altre · Arcareccio unico solo sulla taglia 4.</p>
      </>}</Fold>

      <Fold id="cf-ant" step={6} title={`Anteprima taglia ${F.taglie[i]?.moduli ?? ''}`}
        sum={rt ? `${rt.campate} campate · ${rt.telai} telai · ${fN(rt.lunghezza / 1000, 2)} m · ${n0(rt.massa_struttura)} kg / struttura` : '…'}
        act={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {F.taglie.length > 1 && <span className="seg">{F.taglie.map((x: any, j: number) => <button key={j} className={j === i ? 'on' : ''} onClick={() => vedi(j)}>{x.moduli}</button>)}</span>}
          <button className="btn s" disabled={!r || !!busy} onClick={() => scaricaDxf(P, [i], setBusy)} title="Le 17 tavole DE VITA adattate a questa taglia, in un file ZIP">{busy === String(i) ? 'Preparo le tavole…' : `DXF taglia ${F.taglie[i]?.moduli ?? ''}`}</button>
        </span>}>{() => rt ? <>
        <div className="meta" style={{ marginTop: 0 }}>
          <div>Colonne<b>{rt.colonne}</b></div>
          <div>Campate<b>{rt.campate}</b></div>
          <div>Telai<b>{rt.telai}</b></div>
          <div>Lunghezza<b>{fN(rt.lunghezza / 1000, 2)} m</b></div>
          <div>Potenza per struttura<b>{fN(rt.potenza, 2)} kWp</b></div>
          <div>Massa struttura<b>{n0(rt.massa_struttura)} kg</b></div>
        </div>
        {rt.avvisi.length > 0 && <div className="warn">{rt.avvisi.map(a => <div key={a}>{a}</div>)}</div>}
        <div className="disegni"><Pianta r={rt} /><Sezione r={rt} /></div>
      </> : <div className="empty">{errore || 'Calcolo in corso…'}</div>}</Fold>
    </>
  );
}

/* ---------- Listino dei fissi (scheda Listino) ---------- */
// Nei dati condivisi (data.fisso, su Supabase con il resto del listino): un prezzo per componente e i parametri della zincatura.
const SEZIONI: [string, string[]][] = [
  ['Componenti strutturali', Object.keys(PREZZI_FISSO0).filter(k => PREZZI_FISSO0[k].um === 'kg')],
  ['Bulloneria e alluminio', Object.keys(PREZZI_FISSO0).filter(k => PREZZI_FISSO0[k].um === 'pz')],
];
export function ListinoFisso() {
  const L = normListinoFisso(S.data), pr = L.prezzi;
  const ripristina = () => { if (!confirm('Ripristinare i prezzi degli impianti fissi ai valori della Distinta DE VITA?')) return; delete S.data.fisso; normListinoFisso(S.data); done(); };
  return (
    <Fold id="li-fisso" cls="cat" title="Impianti fissi" sum={`${Object.keys(pr).length} voci · zincatura ${fN(L.par.costoZinc, 2)} €/kg, peso +${fN(L.par.aumZinc * 100, 1)} %`}
      act={<button className="btn s" onClick={ripristina}>Prezzi DE VITA</button>}>{() => <>
      <div className="toolbar">
        <label className="f">Maggiorazione peso zincatura (%)<Inp path="data.fisso.par.aumZinc" type="pct" /></label>
        <label className="f">Costo zincatura (€/kg)<Inp path="data.fisso.par.costoZinc" /></label>
      </div>
      <p className="hint">Acquisto a peso (€/kg) per i profili, a pezzo (€/pz) per bulloneria e alluminio. Lavorazione in % sul costo d'acquisto; zincatura sul peso aumentato della maggiorazione; altre lavorazioni in €/kg.</p>
      {SEZIONI.map(([tit, kk]) => (
        <div key={tit} className="wrap"><table className="rows"><tbody>
          <tr><th>{tit}</th><th className="n">Costo acquisto</th><th className="n">Lavorazione %</th><th>Zincatura</th><th className="n">Altre lav. €/kg</th></tr>
          {kk.map(k => { const p = `data.fisso.prezzi.${k}.`; return (
            <tr key={k}>
              <td>{NOMI_FISSO[k] || k}</td>
              <td className="in"><span className="um"><Inp path={p + 'costo'} /><em>€/{pr[k].um}</em></span></td>
              <td className="in"><Inp path={p + 'lav'} type="pct" /></td>
              <td><input type="checkbox" checked={!!pr[k].zinc} onChange={e => { pr[k].zinc = e.target.checked; done(); }} aria-label={`Zincatura ${NOMI_FISSO[k] || k}`} /></td>
              <td className="in">{pr[k].um === 'kg' ? <Inp path={p + 'altre'} /> : <span className="muted">–</span>}</td>
            </tr>); })}
        </tbody></table></div>
      ))}
    </>}</Fold>
  );
}
/* ---------- Distinta base ---------- */
const GRUPPI: Record<Riga['gruppo'], string> = { strutturali: 'Componenti strutturali', bulloneria: 'Bulloneria', alluminio: 'Alluminio' };
// La bulloneria per struttura e' una media (si arrotonda sul totale della taglia).
const qta = (x: number) => fN(x, Number.isInteger(x) ? 0 : 2);

function Distinta({ righe }: { righe: Riga[] }) {
  return (
    <div className="wrap"><table className="dl">
      <thead><tr><th>Descrizione</th><th className="n">L (mm)</th><th className="n">Q.tà / str.</th><th className="n">Q.tà totale</th><th className="n">Massa / str. (kg)</th></tr></thead>
      {(Object.keys(GRUPPI) as Riga['gruppo'][]).map(g => (
        <tbody key={g}>
          <tr className="g2"><td colSpan={5}>{GRUPPI[g]}</td></tr>
          {righe.filter(x => x.gruppo === g && x.quantita).map(x => (
            <tr key={x.codice}>
              <td>{x.descrizione}</td>
              <td className="n">{x.lunghezza ? n0(x.lunghezza) : <span className="muted">–</span>}</td>
              <td className="n">{qta(x.quantita)}</td>
              <td className="n"><b>{n0(x.totale)}</b></td>
              <td className="n">{fN(x.massa, 1)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table></div>
  );
}

export function DistintaFisso() {
  const P = S.prev, { r, errore } = calcolaFisso(P), [busy, setBusy] = useState('');
  if (!r) return <div className="warn">{errore}</div>;
  const troppe = r.taglie.length > MAX_TAGLIE_DXF;
  return (
    <>
      <div className="tabtools noprint">
        <button className="btn s p" disabled={!!busy || troppe} onClick={() => scaricaDxf(P, r.taglie.map((_, j) => j), setBusy)}
          title={troppe ? `Più di ${MAX_TAGLIE_DXF} taglie: scarica i DXF una alla volta dall'anteprima in Configura` : 'Un DXF per taglia, in un file ZIP'}>
          {busy === 'tutti' ? `Preparo ${r.taglie.length} DXF…` : 'Scarica tutti i DXF'}</button>
      </div>
      <TabTools />
      {r.taglie.map((q, j) => (
        <Fold key={q.input.moduli} id={`di-${q.input.moduli}`} step={j + 1} title={`Taglia ${q.input.moduli} moduli × ${q.input.n_strutture}`}
          sum={`${q.campate} campate · ${q.telai} telai · ${n0(q.massa_struttura)} kg / struttura · ${n0(q.massa_totale)} kg in tutto`}>{() => <>
          {q.avvisi.length > 0 && <div className="warn">{q.avvisi.map(a => <div key={a}>{a}</div>)}</div>}
          <Distinta righe={q.righe} />
        </>}</Fold>
      ))}
    </>
  );
}
