// Barra laterale: abbinamento del proprio account Telegram alla chat dell'agenda (bot su Telegram, via n8n).
// Il codice vale 10 minuti e va scritto al bot come "/collega 123456"; l'abbinamento lo fa /api/agenda.
import { useState } from 'react';
import { commit } from '../store/state';
import { cloud, codiceTelegram, ricaricaMe, scollegaTelegram } from '../store/remote';
import { Ic } from './Icona';

export function Telegram() {
  const [codice, setCodice] = useState(''), [err, setErr] = useState('');
  if (!cloud.session || !cloud.me) return null;
  const collegato = !!cloud.me.telegram_id;
  const nuovo = async () => { const r = await codiceTelegram(); setErr(r.error || ''); setCodice(r.codice || ''); };
  const verifica = async () => { await ricaricaMe(); if (cloud.me?.telegram_id) setCodice(''); else setErr('Non ancora collegato: hai scritto il codice al bot?'); commit(); };
  const togli = async () => { if (!confirm('Scollegare il tuo account Telegram dalla chat dell\'agenda?')) return; const e = await scollegaTelegram(); setErr(e); commit(); };
  return (
    <div className="tgbox">
      {collegato && !codice ? <div className="tgrow"><span><Ic n="telegram" />Telegram collegato</span><button className="btn s" onClick={togli}>Scollega</button></div>
        : !codice ? <div className="tgrow"><span><Ic n="telegram" />Telegram</span><button className="btn s" onClick={nuovo}>Collega</button></div>
        : <>
          <div>Scrivi al bot su Telegram, entro 10 minuti:</div>
          <code className="tgcode">/collega {codice}</code>
          <div className="tgrow"><button className="btn s" onClick={verifica}>Fatto</button><button className="btn s" onClick={() => setCodice('')}>Annulla</button></div>
        </>}
      {err && <div className="tgerr">{err}</div>}
    </div>
  );
}
