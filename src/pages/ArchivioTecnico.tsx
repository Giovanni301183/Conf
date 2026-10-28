// Archivio tecnico (Dati comuni): memoria del consulente tecnico dell'assistente. Non è un archivio a parte: sono i Documenti
// con un'etichetta tecnica (Tecnico e progetto, Geologia e terreni, Prove di pull-out, Normativa) e i file allegati alle note che ne hanno una,
// da qualunque parte arrivino (scheda Documenti, note, Telegram, email). Qui si vedono tutti insieme e se ne caricano di nuovi.
import { useState } from 'react';
import { LIMITE_MB, TECNICHE, cartellaPer, nomeEtichetta, suggerisciEtichette, tecnico, type Documento } from '../domain/documenti';
import { cercaArchivio } from '../domain/esperto';
import { S, commit } from '../store/state';
import { toast } from '../store/actions';
import { caricaFile, ricaricaDocumenti } from '../store/remote';
import { ModuloNota, OpzioniPreventivi, Voce, docNonDisponibili, notaVuota, type Nota } from './Documenti';

/** Etichetta tecnica proposta dal nome del file (Tecnico e progetto se il nome non dice niente). */
const temaPer = (nome: string) => suggerisciEtichette(nome).find(k => TECNICHE.includes(k)) || 'tecnico';

export function ArchivioTecnico() {
  const [q, setQ] = useState(''), [tema, setTema] = useState(''), [solo, setSolo] = useState('');
  const [privato, setPrivato] = useState(false), [prev, setPrev] = useState(''), [temaNuovi, setTemaNuovi] = useState(''), [busy, setBusy] = useState(0), [over, setOver] = useState(false);
  const [nota, setNota] = useState<Nota | null>(null);
  const no = docNonDisponibili();
  if (no) return <div className="warn">{no}</div>;

  const tutti = (S.docs as Documento[]).filter(d => tecnico(d, S.docs));
  const lista = cercaArchivio(tutti, q, null, tema || null).filter(d => !solo || (solo === 'privati' ? d.privato : solo === 'liberi' ? !d.preventivo_id : d.preventivo_id === solo));
  const carica = async (files: FileList | File[]) => {
    const ff = [...files]; if (!ff.length) return;
    setBusy(n => n + ff.length);
    let ok = 0;
    for (const f of ff) {
      const e = await caricaFile(f, { preventivo_id: prev || null }, cartellaPer(f.name, f.type), { etichette: [temaNuovi || temaPer(f.name)], privato });
      setBusy(n => n - 1);
      if (e) toast(e); else ok++;
    }
    if (ok) { await ricaricaDocumenti(); toast(`${ok === 1 ? 'File caricato' : ok + ' file caricati'}: l'AI ne scrive la scheda`); }
    commit();
  };
  const scegli = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = () => i.files && carica(i.files); i.click(); };
  const commesse = [...new Set(tutti.map(d => d.preventivo_id).filter(Boolean))] as string[];
  const nomeP = (id: string | null) => (id && S.arch.find(e => e.id === id)?.nome) || '';

  return (
    <section className={`card dpanel${over ? ' over' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); carica(e.dataTransfer.files); }}>
      <h2 style={{ marginTop: 0 }}>Archivio tecnico</h2>
      <p className="hint">Memoria del consulente tecnico dell'assistente (✦ Assistente): relazioni geologiche e geotecniche, prove di pull-out, calcoli, normative e schede tecniche.
        Qui compare <b>ogni documento o nota con un'etichetta tecnica</b> ({TECNICHE.map(nomeEtichetta).join(', ')}), da qualunque parte arrivi: scheda Documenti, note, Telegram, email.
        Con <b>🔗 Collega</b> lo leghi quando vuoi a un preventivo o commessa, a una nota, e cambi etichette o privato. L'AI legge ogni file tecnico e ne scrive la scheda con valori e pagine.
        I documenti <b>privati</b> li vedi solo tu. Meglio PDF, immagini o testo: Word ed Excel vanno salvati in PDF.</p>

      <div className="dbar">
        <button className="btn p s" onClick={scegli} disabled={busy > 0}>{busy ? `Carico… (${busy})` : '+ Carica file'}</button>
        {!nota && <button className="btn s" onClick={() => setNota({ ...notaVuota(), etichette: ['tecnico'], preventivo_id: prev })}>+ Nota</button>}
        <select className="dsel" value={prev} onChange={e => setPrev(e.target.value)} title="Preventivo o commessa dei file che carichi (facoltativo, si cambia anche dopo)">
          <option value="">Nessun preventivo (libero)</option><OpzioniPreventivi /></select>
        <select className="dsel" value={temaNuovi} onChange={e => setTemaNuovi(e.target.value)} title="Etichetta dei file che carichi">
          <option value="">Etichetta dal nome del file</option>{TECNICHE.map(k => <option key={k} value={k}>{nomeEtichetta(k)}</option>)}</select>
        <label className="small" title="Privato: lo vedi solo tu"><input type="checkbox" checked={privato} onChange={e => setPrivato(e.target.checked)} /> Privato</label>
        <span className="muted small">Trascina qui i file · massimo {LIMITE_MB} MB ciascuno</span>
      </div>
      {nota && <ModuloNota n={nota} set={setNota} chiudi={() => setNota(null)} dove={{}} />}

      <div className="dbar" style={{ marginTop: 12 }}>
        <input className="dq" value={q} placeholder="Cerca per nome o contenuto (es. pull-out, SPT, Foggia)…" onChange={e => setQ(e.target.value)} />
        <select className="dsel" value={tema} onChange={e => setTema(e.target.value)}><option value="">Tutte le etichette tecniche</option>
          {TECNICHE.map(k => <option key={k} value={k}>{nomeEtichetta(k)}</option>)}</select>
        <select className="dsel" value={solo} onChange={e => setSolo(e.target.value)}><option value="">Tutti</option><option value="liberi">Senza preventivo</option><option value="privati">Solo i miei privati</option>
          {commesse.map(id => <option key={id} value={id}>{nomeP(id) || 'preventivo eliminato'}</option>)}</select>
        <span className="muted small">{lista.length} document{lista.length === 1 ? 'o' : 'i'}</span>
      </div>
      {lista.length ? lista.map(d => <div key={d.id}>
        {nomeP(d.preventivo_id) && <div className="muted small" style={{ marginTop: 8 }}>{nomeP(d.preventivo_id)}</div>}
        <Voce d={d} onEdit={x => setNota({ ...x, preventivo_id: d.preventivo_id || '' })} conVoce />
      </div>)
        : <p className="hint" style={{ margin: '8px 0 0' }}>{tutti.length ? 'Nessun documento corrisponde alla ricerca.'
          : "L'archivio è vuoto: carica la prima relazione o prova di pull-out, oppure metti un'etichetta tecnica a un documento o a una nota che hai già."}</p>}
    </section>
  );
}
