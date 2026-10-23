// Scheda Preventivi: archivio dei preventivi salvati, bozza recuperabile, backup su file; cruscotto KPI e mappa.
import { Fold, Seg } from '../components/ui';
import { eStato, testo } from '../domain/kpi';
import { Cruscotto, StatoSel } from './Cruscotto';
import { Mappa } from './Mappa';
import { eur, fDate, fN } from '../domain/format';
import { KEY_DRAFT, S, commit, load } from '../store/state';
import { cloud, isAdmin, uploadLocali } from '../store/remote';
import { archDel, archDl, archDup, archExp, archOpen, archRename, archSave, draftDel, draftOpen, isDirty, newPreventivo, pickFile, prevName, righeTxt } from '../store/actions';

const fd = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '–' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
const run = (f: () => void) => () => { f(); commit(); };

export function Preventivi() {
  const q = S.ui.aq.trim().toLowerCase();
  const list = S.arch.filter(e => !q || testo(e).includes(q));
  const dr = load(KEY_DRAFT);
  const n = S.arch.length;
  return (
    <>
      <div className="card head"><div className="headrow">
        <div><h2>Archivio preventivi</h2>
          <p className="hint" style={{ margin: 0 }}>{n} preventiv{n === 1 ? 'o salvato' : 'i salvati'} {cloud.session ? "nell'archivio condiviso" : 'in questo browser'}. Ogni preventivo conserva anche il listino usato.</p></div>
        <span className="sp" />
        <Seg path="ui.av" opts={[['elenco', 'Elenco'], ['kpi', 'Cruscotto'], ['mappa', 'Mappa']]} />
        {S.ui.av === 'elenco' && <input placeholder="Cerca per nome, cliente, commessa…" value={S.ui.aq} onChange={e => { S.ui.aq = e.target.value; commit(); }} style={{ width: 260 }} />}
        <button className="btn" onClick={run(() => archSave(false))}>Salva preventivo corrente</button>
        <button className="btn p" onClick={run(newPreventivo)}>+ Nuovo preventivo</button>
      </div></div>

      {S.ui.av === 'kpi' ? <Cruscotto /> : S.ui.av === 'mappa' ? <Mappa /> : <>
      {cloud.locali.length > 0 && (
        <div className="card head"><div className="headrow">
          <div><h2>Preventivi solo in questo browser</h2><p className="hint" style={{ margin: 0 }}>
            {cloud.locali.length} preventiv{cloud.locali.length === 1 ? 'o' : 'i'} dell'archivio locale non {cloud.locali.length === 1 ? 'è' : 'sono'} ancora sul server: {cloud.locali.slice(0, 3).map(e => e.nome).join(', ')}{cloud.locali.length > 3 ? '…' : ''}</p></div>
          <span className="sp" />
          <button className="btn p" onClick={() => { uploadLocali(); }}>Carica nell'archivio condiviso</button>
        </div></div>
      )}

      {dr && (
        <div className="card head"><div className="headrow">
          <div><h2>Bozza non salvata</h2><p className="hint" style={{ margin: 0 }}>Dall'ultima sessione: <b>{prevName(dr)}</b> · {righeTxt(dr)}</p></div>
          <span className="sp" />
          <button className="btn" onClick={run(draftDel)}>Scarta</button><button className="btn p" onClick={run(draftOpen)}>Riprendi</button>
        </div></div>
      )}

      {!list.length ? (
        <div className="card"><div className="empty">{n ? 'Nessun preventivo corrisponde alla ricerca.' : <>L'archivio è vuoto. Configura un preventivo e premi <b>Salva</b> in alto.</>}</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="arch"><tbody>
            <tr><th>Preventivo</th><th>Commessa</th><th>Stato</th><th>Tracker</th><th className="n">kWp</th><th className="n">Costo</th><th className="n">Prezzo</th><th>Salvato</th><th></th></tr>
            {list.map(e => {
              const cur = S.prev._id === e.id;
              return (
                <tr key={e.id} className={cur ? 'cur' : ''}>
                  <td><b>{e.nome}</b>{cur && <> <span className="tag on">aperto{isDirty() ? ' · modificato' : ''}</span></>}<div className="muted small">{e.prev?.num ? <>N° {e.prev.num} · </> : null}{e.cliente || '–'}</div></td>
                  <td>{e.rif || '–'}<div className="muted small">{fDate(e.data)}</div></td>
                  <td><StatoSel id={e.id} k={eStato(e)} /></td><td className="small">{e.righe}</td><td className="n">{fN(e.kwp, 2)}</td><td className="n">{eur(e.totale)}</td><td className="n"><b>{e.prezzo != null ? eur(e.prezzo) : '–'}</b>{e.totale > 0 && e.prezzo != null && e.prezzo - e.totale < 0.5 ? <div className="small" style={{ color: 'var(--warn)' }}>margine 0 %</div> : null}</td>
                  <td className="small muted">{fd(e.salvato)}{e.autore ? <div>{e.autore.split('@')[0]}</div> : null}</td>
                  <td className="acts">
                    <button className="btn s p" onClick={run(() => archOpen(e.id))}>Apri</button>
                    <button className="btn s" onClick={run(() => archDup(e.id))} title="Duplica">Duplica</button>
                    <button className="btn s" onClick={run(() => archRename(e.id))} title="Cambia il nome del preventivo">Rinomina</button>
                    <button className="btn s" onClick={() => archDl(e.id)} title="Scarica come file">Scarica</button>
                    {isAdmin() && <button className="btn s del" onClick={run(() => archDel(e.id))} title="Elimina il preventivo (solo amministratore)">Elimina</button>}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div></div>
      )}

      <Fold id="ar-file" title="Backup e trasferimento" sum="Esporta tutto l'archivio su file o importa preventivi da file (per altri PC o colleghi)">{() => <>
        <p className="hint">{cloud.session ? "L'archivio è sul server, condiviso con i colleghi. L'esportazione su file resta utile come copia di sicurezza." : "L'archivio vive nel browser di questo PC. Per sicurezza esportalo ogni tanto su file; il file si importa da qui su un altro PC."}</p>
        <div className="toolbar"><button className="btn" onClick={archExp}>Esporta tutto l'archivio</button><button className="btn" onClick={() => pickFile('arch')}>Importa da file…</button>
          <span className="muted">Accetta sia l'archivio completo sia un singolo preventivo scaricato.</span></div>
      </>}</Fold>
      </>}
    </>
  );
}
