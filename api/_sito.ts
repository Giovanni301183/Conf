// Proposta delle condizioni di progetto dalla localita': categoria di esposizione (NTC 2018), classe di corrosivita' (ISO 9223)
// e altitudine. E' una PROPOSTA da far verificare al progettista: nel modulo i valori restano modificabili.
// Dati da servizi pubblici gratuiti, a cui va solo la localita' o le coordinate: Nominatim (OpenStreetMap) per coordinate e regione,
// Open-Meteo per la quota. La distanza dal mare si calcola qui, sulla linea di costa di Natural Earth in _costa.ts.
// La tabella delle categorie riproduce la Fig. 3.3.2 delle NTC 2018 (rugosita' C e D: un agrivoltaico e' quasi sempre campagna aperta).
import { COSTA } from './_costa.js';

/** Zona del vento NTC 2018 (Tab. 3.3.I) dalla regione e, per Trieste e Reggio Calabria, dalla provincia. Sardegna: retta Capo Teulada - Isola Maddalena. */
export function zonaVento(regione: string, provincia: string, lat: number, lng: number): number | null {
  const r = regione.toLowerCase(), p = provincia.toLowerCase();
  if (p.includes('trieste')) return 8;
  if (p.includes('reggio calabria') || r.includes('sicilia')) return 4;
  if (r.includes('sardegna')) {
    // A oriente della retta (Capo Teulada 38.87 N 8.64 E → Isola Maddalena 41.22 N 9.40 E): zona 5, a occidente zona 6.
    const [y1, x1, y2, x2] = [38.87, 8.64, 41.22, 9.40], lato = (x2 - x1) * (lat - y1) - (y2 - y1) * (lng - x1);
    return lato < 0 ? 5 : 6;
  }
  if (r.includes('liguria')) return 7;
  if (r.includes('emilia')) return 2;
  if (['valle d', 'piemonte', 'lombardia', 'trentino', 'veneto', 'friuli'].some(x => r.includes(x))) return 1;
  if (['toscana', 'marche', 'umbria', 'lazio', 'abruzzo', 'molise', 'puglia', 'campania', 'basilicata', 'calabria'].some(x => r.includes(x))) return 3;
  return null;
}

// Fig. 3.3.2: categoria per zona e rugosita', nelle colonne [terraferma fino a 10 km dal mare, da 10 a 30 km, oltre 30 km fino a 500 m s.l.m.,
// fino a 750 m, oltre 750 m]. Zona 9 (isole minori e mare aperto): sempre I.
const CAT: Record<number, Record<'C' | 'D', string[]>> = {
  1: { C: ['II', 'III', 'III', 'IV', 'IV'], D: ['II', 'II', 'II', 'III', 'IV'] },
  2: { C: ['II', 'III', 'III', 'IV', 'IV'], D: ['II', 'II', 'II', 'III', 'III'] },
  3: { C: ['II', 'III', 'III', 'IV', 'IV'], D: ['II', 'II', 'II', 'III', 'III'] },
  4: { C: ['II', 'III', 'III', 'IV', 'IV'], D: ['II', 'II', 'II', 'III', 'III'] },
  5: { C: ['III', 'III', 'III', 'IV', 'IV'], D: ['II', 'II', 'II', 'III', 'III'] },
  6: { C: ['II', 'III', 'III', 'III', 'IV'], D: ['I', 'II', 'II', 'III', 'III'] },
  7: { C: ['III', 'III', 'III', 'III', 'III'], D: ['III', 'II', 'III', 'III', 'III'] },
  8: { C: ['III', 'III', 'III', 'III', 'III'], D: ['II', 'II', 'II', 'II', 'II'] },
};
export function categoria(zona: number, rugosita: 'C' | 'D', kmMare: number, quota: number) {
  if (zona === 9) return 'I';
  const col = kmMare <= 10 ? 0 : kmMare <= 30 ? 1 : quota <= 500 ? 2 : quota <= 750 ? 3 : 4;
  return CAT[zona]?.[rugosita][col] ?? '';
}
/** Corrosivita' atmosferica (ISO 9223) per una zona agricola: conta la vicinanza al mare (cloruri); citta', industrie e allevamenti la alzano. */
export function corrosivita(kmMare: number) {
  return kmMare <= 0.3 ? 'C5' : kmMare <= 1 ? 'C4' : kmMare <= 10 ? 'C3' : 'C2';
}

// Nel browser (scheda Configura degli impianti fissi) l'intestazione non si puo' cambiare: si manda solo dal server.
const UA: Record<string, string> = typeof window === 'undefined' ? { 'user-agent': 'Terranova-Preventivatore/1.0 (preventivi tracker)' } : {};
async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`servizio non disponibile (${r.status})`);
  return r.json();
}

/** Distanza in km dalla linea di costa piu' vicina (Natural Earth: precisione di qualche centinaio di metri). */
export function kmDalMare(lat: number, lng: number) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let min = Infinity;
  for (const linea of COSTA) for (let i = 1; i < linea.length; i++) {
    const ax = (linea[i - 1][0] - lng) * kx, ay = (linea[i - 1][1] - lat) * ky, bx = (linea[i][0] - lng) * kx, by = (linea[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

export async function propostaSito(localita: string, lat0?: number | null, lng0?: number | null) {
  let lat = lat0 ?? null, lng = lng0 ?? null, regione = '', provincia = '', nome = localita;
  if (lat == null || lng == null) {
    const r = await json(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=it&accept-language=it&q=${encodeURIComponent(localita)}`);
    if (!r[0]) return { ok: false, errore: `"${localita}" non trovata: scrivi comune e provincia, es. Marsala (TP).` };
    lat = +r[0].lat; lng = +r[0].lon; regione = r[0].address?.state || ''; provincia = r[0].address?.county || r[0].address?.province || ''; nome = r[0].display_name;
  } else {
    const r = await json(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=it&lat=${lat}&lon=${lng}`);
    regione = r.address?.state || ''; provincia = r.address?.county || r.address?.province || '';
  }
  const el = await json(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`), km = kmDalMare(lat!, lng!);
  const quota = Math.round(Number(el.elevation?.[0] ?? 0)), zona = zonaVento(regione, provincia, lat!, lng!);
  const cat = zona ? categoria(zona, 'D', km, quota) : '', corr = corrosivita(km);
  const dist = km < 1 ? `a circa ${Math.round(km * 10) * 100} m dal mare` : `a circa ${Math.round(km)} km dal mare`;
  return { ok: true, lat, lng, luogo: nome, altitudine_m: String(quota), categoria_terreno: cat, classe_corrosivita: corr, zona_vento: zona, km_mare: km,
    motivo: `${zona ? `Zona vento ${zona}` : 'Zona vento non riconosciuta'} (${regione || 'regione ?'}), ${dist}, ${quota} m s.l.m., campagna aperta (rugosità D). `
      + 'Corrosività per zona agricola: se vicino ci sono città, industrie o allevamenti, alzala di una classe. Proposta da far verificare al progettista.' };
}
