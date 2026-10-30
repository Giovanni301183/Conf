// Mappa dei reparti nella Home, sotto il calendario: «Terranova» al centro e i reparti intorno (sul telefono una griglia di riquadri).
// Ogni reparto lampeggia come gli Allarmi: rosso con urgenze o voci scadute, arancio con scadenze nei prossimi giorni; il pallino blu
// conta le note nuove dall'ultima volta che lo si è aperto (ricordato in questo browser). Clic su un reparto = S.ui.rep: allarmi,
// appuntamenti, note e colonna del giorno mostrano solo le sue cose. Le voci arrivano dalla Home (vv), con le stesse regole del calendario.
// Intorno a ogni cerchio, verso il centro, le iniziali delle persone: piene chi è nel reparto (pagina Utenti), vuote chi è coinvolto
// (deve fare, ha creato o è coinvolto in una sua voce aperta, o ha scritto una sua nota nell'ultimo mese). Per non affollare la mappa:
// di base solo chi è nel reparto (al massimo 4); il reparto aperto mostra tutti; la scelta «Persone» vale per questo browser.
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { allarmi, type Voce } from '../domain/calendario';
import { dToday } from '../domain/plan';
import { REPARTI, SETTORI_MAPPA, SMISTARE, nomeReparto, nomeSettoreMappa, repartiNota, repartiVoce, settoriDi } from '../domain/reparti';
import { S, commit } from '../store/state';
import { cloud, mioEmail, repartiDi, settorePrev } from '../store/remote';
import { Ic, IcReparto, IcSettore } from './Icona';
import { ChevBarra, barraAperta, clicBarra } from './ui';

const KEY_VISTO = 'tracker_prev_reparti_visto_v1', KEY_MAPPA = 'tracker_prev_mappa_v1';
const leggi = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const scrivi = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* solo una comodità */ } };
const TRE_GIORNI = () => new Date(Date.now() - 3 * 864e5).toISOString();

interface Stato { k: string; late: number; soon: number; nuove: number; note: number }
type Persona = { email: string; nome: string; nel: boolean; perche: string };
const MAX_P = 4, MAX_SEL = 7;   // iniziali intorno a un cerchio (reparto aperto: di più); le altre diventano «+N»
type Pers = 'reparto' | 'tutte' | 'no';
const iniziali = (n: string) => { const pp = n.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/); return ((pp[0]?.[0] || '') + (pp.length > 1 ? pp.at(-1)![0] : pp[0]?.[1] || '')).toUpperCase(); };

/** Larghezza da telefono (come il @media dei riquadri): la scheda del settore va sotto i pulsanti invece che sotto la mappa. */
function useStretto() {
  const q = '(max-width:640px)', c = typeof matchMedia === 'function', [s, setS] = useState(() => c && matchMedia(q).matches);
  useEffect(() => { if (!c) return; const m = matchMedia(q), f = () => setS(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return s;
}

/** onNuovo: il «+» su un reparto, per aggiungerci una voce d'agenda o una nota (la finestra la apre la Home).
 *  scheda: la scheda da compilare che si apre lì, sotto la mappa, cliccando un settore del reparto aperto (la disegna la Home). */
export function MappaReparti({ vv, onNuovo, scheda }: { vv: Voce[]; onNuovo?: (k: string) => void; scheda?: (k: string, st: string, chiudi: () => void) => ReactNode }) {
  const [aperta, setAperta] = useState(false), stretto = useStretto();
  const [visto, setVisto] = useState<Record<string, string>>(() => leggi(KEY_VISTO) || {});
  const [pref, setPref] = useState<{ miei?: boolean; persone?: Pers }>(() => leggi(KEY_MAPPA) || {});
  const quali = pref.persone || 'reparto';
  const salvaPref = (p: typeof pref) => { setPref(p); scrivi(KEY_MAPPA, p); };
  const me = mioEmail(), miei = cloud.me?.reparti || [], oggi = dToday();

  // Per ogni reparto: voci in allarme (dalle stesse voci del calendario) e note nuove dall'ultima apertura.
  const note = S.docs.filter(d => d.tipo === 'nota');
  const stato = (k: string): Stato => {
    const a = allarmi(vv.filter(v => repartiVoce(v, repartiDi).includes(k)), oggi), nn = note.filter(d => repartiNota(d).includes(k));
    const da = visto[k] || TRE_GIORNI();
    return { k, late: a.urgenze.length + a.scadute.length, soon: a.prossime.length, nuove: nn.filter(d => d.creato > da && d.creato_da !== me).length, note: nn.length };
  };
  const tutti = [...REPARTI.map(r => stato(r.k)), stato(SMISTARE)];
  // Persone del reparto: prima chi ne fa parte, poi chi è coinvolto (più voci e note prima).
  const colleghi = cloud.colleghi.length ? cloud.colleghi : cloud.me ? [cloud.me] : [];
  const nomeDi = (e: string) => colleghi.find(c => c.email === e)?.nome || e.split('@')[0];
  const unMese = new Date(Date.now() - 30 * 864e5).toISOString();
  const persone = (k: string): Persona[] => {
    if (k === SMISTARE) return [];
    const conta = new Map<string, number>(), add = (e?: string | null) => { if (e && colleghi.some(c => c.email === e)) conta.set(e, (conta.get(e) || 0) + 1); };
    for (const v of vv) if (v.s && !v.s.fatto && repartiVoce(v, repartiDi).includes(k)) { add(v.s.assegnata_a); add(v.s.creato_da); (v.s.coinvolti || []).forEach(add); }
    for (const d of note) if (d.creato > unMese && repartiNota(d).includes(k)) add(d.creato_da);
    const nel = colleghi.filter(c => (c.reparti || []).includes(k)).map(c => ({ email: c.email, nome: c.nome || c.email.split('@')[0], nel: true,
      perche: `nel reparto${conta.get(c.email) ? ` · ${conta.get(c.email)} tra voci e note` : ''}` }));
    const altri = [...conta].filter(([e]) => !nel.some(p => p.email === e)).sort((a, b) => b[1] - a[1])
      .map(([e, n]) => ({ email: e, nome: nomeDi(e), nel: false, perche: `coinvolto · ${n} tra voci e note` }));
    return [...nel, ...altri];
  };
  /** Persone da mostrare: nessuna, solo chi è nel reparto, o tutte (il reparto aperto le mostra sempre tutte). */
  const daMostrare = (k: string) => (quali === 'no' ? [] : sel === k || quali === 'tutte' ? persone(k) : persone(k).filter(p => p.nel));
  const sel = S.ui.rep;
  // Scegliendo un reparto (o un suo settore) si aprono da sole le barre sotto (allarmi, appuntamenti, note) con le sue cose.
  // Solo scegliendo il settore, se sono fuori schermo, la pagina ci scende: col reparto resta sulla mappa, dove compaiono i settori.
  const apriSotto = (scendi: boolean) => {
    for (const b of ['allarmi', 'appuntamenti', 'note']) S.ui.hb[b] = true;
    if (scendi) requestAnimationFrame(() => {
      const el = document.querySelector('.calsotto') || document.querySelector('.mrep')?.nextElementSibling;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const scegli = (k: string) => {
    S.ui.rep = sel === k ? '' : k; S.ui.repSet = ''; setAperta(false);
    if (S.ui.rep) { const v = { ...visto, [k]: new Date().toISOString() }; setVisto(v); scrivi(KEY_VISTO, v); apriSotto(false); }
    commit();
  };
  // Settori del reparto aperto (pallini intorno): voci da guardare e note di quel reparto e di quel settore. Clic = filtro anche per settore.
  const settori = sel && sel !== SMISTARE ? SETTORI_MAPPA.map(t => {
    const a = allarmi(vv.filter(v => repartiVoce(v, repartiDi).includes(sel) && settoriDi(v.s?.settori, v.prevId, settorePrev).includes(t.k)), oggi);
    const nn = note.filter(d => repartiNota(d).includes(sel) && settoriDi(d.settori, d.preventivo_id, settorePrev).includes(t.k)).length;
    return { ...t, late: a.urgenze.length + a.scadute.length, soon: a.prossime.length, note: nn };
  }) : [];
  const selSet = S.ui.repSet;
  // Clic su un settore: filtro reparto + settore e, se la Home la dà, la scheda da compilare lì sotto (la pagina non scende).
  // Di nuovo sullo stesso settore: torna a tutto il reparto e chiude la scheda.
  const scegliSet = (k: string) => {
    S.ui.repSet = selSet === k ? '' : k; setAperta(!!S.ui.repSet && !!scheda); apriSotto(!!S.ui.repSet && !scheda); commit();
  };
  const qui = aperta && scheda && sel && selSet ? <div className="mscheda" key={sel + selSet}>{scheda(sel, selSet, () => setAperta(false))}</div> : null;
  const titoloSet = (t: (typeof settori)[number]) => `${nomeReparto(sel)} · ${t.nome}: ${t.late} urgenti o scadute, ${t.soon} in scadenza, ${t.note} note`;
  const classeSet = (t: (typeof settori)[number]) => `${t.late ? ' late' : t.soon ? ' soon' : ''}${selSet === t.k ? ' on' : ''}`;
  const dim = (k: string) => !!pref.miei && miei.length > 0 && k !== SMISTARE && !miei.includes(k);
  const classe = (s: Stato) => (s.late ? ' late' : s.soon ? ' soon' : '');
  const quanti = (s: Stato) => s.late + s.soon + (s.k === SMISTARE ? s.note : 0);
  const titolo = (s: Stato) => `${nomeReparto(s.k)}: ${s.late} urgenti o scadute, ${s.soon} in scadenza, ${s.note} note${s.nuove ? `, ${s.nuove} nuove` : ''}`;

  if (!barraAperta('mappa')) return (
    <div className="card mrep chiusa"><h2 className="hbh" onClick={clicBarra('mappa')}>Reparti{sel && <span className="tag on">{nomeReparto(sel)}{selSet && ` · ${nomeSettoreMappa(selSet)}`}</span>}
      {tutti.some(s => s.late) && <span className="tag alate"><Ic n="attenzione" s={12} />{tutti.filter(s => s.late).length} reparti con urgenze</span>}
      <span className="sp" />{sel && <button className="btn s" onClick={() => scegli(sel)}>Tutti i reparti</button>}
      <ChevBarra k="mappa" /></h2></div>
  );

  // Mappa: i reparti su un'ellisse intorno al centro, «Da smistare» in basso a destra.
  // Centro piccolo e reparti distanziati; margine intorno all'ellisse per i rami dei settori, che escono verso l'esterno del reparto aperto.
  // Misure scelte perché, con qualunque reparto aperto, pallini e nomi dei settori non tocchino reparti, nomi, centro e bordo.
  const W = 1188, H = 886, cx = W / 2, cy = H / 2, rx = 340, ry = 250, HUB = 46;
  const pos = REPARTI.map((r, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / REPARTI.length; return { k: r.k, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });
  const tasto = (k: string) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(k); } };
  const Nodo = ({ s, x, y, piccolo = false }: { s: Stato; x: number; y: number; piccolo?: boolean }) => {
    const r = piccolo ? 28 : 30 + Math.min(quanti(s), 5) * 3, sotto = y > cy + 20;
    // Iniziali su un arco intorno al cerchio, dal lato del centro (lì c'è spazio): la direzione è quella verso «Terranova».
    const pp = daMostrare(s.k), max = sel === s.k ? MAX_SEL : MAX_P, vis = pp.slice(0, pp.length > max ? max - 1 : max), resto = pp.length - vis.length;
    const R = r + 19, dir = Math.atan2(cy - y, cx - x), passo = 23 / R, n = vis.length + (resto ? 1 : 0);
    const punto = (i: number) => { const a = dir + (i - (n - 1) / 2) * passo; return { px: R * Math.cos(a), py: R * Math.sin(a) }; };
    return (
      <g className={`mnodo${classe(s)}${sel === s.k ? ' sel' : ''}${dim(s.k) ? ' dim' : ''}${piccolo ? ' smi' : ''}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
        tabIndex={0} role="button" aria-pressed={sel === s.k} aria-label={titolo(s)} onClick={() => scegli(s.k)} onKeyDown={tasto(s.k)}>
        <title>{titolo(s)}</title>
        <circle className="anello" r={r + 7} /><circle className="disco" r={r} />
        <IcReparto k={s.k} s={18} x={-9} y={piccolo ? -17 : -21} />
        <text className={`num${quanti(s) ? '' : ' zero'}`} textAnchor="middle" y={piccolo ? 17 : 19}>{quanti(s)}</text>
        {s.nuove > 0 && <g className="nuove"><circle cx={r * 0.72} cy={-r * 0.72} r={11} /><text x={r * 0.72} y={-r * 0.72 + 4} textAnchor="middle">{s.nuove}</text></g>}
        <text className="nome" textAnchor="middle" y={piccolo ? -r - 8 : sotto ? r + 20 : -r - 10}>{nomeReparto(s.k)}</text>
        {onNuovo && <g className="mpiu" transform={`translate(${(r * 0.72).toFixed(1)} ${(r * 0.72).toFixed(1)})`} role="button" tabIndex={0} aria-label={`Aggiungi in ${nomeReparto(s.k)}`}
          onClick={e => { e.stopPropagation(); onNuovo(s.k); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onNuovo(s.k); } }}>
          <title>{`Aggiungi in ${nomeReparto(s.k)}: nota, promemoria, urgenza o appuntamento`}</title><circle r={11} /><path d="M-5 0H5M0 -5V5" /></g>}
        {vis.map((p, i) => { const { px, py } = punto(i); return (
          <g key={p.email} className={`mpers${p.nel ? ' nel' : ''}`} transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}>
            <title>{`${p.nome} · ${p.perche}`}</title><circle r={10.5} /><text textAnchor="middle" y={3.5}>{iniziali(p.nome)}</text></g>); })}
        {resto > 0 && (() => { const { px, py } = punto(vis.length); return (
          <g className="mpers piu" transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}>
            <title>{pp.slice(vis.length).map(p => `${p.nome} · ${p.perche}`).join('\n')}</title><circle r={10.5} /><text textAnchor="middle" y={3.5}>+{resto}</text></g>); })()}
      </g>
    );
  };

  // Nome del settore sul lato esterno del pallino: a destra o a sinistra sui reparti di lato; in alto e in basso, sopra e sotto
  // alternati (il primo, il terzo e il quinto verso il reparto), perché i nomi vicini non si tocchino.
  const posNome = (c: number, sn: number, i: number) => c > 0.5 ? { x: 23, y: 4, textAnchor: 'start' as const } : c < -0.5 ? { x: -23, y: 4, textAnchor: 'end' as const }
    : { x: 0, y: (sn > 0) !== (i % 2 === 0) ? 33 : -25, textAnchor: 'middle' as const };
  // Pallini dei settori intorno al reparto aperto, verso l'esterno (dal centro in fuori), oltre il nome del reparto, collegati al cerchio.
  const Settori = () => {
    const p = pos.find(q => q.k === sel), s = tutti.find(x => x.k === sel);
    if (!p || !s || !settori.length) return null;
    const r = 30 + Math.min(quanti(s), 5) * 3, R = r + 100, dir = Math.atan2(p.y - cy, p.x - cx), passo = 62 / R;
    return (
      <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
        {settori.map((t, i) => { const a = dir + (i - (settori.length - 1) / 2) * passo, c = Math.cos(a), sn = Math.sin(a), n = t.late + t.soon; return (
          <g key={t.k}>
            <line className="msetl" x1={((r + 26) * c).toFixed(1)} y1={((r + 26) * sn).toFixed(1)} x2={((R - 16) * c).toFixed(1)} y2={((R - 16) * sn).toFixed(1)} />
            <g className={`mset${classeSet(t)}`} style={{ '--ec': t.colore } as CSSProperties} transform={`translate(${(R * c).toFixed(1)} ${(R * sn).toFixed(1)})`}
              role="button" tabIndex={0} aria-pressed={selSet === t.k} aria-label={titoloSet(t)} onClick={() => scegliSet(t.k)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegliSet(t.k); } }}>
              <title>{titoloSet(t)}</title>
              <circle className="anello" r={20} /><circle className="disco" r={15} /><IcSettore k={t.k} s={15} x={-7.5} y={-7.5} />
              {n > 0 && <g className="snum"><circle cx={12} cy={-12} r={8} /><text x={12} y={-8.5} textAnchor="middle">{n}</text></g>}
              <text className="snome" {...posNome(c, sn, i)}>{t.k === 'speciali' ? 'Speciali' : t.nome}</text>
            </g>
          </g>); })}
      </g>
    );
  };

  return (
    <div className="card mrep">
      <h2 className="hbh" onClick={clicBarra('mappa')}>Reparti
        {sel && <span className="tag on"><IcReparto k={sel} s={12} />{nomeReparto(sel)}{selSet && ` · ${nomeSettoreMappa(selSet)}`}</span>}
        <span className="sp" />
        {miei.length > 0 && <span className="seg"><button className={pref.miei ? '' : 'on'} onClick={() => salvaPref({ ...pref, miei: false })}>Tutti</button>
          <button className={pref.miei ? 'on' : ''} onClick={() => salvaPref({ ...pref, miei: true })} title={'I tuoi reparti: ' + miei.map(nomeReparto).join(', ')}>I miei reparti</button></span>}
        <select className="mpsel" value={quali} onChange={e => salvaPref({ ...pref, persone: e.target.value as Pers })} title="Quali persone mostrare intorno ai reparti (il reparto aperto le mostra tutte)">
          <option value="reparto">Persone: solo chi è nel reparto</option><option value="tutte">Persone: anche i coinvolti</option><option value="no">Persone: nessuna</option></select>
        {sel && <button className="btn s" onClick={() => scegli(sel)}>Tutti i reparti</button>}
        <ChevBarra k="mappa" />
      </h2>
      <div className="mleg"><span><i className="late" />urgenze o scadute</span><span><i className="soon" />in scadenza</span><span><i className="new" />note nuove</span>
        <span><i className="pnel" />nel reparto</span><span><i className="pcoi" />coinvolto</span>
        <span className="muted">· il numero conta le voci da guardare · clic su un reparto per vedere solo le sue cose, poi su un settore per restringere</span></div>
      {settori.length > 0 && <p className="hint msethint"><IcReparto k={sel} s={13} /> Intorno a <b>{nomeReparto(sel)}</b> ci sono i settori: {settori.map(t => t.nome).join(', ')}. Cliccane uno per vedere solo le sue cose{scheda ? ' e aggiungere subito una voce o una nota' : ''}{selSet ? '; di nuovo per tornare a tutto il reparto' : ''}.</p>}
      <div className="msvg">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Mappa dei reparti">
          {pos.map(p => <line key={p.k} className={`mlink${sel === p.k ? ' on' : ''}`} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} />)}
          <g className={`mhub${sel ? '' : ' on'}`} role="button" tabIndex={0} aria-label="Tutti i reparti" onClick={() => { S.ui.rep = ''; commit(); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.ui.rep = ''; commit(); } }}>
            <circle cx={cx} cy={cy} r={HUB} /><text x={cx} y={cy + 2} textAnchor="middle">TERRANOVA</text><rect x={cx - 20} y={cy + 11} width={40} height={4} rx={2} />
          </g>
          {pos.map(p => <Nodo key={p.k} s={tutti.find(s => s.k === p.k)!} x={p.x} y={p.y} />)}
          <Nodo s={tutti.at(-1)!} x={W - 64} y={H - 40} piccolo />
          <Settori />
        </svg>
      </div>
      {!stretto && qui}
      <div className="mtiles">
        {tutti.map(s => (<Fragment key={s.k}><div className="mtw">
          <button className={`mtile${classe(s)}${sel === s.k ? ' sel' : ''}${dim(s.k) ? ' dim' : ''}`} onClick={() => scegli(s.k)} aria-pressed={sel === s.k} title={titolo(s)}>
            <b><IcReparto k={s.k} />{nomeReparto(s.k)}</b>
            {daMostrare(s.k).length > 0 && <small className="mnomi">{daMostrare(s.k).map(p => (p.nel ? p.nome.split(' ')[0] : `(${p.nome.split(' ')[0]})`)).join(', ')}</small>}
            <span className="mcnt">{s.late > 0 && <span className="tag alate">{s.late} scadute</span>}{s.soon > 0 && <span className="tag asoon">{s.soon} in arrivo</span>}
              {s.nuove > 0 && <span className="tag anew">{s.nuove} nuove</span>}{!s.late && !s.soon && !s.nuove && <span className="tag">{s.note} note</span>}</span>
          </button>
          {onNuovo && <button className="mtpiu" onClick={() => onNuovo(s.k)} title={`Aggiungi in ${nomeReparto(s.k)}`} aria-label={`Aggiungi in ${nomeReparto(s.k)}`}>+</button>}
        </div>
        {sel === s.k && settori.length > 0 && <div className="msetrow">{settori.map(t => (
          <button key={t.k} className={`msetb${classeSet(t)}`} style={{ '--ec': t.colore } as CSSProperties} onClick={() => scegliSet(t.k)} aria-pressed={selSet === t.k} title={titoloSet(t)}>
            <IcSettore k={t.k} />{t.nome}{t.late + t.soon > 0 && <span className="snum">{t.late + t.soon}</span>}</button>))}</div>}
        {sel === s.k && stretto && qui}
        </Fragment>))}
      </div>
    </div>
  );
}

/** Pallini dei settori da accendere e spegnere (modulo della voce e della nota). */
export function SceltaSettori({ val, set }: { val: string[]; set: (v: string[]) => void }) {
  return <div className="etqs">{SETTORI_MAPPA.map(s => { const on = val.includes(s.k); return (
    <button key={s.k} type="button" className={`etq${on ? ' on' : ''}`} style={{ '--ec': s.colore } as CSSProperties}
      onClick={() => set(on ? val.filter(x => x !== s.k) : [...val, s.k])}><IcSettore k={s.k} />{s.nome}</button>); })}</div>;
}
