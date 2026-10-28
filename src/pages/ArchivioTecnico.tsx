// Archivio tecnico (Dati comuni): memoria del consulente tecnico dell'assistente. Relazioni geologiche, prove di pull-out,
// calcoli, normative, schede tecniche e risposte salvate dalla chat; ognuno condiviso o privato, libero o legato a un preventivo.
// Alla prima lettura l'AI scrive la scheda (riassunto con valori e pagine) che l'assistente usa per ritrovare il documento.
import { useState } from 'react';
import { CATEGORIE_ARCHIVIO, categoriaPer, cercaArchivio, leggibile, nomeCategoria, type DocArchivio } from '../domain/esperto';
import { LIMITE_MB, fByte } from '../domain/documenti';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { aggiornaTecnico, caricaTecnico, cloud, eliminaTecnico, leggiTecnico, linkTecnico, online, puoGestireTec, salvaTecnico } from '../store/remote';

const nomeDi = (email: string) => cloud.colleghi.find(u => u.email === email)?.nome || email.split('@')[0];
const quando = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const nomeP = (id: string | null) => { const e = id && S.arch.find(x => x.id === id); return e ? `${e.prev?.num ? 'N° ' + e.prev.num + ' · ' : ''}${e.nome}` : ''; };
// Documenti in lettura dall'AI (id), fuori da React: la lettura continua anche cambiando scheda.
const inLettura = new Set<string>();

async function leggi(id: string) {
  inLettura.add(id); commit();
  const e = await leggiTecnico(id);
  inLettura.delete(id); commit();
  if (e) toast('Scheda non scritta: ' + e);
}
async function apri(d: DocArchivio) {
  const w = window.open('', '_blank');
  try { const u = await linkTecnico(d); if (w) w.location.href = u; } catch (err) { w?.close(); toast('File non aperto: ' + (err as Error).message); }
}

function Preventivi({ value, set }: { value: string; set: (v: string) => void }) {
  return <select className="dsel" value={value} onChange={e => set(e.target.value)} title="Preventivo o commessa (facoltativo)">
    <option value="">Nessun preventivo (libero)</option>
    {S.arch.map(e => <option key={e.id} value={e.id}>{e.prev?.num ? `N° ${e.prev.num} · ` : ''}{e.nome}{e.cliente ? ' · ' + e.cliente : ''}</option>)}
  </select>;
}

function Voce({ d }: { d: DocArchivio }) {
  const [aperta, setAperta] = useState(false), mio = puoGestireTec(d), lettura = inLettura.has(d.id);
  const cambia = async (patch: Parameters<typeof aggiornaTecnico>[1]) => { const e = await aggiornaTecnico(d.id, patch); if (e) toast('Non cambiato: ' + e); commit(); };
  const togli = async () => { if (!confirm(`Eliminare "${d.titolo}" dall'archivio tecnico? Non si può recuperare.`)) return; const e = await eliminaTecnico(d); toast(e ? 'Non eliminato: ' + e : 'Eliminato'); commit(); };
  const corpo = d.scheda || d.testo;
  return (
    <div className="dvoce" style={{ display: 'block' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>{d.percorso ? '📄' : '📝'}</span>
        {d.percorso ? <a href="#" onClick={e => { e.preventDefault(); apri(d); }}><b>{d.titolo}</b></a> : <b>{d.titolo}</b>}
        <span className="etq on">{nomeCategoria(d.categoria)}</span>
        <span className="muted small" title={d.privato ? 'Lo vedi solo tu' : 'Lo vedono tutti gli utenti'}>{d.privato ? '🔒 privato' : 'condiviso'}</span>
        {nomeP(d.preventivo_id) && <span className="muted small">· {nomeP(d.preventivo_id)}</span>}
        <span className="muted small">· {nomeDi(d.creato_da)}, {quando(d.creato)}{d.dimensione ? ' · ' + fByte(d.dimensione) : ''}</span>
        <span style={{ flex: 1 }} />
        {corpo && <button className="btn s" onClick={() => setAperta(!aperta)}>{aperta ? 'Chiudi' : d.scheda ? 'Scheda' : 'Testo'}</button>}
        {d.percorso && leggibile(d.mime, d.titolo) && <button className="btn s" disabled={lettura} onClick={() => leggi(d.id)} title="L'AI legge il file e scrive la scheda">{lettura ? 'Leggo…' : d.scheda ? 'Rileggi' : 'Leggi con AI'}</button>}
        {mio && <>
          <select className="dsel" value={d.categoria} onChange={e => cambia({ categoria: e.target.value })} title="Categoria">{CATEGORIE_ARCHIVIO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {d.creato_da === cloud.me?.email && <button className="btn s" onClick={() => cambia({ privato: !d.privato })}>{d.privato ? 'Condividi' : 'Rendi privato'}</button>}
          <button className="btn s" onClick={togli} title="Elimina">✕</button>
        </>}
      </div>
      {!corpo && d.percorso && !lettura && <div className="muted small">{leggibile(d.mime, d.titolo) ? 'Scheda non ancora scritta: premi «Leggi con AI».' : "L'AI non legge questo tipo di file (Word, Excel…): salvalo in PDF e ricaricalo."}</div>}
      {aperta && corpo && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{corpo}</div>}
    </div>
  );
}

export function ArchivioTecnico() {
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [solo, setSolo] = useState('');
  const [privato, setPrivato] = useState(false), [prev, setPrev] = useState(''), [busy, setBusy] = useState(0), [over, setOver] = useState(false);
  const [nota, setNota] = useState<{ titolo: string; testo: string; categoria: string } | null>(null);
  if (!online()) return <div className="warn">L'archivio tecnico sta sul server (Supabase): in questa versione solo-browser non è disponibile.</div>;
  if (cloud.tecErr) return <div className="warn">L'archivio tecnico non si legge dal server: {cloud.tecErr}</div>;

  const tutti = S.tecn as DocArchivio[];
  const lista = cercaArchivio(tutti, q, null, cat || null).filter(d => !solo || (solo === 'privati' ? d.privato : d.preventivo_id === solo));
  const carica = async (files: FileList | File[]) => {
    const ff = [...files]; if (!ff.length) return;
    setBusy(n => n + ff.length);
    for (const f of ff) {
      const { errore, id } = await caricaTecnico(f, { categoria: categoriaPer(f.name), privato, preventivo_id: prev || null });
      setBusy(n => n - 1);
      if (errore) { toast(errore); continue; }
      if (id && leggibile(f.type, f.name)) leggi(id);   // la scheda si scrive in sottofondo
    }
    commit();
  };
  const scegli = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.pdf,.txt,.csv,.md,image/*,application/pdf'; i.onchange = () => i.files && carica(i.files); i.click(); };
  const salvaNota = async () => {
    if (!nota) return;
    const e = await salvaTecnico({ ...nota, privato, preventivo_id: prev || null });
    if (e) { toast('Nota non salvata: ' + e); return; }
    setNota(null); toast('Nota salvata'); commit();
  };
  const commesse = [...new Set(tutti.map(d => d.preventivo_id).filter(Boolean))] as string[];

  return (
    <section className={`card dpanel${over ? ' over' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); carica(e.dataTransfer.files); }}>
      <h2 style={{ marginTop: 0 }}>Archivio tecnico</h2>
      <p className="hint">Memoria del consulente tecnico dell'assistente (✦ Assistente): relazioni geologiche e geotecniche, prove di pull-out e di carico, calcoli strutturali,
        normative e schede tecniche. L'AI legge ogni file una volta e ne scrive la scheda con i valori e le pagine; poi l'assistente lo ritrova e lo cita da solo.
        I documenti <b>condivisi</b> li vedono tutti gli utenti; quelli <b>privati</b> solo tu (e l'assistente li usa solo nelle tue domande). Meglio PDF, immagini o testo: Word ed Excel vanno salvati in PDF.</p>

      <div className="dbar">
        <button className="btn p s" onClick={scegli} disabled={busy > 0}>{busy ? `Carico… (${busy})` : '+ Carica file'}</button>
        {!nota && <button className="btn s" onClick={() => setNota({ titolo: '', testo: '', categoria: 'altro' })}>+ Nota</button>}
        <label className="small" title="Privato: lo vedi solo tu"><input type="checkbox" checked={privato} onChange={e => setPrivato(e.target.checked)} /> Privato</label>
        <Preventivi value={prev} set={setPrev} />
        <span className="muted small">Trascina qui i file · massimo {LIMITE_MB} MB ciascuno</span>
      </div>
      {nota && <div className="dvoce" style={{ display: 'block' }}>
        <input className="dq" style={{ width: '100%' }} value={nota.titolo} placeholder="Titolo (es. Pull-out pali IPE 160 · Foggia)" onChange={e => setNota({ ...nota, titolo: e.target.value })} />
        <textarea className="dq" style={{ width: '100%', marginTop: 6 }} rows={6} value={nota.testo} placeholder="Dati, valori, conclusioni…" onChange={e => setNota({ ...nota, testo: e.target.value })} />
        <div className="dbar">
          <select className="dsel" value={nota.categoria} onChange={e => setNota({ ...nota, categoria: e.target.value })}>{CATEGORIE_ARCHIVIO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span className="muted small">{privato ? '🔒 privata' : 'condivisa'}{prev ? ' · ' + nomeP(prev) : ' · libera'}</span>
          <span style={{ flex: 1 }} />
          <button className="btn s" onClick={() => setNota(null)}>Annulla</button>
          <button className="btn p s" disabled={!nota.titolo.trim() || !nota.testo.trim()} onClick={salvaNota}>Salva nota</button>
        </div>
      </div>}

      <div className="dbar" style={{ marginTop: 12 }}>
        <input className="dq" value={q} placeholder="Cerca per nome o contenuto (es. pull-out, SPT, Foggia)…" onChange={e => setQ(e.target.value)} />
        <select className="dsel" value={cat} onChange={e => setCat(e.target.value)}><option value="">Tutte le categorie</option>{CATEGORIE_ARCHIVIO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="dsel" value={solo} onChange={e => setSolo(e.target.value)}><option value="">Tutti</option><option value="privati">Solo i miei privati</option>
          {commesse.map(id => <option key={id} value={id}>{nomeP(id) || 'preventivo eliminato'}</option>)}</select>
        <span className="muted small">{lista.length} document{lista.length === 1 ? 'o' : 'i'}</span>
      </div>
      {lista.length ? lista.map(d => <Voce key={d.id} d={d} />)
        : <p className="hint" style={{ margin: '8px 0 0' }}>{tutti.length ? 'Nessun documento corrisponde alla ricerca.' : "L'archivio è vuoto: carica la prima relazione o prova di pull-out."}</p>}
    </section>
  );
}
