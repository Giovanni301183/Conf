// Accesso con email e password; impostazione della password da invito o recupero; attesa del caricamento.
import { useState, type FormEvent } from 'react';
import { cloud, login, logout, resetPassword, setPassword } from '../store/remote';
import { commit } from '../store/state';

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="login"><div className="card">
      <div className="brand"><div className="logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-4 9 4-9 4z" /><path d="M12 14v7M8 21h8" /></svg>
      </div><h1>Preventivatore Tracker<small>{title}</small></h1></div>
      {children}
    </div></div>
  );
}

export function Accesso() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  const run = (f: () => Promise<string>, done = '') => async (e?: FormEvent) => {
    e?.preventDefault(); setBusy(true); setMsg(''); setOk('');
    const err = await f(); setBusy(false);
    if (err) setMsg(err); else if (done) setOk(done);
  };

  if (cloud.fase === 'avvio' || cloud.fase === 'carico') return <Box title={cloud.fase === 'carico' ? 'Caricamento archivio e listino…' : 'Avvio…'}><div className="spinner" /></Box>;

  if (cloud.fase === 'errore') return (
    <Box title="Impossibile caricare i dati">
      <p className="err">{cloud.err}</p>
      <p className="hint">Controlla la connessione. Se il problema persiste, l'utente potrebbe non essere abilitato (serve l'email aziendale).</p>
      <div className="toolbar"><button className="btn p" onClick={() => location.reload()}>Riprova</button><button className="btn" onClick={() => { logout().then(commit); }}>Esci</button></div>
    </Box>
  );

  if (cloud.fase === 'negato') return (
    <Box title="Account non abilitato">
      <p className="err">{cloud.me ? `L'account ${cloud.me.email} è stato disattivato.` : `L'account ${cloud.session?.user.email ?? ''} non è nell'elenco degli utenti abilitati.`}</p>
      <p className="hint">Chiedi all'amministratore di abilitarti dalla pagina Utenti.</p>
      <div className="toolbar"><button className="btn p" onClick={() => { logout().then(commit); }}>Esci</button></div>
    </Box>
  );

  if (cloud.fase === 'password') return (
    <Box title={`Imposta la tua password · ${cloud.session?.user.email ?? ''}`}>
      <form onSubmit={run(() => (pw.length < 8 ? Promise.resolve('La password deve avere almeno 8 caratteri.') : pw !== pw2 ? Promise.resolve('Le due password non coincidono.') : setPassword(pw)))}>
        <label>Nuova password<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
        <label>Ripeti password<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
        {msg && <p className="err">{msg}</p>}
        <button className="btn p" disabled={busy}>Salva e continua</button>
      </form>
    </Box>
  );

  return (
    <Box title="Accedi con il tuo account aziendale">
      <form onSubmit={run(() => login(email, pw))}>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} autoFocus required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required /></label>
        {msg && <p className="err">{msg}</p>}
        {ok && <p className="okmsg">{ok}</p>}
        <button className="btn p" disabled={busy}>{busy ? 'Accesso…' : 'Accedi'}</button>
        <button type="button" className="btn link" disabled={busy}
          onClick={() => (email.trim() ? run(() => resetPassword(email), `Ti abbiamo inviato un'email a ${email.trim()} con il link per scegliere una nuova password.`)() : setMsg("Scrivi prima l'email, poi premi di nuovo «Password dimenticata?»."))}>
          Password dimenticata?
        </button>
      </form>
      <p className="hint">Gli account li crea l'amministratore: se non ne hai uno, chiedi un invito.</p>
    </Box>
  );
}
