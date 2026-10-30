// Calendario e agenda in cima alla Home: allarmi, mese (o elenco dei prossimi giorni) con le date delle commesse e le voci
// inserite a mano, dettaglio del giorno scelto. Si nasconde e si rimette con un pulsante (scelta ricordata in questo browser);
// nascosto restano gli allarmi in breve.
import { useEffect, useState } from 'react';
import { ATTESA, CATEGORIE, GENERI, PREAVVISO, RICHIAMO, TIPI, agenda, allarmi, annulliChiesti, aspetto, daConfermare, daFare, daPianificare, fatte, inAttesa, mia, oraBreve, perGiorno, persone, traGiorniLavorativi, voci, vociScadenze, type Genere, type Scadenza, type Voce } from '../domain/calendario';
import { RINVII_TROPPI, STATI, azioni, intatta, nelFlusso, statoDi, type Stato } from '../domain/flusso';
import { messaggiDi } from '../domain/squadra';
import { ChevBarra, Fold, barraAperta, clicBarra } from '../components/ui';
import { StatoSel } from './Cruscotto';
import { eStato } from '../domain/kpi';
import { DAY, dDate, dFmt, dToday, isWork, isoDay, monday } from '../domain/plan';
import { S, commit } from '../store/state';
import { archOpen, toast } from '../store/actions';
import { DocPanel, ModuloNota, NoteHome, docNonDisponibili, notaVuota, type Nota } from './Documenti';
import { ModuloEmail, contestoEmail } from '../components/Email';
import { PermessoAvvisi } from '../components/AvvisiRiunioni';
import { linkRiunione } from '../domain/riunione';
import { Discuti } from '../components/Collegamento';
import { MappaReparti, SceltaSettori } from '../components/MappaReparti';
import { Smistamento } from '../components/Smistamento';
import { InArrivo } from '../components/InArrivo';
import { REPARTI, SMISTARE, nomeReparto, nomeSettoreMappa, repartiVoce, settoriDi } from '../domain/reparti';
import { cambiaStato, cloud, coinvoltiDisponibili, eliminaScadenza, flussoDisponibile, isAdmin, squadra, storicoVoce, type Evento, repartiDi, repartiVociDisponibili, settoriDisponibili, settorePrev, miaVista, mioEmail, online, puoModificare, puoSpuntare, riassumiRisposta, salvaNota, salvaScadenza, salvaVista, spuntaScadenza, type Utente } from '../store/remote';
import { VISTA_TUTTO, filtraVista, normVista, vedeTutto, type Quanto, type Vista } from '../domain/vista';
import { Ic, IcReparto } from '../components/Icona';

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
const segna = async (s: Scadenza) => {
  const e = await spuntaScadenza(s);
  toast(e ? 'Voce non aggiornata: ' + e : s.fatto ? 'Rimessa in agenda' : 'Fatta: la ritrovi in Archivio attività'); commit();
};
const togli = async (s: Scadenza) => {
  if (!confirm(`Eliminare "${s.titolo}"?`)) return;
  const e = await eliminaScadenza(s.id); if (e) toast('Voce non eliminata: ' + e); commit();
};
// Risposta a un'email arrivata: la voce «Attesa risposta» diventa fatta, con la nota su cosa hanno risposto.
// Si può incollare l'email intera: l'AI scrive il riassunto per la voce e l'email resta come appunto legato alla voce.
function RispostaArrivata({ s, chiudi }: { s: Scadenza; chiudi: () => void }) {
  const [testo, setTesto] = useState(''), [riass, setRiass] = useState(''), [salvaEmail, setSalvaEmail] = useState(true), [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const lunga = testo.trim().length > 300;
  const riassumi = async () => {
    setBusy('riassumo'); setErr('');
    try { const r = await riassumiRisposta(testo); setRiass(r.riassunto || r.titolo); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  const conferma = async () => {
    setBusy('salvo'); setErr('');
    const cosa = (riass || (lunga ? '' : testo)).trim();
    const nota = [s.nota, cosa && `Risposta del ${dFmt(dToday())}: ${cosa}`].filter(Boolean).join('\n');
    const e = await salvaScadenza({ ...s, nota, fatto: true, esito: cosa || 'Risposta arrivata' });
    if (e) { setErr('Voce non aggiornata: ' + e); setBusy(''); return; }
    if (lunga && salvaEmail) {
      const r = await salvaNota({ titolo: 'Risposta: ' + s.titolo.replace(ATTESA, ''), testo: testo.trim(), cartella: s.preventivo_id ? 'cliente' : 'altro', etichette: [],
        preventivo_id: s.preventivo_id || null, scadenza_id: s.id });
      if (r.errore) toast('Voce fatta, ma email non salvata: ' + r.errore);
    }
    toast('✓ Risposta registrata'); commit(); chiudi();
  };
  return (
    <div className="cform">
      <label className="f wide">Cosa hanno risposto <span className="muted small">(facoltativo: due parole, oppure incolla qui l'email intera)</span>
        <textarea rows={lunga ? 8 : 3} autoFocus value={testo} onChange={e => setTesto(e.target.value)} placeholder="es. Confermano l'ordine, consegna entro il 20" /></label>
      {lunga && <>
        <div className="wide" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!busy} onClick={riassumi}>{busy === 'riassumo' ? 'Riassumo…' : '✦ Riassumi con AI'}</button>
          <label className="chk"><input type="checkbox" checked={salvaEmail} onChange={e => setSalvaEmail(e.target.checked)} /> Salva l'email intera come appunto della voce</label>
        </div>
        <label className="f wide">Riassunto per la voce<textarea rows={4} value={riass} onChange={e => setRiass(e.target.value)} placeholder="Premi «✦ Riassumi con AI» o scrivilo tu" /></label>
      </>}
      {err && <div className="warn wide">{err}</div>}
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={!!busy} onClick={conferma}>{busy === 'salvo' ? 'Salvo…' : 'Segna fatta'}</button>
        <button className="btn" disabled={!!busy} onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}
/* ---------- Flusso fino alla chiusura (domain/flusso.ts) ---------- */
// La voce segue il flusso se è una cosa da fare, una scadenza o un'urgenza e il database ha la migrazione del flusso.
const conFlusso = (s?: Scadenza | null) => !!s && nelFlusso(s) && flussoDisponibile();
const nAllegati = (s: Scadenza) => S.docs.filter(d => d.scadenza_id === s.id).length;
const nMessaggi = (s: Scadenza) => messaggiDi(squadra.mm, { tipo: 'voce', id: s.id }).length;
const azioniDi = (s: Scadenza) => azioni(s, mioEmail(), isAdmin(), intatta(s, nAllegati(s), nMessaggi(s)));
const passa = async (s: Scadenza, patch: Partial<Scadenza>, ok: string) => {
  const e = await cambiaStato(s, patch, nAllegati(s), nMessaggi(s));
  toast(e ? 'Voce non aggiornata: ' + e : ok); commit(); return !e;
};
const prendi = (s: Scadenza) => passa(s, { stato: 'in_corso', ...(s.assegnata_a ? {} : { assegnata_a: mioEmail() }) }, 'Presa in carico: la voce è in corso');
const conferma = (s: Scadenza) => passa(s, { stato: 'chiusa' }, 'Chiusura confermata: la voce è chiusa');
const dIso = (iso: string) => dFmt(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
/** Riga breve sullo stato del flusso, accanto al tipo della voce. */
function statoBreve(s: Scadenza) {
  const st = statoDi(s), r = s.rinvii || 0, out: string[] = [];
  if (st === 'in_attesa') out.push(`in attesa${s.attesa_di ? ' di ' + s.attesa_di : ''}${s.sollecito ? ', sollecito il ' + dIso(s.sollecito) : ''}`);
  else if (st !== 'aperta') out.push(STATI[st].toLowerCase());
  if (r) out.push(`rinviata ${r} volt${r === 1 ? 'a' : 'e'}`);
  if (s.annullo_chiesto && !s.fatto) out.push('annullamento chiesto');
  return out.join(' · ');
}

type Passo = 'attesa' | 'fatta' | 'riapri' | 'annulla' | 'chiedi' | 'rifiuta';
// [titolo, pulsante, campo di testo, testo obbligatorio]
const PASSI: Record<Passo, [string, string, string, boolean]> = {
  attesa: ['In attesa: di chi e quando sollecitare', 'Metti in attesa', 'Nota (facoltativa)', false],
  fatta: ["Fatta: com'è andata?", 'Segna fatta', 'Esito', true],
  riapri: ['Riapri la voce', 'Riapri', 'Motivo', true],
  annulla: ['Annulla la voce', 'Annulla la voce', 'Motivo', true],
  chiedi: ["Chiedi all'amministratore di annullarla", 'Chiedi annullamento', 'Motivo', true],
  rifiuta: ['Non annullare: la voce resta in agenda', 'Resta in agenda', 'Motivo (facoltativo)', false],
};
/** Modulo di un passaggio del flusso: attesa (di chi + sollecito), fatta (esito obbligatorio + seguito), riapri, annulla, richiesta di annullamento. */
function Passaggio({ s, passo, chiudi }: { s: Scadenza; passo: Passo; chiudi: () => void }) {
  const [titolo, bottone, campo, serve] = PASSI[passo];
  const [testo, setTesto] = useState(''), [chi, setChi] = useState(s.attesa_di || ''), [soll, setSoll] = useState(s.sollecito || isoDay(traGiorniLavorativi(3)));
  const [seguito, setSeguito] = useState(false), [busy, setBusy] = useState(false);
  const [sg, setSg] = useState({ titolo: 'Seguito: ' + s.titolo.slice(0, 180), giorno: isoDay(traGiorniLavorativi(5)), assegnata_a: s.assegnata_a || '' });
  const manca = (serve && !testo.trim()) || (passo === 'attesa' && (!chi.trim() || !soll)) || (seguito && (!sg.titolo.trim() || !sg.giorno));
  const fai = async () => {
    setBusy(true);
    const t = testo.trim() || null;
    const patch: Partial<Scadenza> = passo === 'attesa' ? { stato: 'in_attesa', attesa_di: chi.trim(), sollecito: soll, motivo: t }
      : passo === 'fatta' ? { stato: 'fatta', esito: t }
      : passo === 'riapri' ? { stato: s.assegnata_a ? 'in_corso' : 'aperta', motivo: t }
      : passo === 'annulla' ? { stato: 'annullata', motivo: t }
      : passo === 'chiedi' ? { annullo_chiesto: t } : { annullo_chiesto: null, motivo: t };
    const ok = {
      attesa: `In attesa di ${chi.trim()}: torna negli allarmi il ${dIso(soll)}`,
      fatta: s.creato_da === mioEmail() ? 'Fatta e chiusa: la ritrovi in Archivio attività' : `Fatta: ${nomeDi(s.creato_da)} deve confermare la chiusura`,
      riapri: 'Voce riaperta: è di nuovo in agenda', annulla: 'Voce annullata: la ritrovi in Archivio attività',
      chiedi: "Richiesta mandata: decide l'amministratore", rifiuta: 'La voce resta in agenda',
    }[passo];
    if (!(await passa(s, patch, ok))) { setBusy(false); return; }
    if (passo === 'fatta' && seguito) {
      const e = await salvaScadenza({ genere: s.genere === 'urgenza' ? 'attivita' : s.genere, titolo: sg.titolo, giorno: sg.giorno, assegnata_a: sg.assegnata_a || null,
        coinvolti: s.coinvolti || [], preventivo_id: s.preventivo_id, reparti: s.reparti || [], settori: s.settori || [], seguito_di: s.id });
      toast(e ? 'Voce fatta, ma seguito non creato: ' + e : 'Fatta, con il seguito in agenda il ' + dIso(sg.giorno)); commit();
    }
    chiudi();
  };
  return (
    <div className="cform">
      <b className="wide">{titolo}</b>
      {passo === 'attesa' && <>
        <label className="f">Di chi<input value={chi} autoFocus maxLength={120} placeholder="es. fornitore zincatura, cliente, un collega" onChange={e => setChi(e.target.value)} /></label>
        <label className="f">Sollecitare il<input type="date" value={soll} onChange={e => setSoll(e.target.value)} /></label>
        <p className="hint wide" style={{ margin: 0 }}>Fino a quel giorno la voce non scade e non lampeggia; poi torna negli allarmi per il sollecito.</p>
      </>}
      <label className="f wide">{campo}
        <textarea rows={2} autoFocus={passo !== 'attesa'} value={testo} maxLength={1000} onChange={e => setTesto(e.target.value)}
          placeholder={passo === 'fatta' ? 'Una riga: es. Ordine confermato, consegna il 20' : passo === 'attesa' ? 'es. Chiesto il certificato via email' : ''} /></label>
      {passo === 'fatta' && <>
        <label className="chk wide"><input type="checkbox" checked={seguito} onChange={e => setSeguito(e.target.checked)} /> Serve un seguito? Crea una voce collegata a questa</label>
        {seguito && <>
          <label className="f wide">Cosa<input value={sg.titolo} maxLength={200} onChange={e => setSg({ ...sg, titolo: e.target.value })} /></label>
          <label className="f">Giorno<input type="date" value={sg.giorno} onChange={e => setSg({ ...sg, giorno: e.target.value })} /></label>
          {cloud.colleghi.length > 0 && <label className="f">Per chi<select value={sg.assegnata_a} onChange={e => setSg({ ...sg, assegnata_a: e.target.value })}>
            <option value="">— chiunque —</option>
            {cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}</select></label>}
        </>}
      </>}
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || manca} onClick={fai}>{busy ? 'Salvo…' : bottone}</button>
        <button className="btn" disabled={busy} onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

const EVENTO: Record<string, string> = { annullo_chiesto: 'Chiesto annullamento', annullo_rifiutato: 'Annullamento non concesso', email: 'Email' };
/** Storico dei passaggi della voce: quando, cosa, chi. */
function Storico({ s }: { s: Scadenza }) {
  const [ee, setEe] = useState<Evento[] | null>(null);
  useEffect(() => { let vivo = true; storicoVoce(s.id).then(x => { if (vivo) setEe(x); }); return () => { vivo = false; }; }, [s.id, s.stato, s.passaggi]);
  if (!ee?.length) return null;
  const cosa = (e: Evento) => e.cosa === 'stato' ? (e.da === 'fatta' && e.a === 'chiusa' ? 'Chiusura confermata' : STATI[e.a as Stato] || e.a)
    : e.cosa === 'rinvio' ? `Rinviata dal ${dIso(e.da!)} al ${dIso(e.a!)}` : EVENTO[e.cosa] || e.cosa;
  return (
    <div className="cstorico">
      <b><Ic n="storico" />Storico</b>
      <ol>{ee.map(e => <li key={e.id}><span className="muted">{new Date(e.quando).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        {' '}<b>{cosa(e)}</b>{e.chi ? ' · ' + nomeDi(e.chi) : ' · da Telegram o email'}{e.testo ? <> — {e.testo}</> : null}</li>)}</ol>
    </div>
  );
}

// Voci visibili: prima la scelta personale «Cosa vedo», poi con "Le mie" solo quelle create da me o assegnate a me.
// Le fatte stanno nell'Archivio attività.
const soloMie = (vv: Voce[]) => { const me = mioEmail(), x = filtraVista(vv, miaVista(), me); return S.ui.calMie && me ? x.filter(v => mia(v, me)) : x; };
export const vociVisibili = () => soloMie(voci(S.arch, S.scad));
/** Voci della Home: con un reparto scelto nella mappa, solo le sue, e con un settore (pallino) solo quelle del settore
 *  (il numerino del menu resta su tutte). */
const vociHome = () => {
  const vv = vociVisibili(), r = S.ui.rep, st = r && S.ui.repSet;
  return r ? vv.filter(v => repartiVoce(v, repartiDi).includes(r) && (!st || settoriDi(v.s?.settori, v.prevId, settorePrev).includes(st))) : vv;
};
/** Voci scadute e non fatte, per il numerino sulla voce Home del menu. */
export const nScadute = () => { const a = allarmi(vociVisibili(), dToday()); return a.urgenze.length + a.scadute.length; };

const stesse = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
/** Colleghi coinvolti in una voce: la vedono come fosse loro, la possono segnare fatta e aggiungerle note. */
function Coinvolti({ val, set, escludi }: { val: string[]; set: (v: string[]) => void; escludi: string }) {
  if (!coinvoltiDisponibili()) return null;
  const altri = cloud.colleghi.filter(u => u.email !== escludi);
  if (!altri.length) return null;
  return (
    <div className="f wide"><span>Coinvolti (facoltativo): vedono la voce, la possono segnare fatta e aggiungere note</span>
      <div className="cpers">{altri.map(u => <label key={u.email} className={val.includes(u.email) ? 'on' : ''}>
        <input type="checkbox" checked={val.includes(u.email)} onChange={e => set(e.target.checked ? [...val, u.email] : val.filter(x => x !== u.email))} />
        {u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</label>)}</div>
    </div>
  );
}

// Assegnazione rapida di una voce a un collega (o a nessuno) e ai coinvolti, senza aprire Modifica.
function Assegna({ s, chiudi }: { s: Scadenza; chiudi: () => void }) {
  const [a, setA] = useState(s.assegnata_a || ''), [co, setCo] = useState<string[]>(s.coinvolti || []), [busy, setBusy] = useState(false);
  const fai = async () => {
    setBusy(true); const e = await salvaScadenza({ ...s, assegnata_a: a || null, coinvolti: co }); setBusy(false);
    if (e) { toast('Voce non assegnata: ' + e); return; }
    const chi = persone({ ...s, assegnata_a: a || null, coinvolti: co }).map(nomeDi).join(', ');
    toast(chi ? `Voce per ${chi}: la trovano in «Le mie»` : 'Assegnazione tolta'); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Assegna a<select value={a} autoFocus onChange={e => setA(e.target.value)}>
        <option value="">— chiunque —</option>
        {cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}</select></label>
      <Coinvolti val={co.filter(x => x !== a)} set={setCo} escludi={a} />
      <div className="f" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <button className="btn p" disabled={busy || (a === (s.assegnata_a || '') && stesse(co, s.coinvolti || []))} onClick={fai}>{busy ? 'Salvo…' : 'Assegna'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

// qui = Modifica apre il modulo sotto la voce, al suo posto (Allarmi e Appuntamenti), invece che nella colonna del giorno.
// aperta = la voce parte già aperta per intero (finestra della ricerca).
function Riga({ v, oggi, onEdit, data = true, allarme = '', qui = false, aperta = false }: { v: Voce; oggi: number; onEdit?: (s: Scadenza) => void; data?: boolean; allarme?: '' | 'late' | 'soon'; qui?: boolean; aperta?: boolean }) {
  const [l, c] = aspetto(v), s = v.s, mio = s && puoModificare(s), spunta = s && puoSpuntare(s), ora = oraBreve(s), link = s && !s.fatto ? linkRiunione(s.nota) : '';
  // Allegati della voce (file e note): la graffetta mostra quanti sono e apre l'elenco sotto la voce.
  const [email, setEmail] = useState<'' | 'email' | 'sollecito'>(''), [vedi, setVedi] = useState(aperta), [risp, setRisp] = useState(false), [mod, setMod] = useState<Bozza | null>(null), [ass, setAss] = useState(false), attesa = inAttesa(s) && !s!.fatto, nAll = s ? S.docs.filter(d => d.scadenza_id === s.id).length : 0, docOk = !!s && !docNonDisponibili();
  // Flusso: la spunta apre la chiusura con l'esito (o la riapertura con il motivo); gli altri passaggi hanno i loro pulsanti.
  const [passo, setPasso] = useState<Passo | null>(null), fl = conFlusso(s), az = fl ? azioniDi(s!) : null, sb = fl ? statoBreve(s!) : '';
  const puoSpunta = az ? (s!.fatto ? az.riapri : az.fatta) : spunta;
  return (<>
    <div className={`cvoce ${s?.fatto ? 'fatto' : ''} ${allarme ? 'blink ' + allarme : ''}`} style={{ '--vc': c } as React.CSSProperties}>
      {s ? <input type="checkbox" checked={s.fatto} disabled={!puoSpunta} onChange={() => (fl ? setPasso(s.fatto ? 'riapri' : 'fatta') : segna(s))}
        title={puoSpunta ? (fl ? (s.fatto ? 'Riapri la voce' : "Segna fatta, con l'esito") : 'Fatto') : fl && s.fatto ? "La riaprono solo chi l'ha creata e l'amministratore" : "Solo chi l'ha creata, chi l'ha assegnata o un amministratore"} /> : <i className="vdot" />}
      <div className={`vt${s ? ' apri' : ''}`} onClick={s ? () => setVedi(!vedi) : undefined} title={s ? (vedi ? 'Chiudi' : 'Apri la voce per intero, con le note e i file allegati') : undefined}>
        <b>{ora && <span className="vora">{ora}</span>}{v.titolo}</b>
        <small>{l}{s?.categoria ? ' · ' + s.categoria.toLowerCase() : ''}{data ? <> · {dFmt(v.giorno)} ({quando(v.giorno, oggi, daFare(v) && !s?.fatto)})</> : null}{v.sotto ? ' · ' + v.sotto : ''}
          {s?.assegnata_a ? ' · per ' + nomeDi(s.assegnata_a) : ''}{s?.coinvolti?.length ? ' · con ' + s.coinvolti.map(nomeDi).join(', ') : ''}{s?.creato_da ? ' · da ' + nomeDi(s.creato_da) : ''}{s?.origine === 'telegram' ? ' (Telegram)' : ''}
          {sb && <> · <span className={(s!.rinvii || 0) >= RINVII_TROPPI || s!.annullo_chiesto ? 'vstato warn' : 'vstato'}>{sb}</span></>}</small>
        {s?.nota && !vedi ? <span className="muted small vnota">{s.nota}</span> : null}
        {s?.esito && !vedi ? <span className="small vnota"><b>Esito:</b> {s.esito}</span> : null}
        {v.tipo === 'richiamo' ? <span className="muted small">Offerta inviata da {RICHIAMO}+ giorni senza risposta: quando il cliente risponde, cambia lo stato.</span> : null}
      </div>
      {v.tipo === 'richiamo' && v.prevId && <StatoSel id={v.prevId} k="inviato" />}
      {link && <a className="btn s p" href={link} target="_blank" rel="noopener noreferrer" title={link}><Ic n="video" />Entra</a>}
      {v.prevId && <button className="btn s" onClick={() => apri(v.prevId!)} title={'Apre il preventivo nel configuratore: ' + (S.arch.find(e => e.id === v.prevId)?.nome || '')}>Apri preventivo</button>}
      {s && <Discuti r={{ tipo: 'voce', id: s.id }} stanza={s.preventivo_id || null} />}
      {az?.prendi && <button className="btn s p" onClick={() => prendi(s!)} title="Prendi in carico la voce: diventa «in corso»"><Ic n="prendo" />La prendo io</button>}
      {az?.attesa && passo !== 'attesa' && <button className="btn s" onClick={() => setPasso('attesa')} title="Aspetti qualcuno: di chi e quando sollecitare (fino ad allora non scade)"><Ic n="attesa" />{statoDi(s!) === 'in_attesa' ? 'Cambia attesa' : 'In attesa'}</button>}
      {az?.conferma && <><button className="btn s p" onClick={() => conferma(s!)} title="La voce è fatta davvero: chiudila"><Ic n="conferma" />Confermo</button>
        <button className="btn s" onClick={() => setPasso('riapri')} title="Non è fatta: rimettila in agenda con il motivo"><Ic n="riapri" />Riapri</button></>}
      {az?.decidiAnnullo && <><button className="btn s" onClick={() => setPasso('annulla')} title={'Richiesta: ' + s!.annullo_chiesto}><Ic n="annulla" />Annulla voce</button>
        <button className="btn s" onClick={() => setPasso('rifiuta')}>Resta in agenda</button></>}
      {attesa && spunta && !risp && <button className="btn s p" onClick={() => setRisp(true)} title="Segna la voce come fatta, con una nota su cosa hanno risposto (anche incollando l'email)">Risposta arrivata</button>}
      {s && online() && !email && <button className="btn s" onClick={() => setEmail(attesa ? 'sollecito' : 'email')} title={attesa ? 'Scrivi un sollecito cortese' : "Scrivi un'email di aggiornamento da questa voce"}><Ic n="email" />{attesa ? 'Sollecita' : 'Email'}</button>}
      {s && <button className={`btn s${vedi ? ' on' : ''}`} onClick={() => setVedi(!vedi)} title="Vedi la voce per intero, con le note e i file allegati"><Ic n="vedi" />Vedi{nAll ? <> · <Ic n="allega" />{nAll}</> : ''}</button>}
      {mio && !s.fatto && cloud.colleghi.length > 0 && !ass && <button className="btn s" onClick={() => setAss(true)} title="Assegna la voce a un collega"><Ic n="persona" />{s.assegnata_a ? 'Riassegna' : 'Assegna'}</button>}
      {mio && (qui || onEdit) && !mod && <><button className="btn s" onClick={() => qui ? setMod(bozzaDa(s)) : onEdit!(s)}>Modifica</button>
        {(!az || az.elimina) && <button className="btn x" onClick={() => togli(s)} title="Elimina">✕</button>}</>}
    </div>
    {passo && s && <div className="callegati"><Passaggio s={s} passo={passo} chiudi={() => setPasso(null)} /></div>}
    {mod && <div className="callegati"><Modulo b={mod} set={setMod} chiudi={() => setMod(null)} /></div>}
    {risp && s && <div className="callegati"><RispostaArrivata s={s} chiudi={() => setRisp(false)} /></div>}
    {ass && s && <div className="callegati"><Assegna s={s} chiudi={() => setAss(false)} /></div>}
    {email && s && <div className="callegati"><ModuloEmail titolo={s.titolo} testo={s.nota || ''} contesto={contestoEmail(s.preventivo_id, s.id)}
      chiave={s.preventivo_id || s.id} preventivo={s.preventivo_id} chiudi={() => setEmail('')}
      richiesta0={email === 'sollecito' ? 'Sollecito cortese: non abbiamo ancora ricevuto risposta alla nostra email.' : ''} /></div>}
    {vedi && s && <div className="callegati"><Scheda s={s} onPasso={setPasso} />{docOk && <DocPanel scadenza={s.id} preventivo={s.preventivo_id} compatto />}</div>}
  </>);
}

/** Una voce d'agenda aperta per intero, con nota, allegati e Modifica sul posto: la finestra della ricerca (components/SchedaAperta). */
export function VoceScheda({ s }: { s: Scadenza }) {
  const v = vociScadenze([s], S.arch)[0];
  return v ? <Riga v={v} oggi={dToday()} qui aperta /> : <p className="hint">La voce non ha una data valida.</p>;
}

/** La voce per intero, in sola lettura: per chi non la può modificare e per non dover entrare in Modifica. */
function Scheda({ s, onPasso }: { s: Scadenza; onPasso: (p: Passo) => void }) {
  const prev = s.preventivo_id ? S.arch.find(e => e.id === s.preventivo_id)?.nome : '', fl = conFlusso(s), az = fl ? azioniDi(s) : null, st = statoDi(s);
  const padre = s.seguito_di ? S.scad.find(x => x.id === s.seguito_di) : null, figli = S.scad.filter(x => x.seguito_di === s.id);
  const righe: [string, React.ReactNode][] = [
    ['Tipo', (inAttesa(s) ? 'In attesa di risposta' : GENERI[s.genere]?.[0] || '') + (s.categoria ? ' · ' + s.categoria.toLowerCase() : '')],
    ['Quando', dFmt(Date.UTC(+s.giorno.slice(0, 4), +s.giorno.slice(5, 7) - 1, +s.giorno.slice(8, 10)) / DAY) + (oraBreve(s) ? ' alle ' + oraBreve(s) : '')],
    ['Riferita a', prev || ''], ['Per', s.assegnata_a ? nomeDi(s.assegnata_a) : ''], ['Coinvolti', (s.coinvolti || []).map(nomeDi).join(', ')],
    ['Creata da', nomeDi(s.creato_da) + (s.origine === 'telegram' ? ' (Telegram)' : '') + (s.creato ? ' il ' + new Date(s.creato).toLocaleDateString('it-IT') : '')],
    ['Stato', fl ? STATI[st] : s.fatto ? '✓ fatta' : 'da fare'],
    ['Esito', s.esito || ''],
    ['In attesa di', st === 'in_attesa' ? (s.attesa_di || '') + (s.sollecito ? ' · sollecito il ' + dIso(s.sollecito) : '') : ''],
    ['Rinvii', s.rinvii ? String(s.rinvii) + ((s.rinvii || 0) >= RINVII_TROPPI ? ' (troppi: va guardata)' : '') : ''],
    ['Annullamento', s.annullo_chiesto && !s.fatto ? `chiesto${s.annullo_da ? ' da ' + nomeDi(s.annullo_da) : ''}: ${s.annullo_chiesto}` : ''],
    ['Seguito di', padre ? padre.titolo + (padre.esito ? ' — ' + padre.esito : '') : ''],
    ['Seguiti', figli.map(x => x.titolo + (x.fatto ? ' ✓' : '')).join(' · ')],
  ];
  return (
    <div className="cscheda">
      <b>{s.titolo}</b>
      <dl>{righe.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {s.nota ? <p className="cnota">{s.nota}</p> : <p className="muted small" style={{ margin: 0 }}>Nessuna nota sulla voce.</p>}
      {!puoModificare(s) && <p className="hint" style={{ margin: 0 }}>La voce la modificano solo chi l'ha creata e l'amministratore{puoSpuntare(s) ? ': tu puoi segnarla fatta e aggiungere note qui sotto' : ''}.</p>}
      {az && (az.annulla || az.chiediAnnullo || (az.riapri && st !== 'fatta')) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {az.riapri && st !== 'fatta' && <button className="btn s" onClick={() => onPasso('riapri')}><Ic n="riapri" />Riapri</button>}
        {az.annulla && <button className="btn s" onClick={() => onPasso('annulla')} title={isAdmin() ? 'Annulla la voce, con il motivo' : 'La voce è ancora intatta: la puoi annullare tu'}><Ic n="annulla" />Annulla la voce</button>}
        {az.chiediAnnullo && <button className="btn s" onClick={() => onPasso('chiedi')} title="La voce ha già dei passaggi: decide l'amministratore"><Ic n="annulla" />Chiedi annullamento</button>}
      </div>}
      {fl && <Storico s={s} />}
    </div>
  );
}

/** Riquadro degli allarmi: voci superate, in arrivo nei prossimi giorni, commesse senza data di avvio. */
export function Allarmi({ onEdit }: { onEdit?: (s: Scadenza) => void }) {
  const oggi = dToday(), { urgenze, scadute, prossime } = allarmi(vociHome(), oggi), np = daPianificare(S.arch);
  const tutte = [...urgenze, ...scadute, ...prossime], ap = barraAperta('allarmi');
  // Flusso: voci fatte da altri che aspettano la mia conferma; per l'amministratore, le richieste di annullamento.
  const conf = flussoDisponibile() ? vociScadenze(daConfermare(S.scad, mioEmail()), S.arch) : [];
  const ann = flussoDisponibile() && isAdmin() && cloud.session ? vociScadenze(annulliChiesti(S.scad), S.arch) : [];
  return (
    <div className={`card calarm${ap ? '' : ' chiusa'}`}>
      <h2 className="hbh" onClick={clicBarra('allarmi')}>Allarmi
        {urgenze.length > 0 && <span className="tag alate"><Ic n="attenzione" s={12} />{urgenze.length} urgenz{urgenze.length === 1 ? 'a' : 'e'}</span>}
        {scadute.length > 0 && <span className="tag alate">{scadute.length} scadut{scadute.length === 1 ? 'a' : 'e'}</span>}
        {conf.length > 0 && <span className="tag on">{conf.length} da confermare</span>}
        {ann.length > 0 && <span className="tag alate">{ann.length} annullament{ann.length === 1 ? 'o' : 'i'} da decidere</span>}
        <span className="tag asoon">{prossime.length} nei prossimi {PREAVVISO} giorni</span>
        {S.ui.calMie && <span className="tag">solo le mie</span>}
        {S.ui.rep && <span className="tag on">{nomeReparto(S.ui.rep)}{S.ui.repSet && ` · ${nomeSettoreMappa(S.ui.repSet)}`}</span>}
        <span className="sp" />
        <ChevBarra k="allarmi" />
      </h2>
      {ap && <>
      {ann.length > 0 && <div className="agiorno late"><h3>Annullamenti chiesti: decidi tu</h3>{ann.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} qui />)}</div>}
      {conf.length > 0 && <div className="agiorno"><h3>Fatte dai colleghi: conferma la chiusura o riapri</h3>{conf.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} qui />)}</div>}
      {tutte.length ? tutte.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} qui allarme={prossime.includes(v) ? 'soon' : 'late'} />) : <p className="hint" style={{ margin: 0 }}>Niente di scaduto o in arrivo.</p>}
      {np.length > 0 && <p className="hint" style={{ margin: '10px 0 0' }}>
        Commesse vinte senza data di avvio della produzione (non compaiono nel calendario): {np.map((e, i) => <span key={e.id}>{i ? ', ' : ''}<a href="#" onClick={ev => { ev.preventDefault(); apri(e.id); }}>{e.nome}</a></span>)}.
        Impostala nel Gantt della scheda Distinta lavorazione.</p>}
      </>}
    </div>
  );
}

type Bozza = { id?: string; genere: Genere; categoria: string; giorno: string; ora: string; titolo: string; nota: string; preventivo_id: string; assegnata_a: string; coinvolti: string[]; reparti?: string[]; settori?: string[]; motivo?: string };
const bozzaDa = (s: Scadenza): Bozza => ({ id: s.id, genere: s.genere || 'attivita', categoria: s.categoria || '', giorno: s.giorno, ora: oraBreve(s), titolo: s.titolo, nota: s.nota || '', preventivo_id: s.preventivo_id || '', assegnata_a: s.assegnata_a || '', coinvolti: s.coinvolti || [], reparti: s.reparti || [], settori: s.settori || [] });
const ESEMPI: Record<Genere, string> = {
  attivita: 'es. Rifare il computo bulloneria', promemoria: 'es. Richiamare il cliente per il preventivo',
  scadenza: 'es. Consegna documentazione collaudo', appuntamento: 'es. Sopralluogo in cantiere',
  urgenza: 'es. Mancano bulloni in cantiere: preparare il materiale',
};
function Modulo({ b, set, chiudi }: { b: Bozza; set: (b: Bozza) => void; chiudi: () => void }) {
  const [busy, setBusy] = useState(false);
  const vinti = S.arch.filter(e => eStato(e) === 'vinto'), altri = S.arch.filter(e => eStato(e) !== 'vinto');
  // Rinvio: la voce era già arrivata alla sua data (o scaduta) e la si sposta più avanti: serve il motivo, che resta nello storico.
  const prima = b.id ? S.scad.find(x => x.id === b.id) : null;
  const rinvio = !!prima && conFlusso(prima) && !prima.fatto && b.giorno > prima.giorno && prima.giorno <= isoDay(dToday());
  const salva = async () => {
    if (rinvio && !b.motivo?.trim()) { toast('Scrivi perché la rinvii'); return; }
    setBusy(true); const e = await salvaScadenza({ ...b, fatto: !!prima?.fatto, motivo: rinvio ? b.motivo!.trim() : null }); setBusy(false);
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
      {rinvio && <label className="f wide">Perché la rinvii{(prima!.rinvii || 0) >= RINVII_TROPPI - 1 ? ` (è già stata rinviata ${prima!.rinvii} volt${prima!.rinvii === 1 ? 'a' : 'e'})` : ''}
        <input value={b.motivo || ''} maxLength={300} placeholder="es. Il fornitore ha spostato la consegna" onChange={e => set({ ...b, motivo: e.target.value })} /></label>}
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
      <Coinvolti val={b.coinvolti.filter(x => x !== b.assegnata_a)} set={c => set({ ...b, coinvolti: c })} escludi={b.assegnata_a} />
      {repartiVociDisponibili() && <div className="f wide">Reparti <span className="muted small">(facoltativo: se non ne scegli, quelli di chi la deve fare)</span>
        <div className="etqs">{REPARTI.map(r => { const on = (b.reparti || []).includes(r.k); return (
          <button key={r.k} type="button" className={`etq${on ? ' on' : ''}`} onClick={() => set({ ...b, reparti: on ? (b.reparti || []).filter(x => x !== r.k) : [...(b.reparti || []), r.k] })}><IcReparto k={r.k} />{r.nome}</button>); })}</div></div>}
      {settoriDisponibili() && <div className="f wide">Settori <span className="muted small">(facoltativo: se non ne scegli, quello del preventivo collegato)</span>
        <SceltaSettori val={b.settori || []} set={x => set({ ...b, settori: x })} /></div>}
      <label className="f wide">Nota (facoltativa)<textarea rows={3} value={b.nota} onChange={e => set({ ...b, nota: e.target.value })} /></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !b.titolo.trim() || !b.giorno || (rinvio && !b.motivo?.trim())} onClick={salva}>{b.id ? 'Salva modifiche' : 'Aggiungi'}</button>
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

/** mappa: subito sotto il calendario, anche sul telefono (prima della colonna del giorno); sotto: il resto della Home. */
export function Calendario({ mappa, sotto }: { mappa?: React.ReactNode; sotto?: (onEdit: (s: Scadenza) => void) => React.ReactNode }) {
  const oggi = dToday(), t = dDate(oggi);
  const [ym, setYm] = useState({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  const [sel, setSel] = useState(oggi);
  const [bozza, setBozza] = useState<Bozza | null>(null), [cosa, setCosa] = useState(false);
  const vv = vociHome(), byDay = perGiorno(vv), mese = S.ui.calV === 'mese';
  const sposta = (d: number) => { const x = new Date(Date.UTC(ym.y, ym.m + d, 1)); setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() }); };
  // Con un reparto scelto nella mappa, la voce nuova parte già in quel reparto.
  const nuova = (g = sel) => setBozza({ genere: 'attivita', categoria: '', giorno: isoDay(g), ora: '', titolo: '', nota: '', preventivo_id: '', assegnata_a: '', coinvolti: [],
    reparti: S.ui.rep && S.ui.rep !== SMISTARE ? [S.ui.rep] : [], settori: S.ui.rep && S.ui.repSet ? [S.ui.repSet] : [] });
  // Il modulo si apre nella colonna del giorno: se si arriva dagli allarmi o dagli appuntamenti, più sotto, la pagina ci torna.
  const modifica = (s: Scadenza) => { setSel(Date.UTC(+s.giorno.slice(0, 4), +s.giorno.slice(5, 7) - 1, +s.giorno.slice(8, 10)) / DAY); setBozza(bozzaDa(s));
    requestAnimationFrame(() => document.querySelector('.calday')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const vista = (k: 'mese' | 'agenda') => { S.ui.calV = k; commit(); };
  const delGiorno = byDay.get(sel) || [];   // le fatte sono nell'Archivio attività, da dove si riaprono
  return (
    <>
      {cloud.scadErr && <div className="warn">L'agenda non si legge dal server ({cloud.scadErr}). Probabilmente manca una migrazione del database
        (<b>20261020000000_calendario_scadenze.sql</b> o <b>20261020010000_agenda.sql</b>): va eseguita nel SQL Editor di Supabase.</div>}
      {cosa && <div className="card"><CosaVedo chiudi={() => setCosa(false)} /></div>}
      <div className="calgrid calhome">
        <section className="card calmain">
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
            <PermessoAvvisi />
            <button className={`btn s${vedeTutto(miaVista()) ? '' : ' on'}`} onClick={() => setCosa(!cosa)} title="Scegli cosa vedere nel calendario: le tue voci si vedono sempre"><Ic n="vedi" />Cosa vedo{vedeTutto(miaVista()) ? '' : ' · filtrato'}</button>
            <ChevBarra k="calendario" />
          </div>
          {mese ? <Mese ym={ym} sel={sel} setSel={setSel} nuova={nuova} byDay={byDay} oggi={oggi} /> : <Agenda vv={vv} oggi={oggi} sel={sel} setSel={setSel} onEdit={modifica} />}
          <div className="klegend">
            {(['prod', 'prodFine', 'mont', 'richiamo'] as const).map(k => <span key={k}><i style={{ background: TIPI[k][1] }} />{TIPI[k][0]}</span>)}
            {Object.entries(GENERI).map(([k, [l, c]]) => <span key={k}><i style={{ background: c }} />{l}</span>)}
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>{mese ? 'Clic su un giorno per il dettaglio, doppio clic per aggiungere. ' : ''}Le date delle commesse vengono dal Gantt dei preventivi vinti; il resto si aggiunge a mano, legato o no a un preventivo.</p>
        </section>
        {mappa && <div className="calmappa">{mappa}</div>}

        <section className="card calday">
          <h2>{giornoNome(sel)}<span className="sp" />
            {!bozza && <button className="btn s p" onClick={() => nuova()}>+ Aggiungi</button>}</h2>
          {bozza && <Modulo b={bozza} set={setBozza} chiudi={() => setBozza(null)} />}
          {delGiorno.length ? delGiorno.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={modifica} data={false} />)
            : !bozza && <p className="hint" style={{ margin: 0 }}>Niente in programma.</p>}
        </section>
        {sotto && <div className="calsotto">{sotto(modifica)}</div>}
      </div>
    </>
  );
}

/** Prossimi appuntamenti (da oggi in poi, non ancora fatti), in ordine di data e ora. */
function Appuntamenti({ onEdit }: { onEdit?: (s: Scadenza) => void }) {
  const oggi = dToday(), [tutti, setTutti] = useState(false);
  const vv = vociHome().filter(v => v.s?.genere === 'appuntamento' && !v.s.fatto && v.giorno >= oggi)
    .sort((a, b) => a.giorno - b.giorno || oraBreve(a.s).localeCompare(oraBreve(b.s)));
  const vis = tutti ? vv : vv.slice(0, 8), ap = barraAperta('appuntamenti');
  return (
    <div className={`card${ap ? '' : ' chiusa'}`}>
      <h2 className="hbh" onClick={clicBarra('appuntamenti')}>Appuntamenti<span className="tag">{vv.length} in programma</span><span className="sp" /><ChevBarra k="appuntamenti" /></h2>
      {ap && <>{vv.length ? vis.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={onEdit} qui />) : <p className="hint" style={{ margin: 0 }}>Nessun appuntamento in programma.</p>}
      {vv.length > 8 && <button className="btn s" style={{ marginTop: 8 }} onClick={() => setTutti(!tutti)}>{tutti ? 'Mostra solo i prossimi 8' : `Mostra tutti (${vv.length})`}</button>}</>}
    </div>
  );
}

/** Home: a sinistra il calendario e sotto, larghi, allarmi, appuntamenti e note; a destra la colonna con tutto il giorno scelto.
 *  Se l'utente ha nascosto il calendario: allarmi in breve, poi appuntamenti e note a tutta pagina. */
/** Dal «+» di un reparto della mappa: voce d'agenda (promemoria, scadenza, urgenza, appuntamento…) o nota, già nel reparto.
 *  La voce prende il reparto, la nota il suo primo tema (in «Da smistare» niente: ci finiscono da sole). */
/** Scheda «Nuovo in…»: Agenda o Nota, già nel reparto k (e nel settore st, se c'è). Nella finestra del «+» o, dalla mappa, sotto i settori. */
function SchedaNuovo({ k, st = '', chiudi, testa = 'saphead', corpo = 'sapbody' }: { k: string; st?: string; chiudi: () => void; testa?: string; corpo?: string }) {
  const [cosa, setCosa] = useState<'voce' | 'nota'>('voce'), qui = k !== SMISTARE;
  const [b, setB] = useState<Bozza>({ genere: 'promemoria', categoria: '', giorno: isoDay(dToday()), ora: '', titolo: '', nota: '', preventivo_id: '', assegnata_a: '', coinvolti: [], reparti: qui ? [k] : [],
    settori: qui && st ? [st] : [] });
  const [n, setN] = useState<Nota>({ ...notaVuota(), preventivo_id: '', etichette: qui ? REPARTI.find(r => r.k === k)!.temi.slice(0, 1) : [], settori: b.settori });
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [chiudi]);
  return <>
    <div className={testa}><IcReparto k={k} s={16} /><b>{qui ? `Nuovo in ${nomeReparto(k)}${st ? ' · ' + nomeSettoreMappa(st) : ''}` : 'Nuovo da smistare'}</b><span className="sp" />
      <span className="seg"><button className={cosa === 'voce' ? 'on' : ''} onClick={() => setCosa('voce')}>Agenda</button>
        <button className={cosa === 'nota' ? 'on' : ''} onClick={() => setCosa('nota')} disabled={!!docNonDisponibili()}>Nota</button></span>
      <button className="btn x" onClick={chiudi} title="Chiudi (Esc)" aria-label="Chiudi">✕</button></div>
    <div className={corpo}>
      {cosa === 'voce' ? <Modulo b={b} set={setB} chiudi={chiudi} /> : <ModuloNota n={n} set={setN} chiudi={chiudi} dove={{}} />}
    </div>
  </>;
}
function NuovoInReparto({ k, chiudi }: { k: string; chiudi: () => void }) {
  return (
    <div className="sapscrim noprint" onMouseDown={e => { if (e.target === e.currentTarget) chiudi(); }}>
      <div className="sapwin" role="dialog" aria-modal="true" aria-label={`Nuovo in ${nomeReparto(k)}`}>
        <SchedaNuovo k={k} st={S.ui.rep === k ? S.ui.repSet : ''} chiudi={chiudi} />
      </div>
    </div>
  );
}

export const CalendarioHome = () => {
  const [nuovo, setNuovo] = useState('');
  // Sotto il calendario la mappa dei reparti: scegliendone uno, allarmi, appuntamenti, note e colonna del giorno mostrano solo le sue cose.
  const sotto = (onEdit?: (s: Scadenza) => void) => <><Appuntamenti onEdit={onEdit} />{!docNonDisponibili() && <NoteHome />}</>;
  // In «📥 Da smistare» compare subito il riquadro con i reparti da cliccare su ogni riga.
  const mappa = <><MappaReparti vv={vociVisibili()} onNuovo={setNuovo} scheda={(k, st, chiudi) => <SchedaNuovo k={k} st={st} chiudi={chiudi} testa="mschedah" corpo="mschedab" />} />{S.ui.rep === SMISTARE && <Smistamento vv={vociVisibili()} />}
    {nuovo && <NuovoInReparto k={nuovo} chiudi={() => setNuovo('')} />}</>;
  // Calendario chiuso: resta la sua barra in cima, e il resto va a tutta pagina.
  if (barraAperta('calendario')) return <Calendario mappa={mappa} sotto={m => <><InArrivo /><Allarmi onEdit={m} />{sotto(m)}</>} />;
  const oggi = perGiorno(vociHome()).get(dToday())?.length || 0;
  return <>
    <section className="card chiusa"><h2 className="hbh" onClick={clicBarra('calendario')}>Calendario<span className="tag">{oggi ? `${oggi} in programma oggi` : 'niente oggi'}</span>
      <span className="sp" /><ChevBarra k="calendario" /></h2></section>
    {mappa}<InArrivo /><Allarmi />{sotto()}</>;
};

/** Nel preventivo aperto: le sue voci in agenda (date della commessa, richiamo, voci a mano) e l'aggiunta di un promemoria. */
export function AgendaPreventivo() {
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const id = S.prev._id, oggi = dToday();
  if (!id) return <Fold id="cf-agenda" title="Agenda" sum="Salva il preventivo per collegarci promemoria e cose da fare">{() =>
    <p className="hint" style={{ margin: 0 }}>Le voci in agenda si legano a un preventivo salvato nell'archivio.</p>}</Fold>;
  const vv = voci(S.arch, S.scad, true).filter(v => v.prevId === id), aperte = vv.filter(v => daFare(v) && !v.s?.fatto && v.giorno >= oggi - 365);
  const tardi = aperte.filter(v => v.giorno < oggi).length;
  const nuova = () => setBozza({ genere: 'promemoria', categoria: '', giorno: isoDay(oggi), ora: '', titolo: '', nota: '', preventivo_id: id, assegnata_a: '', coinvolti: [] });
  return (
    <Fold id="cf-agenda" title="Agenda" sum={vv.length ? `${aperte.length} da fare${tardi ? ` · ${tardi} scadut${tardi === 1 ? 'a' : 'e'}` : ''} · ${vv.length} voc${vv.length === 1 ? 'e' : 'i'} in tutto` : 'Nessuna voce: aggiungi un promemoria'}
      act={!bozza && <button className="btn s p" onClick={nuova}>+ Promemoria</button>}>{() => <>
      {bozza && <Modulo b={bozza} set={setBozza} chiudi={() => setBozza(null)} />}
      {vv.length ? vv.map(v => <Riga key={v.key} v={v} oggi={oggi} onEdit={s => setBozza(bozzaDa(s))} />)
        : !bozza && <p className="hint" style={{ margin: 0 }}>Niente in agenda per questo preventivo.</p>}
    </>}</Fold>
  );
}

/** Archivio delle attività: le voci fatte, che non affollano più il calendario. Togliendo la spunta tornano in agenda. */
export function ArchivioAttivita() {
  const oggi = dToday(), [q, setQ] = useState(''), [anno, setAnno] = useState(''), [gen, setGen] = useState(''), [n, setN] = useState(100);
  const tutte = soloMie(fatte(S.scad, S.arch)), anni = [...new Set(tutte.map(v => dDate(v.giorno).getUTCFullYear()))];
  const t = q.trim().toLowerCase();
  const vv = tutte.filter(v => (!anno || dDate(v.giorno).getUTCFullYear() === +anno) && (!gen || v.s!.genere === gen)
    && (!t || [v.titolo, v.sotto, v.s!.nota, ...persone(v.s).map(nomeDi), nomeDi(v.s!.creato_da)].some(x => x && x.toLowerCase().includes(t))));
  const vis = vv.slice(0, n);
  // Raggruppate per mese, dal più recente.
  const mesi = new Map<string, Voce[]>();
  for (const v of vis) { const d = dDate(v.giorno), k = meseNome(d.getUTCFullYear(), d.getUTCMonth()), a = mesi.get(k); if (a) a.push(v); else mesi.set(k, [v]); }
  return (
    <div className="card">
      <h2>Archivio attività<span className="tag">{tutte.length} fatt{tutte.length === 1 ? 'a' : 'e'}</span>{S.ui.calMie && <span className="tag">solo le mie</span>}</h2>
      <p className="hint">Le voci spuntate come fatte escono dal calendario e restano qui. Togli la spunta per rimetterne una in agenda.</p>
      <div className="toolbar afilt">
        <input type="search" value={q} placeholder="Cerca titolo, nota, commessa, persona…" onChange={e => { setQ(e.target.value); setN(100); }} />
        <select value={anno} onChange={e => setAnno(e.target.value)}><option value="">Tutti gli anni</option>{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={gen} onChange={e => setGen(e.target.value)}><option value="">Tutti i tipi</option>
          {(Object.entries(GENERI) as [Genere, [string, string]][]).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        {cloud.session && <span className="seg"><button className={S.ui.calMie ? '' : 'on'} onClick={() => { S.ui.calMie = false; commit(); }}>Tutte</button>
          <button className={S.ui.calMie ? 'on' : ''} onClick={() => { S.ui.calMie = true; commit(); }}>Le mie</button></span>}
        {(q || anno || gen) && <span className="muted">{vv.length} trovat{vv.length === 1 ? 'a' : 'e'}</span>}
      </div>
      {vv.length ? [...mesi].map(([m, vs]) => <div key={m} className="agiorno"><h3>{m}</h3>{vs.map(v => <Riga key={v.key} v={v} oggi={oggi} />)}</div>)
        : <p className="hint" style={{ margin: '12px 0 0' }}>{tutte.length ? 'Nessuna attività fatta con questi filtri.' : 'Ancora nessuna attività fatta.'}</p>}
      {vv.length > n && <button className="btn s" style={{ marginTop: 8 }} onClick={() => setN(n + 100)}>Mostra altre ({vv.length - n})</button>}
    </div>
  );
}

const QUANTO: [Quanto, string][] = [['tutte', 'Tutte'], ['seguite', 'Solo delle commesse che seguo'], ['nessuna', 'Nessuna']];
/** Cosa vedere nel calendario: la mia scelta, o (amministratore, dalla pagina Utenti) quella di un collega. */
export function CosaVedo({ utente, chiudi }: { utente?: Utente; chiudi: () => void }) {
  const email = utente?.email, altrui = !!email && email !== mioEmail();
  const iniziale = altrui ? normVista(utente!.vista) : miaVista();
  const [v, setV] = useState<Vista>(iniziale), [q, setQ] = useState(''), [busy, setBusy] = useState(false);
  const salva = async (x: Vista) => {
    setBusy(true); const e = await salvaVista(x, email); setBusy(false);
    if (e) { toast('Scelta non salvata: ' + e); return; }
    toast(vedeTutto(x) ? 'Ora si vede tutto il calendario' : 'Scelta salvata: vale su ogni dispositivo'); chiudi(); commit();
  };
  const t = q.trim().toLowerCase(), segue = new Set(v.seguo);
  const elenco = [...S.arch].sort((a, b) => +(eStato(b) === 'vinto') - +(eStato(a) === 'vinto') || String(b.data || '').localeCompare(String(a.data || '')))
    .filter(e => segue.has(e.id) || !t || [e.nome, e.cliente, e.prev?.num].some(x => x && String(x).toLowerCase().includes(t)));
  const giu = (k: 'altri' | 'commesse', l: string) => (
    <div className="f"><span>{l}</span><span className="seg">{QUANTO.map(([x, n]) => <button key={x} className={v[k] === x ? 'on' : ''} onClick={() => setV({ ...v, [k]: x })}>{n}</button>)}</span></div>
  );
  return (
    <div className="cvista">
      <h2>Cosa vedo nel calendario{altrui ? ` · ${nomeDi(email!)}` : ''}<span className="sp" />
        <button className="btn s" disabled={busy} onClick={() => salva(VISTA_TUTTO)}>Vedi tutto</button></h2>
      <p className="hint">{altrui ? 'Le sue voci' : 'Le tue voci'} (create {altrui ? 'da lui o assegnate a lui' : 'da te o assegnate a te'}) si vedono sempre. Il resto lo scegli qui; vale anche per il numerino degli allarmi.</p>
      <div className="vgrid">
        {giu('altri', 'Voci degli altri colleghi')}
        {giu('commesse', 'Date delle commesse (produzione e montaggio)')}
        <label className="chk"><input type="checkbox" checked={v.urgenze} onChange={e => setV({ ...v, urgenze: e.target.checked })} />Urgenze di tutti</label>
        <label className="chk"><input type="checkbox" checked={v.richiami} onChange={e => setV({ ...v, richiami: e.target.checked })} />Richiami ai clienti (offerte senza risposta)</label>
      </div>
      <h3>Commesse che seguo <span className="tag">{v.seguo.length}</span></h3>
      <input type="search" className="vcerca" value={q} placeholder="Cerca commessa, cliente, numero…" onChange={e => setQ(e.target.value)} />
      <div className="vlist">
        {elenco.slice(0, 60).map(e => <label key={e.id} className="chk"><input type="checkbox" checked={segue.has(e.id)}
          onChange={() => setV({ ...v, seguo: segue.has(e.id) ? v.seguo.filter(x => x !== e.id) : [...v.seguo, e.id] })} />
          {e.nome}<small className="muted">{[e.cliente, eStato(e) === 'vinto' ? 'commessa' : ''].filter(Boolean).join(' · ')}</small></label>)}
        {elenco.length > 60 && <p className="hint" style={{ margin: 0 }}>… altre {elenco.length - 60}: usa la ricerca.</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn p" disabled={busy} onClick={() => salva(v)}>{busy ? 'Salvo…' : 'Salva'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}
