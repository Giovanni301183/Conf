import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { useToast } from './components/Toast';
import { Preventivi } from './pages/Preventivi';

const TABS = [
  ['archivio', 'Preventivi'],
  ['listino', 'Listino'],
  ['distinte', 'Distinte base'],
  ['config', 'Configura'],
  ['costi', 'Costi'],
  ['extra', 'Voci extra'],
  ['margini', 'Margini'],
  ['lavor', 'Distinta lavorazione'],
  ['mont', 'Montaggio'],
] as const;
type Tab = (typeof TABS)[number][0];

const fromHash = (): Tab => TABS.find(t => t[0] === location.hash.slice(1))?.[0] ?? 'archivio';

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  const { toast, node } = useToast();

  useEffect(() => {
    history.replaceState(null, '', '#' + tab);
  }, [tab]);

  const label = TABS.find(t => t[0] === tab)![1];

  return (
    <>
      <Header onTab={t => setTab(t as Tab)} />
      <div className="navbar">
        <nav>
          {TABS.map(([k, l], i) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <i>{i + 1}</i>
              {l}
            </button>
          ))}
          <span className="navtot">
            <span className="curname">Nuovo preventivo</span>Totale <b>–</b>
          </span>
        </nav>
      </div>
      <main>
        {tab === 'archivio' ? (
          <Preventivi toast={toast} />
        ) : (
          <div className="card">
            <h2>{label}</h2>
            <div className="empty">Scheda in migrazione dall'app HTML: arriverà nei prossimi passi.</div>
          </div>
        )}
      </main>
      {node}
    </>
  );
}
