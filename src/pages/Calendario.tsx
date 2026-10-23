// Calendario e agenda in cima alla Home: allarmi, mese (o elenco dei prossimi giorni) con le date delle commesse e le voci
// inserite a mano, dettaglio del giorno scelto. Si nasconde e si rimette con un pulsante (scelta ricordata in questo browser);
// nascosto restano gli allarmi in breve.
import { useState } from 'react';
import { CATEGORIE, GENERI, PREAVVISO, RICHIAMO, TIPI, agenda, allarmi, aspetto, daFare, daPianificare, inAttesa, mia, oraBreve, perGiorno, voci, type Genere, type Scadenza, type Voce } from '../domain/calendario';
import { Fold } from '../components/ui';
import { StatoSel } from './Cruscotto';
import { eStato } from '../domain/kpi';
import { DAY, dDate, dFmt, dToday, isWork, isoDay, monday } from '../domain/plan';
import { S, commit } from '../store/state';
import { archOpen, toast } from '../store/actions';
import { DocPanel, docNonDisponibili } from './Documenti';
import { ModuloEmail, contestoEmail } from '../components/Email';
import { cloud, eliminaScadenza, mioEmail, online, puoModificare, puoSpuntare, salvaScadenza, spuntaScadenza } from '../store/remote';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const meseNome = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const giornoNome = (n: number) => dDate(n).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
// Le voci a mano e i richiami "scadono"; le date delle commesse passano e basta.
const quando = (g: number, oggi: number, man: boolean) => {
  const d = g - oggi;
  if (d >= 0) return d === 0 ? 'oggi' : d === 1 ? 'domani' : `tra ${d} giorni`;
  return man ? (d === -1 ? 'scaduta ieri' : `scaduta da ${-d} giorni`) : d === -1 ? 'ieri' : `${-d} giorni fa`;
};
const nomeDi = (email: string) => cloud.colleghi.find(u => u.email === email)?.nome || email.split('@')[0];
const apri = (id: string) => { archOpen(id); commit(); };
const mostra = (v: boolean) => { S.ui.cal = v; commit(); };
const segna = async (s: Scadenza) => { const e = await spuntaScadenza(s); if (e) toast('Voce non aggiornata: ' + e); commit(); };
const togli = async (s: Scadenza) => {
  if (!confirm(`Eliminare "${s.titolo}"?`)) return;
  const e = await eliminaScadenza(s.id); if (e) toast('Voce non eliminata: ' + e); commit();
};
// Risposta a un'email arrivata: la voce «Attesa risposta» diventa fatta, con la nota facoltativa su cosa hanno risposto.
async function risposta(s: Scadenza) {
  const n = prompt('Risposta arrivata. Cosa hanno risposto? (facoltativo)', '');
  if (n === null) return;
  const nota = [s.nota, n.trim() && `Risposta del ${dFmt(dToday())}: ${n.trim()}`].filter(Boolean).join('\n');
  const e = await salvaScadenza({ ...s, nota, fatto: true }); if (e) toast('Voce non aggiornata: ' + e); commit();
}
// Voci visibili: con "Le mie" solo quelle create da me o assegnate a me.
const vociVisibili = () => { const vv = voci(S.arch, S.scad), me = mioEmail(); return S.ui.calMie && me ? vv.filter(v => mia(v, me)) : vv; };
/** Voci scadute e non fatte, per il numerino sulla voce Home del menu. */
export const nScadute = () => { const a = allarmi(vociVisibili(), dToday()); return a.urgenze.length + a.scadute.length; };

// Assegnazione rapida di una voce a un collega (o a nessuno), senza aprire Modifica.
function Assegna({ s, chiudi }: { s: Scadenza; chiudi: () => void }) {
  const [a, setA] = useState(s.assegnata_a || ''), [busy, setBusy] = useState(false);
  const fai = async () => {
    setBusy(true); const e = await salvaScadenza({ ...s, assegnata_a: a || null }); setBusy(false);
    if (e) { toast('Voce non assegnata: ' + e); return; }
    toast(a ? `Assegnata a ${nomeDi(a)}: la trova in «Le mie»` : 'Assegnazione tolta'); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Assegna a<select value={a} autoFocus onChange={e => setA(e.target.value)}>
        <option value="">— chiunque —</option>
        {cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}</select></label>
      <div className="f" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <button className="btn p" disabled={busy || a === (s.assegnata_a || '')} onClick={fai}>{busy ? 'Salvo…' : 'Assegna'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

function Riga({ v, oggi, onEdit, data = true }: { v: Voce; oggi: number; onEdit?: (s: Scadenza) => void; data?: boolean }) {
  const [l, c] = aspetto(v), s = v.s, mio = s && puoModificare(s), spunta = s && puoSpuntare(s), ora = oraBreve(s);
  // Allegati della voce (file e note): la graffetta mostra quanti sono e apre l'elenco sotto la voce.
  const [email, setEmail] = useState<'' | 'email' | 'sollecito'>(''), [all, setAll] = useState(false), [ass, setAss] = useState(false), attesa = inAttesa(s) && !s!.fatto, nAll = s ? S.docs.filter(d => d.scadenza_id === s.id).length : 0, docOk = !!s && !docNonDisponibili();
  return (<>
    <div className={`cvoce ${s?.fatto ? 'fatto' : ''}`} style={{ '--vc': c } as React.CSSProperties}>
      {s ? <input type="checkbox" checked={s.fatto} disabled={!spunta} onChange={() => segna(s)} title={spunta ? 'Fatto' : "Solo chi l'ha creata, chi l'ha assegnata o un amministratore"} /> : <i className="vdot" />}
      <div className="vt">
        <b>{ora && <span className="vora">{ora}</span>}{v.titolo}</b>
        <small>{l}{s?.categoria ? ' · ' + s.categoria.toLowerCase() : ''}{data ? <> · {dFmt(v.giorno)} ({quando(v.giorno, oggi, daFare(v) && !s?.fatto)})</> : null}{v.sotto ? ' · ' + v.sotto : ''}
          {s?.assegnata_a ? ' · per ' + nomeDi(s.assegnata_a) : ''}{s?.creato_da ? ' · da ' + nomeDi(s.creato_da) : ''}{s?.origine === 'telegram' ? ' (Telegram)' : ''}</small>
        {s?.nota ? <span className="muted small">{s.nota}</span> : null}
        {v.tipo === 'richiamo' ? <span className="muted small">Offerta inviata da {RICHIAMO}+ giorni senza risposta: quando il cliente risponde, cambia lo stato.</span> : null}
      </div>
      {v.tipo === 'richiamo' && v.prevId && <StatoSel id={v.prevId} k="inviato" />}
      {v.prevId && <button className="btn s" onClick={() => apri(v.prevId!)}>Apri</button>}
      {attesa && spunta && <button className="btn s p" onClick={() => risposta(s!)} title="Segna la voce come fatta, con una nota su cosa hanno risposto">Risposta arrivata</button>}
      {s && online() && !email && <button className="btn s" onClick={() => setEmail(attesa ? 'sollecito' : 'email')} title={attesa ? 'Scrivi un sollecito cortese' : "Scrivi un'email di aggiornamento da questa voce"}>{attesa ? '✉ Sollecita' : '✉ Email'}</button>}
      {docOk && <button className={`btn s${all ? ' on' : ''}`} onClick={() => setAll(!all)} title="File e note allegati alla voce">📎{nAll ? ' ' + nAll : ''}</button>}
      {mio && !s.fatto && cloud.colleghi.length > 0 && !ass && <button className="btn s" onClick={() => setAss(true)} title="Assegna la voce a un collega">👤 {s.assegnata_a ? 'Riassegna' : 'Assegna'}</button>}
      {mio && onEdit && <><button className="btn s" onClick={() => onEdit(s)}>Modifica</button><button className="btn x" onClick={() => togli(s)} title="Elimina">✕</button></>}
    </div>
    {ass && s && <div className="callegati"><Assegna s={s} chiudi={() => setAss(false)} /></div>}
    {email && s && <div className="callegati"><ModuloEmail titolo={s.titolo} testo={s.nota || ''} contesto={contestoEmail(s.preventivo_id, s.id)}
      chiave={s.preventivo_id || s.id} preventivo={s.preventivo_id} chiudi={() => setEmail('')}
      richiesta0={email === 'sollecito' ? 'Sollecito cortese: non abbiamo ancora ricevuto risposta alla nostra email.' : ''} /></div>}
    {all && s && <div className="callegati"><DocPanel scadenza={s.id} preventivo={s.preventivo_id} compatto /></div>}
  </>);
}

/** Riquadro degli allarmi: voci superate, in arrivo nei prossimi giorni, commesse senza data di avvio. */
export function Allarmi({ compatto = false }: { compatto?: boolean }) {
  const oggi = dToday(), { urgenze, scadute, prossime } = allarmi(vociVisibili(), oggi), np = daPianificare(S.arch);
  const tutte = [...urgenze, ...scadute, ...prossime], vis = compatto ? tutte.slice(0, 4) : tutte;
  return (
    <div className="card calarm">
      <h2>Allarmi
        {urgenze.length > 0 && <span className="tag alate">🔴 {urgenze.length} urgenz{urgenze.length === 1 ? 'a' : 'e'}</span>}
        {scadute.length > 0 && <span className="tag alate">{scadute.length} scadut{scadute.length === 1 ? 'a' : 'e'}</span>}
        <span className="tag asoon">{prossime.length} nei prossimi {PREAVVISO} giorni</span>
        {S.ui.calMie && <span className="tag">solo le mie</span>}
        <span className="sp" />
        {compatto && <button className="btn s" onClick={() => mostra(true)}>Mostra calendario</button>}
      </h2>
      {tutte.length ? vis.map(v => <Riga key={v.key} v={v} oggi={oggi} />) : <p className="hint" style={{ margin: 0 }}>Niente di scaduto o in arrivo.</p>}
      {vis.length < tutte.length && <p className="hint" style={{ margin: '6px 0 0' }}>… e altre {tutte.length - vis.length} nel calendario.</p>}
      {!compatto && np.length > 0 && <p className="hint" style={{ margin: '10px 0 0' }}>
        Commesse vinte senza data di avvio della produzione (non compaiono nel calendario): {np.map((e, i) => <span key={e.id}>{i ? ', ' : ''}<a href="#" onClick={ev => { ev.preventDefault(); apri(e.id); }}>{e.nome}</a></span>)}.
        Impostala nel Gantt della scheda Distinta lavorazione.</p>}
    </div>
  );
}

type Bozza = { id?: string; genere: Genere; categoria: string; giorno: string; ora: string; titolo: string; nota: string; preventivo_id: string; assegnata_a: string };
const bozzaDa = (s: Scadenza): Bozza => ({ id: s.id, genere: s.genere || 'attivita', categoria: s.categoria || '', giorno: s.giorno, ora: oraBreve(s), titolo: s.titolo, nota: s.nota || '', preventivo_id: s.preventivo_id || '', assegnata_a: s.assegnata_a || '' });
const ESEMPI: Record<Genere, string> = {
  attivita: 'es. Rifare il computo bulloneria', promemoria: 'es. Richiamare il cliente per il preventivo',
  scadenza: 'es. Consegna documentazione collaudo', appuntamento: 'es. Sopralluogo in cantiere',
  urgenza: 'es. Mancano bulloni in cantiere: preparare il materiale',
};
function Modulo({ b, set, chiudi }: { b: Bozza; set: (b: Bozza) => void; chiudi: () => void }) {
  const [busy, setBusy] = useState(false);
  const vinti = S.arch.filter(e => eStato(e) === 'vinto'), altri = S.arch.filter(e => eStato(e) !== 'vinto');
  const salva = async () => {
    setBusy(true); const e = await salvaScadenza({ ...b, fatto: !!S.scad.find(x => x.id === b.id)?.fatto }); setBusy(false);
    if (e) { toast('Voce non salvata: ' + e); return; }
    toast(b.id ? 'Voce aggiornata' : `${GENERI[b.genere][0]} aggiunt${b.genere === 'attivita' ? 'o' : 'a'}`); chiudi(); commit();
  };
  return (
    <div className="cform">
      <div className="wide seg cgen">{(Object.entries(GENERI) as [Genere, [string, string]][]).map(([k, [l, c]]) =>
        <button key={k} className={b.genere === k ? 'on' : ''} style={{ '--vc': c } as React.CSSProperties} onClick={() => set({ ...b, genere: k })}><i />{l}</button>)}</div>
      <label className="f wide">Cosa<input value={b.titolo} placeholder={ESEMPI[b.genere]} maxLength={200} autoFocus onChange={e => set({ ...b, titolo: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') salva(); }} /></label>
      <label className="f">Giorno<input type="date" value={b.giorno} onChange={e => set({ ...b, giorno: e.target.value })} /></label>
      <label className="f">Ora (facoltativa)<input type="time" value={b.ora} onChange={e => set({ ...b, ora: e.target.value })} /></label>
      <label className="f">Riferita a (facoltativo)<select value={b.preventivo_id} onChange={e => set({ ...b, preventivo_id: e.target.value })}>
        <option value="">— niente —</option>
        {vinti.length > 0 && <optgroup label="Commesse (vinte)">{vinti.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
        {altri.length > 0 && <optgroup label="Preventivi">{altri.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
      </select></label>
      <label className="f">Categoria (facoltativa)<select value={b.categoria} onChange={e => set({ ...b, categoria: e.target.value })}>
        <option value="">— nessuna —</option>{CATEGORIE.map(c => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}
      </select></label>
      {cloud.colleghi.length > 0 ? <label className="f">Per chi (facoltativo)<select value={b.assegnata_a} onChange={e => set({ ...b, assegnata_a: e.target.value })}>
        <option value="">— chiunque —</option>
        {cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}
      </select></label> : null}
      <label className="f wide">Nota (facoltativa)<input value={b.nota} onChange={e => set({ ...b, nota: e.target.value })} /></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !b.titolo.trim() || !b.giorno} onClick={salva}>{b.id ? 'Salva modifiche' : 'Aggiungi'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

function Mese({ ym, sel, setSel, nuova, byDay, oggi }: { ym: { y: number; m: number }; sel: number; setSel: (n: number) => void; nuova: (n: number) => void; byDay: Map<number, Voce[]>; oggi: number }) {
  const first = Date.UTC(ym.y, ym.m, 1) / DAY, last = Date.UTC(ym.y, ym.m + 1, 0) / DAY, a = monday(first), b = monday(last) + 6;
  const giorni = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return (
    <div className="cal">
      {GIORNI.map(g => <div key={g} className="dh">{g}</div>)}
      {giorni.map(n => {
        const vs = byDay.get(n) || [], mese = dDate(n).getUTCMonth() === ym.m;
        return (
          <button key={n} className={`cday${mese ? '' : ' out'}${n === oggi ? ' oggi' : ''}${isWork(n) ? '' : ' fest'}${n === sel ? ' on' : ''}`}
            onClick={() => setSel(n)} onDoubleClick={() => { setSel(n); nuova(n); }} aria-label={`${dFmt(n)}: ${vs.length} voci`}>
            <span className="dn">{dDate(n).getUTCDate()}</span>
            {vs.slice(0, 3).map(v => <span key={v.key} className={`cchip${v.s?.fatto ? ' fatto' : daFare(v) && n < oggi ? ' late' : ''}`}
              style={{ '--vc': aspetto(v)[1] } as React.CSSProperties}>{oraBreve(v.s) && <em>{oraBreve(v.s)}</em>}{v.titolo}</span>)}
            {vs.length > 3 && <span className="cmore">+{vs.length - 3}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Agenda: elenco per giorno; in cima le voci rimaste indietro. Clic sul giorno per il dettaglio a destra.
function Agenda({ vv, oggi, sel, setSel, onEdit }: { vv: Voce[]; oggi: number; sel: number; setSel: (n: number) => void; onEdit: (s: Scadenza) => void }) {
  const { arretrate, avanti } = agenda(vv, oggi), byDay = [...perGiorno(avanti)];
  return (
    <div className="cagenda">
      {arretrate.length > 0 && <div className="agiorno late"><h3>Urgenze e voci rimaste indietro</h3>{arretrate.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} />)}</div>}
      {byDay.length ? byDay.map(([g, vs]) => (
        <div key={g} className={`agiorno${g === sel ? ' on' : ''}`}>
          <h3><button onClick={() => setSel(g)}>{giornoNome(g)}</button>{g === oggi && <span className="tag on">oggi</span>}</h3>
          {vs.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} data={false} />)}
        </div>
      )) : <p className="hint">Niente in programma nei prossimi 30 giorni.</p>}
    </div>
  );
}

export function Calendario() {
  const oggi = dToday(), t = dDate(oggi);
  const [ym, setYm] = useState({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  const [sel, setSel] = useState(oggi);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const vv = vociVisibili(), byDay = perGiorno(vv), mese = S.ui.calV === 'mese';
  const sposta = (d: number) => { const x = new Date(Date.UTC(ym.y, ym.m + d, 1)); setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() }); };
  const nuova = (g = sel) => setBozza({ genere: 'attivita', categoria: '', giorno: isoDay(g), ora: '', titolo: '', nota: '', preventivo_id: '', assegnata_a: '' });
  const modifica = (s: Scadenza) => { setSel(Date.UTC(+s.giorno.slice(0, 4), +s.giorno.slice(5, 7) - 1, +s.giorno.slice(8, 10)) / DAY); setBozza(bozzaDa(s)); };
  const vista = (k: 'mese' | 'agenda') => { S.ui.calV = k; commit(); };
  const delGiorno = byDay.get(sel) || [];
  return (
    <>
      {cloud.scadErr && <div className="warn">L'agenda non si legge dal server ({cloud.scadErr}). Probabilmente manca una migrazione del database
        (<b>20261020000000_calendario_scadenze.sql</b> o <b>20261020010000_agenda.sql</b>): va eseguita nel SQL Editor di Supabase.</div>}
      <Allarmi />
      <div className="calgrid">
        <section className="card">
          <div className="calhead">
            <span className="seg"><button className={mese ? 'on' : ''} onClick={() => vista('mese')}>Mese</button><button className={mese ? '' : 'on'} onClick={() => vista('agenda')}>Agenda</button></span>
            {mese && <>
              <button className="btn s" onClick={() => sposta(-1)} aria-label="Mese precedente">‹</button>
              <h2>{meseNome(ym.y, ym.m)}</h2>
              <button className="btn s" onClick={() => sposta(1)} aria-label="Mese successivo">›</button>
            </>}
            {!mese && <h2>Prossimi 30 giorni</h2>}
            <button className="btn s" onClick={() => { setYm({ y: t.getUTCFullYear(), m: t.getUTCMonth() }); setSel(oggi); }}>Oggi</button>
            <span className="sp" />
            {cloud.session && <span className="seg"><button className={S.ui.calMie ? '' : 'on'} onClick={() => { S.ui.calMie = false; commit(); }}>Tutte</button>
              <button className={S.ui.calMie ? 'on' : ''} onClick={() => { S.ui.calMie = true; commit(); }}>Le mie</button></span>}
            <button className="btn s" onClick={() => mostra(false)} title="Toglie il calendario dalla Home: restano solo gli allarmi">Nascondi calendario</button>
          </div>
          {mese ? <Mese ym={ym} sel={sel} setSel={setSel} nuova={nuova} byDay={byDay} oggi={oggi} /> : <Agenda vv={vv} oggi={oggi} sel={sel} setSel={setSel} onEdit={modifica} />}
          <div className="klegend">
            {(['prod', 'prodFine', 'mont', 'richiamo'] as const).map(k => <span key={k}><i style={{ background: TIPI[k][1] }} />{TIPI[k][0]}</span>)}
            {Object.entries(GENERI).map(([k, [l, c]]) => <span key={k}><i style={{ background: c }} />{l}</span>)}
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>{mese ? 'Clic su un giorno per il dettaglio, doppio clic per aggiungere. ' : ''}Le date delle commesse vengono dal Gantt dei preventivi vinti; il resto si aggiunge a mano, legato o no a un preventivo.</p>
        </section>

        <section className="card">
          <h2>{giornoNome(sel)}<span className="sp" />
            {!bozza && <button className="btn s p" onClick={() => nuova()}>+ Aggiungi</button>}</h2>
          {bozza && <Modulo b={bozza} set={setBozza} chiudi={() => setBozza(null)} />}
          {delGiorno.length ? delGiorno.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={modifica} data={false} />)
            : !bozza && <p className="hint" style={{ margin: 0 }}>Niente in programma.</p>}
        </section>
      </div>
    </>
  );
}

/** In cima alla Home: calendario completo, oppure solo gli allarmi se l'utente l'ha nascosto. */
export const CalendarioHome = () => (S.ui.cal ? <><Calendario /><div className="calsep" /></> : <Allarmi compatto />);

/** Nel preventivo aperto: le sue voci in agenda (date della commessa, richiamo, voci a mano) e l'aggiunta di un promemoria. */
export function AgendaPreventivo() {
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const id = S.prev._id, oggi = dToday();
  if (!id) return <Fold id="cf-agenda" title="Agenda" sum="Salva il preventivo per collegarci promemoria e cose da fare">{() =>
    <p className="hint" style={{ margin: 0 }}>Le voci in agenda si legano a un preventivo salvato nell'archivio.</p>}</Fold>;
  const vv = voci(S.arch, S.scad).filter(v => v.prevId === id), aperte = vv.filter(v => daFare(v) && !v.s?.fatto && v.giorno >= oggi - 365);
  const tardi = aperte.filter(v => v.giorno < oggi).length;
  const nuova = () => setBozza({ genere: 'promemoria', categoria: '', giorno: isoDay(oggi), ora: '', titolo: '', nota: '', preventivo_id: id, assegnata_a: '' });
  return (
    <Fold id="cf-agenda" title="Agenda" sum={vv.length ? `${aperte.length} da fare${tardi ? ` · ${tardi} scadut${tardi === 1 ? 'a' : 'e'}` : ''} · ${vv.length} voc${vv.length === 1 ? 'e' : 'i'} in tutto` : 'Nessuna voce: aggiungi un promemoria'}
      act={!bozza && <button className="btn s p" onClick={nuova}>+ Promemoria</button>}>{() => <>
      {bozza && <Modulo b={bozza} set={setBozza} chiudi={() => setBozza(null)} />}
      {vv.length ? vv.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={s => setBozza(bozzaDa(s))} />)
        : !bozza && <p className="hint" style={{ margin: 0 }}>Niente in agenda per questo preventivo.</p>}
    </>}</Fold>
  );
}
