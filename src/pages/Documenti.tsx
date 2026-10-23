// Documenti e note (DMS leggero): scheda Documenti del preventivo e allegati delle voci d'agenda.
// File e note si caricano qui; i file stanno nello Storage di Supabase e si aprono con un link temporaneo.
import { useEffect, useState } from 'react';
import { CARTELLE, LIMITE_MB, cartellaPer, cerca, documentiDi, estensione, fByte, immagine, nomeCartella, perCartella, type Cartella, type Documento } from '../domain/documenti';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { ModuloEmail, contestoEmail } from '../components/Email';
import { aggiornaDoc, caricaFile, ricaricaDocumenti, cloud, eliminaDoc, linkAnteprime, linkDoc, online, puoGestireDoc, salvaNota } from '../store/remote';

const nomeDi = (email: string) => cloud.colleghi.find(u => u.email === email)?.nome || email.split('@')[0];
const quandoDoc = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Il link si chiede al server dopo il clic: la finestra si apre subito (altrimenti il browser la blocca) e poi riceve l'indirizzo.
async function apriFile(d: Documento, scarica = false) {
  const w = scarica ? null : window.open('', '_blank');
  try {
    const u = await linkDoc(d, scarica);
    if (w) w.location.href = u; else location.href = u;
  } catch (err) { w?.close(); toast('File non aperto: ' + (err as Error).message); }
}
async function togli(d: Documento) {
  if (!confirm(`Eliminare ${d.tipo === 'nota' ? 'la nota' : 'il file'} "${d.titolo}"? Non si può recuperare.`)) return;
  const e = await eliminaDoc(d); toast(e ? 'Non eliminato: ' + e : 'Eliminato'); commit();
}
async function rinomina(d: Documento) {
  const t = prompt('Nuovo nome', d.titolo); if (t == null || !t.trim() || t.trim() === d.titolo) return;
  const e = await aggiornaDoc(d.id, { titolo: t.trim().slice(0, 200) }); if (e) toast('Nome non cambiato: ' + e); commit();
}
async function sposta(d: Documento, cartella: Cartella) {
  const e = await aggiornaDoc(d.id, { cartella }); if (e) toast('Non spostato: ' + e); commit();
}

type Nota = { id?: string; titolo: string; testo: string; cartella: Cartella };
function ModuloNota({ n, set, chiudi, dove }: { n: Nota; set: (n: Nota) => void; chiudi: () => void; dove: { preventivo_id?: string | null; scadenza_id?: string | null } }) {
  const [busy, setBusy] = useState(false);
  const salva = async () => {
    setBusy(true); const e = await salvaNota({ ...n, ...dove }); setBusy(false);
    if (e) { toast('Nota non salvata: ' + e); return; }
    toast(n.id ? 'Nota aggiornata' : 'Nota aggiunta'); chiudi(); commit();
  };
  return (
    <div className="cform">
      <label className="f">Titolo<input value={n.titolo} maxLength={200} autoFocus placeholder="es. Telefonata con il cliente" onChange={e => set({ ...n, titolo: e.target.value })} /></label>
      <label className="f">Cartella<select value={n.cartella} onChange={e => set({ ...n, cartella: e.target.value as Cartella })}>
        {CARTELLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="f wide">Testo<textarea rows={4} value={n.testo} onChange={e => set({ ...n, testo: e.target.value })} /></label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button className="btn p" disabled={busy || !n.titolo.trim()} onClick={salva}>{n.id ? 'Salva modifiche' : 'Aggiungi nota'}</button>
        <button className="btn" onClick={chiudi}>Annulla</button>
      </div>
    </div>
  );
}

function Voce({ d, thumb, onEdit, conVoce }: { d: Documento; thumb?: string; onEdit: (n: Nota) => void; conVoce: boolean }) {
  const [email, setEmail] = useState(false);
  const mio = puoGestireDoc(d), voce = conVoce && d.scadenza_id ? S.scad.find(s => s.id === d.scadenza_id) : null;
  const meta = [nomeCartella(d.cartella), d.tipo === 'file' ? fByte(d.dimensione) : '', 'da ' + nomeDi(d.creato_da), quandoDoc(d.creato), d.modificato ? 'modificata' : '',
    voce ? 'voce d\'agenda: ' + voce.titolo : ''].filter(Boolean).join(' · ');
  return (<>
    <div className="ditem">
      {d.tipo === 'nota' ? <span className="dico nota" aria-hidden>✎</span>
        : thumb ? <button className="dthumb" onClick={() => apriFile(d)} title="Apri"><img src={thumb} alt="" /></button>
        : <span className="dico">{estensione(d.titolo) || 'FILE'}</span>}
      <div className="dt">
        {d.tipo === 'file' ? <a href="#" onClick={e => { e.preventDefault(); apriFile(d); }}><b>{d.titolo}</b></a> : <b>{d.titolo}</b>}
        <small>{meta}</small>
        {d.testo ? <p className="dtesto">{d.testo}</p> : null}
      </div>
      <div className="dact">
        {d.tipo === 'file' && <button className="btn s" onClick={() => apriFile(d, true)}>Scarica</button>}
        {d.tipo === 'nota' && !email && <button className="btn s" onClick={() => setEmail(true)} title="Scrivi un'email di aggiornamento da questo appunto">✉ Email</button>}
        {mio && <select className="dsel" value={d.cartella} onChange={e => sposta(d, e.target.value as Cartella)} title="Sposta in un'altra cartella">
          {CARTELLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        {mio && (d.tipo === 'nota'
          ? <button className="btn s" onClick={() => onEdit({ id: d.id, titolo: d.titolo, testo: d.testo || '', cartella: d.cartella })}>Modifica</button>
          : <button className="btn s" onClick={() => rinomina(d)}>Rinomina</button>)}
        {mio && <button className="btn x" onClick={() => togli(d)} title="Elimina">✕</button>}
      </div>
    </div>
    {email && <ModuloEmail titolo={d.titolo} testo={d.testo || ''} contesto={contestoEmail(d.preventivo_id, d.scadenza_id)}
      chiave={d.preventivo_id || d.scadenza_id || ''} chiudi={() => setEmail(false)} />}
  </>);
}

/** Elenco con caricamento (pulsante o trascinamento), nuova nota e ricerca. compatto = dentro una voce d'agenda. */
export function DocPanel({ preventivo, scadenza, cartella = '', compatto = false }: { preventivo?: string | null; scadenza?: string; cartella?: Cartella | ''; compatto?: boolean }) {
  const [q, setQ] = useState(''), [busy, setBusy] = useState(0), [over, setOver] = useState(false), [nota, setNota] = useState<Nota | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const tutti = documentiDi(S.docs, scadenza ? { scadenza } : { preventivo: preventivo || undefined });
  const lista = cerca(cartella ? tutti.filter(d => d.cartella === cartella) : tutti, q);
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
        {!nota && <button className="btn s" onClick={() => setNota({ titolo: '', testo: '', cartella: cartella || 'altro' })}>+ Nota</button>}
        {!compatto && <input className="dq" value={q} placeholder="Cerca per nome o testo…" onChange={e => setQ(e.target.value)} />}
        <span className="muted small">{compatto ? 'oppure trascina qui i file' : `Trascina qui i file · massimo ${LIMITE_MB} MB ciascuno`}</span>
      </div>
      {nota && <ModuloNota n={nota} set={setNota} chiudi={() => setNota(null)} dove={dove} />}
      {lista.length ? lista.map(d => <Voce key={d.id} d={d} thumb={d.percorso ? thumbs[d.percorso] : undefined} onEdit={setNota} conVoce={!scadenza} />)
        : <p className="hint" style={{ margin: '8px 0 0' }}>{q ? 'Nessun documento corrisponde alla ricerca.' : cartella ? 'Cartella vuota.' : 'Nessun documento o nota.'}</p>}
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
