// Modulo del preventivo dentro Telegram: l'operatore scrive i dati, guarda l'anteprima (calcolo e testi dell'offerta) e solo dopo
// crea il preventivo e riceve il PowerPoint in chat. Ogni modifica annulla l'anteprima: si invia sempre quello che si e' visto.
// Il server (api/modulo.ts) riconosce il collega dai dati firmati di Telegram e fa calcolo e offerta come l'app.
import { Fragment, useEffect, useState } from 'react';
import { disegna, leggiDxf } from '../domain/dxf';
import { eur, fL, fN } from '../domain/format';

const tg: any = (window as any).Telegram?.WebApp;
const parametri = new URLSearchParams(location.search);

type Riga = { n: string; taglia: string; tipo: string; prof: string; asse: string; omega: string; lFond: number; lCusc: number };
type Layout = { url: string; w: number; h: number; nome: string; dxf: Record<string, number> | null };
type Campi = {
  cliente: string; rif: string; localita: string; referente: string; email: string; zona: string; rev: string; wp: string; modulo: string; righe: Riga[];
  resa: string; pagamento: string; consegna: string; validita: string;
  margine: string; margini: Record<string, string>; trasporto: string; posa: string; pieno: string; layout: Layout | null | false;
  prog: Record<string, string>; lat: string; lng: string;
  [componente: string]: any;   // quadri e sensori (centralina, piranometro…): numero di pezzi, vuoto = 0
};
const rigaNuova = (taglia = '36'): Riga => ({ n: '', taglia, tipo: 'Agrivoltaico', prof: 'IPE 140', asse: '2,5', omega: '2,0', lFond: 3, lCusc: 2.3 });
const vuoti = (): Campi => ({ cliente: parametri.get('cliente') || '', rif: '', localita: '', referente: '', email: '', zona: '', resa: '', pagamento: '', consegna: '', validita: '', rev: '0', wp: '600', modulo: '', righe: [rigaNuova()],
  margine: '', margini: {}, trasporto: '', posa: '', pieno: '', layout: null, prog: {}, lat: '', lng: '' });
const CATEGORIE_ESP = ['I', 'II', 'III', 'IV', 'V'], CORROSIVITA = ['C1', 'C2', 'C3', 'C4', 'C5', 'CX'];

async function chiama(azione: string, campi: unknown = {}) {
  const r = await fetch('/api/modulo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tg?.initData || '', azione, campi }) });
  return r.json().catch(() => ({ ok: false, errore: `Errore del server (${r.status})` }));
}

// Foto: ridotta nel telefono e salvata in JPG (un PNG di una foto peserebbe troppo). Il DXF si disegna come nell'app, scritte comprese.
function fotoInJpg(f: File, max = 1800): Promise<Layout> {
  return new Promise((ok, ko) => {
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(u); ok({ url: cv.toDataURL('image/jpeg', 0.85), w: W, h: H, nome: f.name, dxf: null });
    };
    img.onerror = () => { URL.revokeObjectURL(u); ko(new Error('immagine non leggibile')); };
    img.src = u;
  });
}

function Seg({ v, opts, set }: { v: string; opts: readonly (readonly [string, string])[]; set: (x: string) => void }) {
  return <div className="seg">{opts.map(([k, l]) => <button key={k} type="button" className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
}
function Campo({ label, children, nota }: { label: string; children: React.ReactNode; nota?: string }) {
  return <label className="campo"><span>{label}</span>{children}{nota ? <small>{nota}</small> : null}</label>;
}

export function Modulo() {
  const [f, setF] = useState<Campi>(vuoti);
  const [cfg, setCfg] = useState<any>(null);
  const [errore, setErrore] = useState('');
  const [prev, setPrev] = useState<any>(null);       // anteprima valida per i campi attuali
  const [busy, setBusy] = useState('');
  const [fatto, setFatto] = useState<any>(null);     // esito dell'ultimo "Crea e invia": da li' in poi si corregge lo stesso preventivo
  const [esito, setEsito] = useState(false);
  const [catAperte, setCatAperte] = useState(false);
  const [sito, setSito] = useState('');           // motivazione della proposta dalla localita'
  const [spot, setSpot] = useState(''), [spotEsito, setSpotEsito] = useState('');   // prezzo spot e margini ricalcolati
  const id = fatto?.id || parametri.get('id') || '';

  useEffect(() => {
    tg?.ready(); tg?.expand();
    if (!tg?.initData) { setErrore('Questo modulo si apre da Telegram, con il pulsante «Compila preventivo» che manda il bot.'); return; }
    chiama('dati', { id }).then(r => {
      if (!r.ok) { setErrore(r.errore); return; }
      setCfg(r);
      if (r.prev) setF({ ...vuoti(), ...r.prev, margini: r.prev.margini || {}, prog: r.prev.prog || {} });
      else setF(x => ({ ...x, righe: [rigaNuova(r.taglie.includes('36') ? '36' : r.taglie[0])] }));
    }).catch(() => setErrore('Server non raggiungibile: riprova tra poco.'));
  }, []);

  const cambia = (p: Partial<Campi>) => { setF(x => ({ ...x, ...p })); setPrev(null); };
  const cambiaRiga = (i: number, p: Partial<Riga>) => cambia({ righe: f.righe.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, ...p }, min = cfg?.opzioni.minCusc[n.tipo] ?? 2.3;
    if (n.lCusc < min) n.lCusc = min;
    return n;
  }) });

  const cambiaProg = (k: string, v: string) => cambia({ prog: { ...f.prog, [k]: v } });
  // Campo della slide "Dati di progetto", con l'etichetta del modello (cfg.progetto: [chiave, etichetta, esempio]).
  const prog = (k: string, modo: 'text' | 'decimal' | 'numeric' = 'text', nota?: string) => {
    const [, label, es] = cfg.progetto.find((p: string[]) => p[0] === k) || [k, k, ''];
    return <Campo key={k} label={label} nota={nota}><input inputMode={modo} value={f.prog[k] ?? ''} placeholder={'es. ' + es} onChange={e => cambiaProg(k, e.target.value)} /></Campo>;
  };
  async function proponi() {
    if (!f.localita.trim() && !f.lat) { tg?.showAlert?.('Scrivi prima la località (in Commessa).'); return; }
    setBusy('sito');
    const r = await chiama('sito', { localita: f.localita, lat: f.lat, lng: f.lng }).catch(() => ({ ok: false, errore: 'Servizio non raggiungibile.' }));
    setBusy('');
    if (!r.ok) { tg?.showAlert ? tg.showAlert(r.errore) : alert(r.errore); return; }
    cambia({ lat: String(r.lat), lng: String(r.lng), prog: { ...f.prog, categoria_terreno: r.categoria_terreno, classe_corrosivita: r.classe_corrosivita, altitudine_m: r.altitudine_m } });
    setSito('Proposta: ' + r.motivo);
  }

  // Prezzo spot: il server sposta tutti i margini degli stessi punti finche' il prezzo e' quello scritto.
  async function calcolaSpot() {
    const v = Number(spot.replace(/\./g, '').replace(',', '.'));
    if (!(v > 0)) { tg?.showAlert?.('Scrivi il prezzo totale in euro, es. 250.000'); return; }
    setBusy('spot');
    const r = await chiama('spot', { ...f, id: id || undefined, spot: v }).catch(() => ({ ok: false, errore: 'Server non raggiungibile.' }));
    setBusy('');
    if (!r.ok) { tg?.showAlert ? tg.showAlert(r.errore) : alert(r.errore); return; }
    cambia({ margine: r.margine, margini: r.margini }); setSpotEsito(r.testo);
  }

  async function caricaLayout(file: File) {
    try {
      if (/\.dxf$/i.test(file.name)) {
        const L = leggiDxf(await file.text()), img = disegna(L);
        const dxf = Object.keys(L.tracker).length ? L.tracker : null;
        cambia({ layout: { url: img.url, w: img.w, h: img.h, nome: file.name, dxf } });
      } else cambia({ layout: await fotoInJpg(file) });
    } catch (e) { tg?.showAlert?.('File non leggibile: ' + (e as Error).message); }
  }
  const usaDxf = () => {
    const T = f.layout && f.layout.dxf; if (!T) return;
    cambia({ righe: Object.entries(T).filter(([t]) => cfg.taglie.includes(t)).map(([t, n]) => ({ ...rigaNuova(t), n: String(n) })) });
  };

  async function esegui(azione: 'anteprima' | 'crea') {
    setBusy(azione);
    const r = await chiama(azione, { ...f, id: id || undefined }).catch(() => ({ ok: false, errore: 'Server non raggiungibile.' }));
    setBusy('');
    if (!r.ok) { tg?.HapticFeedback?.notificationOccurred('error'); tg?.showAlert ? tg.showAlert(r.errore) : alert(r.errore); return; }
    if (azione === 'anteprima') { setPrev(r); setTimeout(() => document.getElementById('anteprima')?.scrollIntoView({ behavior: 'smooth' }), 50); }
    else { tg?.HapticFeedback?.notificationOccurred('success'); setFatto(r); setEsito(true); setPrev(null); window.scrollTo({ top: 0 }); }
  }

  if (errore) return <main><h1>Compila preventivo</h1><p className="err">{errore}</p></main>;
  if (!cfg) return <main><p className="muted">Carico…</p></main>;
  if (fatto && esito) return (
    <main>
      <h1>✅ Preventivo N° {fatto.numero}</h1>
      <p>{fatto.offerta === 'inviata nella chat privata con il bot' ? "L'offerta PowerPoint è nella chat con il bot: da lì la inoltri al cliente." : 'Offerta ' + fatto.offerta}</p>
      <pre className="riep">{fatto.testo}</pre>
      <p className="muted">Il preventivo è nell'archivio dell'app. Puoi correggerlo qui e rimandare l'offerta.</p>
      <div className="azioni"><button className="sec" onClick={() => setEsito(false)}>Correggi</button><button onClick={() => tg?.close()}>Chiudi</button></div>
    </main>
  );

  const L = f.layout || null, o = cfg.opzioni;
  return (
    <main>
      <h1>{id ? `Preventivo N° ${fatto?.numero || cfg.numero || '–'}` : 'Nuovo preventivo'}</h1>

      <section>
        <h2>Commessa</h2>
        <Campo label="Cliente *"><input value={f.cliente} onChange={e => cambia({ cliente: e.target.value })} /></Campo>
        <Campo label="Nome impianto" nota="Titolo della copertina e della slide Layout: breve. Vuoto = nome del cliente.">
          <input value={f.rif} maxLength={60} onChange={e => cambia({ rif: e.target.value })} placeholder={f.cliente} /></Campo>
        <div className="due">
          <Campo label="Località"><input value={f.localita} onChange={e => cambia({ localita: e.target.value, lat: '', lng: '' })} placeholder="es. Marsala (TP)" /></Campo>
          <Campo label="Referente"><input value={f.referente} onChange={e => cambia({ referente: e.target.value })} /></Campo>
        </div>
        <div className="due">
          <Campo label="E-mail referente"><input type="email" value={f.email} onChange={e => cambia({ email: e.target.value })} /></Campo>
          <Campo label="Zona"><input value={f.zona} onChange={e => cambia({ zona: e.target.value })} placeholder="es. Periferia" /></Campo>
        </div>
      </section>

      <section>
        <h2>Modulo fotovoltaico</h2>
        <div className="due">
          <Campo label="Potenza (W)"><input inputMode="numeric" value={f.wp} onChange={e => cambia({ wp: e.target.value })} /></Campo>
          <Campo label="Modello"><input value={f.modulo} onChange={e => cambia({ modulo: e.target.value })} /></Campo>
        </div>
        <div className="due">
          {prog('modulo_tipo')}{prog('modulo_peso_kg', 'decimal')}
        </div>
        {prog('modulo_dimensioni')}
      </section>

      <section>
        <h2>Condizioni di progetto</h2>
        <button type="button" className="sec" disabled={busy === 'sito'} onClick={proponi}>{busy === 'sito' ? 'Cerco…' : '📍 Proponi dalla località'}</button>
        {sito ? <p className="muted">{sito}</p> : null}
        <div className="due">
          {prog('vento_ms', 'decimal', 'Lo inserisci tu')}{prog('vento_protezione_ms', 'decimal')}
        </div>
        <div className="due">
          <Campo label="Categoria di esposizione"><select value={f.prog.categoria_terreno ?? ''} onChange={e => cambiaProg('categoria_terreno', e.target.value)}>
            <option value="">–</option>{CATEGORIE_ESP.map(c => <option key={c}>{c}</option>)}</select></Campo>
          {prog('altitudine_m', 'numeric')}
        </div>
        <div className="due">
          <Campo label="Corrosività (ISO 9223)"><select value={f.prog.classe_corrosivita ?? ''} onChange={e => cambiaProg('classe_corrosivita', e.target.value)}>
            <option value="">–</option>{CORROSIVITA.map(c => <option key={c}>{c}</option>)}</select></Campo>
          {prog('pendenza_ns')}
        </div>
        <div className="due">{prog('altezza_min_modulo_m', 'decimal')}{prog('infissione_m', 'decimal')}</div>
        {prog('angolo_rotazione', 'numeric')}
        <div className="due">
          <Campo label="Latitudine"><input inputMode="decimal" value={f.lat} onChange={e => cambia({ lat: e.target.value })} /></Campo>
          <Campo label="Longitudine"><input inputMode="decimal" value={f.lng} onChange={e => cambia({ lng: e.target.value })} /></Campo>
        </div>
      </section>

      <section>
        <h2>Tracker</h2>
        {f.righe.map((r, i) => {
          const lc = o.lCusc.filter((x: number) => x >= o.minCusc[r.tipo] - 1e-9);
          return (
            <div className="riga" key={i}>
              <div className="rtesta"><b>Riga {i + 1}</b>{f.righe.length > 1 ? <button type="button" className="x" onClick={() => cambia({ righe: f.righe.filter((_, j) => j !== i) })}>Togli</button> : null}</div>
              <div className="due">
                <Campo label="N° tracker"><input inputMode="numeric" value={r.n} onChange={e => cambiaRiga(i, { n: e.target.value })} /></Campo>
                <Campo label="Taglia (moduli)"><select value={r.taglia} onChange={e => cambiaRiga(i, { taglia: e.target.value })}>{cfg.taglie.map((t: string) => <option key={t}>{t}</option>)}</select></Campo>
              </div>
              <Campo label="Tipo"><Seg v={r.tipo} opts={[['Agrivoltaico', 'Agrivoltaico'], ['Basso', 'Basso']]} set={v => cambiaRiga(i, { tipo: v })} /></Campo>
              <div className="due">
                <Campo label="Profilo pilastro"><Seg v={r.prof} opts={o.prof} set={v => cambiaRiga(i, { prof: v })} /></Campo>
                <Campo label="Asse"><Seg v={r.asse} opts={o.asse} set={v => cambiaRiga(i, { asse: v })} /></Campo>
              </div>
              <div className="due">
                <Campo label="Omega"><Seg v={r.omega} opts={o.omega} set={v => cambiaRiga(i, { omega: v })} /></Campo>
                {r.tipo === 'Basso' ? <Campo label="Fondazione"><span className="muted fisso">pilastro unico</span></Campo>
                  : <Campo label="Fondazione"><select value={r.lFond} onChange={e => cambiaRiga(i, { lFond: +e.target.value })}>{o.lFond.map((x: number) => <option key={x} value={x}>{fL(x)} m</option>)}</select></Campo>}
              </div>
              <Campo label="Pilastro cuscinetto" nota={`Motore = cuscinetto − 0,08 m (${fL(r.lCusc - 0.08)} m)`}>
                <select value={r.lCusc} onChange={e => cambiaRiga(i, { lCusc: +e.target.value })}>{lc.map((x: number) => <option key={x} value={x}>{fL(x)} m</option>)}</select></Campo>
            </div>
          );
        })}
        <button type="button" className="sec" onClick={() => cambia({ righe: [...f.righe, rigaNuova(f.righe.at(-1)?.taglia)] })}>+ Aggiungi riga</button>
      </section>

      <section>
        <h2>Quadri e sensori</h2>
        <div className="due">{cfg.impianto.map(([k, nome]: [string, string]) => (
          <Campo key={k} label={nome.charAt(0).toUpperCase() + nome.slice(1)}><input inputMode="numeric" value={f[k] ?? ''} onChange={e => cambia({ [k]: e.target.value })} placeholder="0" /></Campo>))}</div>
      </section>

      <section>
        <h2>Margini</h2>
        <Campo label="Margine generale (%) *" nota="Margine sul prezzo: costo 100 €, margine 20 % → prezzo 125 €."><input inputMode="decimal" value={f.margine} onChange={e => cambia({ margine: e.target.value })} /></Campo>
        <div className="due">
          <Campo label="Prezzo spot (€)" nota="Prezzo totale voluto: i margini si spostano tutti degli stessi punti."><input inputMode="decimal" value={spot} onChange={e => { setSpot(e.target.value); setSpotEsito(''); }} placeholder="es. 250.000" /></Campo>
          <Campo label=" "><button type="button" className="sec" disabled={busy === 'spot'} onClick={calcolaSpot}>{busy === 'spot' ? 'Calcolo…' : 'Calcola margini'}</button></Campo>
        </div>
        {spotEsito ? <p className="muted">{spotEsito}</p> : null}
        <button type="button" className="link" onClick={() => setCatAperte(!catAperte)}>{catAperte ? '▾' : '▸'} Margini per categoria (zincatura, struttura…)</button>
        {catAperte ? <div className="due">{cfg.categorie.map((c: string) => (
          <Campo key={c} label={c.charAt(0) + c.slice(1).toLowerCase()}><input inputMode="decimal" value={f.margini[c] ?? ''} placeholder={c === 'LAVORAZIONE' || c === 'ZINCATURA' ? 'come categoria' : 'generale'}
            onChange={e => cambia({ margini: { ...f.margini, [c]: e.target.value } })} /></Campo>))}</div> : null}
      </section>

      <section>
        <h2>Prezzi nell'offerta</h2>
        <div className="due">
          <Campo label="Trasporto (€)" nota="0 = escluso"><input inputMode="decimal" value={f.trasporto} onChange={e => cambia({ trasporto: e.target.value })} placeholder="escluso" /></Campo>
          <Campo label="Posa in opera (€)" nota="0 = non inclusa"><input inputMode="decimal" value={f.posa} onChange={e => cambia({ posa: e.target.value })} placeholder="non inclusa" /></Campo>
        </div>
        <Campo label="Revisione"><input value={f.rev} onChange={e => cambia({ rev: e.target.value })} /></Campo>
      </section>

      <section>
        <h2>Condizioni commerciali</h2>
        <div className="due">
          <Campo label="Resa (Incoterms 2020)"><input value={f.resa} onChange={e => cambia({ resa: e.target.value })} placeholder="es. DAP cantiere" /></Campo>
          <Campo label="Pagamento"><input value={f.pagamento} onChange={e => cambia({ pagamento: e.target.value })} placeholder="Da concordare" /></Campo>
        </div>
        <div className="due">
          <Campo label="Tempi di consegna"><input value={f.consegna} onChange={e => cambia({ consegna: e.target.value })} placeholder="es. 8-10 settimane" /></Campo>
          <Campo label="Validità offerta"><input value={f.validita} onChange={e => cambia({ validita: e.target.value })} placeholder="es. 30 giorni" /></Campo>
        </div>
      </section>

      <section>
        <h2>Layout</h2>
        {L ? <>
          <img className="lay" src={L.url} alt="Layout" />
          <p className="muted">{L.nome}{L.dxf ? ' · nel DXF: ' + Object.entries(L.dxf).map(([t, n]) => `${n}×${t}`).join(', ') : ''}</p>
          <div className="azioni">
            {L.dxf ? <button type="button" className="sec" onClick={usaDxf}>Usa i tracker del DXF</button> : null}
            <button type="button" className="sec" onClick={() => cambia({ layout: false })}>Togli</button>
          </div>
        </> : <p className="muted">Nessun layout: la slide del layout resterà vuota.</p>}
        <label className="file">{L ? 'Cambia file' : 'Carica DXF o foto'}<input type="file" accept=".dxf,image/*" onChange={e => { const x = e.target.files?.[0]; if (x) caricaLayout(x); e.target.value = ''; }} /></label>
      </section>

      {prev ? (
        <section id="anteprima" className="prev">
          <h2>Anteprima</h2>
          <pre className="riep">{prev.testo}</pre>
          <h3>Nell'offerta</h3>
          <dl>
            <dt>Titolo</dt><dd>{prev.offerta.titolo || '–'}</dd>
            <dt>Potenza</dt><dd>{prev.offerta.potenza}</dd>
            <dt>Tracker</dt><dd>{prev.offerta.tracker.join(' · ')}</dd>
            {prev.offerta.prezzi.map((p: any) => <Fragment key={p.label}><dt>{p.label}</dt><dd>{p.strike ? <s>{p.strike}</s> : null} {p.value}{p.nota ? <small> · {p.nota}</small> : null}</dd></Fragment>)}
            <dt>Layout</dt><dd>{prev.offerta.layout || 'nessuno (slide vuota)'}</dd>
          </dl>
          {prev.avvisi.length ? <div className="avv">{prev.avvisi.map((a: string, i: number) => <p key={i}>⚠️ {a}</p>)}</div> : null}
          <p className="muted">Costo {eur(prev.costo)} · €/Wp {prev.kwp ? fN(prev.prezzo / (prev.kwp * 1000), 4) : '–'}</p>
        </section>
      ) : null}

      <div className="barra">
        {prev ? <button disabled={!!busy} onClick={() => esegui('crea')}>{busy === 'crea' ? "Creo l'offerta…" : id ? "Salva e rimanda l'offerta" : 'Crea e invia'}</button>
          : <button disabled={!!busy} onClick={() => esegui('anteprima')}>{busy === 'anteprima' ? 'Calcolo…' : 'Anteprima'}</button>}
      </div>
    </main>
  );
}
