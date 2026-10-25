// Documenti e note (DMS leggero): scheda Documenti del preventivo e allegati delle voci d'agenda.
// File e note si caricano qui; i file stanno nello Storage di Supabase e si aprono con un link temporaneo.
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { CARTELLE, ETICHETTE, LIMITE_MB, allegatiDi, cartellaPer, cerca, coloreEtichetta, conEtichette, documentiDi, estensione, etichetteDi, fByte, immagine, nomeCartella, nomeEtichetta, perCartella, perEtichetta, suggerisciEtichette, suggerisciPreventivi, type Cartella, type Documento } from '../domain/documenti';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { ModuloEmail, contestoEmail } from '../components/Email';
import { aggiornaDoc, assegnaNota, caricaFile, ricaricaDocumenti, cloud, eliminaDoc, linkAnteprime, linkDoc, mioEmail, online, puoGestireDoc, salvaNota } from '../store/remote';

const nomeDi = (email: string) => cloud.colleghi.find(u => u.email === email)?.nome || email.split('@')[0];
const quandoDoc = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Il link si chiede al server dopo il clic: la finestra si apre subito (altrimenti il browser la blocca) e poi riceve l'indirizzo.
export async function apriFile(d: Documento, scarica = false) {
  const w = scarica ? null : window.open('', '_blank');
  try {
    const u = await linkDoc(d, scarica);
    if (w) w.location.href = u; else location.href = u;
  } catch (err) { w?.close(); toast('File non aperto: ' + (err as Error).message); }
}
async function togli(d: Documento) {
  const n = d.tipo === 'nota' ? allegatiDi(S.docs, d.id).length : 0;
  if (!confirm(`Eliminare ${d.tipo === 'nota' ? 'la nota' : 'il file'} "${d.titolo}"${n ? ` e ${n === 1 ? 'il suo allegato' : `i suoi ${n} allegati`}` : ''}? Non si può recuperare.`)) return;
  const e = await eliminaDoc(d); toast(e ? 'Non eliminato: ' + e : 'Eliminato'); commit();
}
async function rinomina(d: Documento) {
  const t = prompt('Nuovo nome', d.titolo); if (t == null || !t.trim() || t.trim() === d.titolo) return;
  const e = await aggiornaDoc(d.id, { titolo: t.trim().slice(0, 200) }); if (e) toast('Nome non cambiato: ' + e); commit();
}
async function sposta(d: Documento, cartella: Cartella) {
  const e = await aggiornaDoc(d.id, { cartella }); if (e) toast('Non spostato: ' + e); commit();
}

// preventivo_id: presente solo quando il modulo fa scegliere il collegamento (Home); '' = nota libera.
type Nota = { id?: string; titolo: string; testo: string; cartella: Cartella; etichette: string[]; preventivo_id?: string };
const notaVuota = (cartella: Cartella = 'altro'): Nota => ({ titolo: '', testo: '', cartella, etichette: [] });
const scambia = (xx: string[], k: string) => xx.includes(k) ? xx.filter(x => x !== k) : [...xx, k];
/** Finestra per scegliere uno o più file. */
const scegliFile = (fatto: (ff: File[]) => void) => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = () => i.files && fatto([...i.files]); i.click(); };
/** Carica i file come allegati della nota: ritorna quanti ne sono andati. */
async function allega(notaId: string, ff: File[]) {
  let ok = 0;
  for (const f of ff) { const e = await caricaFile(f, { nota_id: notaId }, cartellaPer(f.name, f.type)); if (e) toast(e); else ok++; }
  if (ok) await ricaricaDocumenti();
  return ok;
}
/** Allegati sotto una nota: si aprono con un clic; chi li ha caricati (o l'amministratore) li toglie. */
function Allegati({ nota }: { nota: Documento }) {
  const aa = allegatiDi(S.docs, nota.id);
  if (!aa.length) return null;
  return <div className="dall">{aa.map(a => <span key={a.id} className="dallf">
    <a href="#" onClick={e => { e.preventDefault(); apriFile(a); }} title={`${a.titolo} · ${fByte(a.dimensione)} · da ${nomeDi(a.creato_da)}`}>📎 {a.titolo}</a>
    {puoGestireDoc(a) && <button type="button" className="link" title="Togli l'allegato" onClick={() => togli(a)}>✕</button>}</span>)}</div>;
}

/** Preventivi dell'archivio per un menu: prima quelli aperti (vinti e in corso), poi persi e non scelti. */
function OpzioniPreventivi() {
  const chiusi = (e: any) => ['perso', 'alternativa'].includes(e.prev?.stato), op = (e: any) => <option key={e.id} value={e.id}>{e.nome}{e.cliente ? ' · ' + e.cliente : ''}</option>;
  const a = S.arch.filter(e => !chiusi(e)), c = S.arch.filter(chiusi);
  return <>{a.length > 0 && <optgroup label="Vinti e in corso">{a.map(op)}</optgroup>}{c.length > 0 && <optgroup label="Persi e non scelti">{c.map(op)}</optgroup>}</>;
}
/** Etichetta colorata; con onClick diventa un pulsante da accendere e spegnere. */
function Etq({ k, on = true, n, onClick }: { k: string; on?: boolean; n?: number; onClick?: () => void }) {
  const st = { '--ec': coloreEtichetta(k) } as CSSProperties, t = <>{nomeEtichetta(k)}{n ? <em>{n}</em> : null}</>;
  return onClick ? <button type="button" className={`etq${on ? ' on' : ''}`} style={st} onClick={onClick}>{t}</button> : <span className="etq on" style={st}>{t}</span>;
}
/** Filtro per tema sopra l'elenco: solo le etichette usate (più quelle accese), con quante note ha ciascuna. */
function FiltroEtichette({ docs, sel, set }: { docs: Documento[]; sel: string[]; set: (s: string[]) => void }) {
  const n = perEtichetta(docs), usate = ETICHETTE.filter(([k]) => n[k] || sel.includes(k));
  if (!usate.length) return null;
  return (
    <div className="etqs" style={{ marginBottom: 8 }}>
      {usate.map(([k]) => <Etq key={k} k={k} n={n[k]} on={sel.includes(k)} onClick={() => set(scambia(sel, k))} />)}
      {sel.length > 0 && <button type="button" className="etq" onClick={() => set([])}>✕ tutti i temi</button>}
    </div>
  );
}
/** Modulo della nota. Mentre si scrive suggerisce i temi e, se il collegamento si sceglie qui, la commessa nominata nel testo. */
function ModuloNota({ n, set, chiudi, dove }: { n: Nota; set: (n: Nota) => void; chiudi: () => void; dove: { preventivo_id?: string | null; scadenza_id?: string | null } }) {
  const [busy, setBusy] = useState(false), [file, setFile] = useState<File[]>([]);
  const scelgo = n.preventivo_id !== undefined, scritto = `${n.titolo} ${n.testo}`;
  const sugE = suggerisciEtichette(scritto).filter(k => !n.etichette.includes(k));
  const sugP = scelgo && !n.preventivo_id ? suggerisciPreventivi(scritto, S.arch) : [];
  const salva = async () => {
    setBusy(true);
    const { errore, id } = await salvaNota({ ...n, ...dove, ...(scelgo ? { preventivo_id: n.preventivo_id } : {}) });
    if (errore) { setBusy(false); toast('Nota non salvata: ' + errore); return; }
    const ok = file.length && id ? await allega(id, file) : 0;
    setBusy(false);
    toast((n.id ? 'Nota aggiornata' : 'Nota aggiunta') + (ok ? ` con ${ok === 1 ? 'un allegato' : ok + ' allegati'}` : '')); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Titolo<input value={n.titolo} maxLength={200} autoFocus placeholder="es. Telefonata con il cliente" onChange={e => set({ ...n, titolo: e.target.value })} /></label>
      {scelgo && <label className="f">Collegata a<select value={n.preventivo_id} onChange={e => set({ ...n, preventivo_id: e.target.value })}>
        <option value="">— nessun preventivo (nota libera) —</option>
        <OpzioniPreventivi /></select></label>}
      <label className="f">Cartella<select value={n.cartella} onChange={e => set({ ...n, cartella: e.target.value as Cartella })}>
        {CARTELLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="f wide">Etichette (tema, anche più di una)<div className="etqs">
        {ETICHETTE.map(([k]) => <Etq key={k} k={k} on={n.etichette.includes(k)} onClick={() => set({ ...n, etichette: scambia(n.etichette, k) })} />)}</div></div>
      <label className="f wide">Testo<textarea rows={4} value={n.testo} onChange={e => set({ ...n, testo: e.target.value })} /></label>
      <div className="f wide">Allegati (documenti, foto, PDF… massimo {LIMITE_MB} MB ciascuno)<div className="etqs">
        {file.map((f, i) => <span key={i} className="etq on">📎 {f.name}<button type="button" className="link" onClick={() => setFile(file.filter((_, j) => j !== i))}>✕</button></span>)}
        <button type="button" className="etq" onClick={() => scegliFile(ff => setFile([...file, ...ff]))}>+ Allega file</button></div></div>
      {(sugE.length > 0 || sugP.length > 0) && <div className="wide etqs sug"><span className="muted small">Sembra:</span>
        {sugE.map(k => <button key={k} type="button" className="etq" style={{ '--ec': coloreEtichetta(k) } as CSSProperties} onClick={() => set({ ...n, etichette: [...n.etichette, k] })}>+ {nomeEtichetta(k)}</button>)}
        {sugP.map(e => <button key={e.id} type="button" className="etq" onClick={() => set({ ...n, preventivo_id: e.id })}>🔗 {e.nome}{e.cliente ? ' · ' + e.cliente : ''}</button>)}</div>}
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !n.titolo.trim()} onClick={salva}>{busy ? 'Salvo…' : n.id ? 'Salva modifiche' : 'Aggiungi nota'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

// Assegnazione di una nota a un collega: chi e per quando (oggi se non si sceglie).
function Assegna({ d, chiudi }: { d: Documento; chiudi: () => void }) {
  const [a, setA] = useState(''), [giorno, setGiorno] = useState(() => new Date().toLocaleDateString('sv-SE')), [busy, setBusy] = useState(false);
  const fai = async () => {
    setBusy(true); const e = await assegnaNota(d, a, giorno); setBusy(false);
    if (e) { toast('Nota non assegnata: ' + e); return; }
    toast(`Nota assegnata a ${nomeDi(a)}: la trova nell'agenda`); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Assegna a<select value={a} autoFocus onChange={e => setA(e.target.value)}>
        <option value="">— scegli —</option>{cloud.colleghi.map(u => <option key={u.email} value={u.email}>{u.nome || u.email}{u.email === mioEmail() ? ' (io)' : ''}</option>)}</select></label>
      <label className="f">Entro il<input type="date" value={giorno} onChange={e => setGiorno(e.target.value)} /></label>
      <p className="hint wide" style={{ margin: 0 }}>Diventa una voce «Da fare» nell'agenda di chi scegli, con il testo della nota, e viene annunciata nel gruppo Telegram.</p>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !a || !giorno} onClick={fai}>{busy ? 'Assegno…' : 'Assegna'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

function Voce({ d, thumb, onEdit, conVoce }: { d: Documento; thumb?: string; onEdit: (n: Nota) => void; conVoce: boolean }) {
  const [email, setEmail] = useState(false), [ass, setAss] = useState(false), [carico, setCarico] = useState(0);
  const mio = puoGestireDoc(d), voce = conVoce && d.scadenza_id ? S.scad.find(s => s.id === d.scadenza_id) : null;
  // Voci assegnate nate da questa nota: quella a cui è allegata, o con lo stesso titolo e la stessa commessa.
  const per = d.tipo !== 'nota' ? [] : S.scad.filter(s => s.assegnata_a && (s.id === d.scadenza_id || (s.titolo === d.titolo.trim() && (s.preventivo_id || null) === (d.preventivo_id || null))));
  const meta = [nomeCartella(d.cartella), d.tipo === 'file' ? fByte(d.dimensione) : '', 'da ' + nomeDi(d.creato_da), quandoDoc(d.creato), d.modificato ? 'modificata' : '',
    voce ? 'voce d\'agenda: ' + voce.titolo : '', ...per.map(s => `assegnata a ${nomeDi(s.assegnata_a!)}${s.fatto ? ' ✓ fatto' : ''}`)].filter(Boolean).join(' · ');
  return (<>
    <div className="ditem">
      {d.tipo === 'nota' ? <span className="dico nota" aria-hidden>✎</span>
        : thumb ? <button className="dthumb" onClick={() => apriFile(d)} title="Apri"><img src={thumb} alt="" /></button>
        : <span className="dico">{estensione(d.titolo) || 'FILE'}</span>}
      <div className="dt">
        {d.tipo === 'file' ? <a href="#" onClick={e => { e.preventDefault(); apriFile(d); }}><b>{d.titolo}</b></a> : <b>{d.titolo}</b>}
        <small>{meta}</small>
        {etichetteDi(d).length > 0 && <div className="etqs">{etichetteDi(d).map(k => <Etq key={k} k={k} />)}</div>}
        {d.testo ? <p className="dtesto">{d.testo}</p> : null}
        {d.tipo === 'nota' && <Allegati nota={d} />}
      </div>
      <div className="dact">
        {d.tipo === 'file' && <button className="btn s" onClick={() => apriFile(d, true)}>Scarica</button>}
        {d.tipo === 'nota' && <button className="btn s" disabled={carico > 0} title="Allega un documento, una foto o un PDF a questa nota"
          onClick={() => scegliFile(async ff => { setCarico(ff.length); const ok = await allega(d.id, ff); setCarico(0); if (ok) toast(ok === 1 ? 'Allegato aggiunto' : `${ok} allegati aggiunti`); commit(); })}>
          {carico ? `Carico… (${carico})` : '📎 Allega'}</button>}
        {d.tipo === 'nota' && online() && cloud.colleghi.length > 0 && !ass && <button className="btn s" onClick={() => setAss(true)} title="Assegna la nota a un collega: diventa una voce «Da fare» nella sua agenda">👤 Assegna</button>}
        {d.tipo === 'nota' && !email && <button className="btn s" onClick={() => setEmail(true)} title="Scrivi un'email di aggiornamento da questo appunto">✉ Email</button>}
        {mio && <select className="dsel" value={d.cartella} onChange={e => sposta(d, e.target.value as Cartella)} title="Sposta in un'altra cartella">
          {CARTELLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        {mio && (d.tipo === 'nota'
          ? <button className="btn s" onClick={() => onEdit({ id: d.id, titolo: d.titolo, testo: d.testo || '', cartella: d.cartella, etichette: etichetteDi(d) })}>Modifica</button>
          : <button className="btn s" onClick={() => rinomina(d)}>Rinomina</button>)}
        {mio && <button className="btn x" onClick={() => togli(d)} title="Elimina">✕</button>}
      </div>
    </div>
    {ass && <Assegna d={d} chiudi={() => setAss(false)} />}
    {email && <ModuloEmail titolo={d.titolo} testo={d.testo || ''} contesto={contestoEmail(d.preventivo_id, d.scadenza_id)}
      chiave={d.preventivo_id || d.scadenza_id || ''} preventivo={d.preventivo_id} chiudi={() => setEmail(false)} />}
  </>);
}

/** Elenco con caricamento (pulsante o trascinamento), nuova nota e ricerca. compatto = dentro una voce d'agenda. */
export function DocPanel({ preventivo, scadenza, cartella = '', compatto = false }: { preventivo?: string | null; scadenza?: string; cartella?: Cartella | ''; compatto?: boolean }) {
  const [q, setQ] = useState(''), [busy, setBusy] = useState(0), [over, setOver] = useState(false), [nota, setNota] = useState<Nota | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}), [temi, setTemi] = useState<string[]>([]);
  const tutti = documentiDi(S.docs, scadenza ? { scadenza } : { preventivo: preventivo || undefined });
  const inCartella = cartella ? tutti.filter(d => d.cartella === cartella) : tutti, lista = conEtichette(cerca(inCartella, q), temi);
  const foto = lista.filter(d => immagine(d) && d.percorso && !thumbs[d.percorso]).map(d => d.percorso).join('|');
  useEffect(() => { if (foto) linkAnteprime(lista.filter(d => immagine(d))).then(t => setThumbs(x => ({ ...x, ...t }))); }, [foto]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dove = { preventivo_id: preventivo || null, scadenza_id: scadenza || null };
  const carica = async (files: FileList | File[]) => {
    const ff = [...files]; if (!ff.length) return;
    setBusy(n => n + ff.length);
    let ok = 0;
    for (const f of ff) {
      const e = await caricaFile(f, dove, cartella || cartellaPer(f.name, f.type));
      if (e) toast(e); else ok++;
      setBusy(n => n - 1);
    }
    if (ok) { await ricaricaDocumenti(); toast(ok === 1 ? 'File caricato' : `${ok} file caricati`); }
    commit();
  };
  const scegli = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = () => i.files && carica(i.files); i.click(); };
  return (
    <div className={`dpanel${over ? ' over' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); carica(e.dataTransfer.files); }}>
      <div className="dbar">
        <button className="btn p s" onClick={scegli} disabled={busy > 0}>{busy ? `Carico… (${busy})` : '+ Carica file'}</button>
        {!nota && <button className="btn s" onClick={() => setNota(notaVuota(cartella || 'altro'))}>+ Nota</button>}
        {!compatto && <input className="dq" value={q} placeholder="Cerca per nome o testo…" onChange={e => setQ(e.target.value)} />}
        <span className="muted small">{compatto ? 'oppure trascina qui i file' : `Trascina qui i file · massimo ${LIMITE_MB} MB ciascuno`}</span>
      </div>
      {nota && <ModuloNota n={nota} set={setNota} chiudi={() => setNota(null)} dove={dove} />}
      {!compatto && <FiltroEtichette docs={inCartella} sel={temi} set={setTemi} />}
      {lista.length ? lista.map(d => <Voce key={d.id} d={d} thumb={d.percorso ? thumbs[d.percorso] : undefined} onEdit={setNota} conVoce={!scadenza} />)
        : <p className="hint" style={{ margin: '8px 0 0' }}>{q || temi.length ? 'Nessun documento corrisponde alla ricerca.' : cartella ? 'Cartella vuota.' : 'Nessun documento o nota.'}</p>}
    </div>
  );
}

/** Avviso quando i documenti non sono disponibili: senza server o senza la migrazione. Null se tutto va. */
export function docNonDisponibili() {
  if (!online()) return 'I documenti si salvano sul server (Supabase): in questa versione solo-browser non sono disponibili.';
  if (cloud.docErr) return `I documenti non si leggono dal server (${cloud.docErr}). Probabilmente manca la migrazione 20261022000000_documenti.sql: va eseguita nel SQL Editor di Supabase.`;
  return '';
}

/** Scheda Documenti del preventivo aperto: cartelle a sinistra, elenco a destra. */
export function Documenti() {
  const id = S.prev._id, no = docNonDisponibili(), cart = (S.ui.docCart || '') as Cartella | '';
  if (no) return <div className="warn">{no}</div>;
  if (!id) return <div className="card"><div className="empty">Salva il preventivo per collegarci documenti e note.</div></div>;
  const tutti = documentiDi(S.docs, { preventivo: id }), n = perCartella(tutti);
  const vai = (k: Cartella | '') => { S.ui.docCart = k; commit(); };
  return (
    <div className="dgrid">
      <nav className="card dcart">
        <button className={cart ? '' : 'on'} onClick={() => vai('')}><span>Tutti</span><em>{tutti.length}</em></button>
        {CARTELLE.map(([k, l]) => <button key={k} className={cart === k ? 'on' : ''} onClick={() => vai(k)}><span>{l}</span><em>{n[k] || ''}</em></button>)}
      </nav>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{cart ? nomeCartella(cart) : 'Tutti i documenti'} <span className="muted small">· {S.prev._nome}</span></h2>
        <DocPanel preventivo={id} cartella={cart} />
      </section>
    </div>
  );
}

/** In Home, sotto il calendario: tutte le note (di preventivi e voci d'agenda), le più recenti prima, con ricerca.
 *  Una nota puo' essere libera (solo con le etichette) o legata a un preventivo, scelto qui o suggerito dal testo. */
export function NoteHome() {
  const [q, setQ] = useState(''), [nota, setNota] = useState<Nota | null>(null), [tutte, setTutte] = useState(false);
  const [temi, setTemi] = useState<string[]>([]);
  const no = docNonDisponibili();
  if (no) return null;
  const tutteNote = S.docs.filter(d => d.tipo === 'nota'), filtro = !!q || temi.length > 0;
  const note = conEtichette(cerca(tutteNote, q), temi).sort((a, b) => (b.modificato || b.creato).localeCompare(a.modificato || a.creato));
  const viste = tutte || filtro ? note : note.slice(0, 10);
  const nomeP = (id: string | null) => (id && S.arch.find(e => e.id === id)?.nome) || '';
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Note<span className="sp" />
        {!nota && <button className="btn s p" onClick={() => setNota({ ...notaVuota(), preventivo_id: S.prev._id || '' })}>+ Nota</button>}</h2>
      <div className="dbar"><input className="dq" value={q} placeholder="Cerca nelle note…" onChange={e => setQ(e.target.value)} />
        <span className="muted small">{note.length} not{note.length === 1 ? 'a' : 'e'}{filtro ? ' trovat' + (note.length === 1 ? 'a' : 'e') : ''}</span></div>
      <FiltroEtichette docs={tutteNote} sel={temi} set={setTemi} />
      {nota && <ModuloNota n={nota} set={setNota} chiudi={() => setNota(null)} dove={{}} />}
      {viste.length ? viste.map(d => <Fragment key={d.id}>
        {nomeP(d.preventivo_id) && <div className="muted small" style={{ marginTop: 8 }}>{nomeP(d.preventivo_id)}</div>}
        <Voce d={d} onEdit={x => setNota({ ...x, preventivo_id: d.preventivo_id || '' })} conVoce />
      </Fragment>)
        : <p className="hint" style={{ margin: '8px 0 0' }}>{filtro ? 'Nessuna nota corrisponde alla ricerca.' : 'Nessuna nota. Una nota può essere libera o legata a un preventivo: si aggiungono qui, nella scheda Documenti del preventivo o sulle voci d\'agenda.'}</p>}
      {!filtro && note.length > 10 && <button className="btn s" style={{ marginTop: 8 }} onClick={() => setTutte(!tutte)}>{tutte ? 'Mostra solo le ultime 10' : `Mostra tutte (${note.length})`}</button>}
    </section>
  );
}
