import { useEffect, useState } from 'react';
import { useToastState } from './components/ui';
import { eur, fN } from './domain/format';
import { R, S, TABS, commit, useStore, type Tab } from './store/state';
import { allineaSettore, archSave, isBlank, isDirty, newPreventivo, onFilePicked, printCosti, setFileInput, setToast } from './store/actions';
import { Home, Preventivi } from './pages/Preventivi';
import { Listino } from './pages/Listino';
import { Distinte } from './pages/Distinte';
import { Configura } from './pages/Configura';
import { Costi } from './pages/Costi';
import { Extra } from './pages/Extra';
import { Margini } from './pages/Margini';
import { Invia } from './pages/Invia';
import { Lavorazione } from './pages/Lavorazione';
import { Montaggio } from './pages/Montaggio';
import { Documenti } from './pages/Documenti';
import { Accesso } from './pages/Accesso';
import { Utenti } from './pages/Utenti';
import { Presenza } from './components/Presenza';
import { Assistente } from './components/Assistente';
import { Telegram } from './components/Telegram';
import { ArchivioAttivita, nScadute } from './pages/Calendario';
import { AltroSettore, InSviluppo } from './pages/InSviluppo';
import { ConfiguraFisso, DistintaFisso } from './pages/Fisso';
import { AREE, PASSI as PASSI0, SETTORI, infoSettore, schedaPronta, settoreDi, type Settore } from './domain/settori';
import { cloud, isAdmin, logout, setCloudToast } from './store/remote';
import { AvvisiRiunioni } from './components/AvvisiRiunioni';

const VIEWS: Record<Tab, () => React.ReactNode> = {
  archivio: Home, prev: Preventivi, fatte: ArchivioAttivita, listino: Listino, distinte: Distinte, config: Configura, costi: Costi,
  extra: Extra, margini: Margini, invia: Invia, docs: Documenti, lavor: Lavorazione, mont: Montaggio, utenti: Utenti,
};
// Schede proprie degli impianti fissi; le altre sono comuni a tutti i settori.
const VIEWS_FISSO: Partial<Record<Tab, () => React.ReactNode>> = { config: ConfiguraFisso, distinte: DistintaFisso };
const goTab = (t: Tab, set?: Settore) => { S.ui.tab = t; if (set) { S.ui.set = set; allineaSettore(); } window.scrollTo(0, 0); commit(); };
const save = () => { (document.activeElement as HTMLElement | null)?.blur?.(); archSave(false); commit(); };

// Barra laterale: Home e archivio, poi i settori (ognuno con la sua cascata di schede, aperto uno alla volta), poi i dati comuni.
// Le macro aree partono chiuse; aprendone una si chiude l'altra. Energia ha due settori, le altre aree uno solo (le schede stanno sotto l'area).
const PASSI = PASSI0 as readonly Tab[];
const CHEV = 'M9 6l6 6-6 6';
const apriArea = (g: string, ss: typeof SETTORI) => {
  S.ui.area = S.ui.area === g ? '' : g;
  if (ss.length === 1) { S.ui.set = ss[0].k; S.ui.sopen = true; }
  commit();
};
const apriSet = (k: Settore) => { S.ui.sopen = !(S.ui.set === k && S.ui.sopen); S.ui.set = k; commit(); };
const ICON: Record<Tab, string> = {
  archivio: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  prev: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5',
  fatte: 'M3 4h18v4H3zM5 8v12h14V8M9 14l2 2 4-4',
  config: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  costi: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  extra: 'M12 5v14M5 12h14',
  margini: 'M19 5L5 19M7 9a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  invia: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  docs: 'M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9',
  lavor: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  mont: 'M3 20h18M5 20V10l7-6 7 6v10M9 20v-6h6v6',
  listino: 'M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0',
  distinte: 'M4 4h16v16H4zM4 10h16M10 10v10',
  utenti: 'M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM22 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8',
};
// Barra stretta (solo icone), ricordata in questo browser. Del gruppo dei settori resta il settore in uso con le sue schede.
const miniTog = () => { S.ui.mini = !S.ui.mini; commit(); };
const cambiaSettore = () => { S.ui.mini = false; S.ui.area = infoSettore(S.ui.set).gruppo; commit(); };
const Ico = ({ d }: { d: string }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const LABEL = Object.fromEntries(TABS) as Record<Tab, string>;

function Kpi({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className={`kpi ${cls}`}><small>{label}</small><b>{value}</b></div>;
}

export default function App() {
  useStore();
  const { toast, node } = useToastState();
  const [menu, setMenu] = useState(false);   // menu laterale a scomparsa (schermi stretti)
  useEffect(() => { setToast(toast); setCloudToast(toast); });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (cloud.fase !== 'locale' && cloud.fase !== 'pronto') return <><Accesso />{node}</>;
  // Le schede di un settore non ancora pronto mostrano la pagina «in sviluppo».
  // Con aperto un preventivo di un altro settore, le schede del settore chiedono se tornare al suo o iniziarne uno nuovo.
  const set = infoSettore(S.ui.set), passo = PASSI.includes(S.ui.tab), pronta = schedaPronta(set, S.ui.tab), altro = passo && pronta && settoreDi(S.prev) !== set.k;
  const View = passo && !pronta ? InSviluppo : altro ? AltroSettore : (set.k === 'fisso' && VIEWS_FISSO[S.ui.tab]) || VIEWS[S.ui.tab];
  // In Home, nell'archivio e nei settori in sviluppo la barra in alto non mostra preventivo e valori: resta solo il pulsante del menu sugli schermi stretti.
  const home = S.ui.tab === 'archivio' || S.ui.tab === 'prev' || (passo && !pronta);
  const mini = S.ui.mini && !menu;   // sul telefono il menu a scomparsa è sempre intero
  const dirty = isDirty(), nSc = cloud.fase === 'pronto' || cloud.fase === 'locale' ? nScadute() : 0;
  return (
    <div className={`app${mini ? ' mini' : ''}`}>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <aside className={`side ${menu ? 'open' : ''}${mini ? ' mini' : ''}`}>
        <div className="brand">{!mini && <img src="/logo-terranova.png" alt="Terranova" />}
          <button className="sidetog noprint" onClick={miniTog} title={mini ? 'Allarga il menu' : 'Stringi il menu (solo icone), per avere più spazio'} aria-label={mini ? 'Allarga il menu' : 'Stringi il menu'}>
            <Ico d={mini ? 'M13 6l6 6-6 6M5 6l6 6-6 6' : 'M11 6l-6 6 6 6M19 6l-6 6 6 6'} /></button></div>
        <nav>
          <div className="ng">
            {(['archivio', 'prev', 'fatte'] as Tab[]).map(k => <button key={k} className={S.ui.tab === k ? 'on' : ''} title={LABEL[k]} onClick={() => { setMenu(false); goTab(k); }}><Ico d={ICON[k]} /><span>{LABEL[k]}</span>
              {k === 'archivio' && nSc > 0 && <em className="nbadge" title={`${nSc} voci in agenda scadute`}>{nSc}</em>}</button>)}
          </div>
          {mini ? <div className="ng">
            <button className="nsig" onClick={cambiaSettore} title={`${set.nome}: clic per cambiare settore`}>{set.nome.slice(0, 2).toUpperCase()}</button>
            {PASSI.map(k => <button key={k} className={S.ui.tab === k ? 'on' : ''} title={`${set.nome} · ${LABEL[k]}`} onClick={() => goTab(k, set.k)}><Ico d={ICON[k]} /><span>{LABEL[k]}</span></button>)}
          </div> : <div className="ng">
            <div className="ngt">Settori</div>
            {AREE.map(g => {
              const ss = SETTORI.filter(s => s.gruppo === g), aperta = S.ui.area === g, solo = ss.length === 1;
              const qui = PASSI.includes(S.ui.tab) && ss.some(s => s.k === S.ui.set);   // la scheda aperta è in quest'area
              const passi = (s: (typeof SETTORI)[number]) => PASSI.map(k => <button key={k} className={S.ui.tab === k && S.ui.set === s.k ? 'on' : ''} onClick={() => { setMenu(false); goTab(k, s.k); }}><Ico d={ICON[k]} /><span>{LABEL[k]}</span></button>);
              return (
                <div key={g} className={`nset area${aperta ? ' open' : ''}`}>
                  <button className={`nsh${qui && !aperta ? ' cur' : ''}`} aria-expanded={aperta} onClick={() => apriArea(g, ss)}><Ico d={CHEV} /><span>{g}</span>
                    {ss.every(s => !s.pronto && !s.pronte) && <em className="nsoon">in sviluppo</em>}</button>
                  {aperta && (solo ? passi(ss[0]) : ss.map(s => {
                    const su = S.ui.set === s.k && S.ui.sopen;
                    return (
                      <div key={s.k} className={`nset${su ? ' open' : ''}`}>
                        <button className="nsh" aria-expanded={su} onClick={() => apriSet(s.k)}><Ico d={CHEV} /><span>{s.nome}</span>
                          {!s.pronto && <em className="nsoon">{s.pronte ? 'in parte' : 'in sviluppo'}</em>}</button>
                        {su && passi(s)}
                      </div>
                    );
                  }))}
                </div>
              );
            })}
          </div>}
          <div className="ng">
            <div className="ngt">Dati comuni</div>
            {(['listino', ...(isAdmin() ? ['utenti'] : [])] as Tab[]).map(k => <button key={k} className={S.ui.tab === k ? 'on' : ''} title={LABEL[k]} onClick={() => { setMenu(false); goTab(k); }}><Ico d={ICON[k]} /><span>{LABEL[k]}</span></button>)}
          </div>
        </nav>
        <Presenza />
        <Telegram />
        {cloud.session && (
          <div className="user" title={cloud.sync === 'errore' ? 'Ultimo salvataggio sul server non riuscito' : cloud.sync === 'salvo' ? 'Salvataggio sul server…' : 'Dati sincronizzati con il server'}>
            <span className={`dot ${cloud.sync}`} /><span className="em" title={cloud.session.user.email}>{cloud.me?.nome || cloud.session.user.email}{cloud.me?.ruolo === 'admin' ? ' · admin' : ''}</span>
            <button className="btn s" onClick={() => { if (!isDirty() || confirm('Il preventivo aperto ha modifiche non salvate. Uscire comunque?')) logout().then(commit); }}>Esci</button>
          </div>
        )}
      </aside>
      <div className="mainc">
        <header className={home ? 'home' : ''}>
          <div className="top">
            <button className="btn menu noprint" onClick={() => setMenu(true)} aria-label="Apri il menu" title="Menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            {!home && <>
            <div className="cur">
              <small>{passo ? `${set.nome} · ` : ''}{LABEL[S.ui.tab]}</small>
              <span className={`curname ${dirty ? 'dirty' : ''}`} title={dirty ? 'Modifiche non salvate' : 'Salvato'}>
                {S.prev._id ? S.prev._nome : 'Nuovo preventivo'}
                {isBlank(S.prev) ? null : dirty ? <i> ● non salvato</i> : <i className="ok"> ✓ salvato</i>}
              </span>
            </div>
            <div className="kpis">
              <Kpi label="Costo totale" value={eur(R.total)} cls="main" />
              <Kpi label="Prezzo di vendita" value={eur(R.prezzo)} />
              <Kpi label="Potenza" value={fN(R.kwp, 2) + ' kWp'} />
              <Kpi label="€/Wp vendita" value={R.kwp ? fN(R.prezzo / (R.kwp * 1000), 4) : "–"} />
            </div>
            <div className="actions">
              <button className="btn" onClick={() => { newPreventivo(passo ? set.k : 'tracker'); commit(); }}>Nuovo</button>
              <button className="btn" onClick={save} title="Salva nell'archivio (Ctrl+S)">Salva</button>
              <button className="btn p" onClick={printCosti} title="Stampa / PDF"><span className="lg">Stampa / </span>PDF</button>
            </div>
            </>}
          </div>
        </header>
      <main>
        {R.warn.length ? <div className="warn">{R.warn.map((w, i) => <div key={i}>{w}</div>)}</div> : null}
        <View />
      </main>
      <input type="file" ref={setFileInput} accept=".json,application/json" className="hide" onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); }} />
      <AvvisiRiunioni />{node}
      </div>
      <Assistente />
    </div>
  );
}
