import { useEffect } from 'react';
import { useToastState } from './components/ui';
import { eur, fN } from './domain/format';
import { R, S, TABS, commit, useStore, type Tab } from './store/state';
import { archSave, isBlank, isDirty, newPreventivo, onFilePicked, printCosti, setFileInput, setToast } from './store/actions';
import { Preventivi } from './pages/Preventivi';
import { Listino } from './pages/Listino';
import { Distinte } from './pages/Distinte';
import { Configura } from './pages/Configura';
import { Costi } from './pages/Costi';
import { Extra } from './pages/Extra';
import { Margini } from './pages/Margini';
import { Invia } from './pages/Invia';
import { Lavorazione } from './pages/Lavorazione';
import { Montaggio } from './pages/Montaggio';
import { Accesso } from './pages/Accesso';
import { Utenti } from './pages/Utenti';
import { Presenza } from './components/Presenza';
import { cloud, isAdmin, logout, setCloudToast } from './store/remote';

const VIEWS: Record<Tab, () => React.ReactNode> = {
  archivio: Preventivi, listino: Listino, distinte: Distinte, config: Configura, costi: Costi,
  extra: Extra, margini: Margini, invia: Invia, lavor: Lavorazione, mont: Montaggio, utenti: Utenti,
};
const goTab = (t: Tab) => { S.ui.tab = t; window.scrollTo(0, 0); commit(); };
const save = () => { (document.activeElement as HTMLElement | null)?.blur?.(); archSave(false); commit(); };

// Barra laterale: schede raggruppate per fase di lavoro.
const GROUPS: [string, Tab[]][] = [['', ['archivio']], ['Preventivo', ['config', 'costi', 'extra', 'margini', 'invia']],
  ['Produzione e cantiere', ['lavor', 'mont']], ['Dati di base', ['listino', 'distinte']], ['Amministrazione', ['utenti']]];
const ICON: Record<Tab, string> = {
  archivio: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  config: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  costi: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  extra: 'M12 5v14M5 12h14',
  margini: 'M19 5L5 19M7 9a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  invia: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  lavor: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  mont: 'M3 20h18M5 20V10l7-6 7 6v10M9 20v-6h6v6',
  listino: 'M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0',
  distinte: 'M4 4h16v16H4zM4 10h16M10 10v10',
  utenti: 'M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM22 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8',
};
const Ico = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const LABEL = Object.fromEntries(TABS) as Record<Tab, string>;

function Kpi({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className={`kpi ${cls}`}><small>{label}</small><b>{value}</b></div>;
}

export default function App() {
  useStore();
  const { toast, node } = useToastState();
  useEffect(() => { setToast(toast); setCloudToast(toast); });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (cloud.fase !== 'locale' && cloud.fase !== 'pronto') return <><Accesso />{node}</>;
  const View = VIEWS[S.ui.tab];
  const dirty = isDirty();
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-4 9 4-9 4z" /><path d="M12 14v7M8 21h8" /></svg>
          </div>
          <h1>Preventivatore Tracker<small>Configuratore · tracker 1303</small></h1>
        </div>
        <nav>
          {GROUPS.filter(([, tabs]) => isAdmin() || !tabs.includes('utenti')).map(([g, tabs]) => (
            <div key={g || 'home'} className="ng">
              {g && <div className="ngt">{g}</div>}
              {tabs.map(k => <button key={k} className={S.ui.tab === k ? 'on' : ''} onClick={() => goTab(k)}><Ico d={ICON[k]} /><span>{LABEL[k]}</span></button>)}
            </div>
          ))}
        </nav>
        <Presenza />
        {cloud.session && (
          <div className="user" title={cloud.sync === 'errore' ? 'Ultimo salvataggio sul server non riuscito' : cloud.sync === 'salvo' ? 'Salvataggio sul server…' : 'Dati sincronizzati con il server'}>
            <span className={`dot ${cloud.sync}`} /><span className="em" title={cloud.session.user.email}>{cloud.me?.nome || cloud.session.user.email}{cloud.me?.ruolo === 'admin' ? ' · admin' : ''}</span>
            <button className="btn s" onClick={() => { if (!isDirty() || confirm('Il preventivo aperto ha modifiche non salvate. Uscire comunque?')) logout().then(commit); }}>Esci</button>
          </div>
        )}
      </aside>
      <div className="mainc">
        <header>
          <div className="top">
            <div className="cur">
              <small>{LABEL[S.ui.tab]}</small>
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
              <button className="btn" onClick={() => { newPreventivo(); commit(); }}>Nuovo</button>
              <button className="btn" onClick={save} title="Salva nell'archivio (Ctrl+S)">Salva</button>
              <button className="btn p" onClick={printCosti}>Stampa / PDF</button>
            </div>
          </div>
        </header>
      <main>
        {R.warn.length ? <div className="warn">{R.warn.map((w, i) => <div key={i}>{w}</div>)}</div> : null}
        <View />
      </main>
      <input type="file" ref={setFileInput} accept=".json,application/json" className="hide" onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); }} />
      {node}
      </div>
    </div>
  );
}
