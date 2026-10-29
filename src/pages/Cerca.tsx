// Home, scheda Cerca: una sola ricerca su preventivi, voci d'agenda, documenti/note, messaggi della chat di squadra e articoli del listino.
// Tutte le parole devono comparire. La stessa ricerca la usa la casella 🔍 in alto (components/CercaRapida).
import type { ReactNode } from 'react';
import { eur, fDate, fN } from '../domain/format';
import { eAnno, eStato, testo, anni } from '../domain/kpi';
import { STATI, statoOf } from '../domain/model';
import { nomeCartella, nomiEtichette, type Documento } from '../domain/documenti';
import { filtraListino } from './Listino';
import type { Scadenza } from '../domain/calendario';
import { S, commit } from '../store/state';
import { archOpen } from '../store/actions';
import { StatoSel } from './Cruscotto';
import { apriFile } from './Documenti';
import { nomeDi } from '../domain/squadra';
import { cloud, squadra } from '../store/remote';
import { apriChat, apriScheda } from '../components/pannelli';
import { Ic } from '../components/Icona';

const parole = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const tutte = (t: string, pp: string[]) => { const s = t.toLowerCase(); return pp.every(p => s.includes(p)); };
const nomePrev = (id: string | null) => (id && S.arch.find(e => e.id === id)?.nome) || '';
// Oltre a nome, cliente, commessa e località: note, referente, e-mail e zona dell'offerta, autore e stato.
const testoPrev = (e: any) => {
  const o = e.prev?.offerta || {};
  return [testo(e), e.prev?.note, o.nome, o.referente, o.email, o.zona, e.autore, statoOf(eStato(e))[1]].join(' ');
};

/** Tutto quello che contiene le parole cercate, per questa scheda e per la ricerca rapida in alto (CercaRapida).
 *  Agenda, documenti, chat e listino solo quando si scrive qualcosa: senza parole sarebbero l'elenco completo. Le note prima dei file. */
export function risultati(q: string, f: { stato: string; anno: string } = { stato: '', anno: '' }) {
  const pp = parole(q);
  const prev = S.arch.filter(e => (!f.stato || eStato(e) === f.stato) && (!f.anno || eAnno(e) === f.anno) && tutte(testoPrev(e), pp));
  if (!pp.length) return { pp, prev, scad: [] as Scadenza[], docs: [] as Documento[], chat: [] as typeof squadra.mm, art: [] as any[] };
  const scad = S.scad.filter(s => tutte(`${s.titolo} ${s.nota || ''} ${s.categoria || ''} ${nomePrev(s.preventivo_id)}`, pp));
  const docs = S.docs.filter(d => tutte(`${d.titolo} ${d.testo || ''} ${d.scheda || ''} ${nomeCartella(d.cartella)} ${nomiEtichette(d.etichette)} ${nomeDi(d.creato_da, cloud.colleghi)} ${nomePrev(d.preventivo_id)}`, pp))
    .sort((a, b) => +(a.tipo !== 'nota') - +(b.tipo !== 'nota') || b.creato.localeCompare(a.creato));
  const chat = squadra.mm.filter(m => tutte(`${m.testo || ''} ${nomeDi(m.creato_da, cloud.colleghi)} ${nomePrev(m.preventivo_id || null)}`, pp)).reverse();
  const art = S.data.listino.filter((it: any) => tutte(`${it.c} ${it.art || ''} ${it.d}`, pp));
  return { pp, prev, scad, docs, chat, art };
}

/** Apre un articolo nel listino, filtrato per codice. */
export const apriArticolo = (c: string) => { S.ui.tab = 'listino'; filtraListino(c); window.scrollTo(0, 0); };

/** Evidenzia le parole cercate. */
export function Hl({ t, pp }: { t: string; pp: string[] }) {
  if (!pp.length || !t) return <>{t}</>;
  const re = new RegExp('(' + pp.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return <>{t.split(re).map((s, i) => (i % 2 ? <mark key={i}>{s}</mark> : s))}</>;
}
/** Pezzo di un testo lungo attorno alla prima parola trovata. */
export function brano(t: string, pp: string[], n = 160) {
  if (t.length <= n) return t;
  const s = t.toLowerCase(), i = Math.min(...pp.map(p => s.indexOf(p)).filter(i => i >= 0), Infinity);
  const da = isFinite(i) ? Math.max(0, i - 40) : 0;
  return (da ? '…' : '') + t.slice(da, da + n) + (da + n < t.length ? '…' : '');
}

export const apriPrev = (id: string, tab?: 'docs') => { archOpen(id); if (tab && S.prev._id === id) S.ui.tab = tab; commit(); };

function Sezione({ titolo, n, children }: { titolo: string; n: number; children: ReactNode }) {
  return (
    <div className="card">
      <h2>{titolo} <span className="muted small">· {n}</span></h2>
      {n ? children : <div className="empty">Nessun risultato.</div>}
    </div>
  );
}

export function Cerca() {
  const c = S.ui.cerca;
  const set = (k: keyof typeof c, v: string) => { c[k] = v; commit(); };
  const { pp, prev, scad, docs, chat, art } = risultati(c.q, c);
  const act = c.q || c.stato || c.anno;
  return (
    <>
      <div className="card kfilt noprint">
        <input autoFocus placeholder="Cerca in preventivi, agenda, documenti, note e chat…" value={c.q} onChange={e => set('q', e.target.value)} style={{ width: 340 }} />
        <select value={c.anno} onChange={e => set('anno', e.target.value)}><option value="">Tutti gli anni</option>{anni(S.arch).map(a => <option key={a}>{a}</option>)}</select>
        <span className="chips">{STATI.map(([k, l, col, ic]) => (
          <button key={k} className={`chip ${c.stato === k ? 'on' : ''}`} style={{ '--sc': col } as React.CSSProperties} onClick={() => set('stato', c.stato === k ? '' : k)}><i>{ic}</i>{l}</button>))}</span>
        <span className="sp" />
        {act ? <button className="btn s" onClick={() => { S.ui.cerca = { q: '', stato: '', anno: '' }; commit(); }}>Azzera</button> : null}
      </div>

      <Sezione titolo="Preventivi" n={prev.length}>
        <div className="wrap"><table className="arch"><tbody>
          <tr><th>Preventivo</th><th>Commessa</th><th>Stato</th><th className="n">kWp</th><th className="n">Prezzo</th><th></th></tr>
          {prev.map(e => (
            <tr key={e.id} className={S.prev._id === e.id ? 'cur' : ''}>
              <td><b><Hl t={e.nome} pp={pp} /></b><div className="muted small">{e.prev?.num ? <>N° <Hl t={String(e.prev.num)} pp={pp} /> · </> : null}<Hl t={e.cliente || '–'} pp={pp} />{e.prev?.luogo?.nome ? <> · <Hl t={e.prev.luogo.nome} pp={pp} /></> : null}</div></td>
              <td><Hl t={e.rif || '–'} pp={pp} /><div className="muted small">{fDate(e.data)}</div></td>
              <td><StatoSel id={e.id} k={eStato(e)} /></td>
              <td className="n">{fN(e.kwp, 2)}</td><td className="n"><b>{e.prezzo != null ? eur(e.prezzo) : '–'}</b></td>
              <td className="acts"><button className="btn s p" onClick={() => apriPrev(e.id)}>Apri</button></td>
            </tr>
          ))}
        </tbody></table></div>
      </Sezione>

      {pp.length ? <>
        <Sezione titolo="Agenda" n={scad.length}>
          <div className="wrap"><table className="arch"><tbody>
            <tr><th>Giorno</th><th>Voce</th><th>Preventivo</th><th></th></tr>
            {[...scad].sort((a, b) => b.giorno.localeCompare(a.giorno)).map(s => (
              <tr key={s.id}>
                <td className="small">{fDate(s.giorno)}{s.ora ? ' ' + s.ora.slice(0, 5) : ''}{s.fatto ? <div className="muted">✓ fatto</div> : null}</td>
                <td><b><Hl t={s.titolo} pp={pp} /></b>{s.nota ? <div className="muted small"><Hl t={brano(s.nota, pp)} pp={pp} /></div> : null}</td>
                <td className="small">{s.preventivo_id ? <Hl t={nomePrev(s.preventivo_id) || '–'} pp={pp} /> : '–'}</td>
                <td className="acts"><button className="btn s p" onClick={() => apriScheda({ tipo: 'voce', id: s.id })}>Apri</button>
                  {s.preventivo_id && nomePrev(s.preventivo_id) ? <button className="btn s" onClick={() => apriPrev(s.preventivo_id!)}>Apri preventivo</button> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        </Sezione>

        <Sezione titolo="Documenti e note" n={docs.length}>
          <div className="wrap"><table className="arch"><tbody>
            <tr><th>Documento</th><th>Cartella</th><th>Preventivo</th><th></th></tr>
            {docs.map(d => (
              <tr key={d.id}>
                <td><b>{d.tipo === 'nota' ? '✎ ' : ''}<Hl t={d.titolo} pp={pp} /></b>{d.testo ? <div className="muted small"><Hl t={brano(d.testo, pp)} pp={pp} /></div> : null}</td>
                <td className="small">{nomeCartella(d.cartella)}</td>
                <td className="small">{d.preventivo_id ? <Hl t={nomePrev(d.preventivo_id) || '–'} pp={pp} /> : '–'}</td>
                <td className="acts">
                  {d.tipo === 'file' ? <button className="btn s p" onClick={() => apriFile(d)}>Apri file</button>
                    : <button className="btn s p" onClick={() => apriScheda({ tipo: 'doc', id: d.id })}>Apri</button>}
                  {d.preventivo_id && nomePrev(d.preventivo_id) ? <button className="btn s" onClick={() => apriPrev(d.preventivo_id!, 'docs')}>Vai ai documenti</button> : null}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        </Sezione>

        <Sezione titolo="Chat di squadra" n={chat.length}>
          <div className="wrap"><table className="arch"><tbody>
            <tr><th>Quando</th><th>Messaggio</th><th>Stanza</th><th></th></tr>
            {chat.slice(0, 100).map(m => (
              <tr key={m.id}>
                <td className="small">{fDate(m.creato.slice(0, 10))} {new Date(m.creato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td>
                <td><b><Hl t={nomeDi(m.creato_da, cloud.colleghi)} pp={pp} /></b><div className="muted small"><Hl t={brano(m.testo || '', pp)} pp={pp} /></div></td>
                <td className="small">{m.preventivo_id ? <Hl t={nomePrev(m.preventivo_id) || '–'} pp={pp} /> : 'Generale'}</td>
                <td className="acts"><button className="btn s" onClick={() => apriChat(m.preventivo_id || null)}><Ic n="chat" />Apri chat</button></td>
              </tr>
            ))}
          </tbody></table></div>
        </Sezione>

        <Sezione titolo="Articoli del listino" n={art.length}>
          <div className="wrap"><table className="arch"><tbody>
            <tr><th>Codice</th><th>Descrizione</th><th></th></tr>
            {art.slice(0, 100).map((it: any) => (
              <tr key={it.c}>
                <td><b><Hl t={it.c} pp={pp} /></b>{it.art ? <div className="muted small"><Hl t={it.art} pp={pp} /></div> : null}</td>
                <td className="small"><Hl t={it.d || ''} pp={pp} /></td>
                <td className="acts"><button className="btn s" onClick={() => { apriArticolo(it.c); commit(); }}>Apri nel listino</button></td>
              </tr>
            ))}
          </tbody></table></div>
        </Sezione>
      </> : <p className="hint">Scrivi una o più parole per cercare anche nelle voci d'agenda, nei documenti e note, nella chat di squadra e nel listino.</p>}
    </>
  );
}
