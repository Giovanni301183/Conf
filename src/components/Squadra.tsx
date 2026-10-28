// Chat di squadra: pannello a destra, accanto all'assistente, dove i colleghi si scrivono (messaggi a tutti in tempo reale, anche foto e file).
// «📝 Crea nota»: si sceglie da quale messaggio partire, l'AI propone la nota (api/squadra.ts), la si corregge e si conferma: va nei Documenti.
// 🎤 Vocale: si registra l'audio (file nei Documenti) e, su Chrome/Edge, intanto il browser lo trascrive: il testo va nel messaggio e lo legge anche l'AI.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ETICHETTE, cartellaPer, immagine, type Documento } from '../domain/documenti';
import { ASSISTENTE, diStanza, inizioProposto, menzioniIn, nomeDi, nonLetti, perMeNonLetti, tagDi, tagInCorso, testoNota, trattoPerAI, type Messaggio, type PropostaNota } from '../domain/squadra';
import { S, commit } from '../store/state';
import { assistenteInChat, caricaFileId, chatVista, cloud, eliminaMessaggio, isAdmin, linkAnteprime, linkDoc, mioEmail, online, propostaNota, salvaNota, salvaScadenza, scriviMessaggio, segnaNota, spostaMessaggio, squadra } from '../store/remote';
import { Etq, OpzioniPreventivi } from '../pages/Documenti';

import { APRI_CHAT, PANNELLO, apriPannello } from './pannelli';

const ora = (t: string) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const oggiIso = () => new Date().toLocaleDateString('sv-SE');
/** Giorno lavorativo dopo oggi (AAAA-MM-GG): scadenza delle cose da fare quando in chat non è stata detta. */
function domaniLav() { const d = new Date(); do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); return d.toLocaleDateString('sv-SE'); }
function giornoChat(t: string) {
  const g = new Date(t).toLocaleDateString('sv-SE'), ieri = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
  return g === oggiIso() ? 'Oggi' : g === ieri ? 'Ieri' : new Date(t).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

const Riconoscimento: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;
const MAX_VOCALE = 5 * 60;   // secondi: oltre si ferma da solo
const audio = (d?: Pick<Documento, 'mime'>) => !!d?.mime?.startsWith('audio/');
const durata = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Registrazione di un vocale: audio dal microfono e, dove il browser lo sa fare, trascrizione in italiano mentre si parla. */
function useVocale(onFine: (f: File, trascritto: string) => void, onErr: (m: string) => void) {
  const [sec, setSec] = useState<number | null>(null);   // null = non sto registrando
  const rec = useRef<MediaRecorder | null>(null), parla = useRef<any>(null), testo = useRef(''), annulla = useRef(false), timer = useRef<number | undefined>(undefined);
  const pulisci = () => { clearInterval(timer.current); rec.current?.stream.getTracks().forEach(t => t.stop()); rec.current = null; parla.current = null; setSec(null); };
  const ferma = (scarta = false) => { annulla.current = scarta; parla.current?.stop(); if (rec.current?.state === 'recording') rec.current.stop(); else pulisci(); };
  useEffect(() => () => { annulla.current = true; parla.current?.abort(); if (rec.current?.state === 'recording') rec.current.stop(); clearInterval(timer.current); }, []);
  const avvia = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onErr('Questo browser non registra audio.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { onErr('Microfono non consentito: abilitalo dalle impostazioni del browser.'); return; }
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined), pezzi: Blob[] = [];
    r.ondataavailable = e => { if (e.data.size) pezzi.push(e.data); };
    // Le ultime parole trascritte arrivano poco dopo lo stop: si aspetta la fine della trascrizione (al massimo 2 secondi).
    let finito: Promise<unknown> = Promise.resolve();
    r.onstop = async () => {
      const scarta = annulla.current; pulisci();
      if (scarta || !pezzi.length) return;
      await Promise.race([finito, new Promise(ok => setTimeout(ok, 2000))]);
      const mime = (r.mimeType || tipo || 'audio/webm').split(';')[0], ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const quando = new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[/:]/g, '-').replace(/,/g, '');
      onFine(new File(pezzi, `Vocale ${quando}.${ext}`, { type: mime }), testo.current.trim());
    };
    testo.current = ''; annulla.current = false; rec.current = r; r.start(1000);
    if (Riconoscimento) {
      try {
        const p = new Riconoscimento(); p.lang = 'it-IT'; p.continuous = true; p.interimResults = false;
        p.onresult = (ev: any) => { let t = ''; for (let i = 0; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript + ' '; testo.current = t; };
        finito = new Promise(ok => { p.onend = ok; p.onerror = ok; });
        parla.current = p; p.start();
      } catch { parla.current = null; }
    }
    setSec(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSec(s); if (s >= MAX_VOCALE) ferma(); }, 500);
  };
  return { sec, avvia, ferma };
}

/** Proposta di nota dell'AI, da correggere: titolo, testo, temi, commessa; le cose da fare scelte diventano voci d'agenda. */
function CardNota({ p, onFatto }: { p: PropostaNota & { ids: string[] }; onFatto: (esito: string) => void }) {
  const [titolo, setTitolo] = useState(p.titolo), [testo, setTesto] = useState(p.testo), [et, setEt] = useState(p.etichette), [prev, setPrev] = useState(p.preventivo_id || '');
  const [altre, setAltre] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  // Cose da fare per l'agenda: accese quelle con un collega; senza scadenza detta, il giorno lavorativo dopo.
  const [fare, setFare] = useState(() => p.da_fare.filter(x => x.cosa.trim()).map(x => ({ ...x, si: !!x.chi, entro: x.entro || domaniLav() })));
  const cambia = (i: number, v: Partial<(typeof fare)[number]>) => setFare(ff => ff.map((x, k) => (k === i ? { ...x, ...v } : x)));
  const tog = (k: string) => setEt(et.includes(k) ? et.filter(x => x !== k) : [...et, k]);
  const salva = async () => {
    setBusy(true); setErr('');
    const r = await salvaNota({ titolo, testo, cartella: 'altro', etichette: et, preventivo_id: prev || null });
    if (r.errore || !r.id) { setErr(r.errore || 'Nota non salvata.'); setBusy(false); return; }
    const errori: string[] = [], scelte = fare.filter(x => x.si && x.cosa.trim());
    const e = await segnaNota(p.ids, r.id);
    if (e) errori.push('messaggi non segnati: ' + e);
    for (const x of scelte) {
      const e2 = await salvaScadenza({ titolo: x.cosa.trim(), giorno: x.entro || domaniLav(), genere: 'attivita', preventivo_id: prev || null, assegnata_a: x.chi || null, nota: `Dalla nota «${titolo.trim()}» (chat di squadra)` });
      if (e2) errori.push(`«${x.cosa}»: ${e2}`);
    }
    commit();
    onFatto(errori.length ? `Nota salvata, ma: ${errori.join('; ')}` : `✓ Nota salvata nei Documenti${scelte.length ? ` e ${scelte.length} ${scelte.length === 1 ? 'cosa da fare' : 'cose da fare'} in agenda` : ''}`);
  };
  return (
    <div className="aicard sqcard">
      <b>📝 Nota da {p.ids.length} messaggi{prev ? ' · ' + (S.arch.find(a => a.id === prev)?.nome || '') : ' · libera'}</b>
      <input className="aiin" value={titolo} placeholder="Titolo" onChange={e => setTitolo(e.target.value)} />
      <textarea className="aiin" rows={10} value={testo} onChange={e => setTesto(e.target.value)} />
      <select className="aiin" value={prev} onChange={e => setPrev(e.target.value)} title="Commessa o preventivo della nota">
        <option value="">Nessuna commessa (nota libera)</option><OpzioniPreventivi />
      </select>
      <div className="etqs">
        {(altre ? ETICHETTE.map(e => e[0]) : et).map(k => <Etq key={k} k={k} on={et.includes(k)} onClick={() => tog(k)} />)}
        <button type="button" className="etq" onClick={() => setAltre(!altre)}>{altre ? 'Chiudi' : et.length ? '+ Altri temi' : '+ Temi'}</button>
      </div>
      {fare.length > 0 && <div className="sqfare">
        <b className="small">Cose da fare → agenda</b>
        {fare.map((x, i) => <div key={i} className={`sqfr${x.si ? '' : ' off'}`}>
          <label className="small"><input type="checkbox" checked={x.si} onChange={e => cambia(i, { si: e.target.checked })} /> {x.cosa}</label>
          {x.si && <div className="sqfrx">
            <select className="aiin" value={x.chi} onChange={e => cambia(i, { chi: e.target.value })} title="Chi se ne occupa">
              <option value="">Nessuno in particolare</option>
              {cloud.colleghi.map(c => <option key={c.email} value={c.email}>{c.nome || c.email}</option>)}
            </select>
            <input className="aiin" type="date" value={x.entro} onChange={e => cambia(i, { entro: e.target.value })} title="Entro il" />
          </div>}
        </div>)}
      </div>}
      {err && <div className="sqerr">{err}</div>}
      <div className="aibtn">
        <button className="btn p s" disabled={busy || !titolo.trim()} onClick={salva}>{busy ? 'Salvo…' : 'Salva nota'}</button>
        <button className="btn s" disabled={busy} onClick={() => onFatto('annulla')}>Annulla</button>
      </div>
    </div>
  );
}

/** Testo del messaggio con i @nomi evidenziati (il mio in giallo). */
function ConTag({ t, mie }: { t: string; mie: string[] }) {
  const pezzi = t.split(/(@[\p{L}\p{N}._-]+)/u);
  return <>{pezzi.map((x, i) => (i % 2 ? <b key={i} className={`sqtag${mie.some(m => x.slice(1).toLowerCase() === m) ? ' me' : ''}`}>{x}</b> : x))}</>;
}

export function Squadra() {
  const [aperto, setAperto] = useState(false), [testo, setTesto] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [stanza, setStanza] = useState<string | null>(null);   // commessa della stanza aperta (null = Generale)
  const [risposta, setRisposta] = useState<Messaggio | null>(null), [sposta, setSposta] = useState<string | null>(null), [aiPensa, setAiPensa] = useState(false);
  const [da, setDa] = useState<number | null>(null);   // scelta del tratto per la nota: indice del primo messaggio della stanza
  const [prop, setProp] = useState<(PropostaNota & { ids: string[] }) | null>(null), [pensa, setPensa] = useState(false), [esito, setEsito] = useState('');
  const fondo = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null), casella = useRef<HTMLTextAreaElement>(null);
  const tutti = squadra.mm, mm = diStanza(tutti, stanza), me = mioEmail(), ultimo = tutti.at(-1)?.id;
  // Link temporanei per vedere le foto e ascoltare i vocali direttamente in chat (per percorso nello Storage).
  const [link, setLink] = useState<Record<string, string>>({});
  const media = mm.map(m => m.documento_id && S.docs.find(d => d.id === m.documento_id)).filter((d): d is Documento => !!d && !!d.percorso && (immagine(d) || audio(d)));
  const mancano = aperto ? media.filter(d => !link[d.percorso!]) : [];
  useEffect(() => { if (mancano.length) linkAnteprime(mancano).then(x => setLink(l => ({ ...l, ...x }))); }, [mancano.map(d => d.id).join()]);
  const vocale = useVocale(async (f, t) => {
    setBusy(true); setErr('');
    const r = await caricaFileId(f, stanza ? { preventivo_id: stanza } : {}, 'altro');
    const x = r.errore || (await manda(t ? '🎤 ' + t : '', r.id!));
    if (x) setErr(x);
    setBusy(false); commit();
  }, setErr);
  useEffect(() => {
    const chiudi = (e: Event) => { if ((e as CustomEvent).detail !== 'squadra') setAperto(false); };
    const apriIn = (e: Event) => { setStanza((e as CustomEvent).detail ?? null); setDa(null); setProp(null); setRisposta(null); apriPannello('squadra'); setAperto(true); };
    window.addEventListener(PANNELLO, chiudi); window.addEventListener(APRI_CHAT, apriIn);
    return () => { window.removeEventListener(PANNELLO, chiudi); window.removeEventListener(APRI_CHAT, apriIn); };
  }, []);
  useEffect(() => { if (aperto) { chatVista(); commit(); } }, [aperto, ultimo]);
  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [aperto, ultimo, prop, pensa, stanza, aiPensa]);
  if (!online() || !cloud.session) return null;

  const apri = () => { apriPannello('squadra'); setAperto(true); };
  // Il pallino conta i messaggi arrivati da quando ho guardato la chat; quelli dove mi chiamano con @ si segnalano a parte.
  const nuovi = aperto ? 0 : nonLetti(tutti, squadra.visto, me), perMe = aperto ? 0 : perMeNonLetti(tutti, squadra.visto, me);
  const fileDi = (id: string) => S.docs.find(d => d.id === id);
  const commessa = (id?: string | null) => (id ? S.arch.find(a => a.id === id) : undefined);
  const nomeStanza = (id: string | null) => { const c = commessa(id); return id ? (c ? `${c.prev?.num ? 'N° ' + c.prev.num + ' · ' : ''}${c.nome}` : 'Commessa eliminata') : 'Generale'; };
  // Stanze: Generale, le commesse vinte, quelle dove si è già scritto e il preventivo aperto.
  const stanze = [...new Set<string>([...S.arch.filter(e => e.prev?.stato === 'vinto').map(e => e.id), ...tutti.map(m => m.preventivo_id || '').filter(Boolean), ...(S.prev._id ? [S.prev._id] : []), ...(stanza ? [stanza] : [])])]
    .filter(id => commessa(id)).sort((a, b) => nomeStanza(a).localeCompare(nomeStanza(b)));
  const nuoviIn = (id: string | null) => nonLetti(diStanza(tutti, id), squadra.visto, me);
  const cambiaStanza = (s: string | null) => { setStanza(s); setDa(null); setProp(null); setRisposta(null); setSposta(null); setEsito(''); };
  const commesse = () => S.arch.map(e => ({ id: e.id, num: e.prev?.num || '', nome: e.nome, cliente: e.cliente || '' }));
  const persone = [...cloud.colleghi.filter(c => c.email !== me).map(c => ({ tag: tagDi(c), nome: c.nome || c.email })), { tag: 'assistente', nome: '✦ Assistente (risponde in chat)' }];
  const inCorso = tagInCorso(testo), suggeriti = inCorso === null ? [] : persone.filter(p => p.tag.toLowerCase().startsWith(inCorso.toLowerCase())).slice(0, 6);
  const metti = (tag: string) => { setTesto(testo.replace(/@[\p{L}\p{N}._-]*$/u, '@' + tag + ' ')); casella.current?.focus(); };

  /** Manda nella stanza aperta, con risposta e @menzioni; con @assistente chiede anche la risposta all'AI. */
  async function manda(t: string, documento_id: string | null = null): Promise<string> {
    const menzioni = menzioniIn(t, cloud.colleghi);
    const r = await scriviMessaggio(t, documento_id, { preventivo_id: stanza, risposta_a: risposta?.id || null, menzioni });
    if (r.errore) return r.errore;
    setRisposta(null);
    if (menzioni.includes(ASSISTENTE)) {
      setAiPensa(true);
      // La domanda con le ultime righe della stanza: il server scrive la risposta come messaggio dell'assistente.
      const righe = diStanza(squadra.mm, stanza).slice(-40);
      assistenteInChat({ domanda: r.id!, stanza, chat: trattoPerAI(righe, cloud.colleghi, id => fileDi(id)?.titolo || ''), commesse: commesse() })
        .catch(e => setErr("L'assistente non ha risposto: " + (e as Error).message)).finally(() => { setAiPensa(false); commit(); });
    }
    return '';
  }
  const invia = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = testo.trim(); if (!t || busy) return;
    setBusy(true); setErr('');
    const x = await manda(t);
    if (x) setErr(x); else setTesto('');
    setBusy(false); commit();
  };
  const allega = async (ff: FileList | null) => {
    if (!ff?.length) return;
    setBusy(true); setErr('');
    for (const f of Array.from(ff)) {
      const r = await caricaFileId(f, stanza ? { preventivo_id: stanza } : {}, cartellaPer(f.name, f.type || ''));
      const x = r.errore || (await manda('', r.id!));
      if (x) { setErr(x); break; }
    }
    if (file.current) file.current.value = '';
    setBusy(false); commit();
  };
  const elimina = async (m: Messaggio) => {
    if (!confirm('Eliminare il messaggio? (il file allegato resta nei Documenti)')) return;
    const x = await eliminaMessaggio(m.id); if (x) setErr(x); commit();
  };
  const spostaIn = async (m: Messaggio, dove: string) => {
    setSposta(null);
    const x = await spostaMessaggio(m.id, dove || null);
    if (x) setErr(x); else setEsito(`Messaggio spostato in «${nomeStanza(dove || null)}»`);
    commit();
  };
  const apriFile = async (id: string) => {
    const d = fileDi(id); if (!d) return;
    try { window.open(await linkDoc(d), '_blank', 'noopener'); } catch (e) { setErr((e as Error).message); }
  };
  const proponi = async () => {
    if (da === null) return;
    const tratto = mm.slice(da);
    setPensa(true); setErr(''); setEsito('');
    try {
      const r = await propostaNota({ chat: (stanza ? `Stanza della commessa ${nomeStanza(stanza)} (id ${stanza})\n` : '') + trattoPerAI(tratto, cloud.colleghi, id => fileDi(id)?.titolo || ''),
        commesse: commesse(), colleghi: cloud.colleghi.map(c => ({ email: c.email, nome: c.nome })) });
      setProp({ ...r, preventivo_id: r.preventivo_id || stanza, testo: testoNota(r, cloud.colleghi), ids: tratto.map(m => m.id) });
    } catch (e) { setErr((e as Error).message); }
    setPensa(false);
  };
  const chiudiNota = (x: string) => {
    setProp(null);
    if (x === 'annulla') return;
    setDa(null); setEsito(x);
  };

  // Titolo della nota sotto l'ultimo messaggio del tratto che l'ha generata.
  const fineNota = (i: number) => mm[i].nota_id && mm[i + 1]?.nota_id !== mm[i].nota_id ? S.docs.find(d => d.id === mm[i].nota_id) : undefined;
  const citato = (id: string) => tutti.find(m => m.id === id);
  const mieTag = [tagDi(cloud.me ? { email: me, nome: cloud.me.nome } : { email: me, nome: null }).toLowerCase(), me.split('@')[0]];

  return <>
    {!aperto && <button className="aifab sqfab noprint" onClick={apri} title={perMe ? `Ti hanno chiamato con @ in ${perMe} messaggi` : 'Chat di squadra: scrivi ai colleghi'}>
      💬 Squadra{nuovi > 0 && <em className={`sqbadge${perMe ? ' me' : ''}`}>{perMe ? '@' : ''}{nuovi}</em>}</button>}
    {aperto && <aside className="aipanel sqpanel noprint">
      <div className="aihead"><b>💬</b>
        <select className="sqstanza" value={stanza || ''} onChange={e => cambiaStanza(e.target.value || null)} title="Stanza: Generale o una commessa">
          <option value="">Generale{nuoviIn(null) ? ` (${nuoviIn(null)})` : ''}</option>
          {stanze.length > 0 && <optgroup label="Commesse">{stanze.map(id => <option key={id} value={id}>{nomeStanza(id)}{nuoviIn(id) ? ` (${nuoviIn(id)})` : ''}</option>)}</optgroup>}
        </select>
        <span className="muted small" title={cloud.presenti.map(p => p.nome || p.email).join(', ')}>{cloud.presenti.length > 1 ? `${cloud.presenti.length} collegati` : ''}</span>
        <span style={{ flex: 1 }} />
        {mm.length > 0 && da === null && !prop && <button className="btn s" onClick={() => { setEsito(''); setDa(inizioProposto(mm, oggiIso())); }} title="Fai scrivere all'AI una nota da una parte della conversazione">📝 Crea nota</button>}
        <button className="btn x" onClick={() => setAperto(false)} title="Chiudi">✕</button></div>
      <div className="aibody">
        {squadra.err ? <div className="sqerr">{squadra.err}</div> : !mm.length && <div className="muted aihint">{stanza ? <>Stanza della commessa <b>{nomeStanza(stanza)}</b>: qui si parla solo di lei. Foto e file vanno anche nei suoi Documenti.</> : 'Qui scrivete tra colleghi: i messaggi arrivano subito a tutti, anche con foto, file (📎) e vocali (🎤).'}
          <ul><li><b>@nome</b> per chiamare un collega, <b>@assistente</b> per una domanda tecnica all'AI: risponde in chat.</li>
            <li><b>↩</b> su un messaggio per rispondere citandolo; <b>🔗</b> per spostarlo nella stanza di una commessa.</li>
            <li><b>📝 Crea nota</b>: l'AI scrive la nota con decisioni e cose da fare, che puoi mettere in agenda.</li></ul></div>}
        {mm.map((m, i) => {
          const mio = m.creato_da === me, ai = m.creato_da === ASSISTENTE, giorno = giornoChat(m.creato), nuovoGiorno = i === 0 || giornoChat(mm[i - 1].creato) !== giorno;
          const stesso = !nuovoGiorno && mm[i - 1].creato_da === m.creato_da && !m.risposta_a, d = m.documento_id ? fileDi(m.documento_id) : undefined, nota = fineNota(i);
          const scelto = da !== null && i >= da, q = m.risposta_a ? citato(m.risposta_a) : undefined, perMeQui = !mio && !!m.menzioni?.includes(me);
          return <div key={m.id} style={{ display: 'contents' }}>
            {nuovoGiorno && <div className="sqday">{giorno}</div>}
            <div className={`sqmsg${mio ? ' mio' : ''}${ai ? ' ai' : ''}${perMeQui ? ' perme' : ''}${scelto ? ' scelto' : ''}${da !== null ? ' scegli' : ''}`} onClick={da !== null ? () => setDa(i) : undefined}
              title={da !== null ? 'La nota parte da qui' : undefined}>
              {!stesso && !mio && <small className="sqchi">{nomeDi(m.creato_da, cloud.colleghi)}</small>}
              <div className="sqtxt">
                {m.risposta_a && <div className="sqcit">{q ? <><b>{nomeDi(q.creato_da, cloud.colleghi)}</b> {(q.testo || (q.documento_id ? '📎 ' + (fileDi(q.documento_id)?.titolo || 'file') : '')).slice(0, 140)}</> : <i>messaggio eliminato</i>}</div>}
                {m.testo && <span><ConTag t={m.testo} mie={mieTag} /></span>}
                {d && immagine(d) && link[d.percorso!] && <img className="sqimg" src={link[d.percorso!]} alt={d.titolo} onClick={e => { e.stopPropagation(); apriFile(d.id); }} />}
                {d && audio(d) ? (link[d.percorso!] ? <audio className="sqaudio" controls preload="metadata" src={link[d.percorso!]} onClick={e => e.stopPropagation()} /> : <span className="muted small">🎤 vocale…</span>)
                : m.documento_id && <button type="button" className="sqfile" onClick={e => { e.stopPropagation(); apriFile(m.documento_id!); }} disabled={!d}
                  title={d ? 'Apri il file' : 'File non più disponibile'}>📎 {d?.titolo || 'file eliminato'}</button>}
                <span className="sqora">
                  {da === null && <>
                    <button type="button" className="sqact" onClick={() => { setRisposta(m); casella.current?.focus(); }} title="Rispondi citando questo messaggio">↩</button>
                    <button type="button" className="sqact" onClick={() => setSposta(sposta === m.id ? null : m.id)} title={stanza ? 'Sposta in un\'altra stanza' : 'Sposta nella stanza di una commessa'}>🔗</button>
                    {(mio || isAdmin()) && <button type="button" className="sqact del" onClick={() => elimina(m)} title="Elimina il messaggio">✕</button>}
                  </>}
                  {ora(m.creato)}
                </span>
                {sposta === m.id && <select className="aiin" autoFocus value="" onChange={e => spostaIn(m, e.target.value === '-' ? '' : e.target.value)} onClick={e => e.stopPropagation()}>
                  <option value="" disabled>Sposta in…</option>
                  {stanza && <option value="-">Generale</option>}
                  <OpzioniPreventivi />
                </select>}
              </div>
            </div>
            {nota && <div className="sqnota">📝 Diventata nota: «{nota.titolo}»</div>}
          </div>;
        })}
        {aiPensa && <div className="sqmsg ai"><small className="sqchi">✦ Assistente</small><div className="sqtxt muted">Sto scrivendo…</div></div>}
        {prop && <CardNota key={prop.ids.join()} p={prop} onFatto={chiudiNota} />}
        {pensa && <div className="aimsg ai"><div className="aitxt muted">Scrivo la nota…</div></div>}
        {esito && <div className="sqok">{esito}</div>}
        {err && <div className="sqerr">{err}</div>}
        <div ref={fondo} />
      </div>
      {da !== null && !prop ? <div className="aiform sqscelta">
        <div className="small" style={{ flex: 1 }}><b>{mm.length - da} messaggi</b> per la nota, dal {giornoChat(mm[da].creato).toLowerCase()} alle {ora(mm[da].creato)}.
          <div className="muted">Tocca un messaggio per partire da lì.</div></div>
        <button className="btn p" disabled={pensa} onClick={proponi}>{pensa ? 'Scrivo…' : 'Proponi nota'}</button>
        <button className="btn" disabled={pensa} onClick={() => setDa(null)}>Annulla</button>
      </div> : vocale.sec !== null ? <div className="aiform sqscelta">
        <span className="sqrec">● Registro {durata(vocale.sec)}</span>
        <span className="muted small" style={{ flex: 1 }}>{Riconoscimento ? 'Parla pure: trascrivo anche il testo.' : 'Parla pure.'}</span>
        <button className="btn p" onClick={() => vocale.ferma()}>■ Invia</button>
        <button className="btn" onClick={() => vocale.ferma(true)} title="Butta via la registrazione">✕</button>
      </div> : <div className="sqbasso">
        {risposta && <div className="sqrisp">↩ <b>{nomeDi(risposta.creato_da, cloud.colleghi)}</b> <span>{(risposta.testo || '📎 file').slice(0, 90)}</span>
          <button type="button" className="sqact" onClick={() => setRisposta(null)} title="Non rispondere a questo messaggio">✕</button></div>}
        {suggeriti.length > 0 && <div className="sqsug">{suggeriti.map(p => <button key={p.tag} type="button" onClick={() => metti(p.tag)}><b>@{p.tag}</b> <span className="muted">{p.nome}</span></button>)}</div>}
        <form className="aiform" onSubmit={invia}>
          <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()} title="Allega foto o file (vanno anche nei Documenti)">📎</button>
          <input ref={file} type="file" multiple className="hide" onChange={e => allega(e.target.files)} />
          <textarea ref={casella} rows={2} value={testo} placeholder={stanza ? `Scrivi in ${nomeStanza(stanza)}… (@ per chiamare qualcuno)` : 'Scrivi ai colleghi… (@ per chiamare qualcuno)'} disabled={!!squadra.err} onChange={e => setTesto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Tab' && suggeriti.length) { e.preventDefault(); metti(suggeriti[0].tag); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (suggeriti.length && inCorso) metti(suggeriti[0].tag); else invia(); }
            }} />
          {testo.trim() ? <button className="btn p" disabled={busy}>Invia</button>
            : <button type="button" className="btn p" disabled={busy || !!squadra.err} onClick={vocale.avvia} title="Registra un vocale">🎤</button>}
        </form>
      </div>}
    </aside>}
  </>;
}
