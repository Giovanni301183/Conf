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
import { Lavorazione } from './pages/Lavorazione';
import { Montaggio } from './pages/Montaggio';
import { Accesso } from './pages/Accesso';
import { cloud, logout, setCloudToast } from './store/remote';

const VIEWS: Record<Tab, () => React.ReactNode> = {
  archivio: Preventivi, listino: Listino, distinte: Distinte, config: Configura, costi: Costi,
  extra: Extra, margini: Margini, lavor: Lavorazione, mont: Montaggio,
};
const goTab = (t: Tab) => { S.ui.tab = t; window.scrollTo(0, 0); commit(); };
const save = () => { (document.activeElement as HTMLElement | null)?.blur?.(); archSave(false); commit(); };

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
    <>
      <header>
        <div className="top">
          <div className="brand">
            <div className="logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-4 9 4-9 4z" /><path d="M12 14v7M8 21h8" /></svg>
            </div>
            <h1>Preventivatore Tracker<small>Configuratore costi · tracker 1303</small></h1>
          </div>
          <div className="kpis">
            <Kpi label="Costo totale" value={eur(R.total)} cls="main" />
            <Kpi label="Prezzo di vendita" value={eur(R.prezzo)} />
            <Kpi label="Potenza" value={fN(R.kwp, 2) + ' kWp'} />
            <Kpi label="€/Wp" value={R.kwp ? fN(R.total / (R.kwp * 1000), 4) : '–'} />
          </div>
          <div className="actions">
            <button className="btn" onClick={() => { newPreventivo(); commit(); }}>Nuovo</button>
            <button className="btn" onClick={() => goTab('archivio')}>Preventivi</button>
            <button className="btn" onClick={save} title="Salva nell'archivio (Ctrl+S)">Salva</button>
            <button className="btn p" onClick={printCosti}>Stampa / PDF</button>
          </div>
          {cloud.session && (
            <div className="user" title={cloud.sync === 'errore' ? 'Ultimo salvataggio sul server non riuscito' : cloud.sync === 'salvo' ? 'Salvataggio sul server…' : 'Dati sincronizzati con il server'}>
              <span className={`dot ${cloud.sync}`} />{cloud.session.user.email}
              <button className="btn s" onClick={() => { if (!isDirty() || confirm('Il preventivo aperto ha modifiche non salvate. Uscire comunque?')) logout().then(commit); }}>Esci</button>
            </div>
          )}
        </div>
      </header>
      <div className="navbar">
        <nav>
          {TABS.map(([k, l], i) => <button key={k} className={S.ui.tab === k ? 'on' : ''} onClick={() => goTab(k)}><i>{i + 1}</i>{l}</button>)}
          <span className="navtot">
            <span className={`curname ${dirty ? 'dirty' : ''}`} title={dirty ? 'Modifiche non salvate' : 'Salvato'}>
              {S.prev._id ? S.prev._nome : 'Nuovo preventivo'}
              {isBlank(S.prev) ? null : dirty ? <i> ● non salvato</i> : <i className="ok"> ✓ salvato</i>}
            </span>
            Totale <b>{eur(R.total)}</b>
          </span>
        </nav>
      </div>
      <main>
        {R.warn.length ? <div className="warn">{R.warn.map((w, i) => <div key={i}>{w}</div>)}</div> : null}
        <View />
      </main>
      <input type="file" ref={setFileInput} accept=".json,application/json" className="hide" onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); }} />
      {node}
    </>
  );
}
