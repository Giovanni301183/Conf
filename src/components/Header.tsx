import { supabase } from '../lib/supabase';

export function Header({ onTab }: { onTab: (t: string) => void }) {
  const kpi = (label: string, value: string, cls = '') => (
    <div className={`kpi ${cls}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
  return (
    <header>
      <div className="top">
        <div className="brand">
          <div className="logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10l9-4 9 4-9 4z" />
              <path d="M12 14v7M8 21h8" />
            </svg>
          </div>
          <h1>
            Preventivatore Tracker
            <small>Configuratore costi · tracker 1303</small>
          </h1>
        </div>
        <div className="kpis">
          {kpi('Costo totale', '–', 'main')}
          {kpi('Prezzo di vendita', '–')}
          {kpi('Potenza', '– kWp')}
          {kpi('€/Wp', '–')}
        </div>
        <div className="actions">
          <span className={`conn ${supabase ? 'ok' : 'off'}`} title={supabase ? 'Supabase configurato' : 'Inserisci URL e chiave in .env.local'}>
            <i />
            {supabase ? 'Supabase' : 'Solo locale'}
          </span>
          <button className="btn" onClick={() => onTab('archivio')}>Preventivi</button>
        </div>
      </div>
    </header>
  );
}
