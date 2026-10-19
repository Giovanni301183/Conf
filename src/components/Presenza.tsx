// Barra laterale: chi ha l'app aperta in questo momento (solo con l'archivio condiviso sul server).
import { cloud } from '../store/remote';

export function Presenza() {
  if (!cloud.session || !cloud.presenti.length) return null;
  const me = cloud.me?.email;
  return (
    <div className="pres">
      <div className="ngt">Collegati ora · {cloud.presenti.length}</div>
      {cloud.presenti.map(p => (
        <div key={p.email} className="pp" title={p.email}><span className="dot on" />{p.nome || p.email.split('@')[0]}{p.email === me ? ' (tu)' : ''}</div>
      ))}
    </div>
  );
}
