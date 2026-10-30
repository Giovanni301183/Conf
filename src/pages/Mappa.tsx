// Mappa dei preventivi: un cerchio per impianto (grandezza = kWp, colore = stato), stessi filtri del cruscotto.
// I preventivi senza posizione si piazzano cercando la localita' oppure con un clic sulla mappa.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { eur, fN } from '../domain/format';
import { eCliente, eLuogo, eStato, filtra, hasPos, totali } from '../domain/kpi';
import { num, statoOf } from '../domain/model';
import { geocode } from '../lib/geo';
import { S, commit } from '../store/state';
import { archOpen, archPatch, toast } from '../store/actions';
import { KFiltri, StatoTag } from './Cruscotto';
import { Info } from '../components/ui';

const ITALIA: L.LatLngTuple = [42.5, 12.5];
const raggio = (kwp: number) => 6 + Math.min(22, Math.sqrt(Math.max(0, kwp)) / 2.2);
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function Mappa() {
  const box = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null);
  const [piazza, setPiazza] = useState<string | null>(null);   // id del preventivo da posizionare con un clic
  const [cerco, setCerco] = useState('');
  const list = filtra(S.arch, S.ui.aq, S.ui.kf), conPos = list.filter(hasPos), senza = list.filter(e => !hasPos(e));
  const T = totali(conPos);
  const piazzaRef = useRef(piazza); piazzaRef.current = piazza;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { scrollWheelZoom: true }).setView(ITALIA, 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', ev => {
      const id = piazzaRef.current; if (!id) return;
      archPatch(id, p => { p.luogo = { ...(p.luogo || {}), nome: p.luogo?.nome || '', lat: +ev.latlng.lat.toFixed(5), lng: +ev.latlng.lng.toFixed(5) }; });
      setPiazza(null); toast('Posizione salvata'); commit();
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // Marcatori ridisegnati a ogni cambio di filtri o archivio; lo zoom si adatta solo quando cambia l'insieme dei punti.
  const chiave = conPos.map(e => e.id).join(','), firma = conPos.map(e => e.id + e.salvato + eStato(e)).join(','), ultima = useRef('');
  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    for (const e of conPos) {
      const lu = eLuogo(e), [, sl, c, ic] = statoOf(eStato(e)), p = num(e.prezzo ?? e.totale);
      const el = document.createElement('div'); el.className = 'mpop';
      el.innerHTML = `<b>${esc(e.nome)}</b><div>${esc(eCliente(e))}${lu.nome ? ' · ' + esc(lu.nome) : ''}</div>
        <div class="mrow"><span>Stato</span><b style="color:${c}">${ic} ${sl}</b></div>
        <div class="mrow"><span>Potenza</span><b>${fN(e.kwp, 2)} kWp</b></div><div class="mrow"><span>Tracker</span><b>${fN(e.nTracker, 0)}</b></div>
        <div class="mrow"><span>Prezzo</span><b>${eur(p)}</b></div><div class="mrow"><span>€/Wp</span><b>${num(e.kwp) ? fN(p / (num(e.kwp) * 1000), 4) : '–'}</b></div>`;
      const b = document.createElement('button'); b.className = 'btn s p'; b.textContent = 'Apri preventivo';
      b.onclick = () => { archOpen(e.id); commit(); };
      el.appendChild(b);
      L.circleMarker([lu.lat, lu.lng], { radius: raggio(num(e.kwp)), color: '#fff', weight: 2, fillColor: c, fillOpacity: 0.85 })
        .bindPopup(el).bindTooltip(`${esc(e.nome)} · ${fN(e.kwp, 0)} kWp`).addTo(g);
    }
    if (chiave !== ultima.current && conPos.length) m.fitBounds(L.latLngBounds(conPos.map(e => [eLuogo(e).lat, eLuogo(e).lng] as L.LatLngTuple)).pad(0.2), { maxZoom: 11 });
    ultima.current = chiave;
  }, [firma]);

  async function trova(e: any) {
    const q = eLuogo(e).nome || e.cliente; if (!q) { toast('Scrivi prima la località nel preventivo (Configura → Commessa)'); return; }
    setCerco(e.id);
    try {
      const r = await geocode(q);
      if (!r) toast(`"${q}" non trovato: posizionalo con un clic sulla mappa`);
      else { archPatch(e.id, p => { p.luogo = { nome: p.luogo?.nome || r.nome, lat: r.lat, lng: r.lng }; }); toast(`Trovato: ${r.nome}`); }
    } catch (err) { toast('Ricerca della località non riuscita: ' + (err as Error).message); }
    setCerco(''); commit();
  }

  return (
    <>
      <KFiltri arch={S.arch} />
      <div className="mapwrap">
        <div className="card mapcard">
          <div className="maphead">
            <span><b>{conPos.length}</b> impiant{conPos.length === 1 ? 'o' : 'i'} sulla mappa · {fN(T.kwp, 0)} kWp · {eur(T.prezzo)}</span>
            <span className="klegend">{['bozza', 'inviato', 'vinto', 'perso', 'alternativa'].map(k => <StatoTag key={k} k={k} />)}<span className="muted small">grandezza = kWp</span></span>
          </div>
          {piazza && <div className="mapmode">Clic sulla mappa per posizionare <b>{S.arch.find(a => a.id === piazza)?.nome}</b> <button className="btn s" onClick={() => setPiazza(null)}>Annulla</button></div>}
          <div ref={box} className={`map ${piazza ? 'aim' : ''}`} />
        </div>
        <div className="card mapside">
          <h2>Senza posizione · {senza.length}<Info>Cerca la località scritta nel preventivo, oppure scegli "Clic" e indica il punto sulla mappa.</Info></h2>
          {senza.length ? senza.map(e => (
            <div key={e.id} className={`mitem ${piazza === e.id ? 'on' : ''}`}>
              <div><b>{e.nome}</b><div className="muted small">{eLuogo(e).nome || <i>località non indicata</i>} · {fN(e.kwp, 0)} kWp</div></div>
              <span className="sp" />
              <button className="btn s" disabled={cerco === e.id} onClick={() => trova(e)}>{cerco === e.id ? '…' : 'Cerca'}</button>
              <button className="btn s" onClick={() => setPiazza(piazza === e.id ? null : e.id)}>Clic</button>
            </div>
          )) : <div className="muted small">Tutti i preventivi del filtro hanno una posizione.</div>}
          {conPos.length ? <>
            <h3>Sulla mappa</h3>
            {conPos.map(e => (
              <div key={e.id} className="mitem">
                <button className="lnk" onClick={() => map.current?.flyTo([eLuogo(e).lat, eLuogo(e).lng], 12)}><b>{e.nome}</b><div className="muted small">{eLuogo(e).nome || `${fN(eLuogo(e).lat, 3)}, ${fN(eLuogo(e).lng, 3)}`}</div></button>
                <span className="sp" />
                <button className="btn s" title="Sposta con un clic sulla mappa" onClick={() => setPiazza(e.id)}>Sposta</button>
                <button className="btn x" title="Togli dalla mappa" onClick={() => { archPatch(e.id, p => { p.luogo = { ...p.luogo, lat: null, lng: null }; }); commit(); }}>✕</button>
              </div>
            ))}
          </> : null}
        </div>
      </div>
    </>
  );
}
