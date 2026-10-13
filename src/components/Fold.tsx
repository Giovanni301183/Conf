import { useState, type ReactNode } from 'react';

// Tendina: card chiusa con riepilogo in una riga, si apre al clic (PRD §11.2).
export function Fold({ title, sum, children }: { title: string; sum?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card fold ${open ? 'open' : ''}`}>
      <div className="fh" onClick={() => setOpen(o => !o)}>
        <div className="ft">
          <h2>{title}</h2>
          {sum && <div className="fsum">{sum}</div>}
        </div>
        <span className="sp" />
        <span className="chev">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      {open && <div className="fb">{children}</div>}
    </div>
  );
}
