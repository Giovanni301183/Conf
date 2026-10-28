// Assistente con AI (Claude, via /api/assistente): pannello chat a destra. Le modifiche arrivano come proposte
// con Conferma e Annulla; solo la conferma cambia listino, distinte o calendario, con gli stessi strumenti dell'app.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { datiPerAssistente, type Appunto, type Proposta } from '../domain/assistente';
import { nomiEtichette } from '../domain/documenti';
import { datiTecnici } from '../domain/esperto';
import { sostituisci } from '../domain/referenze';
import { clone } from '../domain/model';
import { S, commit, save } from '../store/state';
import { aggiornaDoc, chiediAssistente, cloud, online, salvaNota, salvaScadenza, squadra } from '../store/remote';
import { chatComeAppunti } from '../domain/squadra';
import { apriGmail } from './Email';
import { TabellaVarianti, scaricaOfferte } from './Varianti';
import { archVarianti } from '../store/actions';
import { PANNELLO, apriPannello } from './pannelli';

type Voce = { ruolo: 'tu' | 'ai' | 'err'; testo: string; proposte?: Proposta[] };
const cap = (g: string) => g.charAt(0) + g.slice(1).toLowerCase();
const giorno = (d: string) => new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
// Dettatura col riconoscimento vocale del browser (Chrome/Edge): il testo va nella casella, si invia a mano.
const Riconoscimento: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

/** Appunti per l'assistente: note dei documenti, note degli eventi e chat di squadra, i più recenti prima, con il nome della commessa. */
function appunti(): Appunto[] {
  const comm = (id?: string | null) => (id && S.arch.find(a => a.id === id)?.nome) || '';
  const note = S.docs.filter(d => d.tipo === 'nota').map(d => ({ quando: String(d.creato || '').slice(0, 10), commessa: comm(d.preventivo_id), titolo: d.titolo, testo: (d.testo || '').slice(0, 2000), id: d.id, etichette: d.etichette || [] }));
  const eventi = S.scad.filter(x => x.nota).map(x => ({ quando: x.giorno, commessa: comm(x.preventivo_id), titolo: 'Evento: ' + x.titolo, testo: String(x.nota).slice(0, 2000) }));
  // Le discussioni della chat di squadra (una per giorno e stanza), così si può chiedere cosa si è deciso in chat.
  const chat = chatComeAppunti(squadra.mm, cloud.colleghi, comm);
  return [...note, ...eventi, ...chat].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 300);
}

function CardEmail({ p, stato, onFatto }: { p: Extract<Proposta, { tipo: 'email' }>; stato?: string; onFatto: (esito: string, nota: string) => void }) {
  const [a, setA] = useState(p.a), [oggetto, setOggetto] = useState(p.oggetto), [testo, setTesto] = useState(p.testo);
  return (
    <div className="aicard">
      <b>Email di aggiornamento</b>
      {stato ? <><div>{oggetto}</div><div className="aiesito">{stato}</div></> : <>
        <input className="aiin" value={a} placeholder="A: cliente@esempio.it (anche dopo, in Gmail)" onChange={e => setA(e.target.value)} />
        <input className="aiin" value={oggetto} placeholder="Oggetto" onChange={e => setOggetto(e.target.value)} />
        <textarea className="aiin" rows={8} value={testo} onChange={e => setTesto(e.target.value)} />
        <div className="aibtn">
          <button className="btn p s" disabled={!testo.trim()} onClick={() => { apriGmail(a, oggetto, testo); onFatto('✓ Aperta in Gmail: controlla e premi Invia', `Proposta ${p.id}: email aperta in Gmail dall'utente (non sappiamo se l'ha inviata).`); }}>Apri in Gmail</button>
          <button className="btn s" onClick={() => onFatto('Annullata', `Proposta ${p.id} annullata dall'utente.`)}>Annulla</button>
        </div>
      </>}
    </div>
  );
}

/** Risposta dell'esperto da salvare nell'archivio tecnico: si sceglie condivisa o privata e si può correggere il testo. */
function CardMemoria({ p, stato, onFatto }: { p: Extract<Proposta, { tipo: 'memoria' }>; stato?: string; onFatto: (esito: string, nota: string) => void }) {
  const [titolo, setTitolo] = useState(p.titolo), [testo, setTesto] = useState(p.testo), [privato, setPrivato] = useState(false), [busy, setBusy] = useState(false);
  const salva = async () => {
    setBusy(true);
    const { errore: e } = await salvaNota({ titolo, testo, cartella: 'altro', etichette: p.etichette, privato, preventivo_id: p.preventivo_id });
    setBusy(false);
    if (e) onFatto('Non riuscito: ' + e, `Proposta ${p.id} non salvata: ${e}.`);
    else { commit(); onFatto(`✓ Salvata nell'archivio tecnico (${privato ? 'privata' : 'condivisa'})`, `Proposta ${p.id} confermata: salvata nell'archivio tecnico${privato ? ' come privata' : ''}.`); }
  };
  return (
    <div className="aicard">
      <b>Salva nell'archivio tecnico · {nomiEtichette(p.etichette)}{p.commessa ? ' · ' + p.commessa : ''}</b>
      {stato ? <><div>{titolo}</div><div className="aiesito">{stato}</div></> : <>
        <input className="aiin" value={titolo} onChange={e => setTitolo(e.target.value)} />
        <textarea className="aiin" rows={8} value={testo} onChange={e => setTesto(e.target.value)} />
        <label className="small"><input type="checkbox" checked={privato} onChange={e => setPrivato(e.target.checked)} /> Privata (la vedi solo tu)</label>
        <div className="aibtn">
          <button className="btn p s" disabled={busy || !titolo.trim() || !testo.trim()} onClick={salva}>{busy ? 'Salvo…' : 'Salva'}</button>
          <button className="btn s" disabled={busy} onClick={() => onFatto('Annullata', `Proposta ${p.id} annullata dall'utente.`)}>Annulla</button>
        </div>
      </>}
    </div>
  );
}

/** Applica una sostituzione confermata: crea i codici nuovi copiando i vecchi, poi cambia le righe delle distinte. */
function applicaSostituzione(p: Extract<Proposta, { tipo: 'sostituzione' }>): string {
  const D = S.data;
  for (const c of p.coppie) {
    if (D.listino.some((x: any) => x.c === c.a)) continue;
    const da = D.listino.find((x: any) => x.c === c.da);
    if (!da) throw new Error(`il codice ${c.da} non è più nel listino`);
    const it = { ...clone(da), c: c.a, u: true };
    delete it.pil;
    if (c.descrizione_nuovo) it.d = c.descrizione_nuovo;
    if (c.peso_kg != null) it.kg = c.peso_kg;
    if (c.costo != null && it.t === 'comm') { it.costo = c.costo; delete it.sd; }
    D.listino.splice(D.listino.indexOf(da) + 1, 0, it);
  }
  const conti = sostituisci(D, p.coppie.map(c => [c.da, c.a] as [string, string]), new Set(p.gruppi));
  save(); commit();
  return `sostituite ${conti.reduce((t, c) => t + c.n, 0)} righe` + (p.nuovi.length ? `, creati nel listino ${p.nuovi.join(', ')}` : '');
}

function Card({ p, stato, onFatto }: { p: Proposta; stato?: string; onFatto: (esito: string, nota: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (p.tipo === 'email') return <CardEmail p={p} stato={stato} onFatto={onFatto} />;
  if (p.tipo === 'memoria') return <CardMemoria p={p} stato={stato} onFatto={onFatto} />;
  const conferma = async () => {
    setBusy(true);
    try {
      if (p.tipo === 'sostituzione') { const r = applicaSostituzione(p); onFatto('✓ Fatto: ' + r, `Proposta ${p.id} confermata dall'utente e applicata: ${r}.`); }
      else if (p.tipo === 'varianti') {
        const r = archVarianti(p.base, p.varianti); commit();
        onFatto('✓ ' + r.testo + (r.ids.length ? ' · scarico le offerte' : ''), `Proposta ${p.id} confermata: ${r.testo}; offerte del base e delle varianti scaricate dall'utente.`);
        if (r.ids.length) scaricaOfferte(p.base, r.ids);
      }
      else if (p.tipo === 'evento') {
        const e = await salvaScadenza({ titolo: p.titolo, giorno: p.giorno, ora: p.ora, genere: p.genere as any, nota: p.nota });
        if (e) throw new Error(e);
        commit(); onFatto('✓ Evento aggiunto al calendario', `Proposta ${p.id} confermata: evento creato nel calendario.`);
      }
      else if (p.tipo === 'nota') {
        const { errore } = await salvaNota({ titolo: p.titolo, testo: p.testo, cartella: 'altro', etichette: p.etichette, preventivo_id: p.preventivo_id });
        if (errore) throw new Error(errore);
        commit(); onFatto('✓ Nota salvata' + (p.commessa ? ' in ' + p.commessa : ' (libera)'), `Proposta ${p.id} confermata: nota salvata.`);
      }
      else if (p.tipo === 'etichette') {
        const errori: string[] = [];
        for (const n of p.note) { const e = await aggiornaDoc(n.id, { etichette: n.dopo }); if (e) errori.push(`${n.titolo}: ${e}`); }
        commit();
        if (errori.length === p.note.length) throw new Error(errori.join('; '));
        onFatto('✓ Etichette aggiornate' + (errori.length ? ` (non riuscite: ${errori.join('; ')})` : ''), `Proposta ${p.id} confermata: etichette cambiate su ${p.note.length - errori.length} note.`);
      }
    } catch (err) { onFatto('Non riuscito: ' + (err as Error).message, `Proposta ${p.id} non applicata: ${(err as Error).message}.`); }
    setBusy(false);
  };
  return (
    <div className="aicard">
      {p.tipo === 'sostituzione' ? <>
        <b>Sostituzione nelle distinte</b>
        <ul>{p.righe.map((r, i) => <li key={i}>{cap(r.g)}: <code>{r.da}</code> → <code>{r.a}</code> ×{r.n}{r.taglie.length ? ` (taglie ${r.taglie.join(', ')})` : ''}</li>)}</ul>
        {p.nuovi.length > 0 && <div className="muted">Nuovi nel listino: {p.nuovi.join(', ')}. Controlla poi peso e prezzo.</div>}
      </> : p.tipo === 'varianti' ? <>
        <b>Varianti di {p.nome}</b>
        <TabellaVarianti id={p.base} vv={p.varianti} />
      </> : p.tipo === 'nota' ? <>
        <b>Nuova nota{p.commessa ? ' · ' + p.commessa : ' libera'}</b>
        <div>{p.titolo}</div>
        {p.testo && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.testo}</div>}
        {p.etichette.length > 0 && <div className="muted">Temi: {nomiEtichette(p.etichette)}</div>}
      </> : p.tipo === 'etichette' ? <>
        <b>Etichette delle note</b>
        <ul>{p.note.map(n => <li key={n.id}>{n.titolo}: {nomiEtichette(n.prima) || '—'} → <b>{nomiEtichette(n.dopo) || 'nessuna'}</b></li>)}</ul>
      </> : <>
        <b>Nuovo evento</b>
        <div>{p.titolo}</div>
        <div className="muted">{giorno(p.giorno)}{p.ora ? ` alle ${p.ora}` : ''}{p.nota ? ` · ${p.nota}` : ''}</div>
      </>}
      {stato ? <div className="aiesito">{stato}</div> : <div className="aibtn">
        <button className="btn p s" disabled={busy} onClick={conferma}>{busy ? 'Applico…' : 'Conferma'}</button>
        <button className="btn s" disabled={busy} onClick={() => onFatto('Annullata', `Proposta ${p.id} annullata dall'utente.`)}>Annulla</button>
      </div>}
    </div>
  );
}

export function Assistente() {
  const [aperto, setAperto] = useState(false), [voci, setVoci] = useState<Voce[]>([]), [testo, setTesto] = useState(''), [busy, setBusy] = useState(false);
  const [esiti, setEsiti] = useState<Record<string, string>>({});
  const conv = useRef<unknown[]>([]), note = useRef<string[]>([]), fondo = useRef<HTMLDivElement>(null);
  const [ascolto, setAscolto] = useState(false), rec = useRef<any>(null);
  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [voci, esiti, aperto]);
  useEffect(() => () => rec.current?.abort(), []);
  useEffect(() => { if (!aperto) rec.current?.stop(); }, [aperto]);
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent).detail !== 'assistente') setAperto(false); }; window.addEventListener(PANNELLO, f); return () => window.removeEventListener(PANNELLO, f); }, []);
  if (!online()) return null;

  const detta = () => {
    if (ascolto) { rec.current?.stop(); return; }
    if (!Riconoscimento) { setVoci(v => [...v, { ruolo: 'err', testo: 'Questo browser non supporta la dettatura: usa Chrome o Edge.' }]); return; }
    const r = new Riconoscimento();
    r.lang = 'it-IT'; r.continuous = true; r.interimResults = true;
    const prima = testo.trim() ? testo.trim() + ' ' : '';
    r.onresult = (ev: any) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setTesto(prima + t.trim());
    };
    r.onerror = (ev: any) => {
      if (ev.error === 'not-allowed') setVoci(v => [...v, { ruolo: 'err', testo: 'Microfono non consentito: abilitalo dalle impostazioni del browser.' }]);
    };
    r.onend = () => { setAscolto(false); rec.current = null; };
    rec.current = r; r.start(); setAscolto(true);
  };

  const invia = async (e?: FormEvent) => {
    e?.preventDefault();
    rec.current?.stop();
    const t = testo.trim(); if (!t || busy) return;
    setTesto(''); setVoci(v => [...v, { ruolo: 'tu', testo: t }]); setBusy(true);
    try {
      const nota = note.current.length ? `[Dall'app] ${note.current.join(' ')}` : '';
      const r = await chiediAssistente({ messages: conv.current, testo: t, nota, dati: datiPerAssistente(S.data, appunti(),
        S.arch.map(e => ({ id: e.id, num: e.prev?.num || '', nome: e.nome, cliente: e.cliente || '' })), S.prev._id || null, datiTecnici(S.prev)) });
      conv.current = r.messages; note.current = [];
      setVoci(v => [...v, { ruolo: 'ai', testo: r.testo, proposte: r.proposte }]);
    } catch (err) { setVoci(v => [...v, { ruolo: 'err', testo: (err as Error).message }]); }
    setBusy(false);
  };
  const nuova = () => { conv.current = []; note.current = []; setVoci([]); setEsiti({}); };

  return <>
    {!aperto && <button className="aifab noprint" onClick={() => { apriPannello('assistente'); setAperto(true); }} title="Assistente AI">✦ Assistente</button>}
    {aperto && <aside className="aipanel noprint">
      <div className="aihead"><b>✦ Assistente</b><span style={{ flex: 1 }} />
        {voci.length > 0 && <button className="btn s" onClick={nuova}>Nuova chat</button>}
        <button className="btn x" onClick={() => setAperto(false)} title="Chiudi">✕</button></div>
      <div className="aibody">
        {!voci.length && <div className="muted aihint">Chiedimi di cambiare articoli nelle distinte o di aggiungere un evento. Per esempio:
          <ul><li>«Nel pilastro motore sostituisci bullone, dado e rondella M16 con M20»</li><li>«Aggiungi un evento domani alle 17: riunione con Rossi»</li>
            <li>«Scrivi un'email di aggiornamento al cliente con gli appunti della commessa Rossi»</li>
            <li>«Dal preventivo aperto fammene uno IPEA con asse 2,5 e uno IPE con asse 3»</li>
            <li>«Con le prove di pull-out di Foggia l'infissione da 1,2 m basta per il vento di questo impianto?»</li>
            <li>«Quante prove di pull-out servono e come le facciamo in un terreno argilloso con falda a 2 m?»</li></ul>
          Da consulente tecnico (strutture, pali, terreni) uso i documenti dell'Archivio tecnico in Dati comuni.
          Prima di cambiare qualcosa ti mostro la proposta: decidi tu se confermarla.</div>}
        {voci.map((v, i) => <div key={i} className={'aimsg ' + v.ruolo}>
          {v.testo && <div className="aitxt">{v.testo}</div>}
          {v.proposte?.map(p => <Card key={p.id} p={p} stato={esiti[p.id]} onFatto={(esito, nota) => { note.current.push(nota); setEsiti(x => ({ ...x, [p.id]: esito })); }} />)}
        </div>)}
        {busy && <div className="aimsg ai"><div className="aitxt muted">Sto pensando…</div></div>}
        <div ref={fondo} />
      </div>
      <form className="aiform" onSubmit={invia}>
        <textarea rows={2} value={testo} placeholder={ascolto ? 'Ti ascolto… parla pure' : 'Scrivi qui…'} onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } }} />
        <button type="button" className={'btn aimic' + (ascolto ? ' on' : '')} onClick={detta}
          title={ascolto ? 'Ferma la dettatura' : 'Detta a voce'}>{ascolto ? '■' : '🎤'}</button>
        <button className="btn p" disabled={busy || !testo.trim()}>Invia</button>
      </form>
    </aside>}
  </>;
}
