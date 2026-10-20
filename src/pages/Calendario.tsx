// Calendario della Home: allarmi in cima, mese con le date delle commesse e le scadenze, dettaglio del giorno scelto.
import { useState } from 'react';
import { PREAVVISO, TIPI, allarmi, daPianificare, perGiorno, voci, type Scadenza, type Voce } from '../domain/calendario';
import { eStato } from '../domain/kpi';
import { DAY, dDate, dFmt, dToday, isWork, isoDay, monday } from '../domain/plan';
import { S, commit } from '../store/state';
import { archOpen, toast } from '../store/actions';
import { cloud, eliminaScadenza, puoModificare, salvaScadenza } from '../store/remote';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const meseNome = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// Le scadenze a mano "scadono"; le date delle commesse passano e basta.
const quando = (g: number, oggi: number, man: boolean) => {
  const d = g - oggi;
  if (d >= 0) return d === 0 ? 'oggi' : d === 1 ? 'domani' : `tra ${d} giorni`;
  return man ? (d === -1 ? 'scaduta ieri' : `scaduta da ${-d} giorni`) : d === -1 ? 'ieri' : `${-d} giorni fa`;
};
const apri = (id: string) => { archOpen(id); commit(); };
const segna = async (s: Scadenza) => { const e = await salvaScadenza({ ...s, fatto: !s.fatto }); if (e) toast('Scadenza non aggiornata: ' + e); commit(); };
const togli = async (s: Scadenza) => {
  if (!confirm(`Eliminare la scadenza "${s.titolo}"?`)) return;
  const e = await eliminaScadenza(s.id); if (e) toast('Scadenza non eliminata: ' + e); commit();
};

function Riga({ v, oggi, onEdit }: { v: Voce; oggi: number; onEdit?: (s: Scadenza) => void }) {
  const [l, c] = TIPI[v.tipo], s = v.s, mio = s && puoModificare(s);
  return (
    <div className={`cvoce ${s?.fatto ? 'fatto' : ''}`} style={{ '--vc': c } as React.CSSProperties}>
      {s ? <input type="checkbox" checked={s.fatto} disabled={!mio} onChange={() => segna(s)} title={mio ? 'Fatto' : "Solo chi l'ha creata o un amministratore"} /> : <i className="vdot" />}
      <div className="vt">
        <b>{v.titolo}</b>
        <small>{l} · {dFmt(v.giorno)} ({quando(v.giorno, oggi, !!s && !s.fatto)}){v.sotto ? ' · ' + v.sotto : ''}
          {s?.creato_da ? ' · ' + s.creato_da.split('@')[0] : ''}{s?.origine === 'telegram' ? ' · da Telegram' : ''}</small>
        {s?.nota ? <span className="muted small">{s.nota}</span> : null}
      </div>
      {v.prevId && <button className="btn s" onClick={() => apri(v.prevId!)}>Apri</button>}
      {mio && onEdit && <><button className="btn s" onClick={() => onEdit(s)}>Modifica</button><button className="btn x" onClick={() => togli(s)} title="Elimina">✕</button></>}
    </div>
  );
}

/** Riquadro degli allarmi: scadenze superate, in arrivo nei prossimi giorni, commesse senza data di avvio. */
export function Allarmi({ compatto = false }: { compatto?: boolean }) {
  const oggi = dToday(), { scadute, prossime } = allarmi(voci(S.arch, S.scad), oggi), np = daPianificare(S.arch);
  if (compatto && !scadute.length && !prossime.length) return null;
  const tutte = [...scadute, ...prossime], vis = compatto ? tutte.slice(0, 4) : tutte;
  return (
    <div className="card calarm">
      <h2>Allarmi
        {scadute.length > 0 && <span className="tag alate">{scadute.length} scadut{scadute.length === 1 ? 'a' : 'e'}</span>}
        <span className="tag asoon">{prossime.length} nei prossimi {PREAVVISO} giorni</span>
        <span className="sp" />
        {compatto && <button className="btn s" onClick={() => { S.ui.av = 'cal'; commit(); }}>Apri calendario</button>}
      </h2>
      {tutte.length ? vis.map(v => <Riga key={v.key} v={v} oggi={oggi} />) : <p className="hint" style={{ margin: 0 }}>Nessuna scadenza superata o in arrivo.</p>}
      {vis.length < tutte.length && <p className="hint" style={{ margin: '6px 0 0' }}>… e altre {tutte.length - vis.length} nel calendario.</p>}
      {!compatto && np.length > 0 && <p className="hint" style={{ margin: '10px 0 0' }}>
        Commesse vinte senza data di avvio della produzione (non compaiono nel calendario): {np.map((e, i) => <span key={e.id}>{i ? ', ' : ''}<a href="#" onClick={ev => { ev.preventDefault(); apri(e.id); }}>{e.nome}</a></span>)}.
        Impostala nel Gantt della scheda Distinta lavorazione.</p>}
    </div>
  );
}

type Bozza = { id?: string; giorno: string; titolo: string; nota: string; preventivo_id: string };
function Modulo({ b, set, chiudi }: { b: Bozza; set: (b: Bozza) => void; chiudi: () => void }) {
  const [busy, setBusy] = useState(false);
  const vinti = S.arch.filter(e => eStato(e) === 'vinto'), altri = S.arch.filter(e => eStato(e) !== 'vinto');
  const salva = async () => {
    setBusy(true); const e = await salvaScadenza({ ...b, fatto: !!S.scad.find(x => x.id === b.id)?.fatto }); setBusy(false);
    if (e) { toast('Scadenza non salvata: ' + e); return; }
    toast(b.id ? 'Scadenza aggiornata' : 'Scadenza aggiunta'); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Data<input type="date" value={b.giorno} onChange={e => set({ ...b, giorno: e.target.value })} /></label>
      <label className="f">Cosa<input value={b.titolo} placeholder="es. Sollecito fornitore bulloneria" maxLength={200} autoFocus onChange={e => set({ ...b, titolo: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') salva(); }} /></label>
      <label className="f">Commessa (facoltativa)<select value={b.preventivo_id} onChange={e => set({ ...b, preventivo_id: e.target.value })}>
        <option value="">— nessuna —</option>
        {vinti.length > 0 && <optgroup label="Commesse (vinte)">{vinti.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
        {altri.length > 0 && <optgroup label="Altri preventivi">{altri.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
      </select></label>
      <label className="f wide">Nota (facoltativa)<input value={b.nota} onChange={e => set({ ...b, nota: e.target.value })} /></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !b.titolo.trim() || !b.giorno} onClick={salva}>{b.id ? 'Salva modifiche' : 'Aggiungi scadenza'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

export function Calendario() {
  const oggi = dToday(), t = dDate(oggi);
  const [ym, setYm] = useState({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  const [sel, setSel] = useState(oggi);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const vv = voci(S.arch, S.scad), byDay = perGiorno(vv);
  const first = Date.UTC(ym.y, ym.m, 1) / DAY, last = Date.UTC(ym.y, ym.m + 1, 0) / DAY, a = monday(first), b = monday(last) + 6;
  const giorni = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const sposta = (d: number) => { const x = new Date(Date.UTC(ym.y, ym.m + d, 1)); setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() }); };
  const nuova = (g = sel) => setBozza({ giorno: isoDay(g), titolo: '', nota: '', preventivo_id: '' });
  const modifica = (s: Scadenza) => setBozza({ id: s.id, giorno: s.giorno, titolo: s.titolo, nota: s.nota || '', preventivo_id: s.preventivo_id || '' });
  const delGiorno = byDay.get(sel) || [];
  return (
    <>
      {cloud.scadErr && <div className="warn">Le scadenze non si leggono dal server ({cloud.scadErr}). Se la tabella non c'è ancora, va eseguita la migrazione <b>20261020000000_calendario_scadenze.sql</b> nel SQL Editor di Supabase.</div>}
      <Allarmi />
      <div className="calgrid">
        <section className="card">
          <div className="calhead">
            <button className="btn s" onClick={() => sposta(-1)} aria-label="Mese precedente">‹</button>
            <h2>{meseNome(ym.y, ym.m)}</h2>
            <button className="btn s" onClick={() => sposta(1)} aria-label="Mese successivo">›</button>
            <button className="btn s" onClick={() => { setYm({ y: t.getUTCFullYear(), m: t.getUTCMonth() }); setSel(oggi); }}>Oggi</button>
            <span className="sp" />
            <span className="klegend">{Object.entries(TIPI).map(([k, [l, c]]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</span>
          </div>
          <div className="cal">
            {GIORNI.map(g => <div key={g} className="dh">{g}</div>)}
            {giorni.map(n => {
              const vs = byDay.get(n) || [], mese = dDate(n).getUTCMonth() === ym.m;
              return (
                <button key={n} className={`cday${mese ? '' : ' out'}${n === oggi ? ' oggi' : ''}${isWork(n) ? '' : ' fest'}${n === sel ? ' on' : ''}`}
                  onClick={() => setSel(n)} onDoubleClick={() => { setSel(n); nuova(n); }} aria-label={`${dFmt(n)}: ${vs.length} voci`}>
                  <span className="dn">{dDate(n).getUTCDate()}</span>
                  {vs.slice(0, 3).map(v => <span key={v.key} className={`cchip${v.s?.fatto ? ' fatto' : v.tipo === 'man' && n < oggi ? ' late' : ''}`}
                    style={{ '--vc': TIPI[v.tipo][1] } as React.CSSProperties}>{v.titolo}</span>)}
                  {vs.length > 3 && <span className="cmore">+{vs.length - 3}</span>}
                </button>
              );
            })}
          </div>
          <p className="hint" style={{ margin: '10px 0 0' }}>Clic su un giorno per il dettaglio, doppio clic per aggiungere una scadenza. Le date delle commesse vengono dal Gantt dei preventivi vinti.</p>
        </section>

        <section className="card">
          <h2>{dDate(sel).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}<span className="sp" />
            {!bozza && <button className="btn s p" onClick={() => nuova()}>+ Scadenza</button>}</h2>
          {bozza && <Modulo b={bozza} set={setBozza} chiudi={() => setBozza(null)} />}
          {delGiorno.length ? delGiorno.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={modifica} />)
            : !bozza && <p className="hint" style={{ margin: 0 }}>Niente in programma.</p>}
        </section>
      </div>
    </>
  );
}
