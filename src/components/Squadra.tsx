// Chat di squadra: pannello a destra, accanto all'assistente, dove i colleghi si scrivono (messaggi a tutti in tempo reale, anche foto e file).
// «📝 Crea nota»: si sceglie da quale messaggio partire, l'AI propone la nota (api/squadra.ts), la si corregge e si conferma: va nei Documenti.
// 🎤 Vocale: si registra l'audio (file nei Documenti) e, su Chrome/Edge, intanto il browser lo trascrive: il testo va nel messaggio e lo legge anche l'AI.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ETICHETTE, cartellaPer, immagine, type Documento } from '../domain/documenti';
import { inizioProposto, nomeDi, nonLetti, testoNota, trattoPerAI, type Messaggio, type PropostaNota } from '../domain/squadra';
import { S, commit } from '../store/state';
import { caricaFileId, chatVista, cloud, eliminaMessaggio, isAdmin, linkAnteprime, linkDoc, mioEmail, online, propostaNota, salvaNota, scriviMessaggio, segnaNota, squadra } from '../store/remote';
import { Etq, OpzioniPreventivi } from '../pages/Documenti';

// Un pannello alla volta sulla destra: aprendo la chat si chiude l'assistente e viceversa.
export const PANNELLO = 'pannello-destra';
export const apriPannello = (nome: string) => window.dispatchEvent(new CustomEvent(PANNELLO, { detail: nome }));

const ora = (t: string) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const oggiIso = () => new Date().toLocaleDateString('sv-SE');
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

/** Proposta di nota dell'AI, da correggere: titolo, testo, temi, commessa. */
function CardNota({ p, onFatto }: { p: PropostaNota & { ids: string[] }; onFatto: (esito: string) => void }) {
  const [titolo, setTitolo] = useState(p.titolo), [testo, setTesto] = useState(p.testo), [et, setEt] = useState(p.etichette), [prev, setPrev] = useState(p.preventivo_id || '');
  const [altre, setAltre] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const tog = (k: string) => setEt(et.includes(k) ? et.filter(x => x !== k) : [...et, k]);
  const salva = async () => {
    setBusy(true); setErr('');
    const r = await salvaNota({ titolo, testo, cartella: 'altro', etichette: et, preventivo_id: prev || null });
    if (r.errore || !r.id) { setErr(r.errore || 'Nota non salvata.'); setBusy(false); return; }
    const e = await segnaNota(p.ids, r.id);
    commit(); onFatto(e ? `Nota salvata, ma i messaggi non sono stati segnati: ${e}` : '');
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
      {err && <div className="sqerr">{err}</div>}
      <div className="aibtn">
        <button className="btn p s" disabled={busy || !titolo.trim()} onClick={salva}>{busy ? 'Salvo…' : 'Salva nota'}</button>
        <button className="btn s" disabled={busy} onClick={() => onFatto('annulla')}>Annulla</button>
      </div>
    </div>
  );
}

export function Squadra() {
  const [aperto, setAperto] = useState(false), [testo, setTesto] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [da, setDa] = useState<number | null>(null);   // scelta del tratto per la nota: indice del primo messaggio
  const [prop, setProp] = useState<(PropostaNota & { ids: string[] }) | null>(null), [pensa, setPensa] = useState(false), [esito, setEsito] = useState('');
  const fondo = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null);
  const mm = squadra.mm, me = mioEmail(), ultimo = mm.at(-1)?.id;
  // Link temporanei per vedere le foto e ascoltare i vocali direttamente in chat (per percorso nello Storage).
  const [link, setLink] = useState<Record<string, string>>({});
  const media = mm.map(m => m.documento_id && S.docs.find(d => d.id === m.documento_id)).filter((d): d is Documento => !!d && !!d.percorso && (immagine(d) || audio(d)));
  const mancano = aperto ? media.filter(d => !link[d.percorso!]) : [];
  useEffect(() => { if (mancano.length) linkAnteprime(mancano).then(x => setLink(l => ({ ...l, ...x }))); }, [mancano.map(d => d.id).join()]);
  const vocale = useVocale(async (f, t) => {
    setBusy(true); setErr('');
    const r = await caricaFileId(f, {}, 'altro');
    const x = r.errore || (await scriviMessaggio(t ? '🎤 ' + t : '', r.id!));
    if (x) setErr(x);
    setBusy(false); commit();
  }, setErr);
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent).detail !== 'squadra') setAperto(false); }; window.addEventListener(PANNELLO, f); return () => window.removeEventListener(PANNELLO, f); }, []);
  useEffect(() => { if (aperto) { chatVista(); commit(); } }, [aperto, ultimo]);
  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [aperto, ultimo, prop, pensa]);
  if (!online() || !cloud.session) return null;

  const apri = () => { apriPannello('squadra'); setAperto(true); };
  const nuovi = aperto ? 0 : nonLetti(mm, squadra.visto, me);
  const fileDi = (id: string) => S.docs.find(d => d.id === id);

  const invia = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = testo.trim(); if (!t || busy) return;
    setBusy(true); setErr('');
    const x = await scriviMessaggio(t);
    if (x) setErr(x); else setTesto('');
    setBusy(false); commit();
  };
  const allega = async (ff: FileList | null) => {
    if (!ff?.length) return;
    setBusy(true); setErr('');
    for (const f of Array.from(ff)) {
      const r = await caricaFileId(f, {}, cartellaPer(f.name, f.type || ''));
      const x = r.errore || (await scriviMessaggio('', r.id!));
      if (x) { setErr(x); break; }
    }
    if (file.current) file.current.value = '';
    setBusy(false); commit();
  };
  const elimina = async (m: Messaggio) => {
    if (!confirm('Eliminare il messaggio? (il file allegato resta nei Documenti)')) return;
    const x = await eliminaMessaggio(m.id); if (x) setErr(x); commit();
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
      const r = await propostaNota({ chat: trattoPerAI(tratto, cloud.colleghi, id => fileDi(id)?.titolo || ''),
        commesse: S.arch.map(e => ({ id: e.id, num: e.prev?.num || '', nome: e.nome, cliente: e.cliente || '' })),
        colleghi: cloud.colleghi.map(c => ({ email: c.email, nome: c.nome })) });
      setProp({ ...r, testo: testoNota(r, cloud.colleghi), ids: tratto.map(m => m.id) });
    } catch (e) { setErr((e as Error).message); }
    setPensa(false);
  };
  const chiudiNota = (x: string) => {
    setProp(null);
    if (x === 'annulla') return;
    setDa(null); setEsito(x || '✓ Nota salvata nei Documenti');
  };

  // Titolo della nota sotto l'ultimo messaggio del tratto che l'ha generata.
  const fineNota = (i: number) => mm[i].nota_id && mm[i + 1]?.nota_id !== mm[i].nota_id ? S.docs.find(d => d.id === mm[i].nota_id) : undefined;

  return <>
    {!aperto && <button className="aifab sqfab noprint" onClick={apri} title="Chat di squadra: scrivi ai colleghi">💬 Squadra{nuovi > 0 && <em className="sqbadge">{nuovi}</em>}</button>}
    {aperto && <aside className="aipanel sqpanel noprint">
      <div className="aihead"><b>💬 Squadra</b>
        <span className="muted small" title={cloud.presenti.map(p => p.nome || p.email).join(', ')}>{cloud.presenti.length > 1 ? `${cloud.presenti.length} collegati` : ''}</span>
        <span style={{ flex: 1 }} />
        {mm.length > 0 && da === null && !prop && <button className="btn s" onClick={() => { setEsito(''); setDa(inizioProposto(mm, oggiIso())); }} title="Fai scrivere all'AI una nota da una parte della conversazione">📝 Crea nota</button>}
        <button className="btn x" onClick={() => setAperto(false)} title="Chiudi">✕</button></div>
      <div className="aibody">
        {squadra.err ? <div className="sqerr">{squadra.err}</div> : !mm.length && <div className="muted aihint">Qui scrivete tra colleghi: i messaggi arrivano subito a tutti, anche con foto e file (📎).
          <p>Quando una discussione ha portato a qualcosa premi <b>📝 Crea nota</b>: scegli da quale messaggio partire e l'AI scrive la nota con decisioni e cose da fare. La correggi e la salvi nei Documenti.</p></div>}
        {mm.map((m, i) => {
          const mio = m.creato_da === me, giorno = giornoChat(m.creato), nuovoGiorno = i === 0 || giornoChat(mm[i - 1].creato) !== giorno;
          const stesso = !nuovoGiorno && mm[i - 1].creato_da === m.creato_da, d = m.documento_id ? fileDi(m.documento_id) : undefined, nota = fineNota(i);
          const scelto = da !== null && i >= da;
          return <div key={m.id} style={{ display: 'contents' }}>
            {nuovoGiorno && <div className="sqday">{giorno}</div>}
            <div className={`sqmsg${mio ? ' mio' : ''}${scelto ? ' scelto' : ''}${da !== null ? ' scegli' : ''}`} onClick={da !== null ? () => setDa(i) : undefined}
              title={da !== null ? 'La nota parte da qui' : undefined}>
              {!stesso && !mio && <small className="sqchi">{nomeDi(m.creato_da, cloud.colleghi)}</small>}
              <div className="sqtxt">
                {m.testo}
                {d && immagine(d) && link[d.percorso!] && <img className="sqimg" src={link[d.percorso!]} alt={d.titolo} onClick={e => { e.stopPropagation(); apriFile(d.id); }} />}
                {d && audio(d) ? (link[d.percorso!] ? <audio className="sqaudio" controls preload="metadata" src={link[d.percorso!]} onClick={e => e.stopPropagation()} /> : <span className="muted small">🎤 vocale…</span>)
                : m.documento_id && <button type="button" className="sqfile" onClick={e => { e.stopPropagation(); apriFile(m.documento_id!); }} disabled={!d}
                  title={d ? 'Apri il file' : 'File non più disponibile'}>📎 {d?.titolo || 'file eliminato'}</button>}
                <span className="sqora">{ora(m.creato)}{(mio || isAdmin()) && da === null && <button type="button" className="sqdel" onClick={() => elimina(m)} title="Elimina il messaggio">✕</button>}</span>
              </div>
            </div>
            {nota && <div className="sqnota">📝 Diventata nota: «{nota.titolo}»</div>}
          </div>;
        })}
        {prop && <CardNota p={prop} onFatto={chiudiNota} />}
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
      </div> : <form className="aiform" onSubmit={invia}>
        <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()} title="Allega foto o file (vanno anche nei Documenti)">📎</button>
        <input ref={file} type="file" multiple className="hide" onChange={e => allega(e.target.files)} />
        <textarea rows={2} value={testo} placeholder="Scrivi ai colleghi…" disabled={!!squadra.err} onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } }} />
        {testo.trim() ? <button className="btn p" disabled={busy}>Invia</button>
          : <button type="button" className="btn p" disabled={busy || !!squadra.err} onClick={vocale.avvia} title="Registra un vocale">🎤</button>}
      </form>}
    </aside>}
  </>;
}

