// Ricerca di una localita' (geocodifica) con Nominatim di OpenStreetMap: manda al servizio solo il testo cercato.
export type Luogo = { nome: string; lat: number; lng: number };

export async function geocode(q: string): Promise<Luogo | null> {
  const t = q.trim(); if (!t) return null;
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=${encodeURIComponent(t)}`);
  if (!r.ok) throw new Error(`ricerca non riuscita (${r.status})`);
  const j = await r.json();
  if (!j.length) return null;
  return { nome: j[0].display_name.split(',').slice(0, 3).join(',').trim(), lat: +j[0].lat, lng: +j[0].lon };
}
