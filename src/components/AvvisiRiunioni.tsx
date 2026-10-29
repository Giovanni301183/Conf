// Avviso delle riunioni nell'app aperta (anche in un'altra scheda): ANTICIPO minuti prima di un appuntamento creato da me
// o assegnato a me arriva la notifica del sistema (se permessa) e comunque il messaggio in basso. Click sulla notifica = entra nella riunione.
// Con l'app chiusa l'avviso arriva su Telegram (/api/agenda, azione avvisi_riunioni). Ogni avviso una volta sola per browser.
import { useEffect, useState } from 'react';
import { ANTICIPO, chiaveAvviso, daAvvisare, linkRiunione, minutiA } from '../domain/riunione';
import { S } from '../store/state';
import { toast } from '../store/actions';
import { mioEmail } from '../store/remote';
import { perMe } from '../domain/calendario';
import { Ic } from './Icona';

const due = (n: number) => String(n).padStart(2, '0');
const giaAvvisata = (k: string) => { try { return !!localStorage.getItem('avviso:' + k); } catch { return false; } };
const segnaAvvisata = (k: string) => { try { localStorage.setItem('avviso:' + k, '1'); } catch { /* al peggio si avvisa di nuovo */ } };
const notifiche = () => typeof Notification !== 'undefined';

function controlla() {
  const me = mioEmail();
  if (!me) return;
  const d = new Date(), oggi = `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`, adesso = `${due(d.getHours())}:${due(d.getMinutes())}`;
  for (const s of daAvvisare(S.scad.filter(s => perMe(s, me)), oggi, adesso)) {
    const k = s.id + ' ' + chiaveAvviso(s);
    if (giaAvvisata(k)) continue;
    segnaAvvisata(k);
    const link = linkRiunione(s.nota), testo = `Tra ${minutiA(s.ora!, adesso)} minuti: ${s.titolo} (ore ${s.ora!.slice(0, 5)})`;
    toast(testo + (link ? ' · entra dal calendario con «Entra»' : ''));
    if (notifiche() && Notification.permission === 'granted') {
      // Sul telefono senza service worker il costruttore puo' non esistere: resta il messaggio nell'app (e Telegram).
      try {
        const n = new Notification('Riunione tra poco', { body: testo + (link ? '\nTocca per entrare' : ''), icon: '/logo-terranova.png', tag: k });
        n.onclick = () => { window.focus(); if (link) window.open(link, '_blank'); n.close(); };
      } catch { /* niente notifica di sistema */ }
    }
  }
}

/** Controllo ogni 30 secondi, finché l'app è aperta. */
export function AvvisiRiunioni() {
  useEffect(() => { controlla(); const t = setInterval(controlla, 30_000); return () => clearInterval(t); }, []);
  return null;
}

/** Pulsante per permettere le notifiche del sistema; sparisce quando la scelta è fatta. */
export function PermessoAvvisi() {
  const [stato, setStato] = useState(() => (notifiche() ? Notification.permission : 'denied'));
  if (stato !== 'default') return null;
  return <button className="btn s" title={`Notifica del computer ${ANTICIPO} minuti prima delle tue riunioni, con l'app aperta`}
    onClick={async () => setStato(await Notification.requestPermission())}><Ic n="avvisi" />Avvisi riunioni</button>;
}
