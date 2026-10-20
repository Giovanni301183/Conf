// Layout dal bot: un DXF o un'immagine mandati su Telegram diventano il layout del preventivo, come caricandoli nell'app (Invia → Layout).
// Il file si scarica da Telegram con il token del bot. Sul server non c'e' il canvas del browser: il DXF si disegna qui, pixel per pixel,
// con gli stessi colori e la stessa inquadratura dell'app ma senza le scritte. Le immagini restano come sono (JPG o PNG).
import { deflateSync } from 'node:zlib';
import { leggiDxf, type Layout } from '../src/domain/dxf.js';

const MAX_IMG = 1.5e6;   // byte: una foto mandata "come file" a piena risoluzione appesantirebbe il preventivo

/** Disegna il layout DXF su fondo bianco (lato lungo = max px) e lo restituisce come PNG. */
export function rasterizza(L: Layout, max = 1800) {
  const { x0, y0, x1, y1 } = L.bbox, w = x1 - x0 || 1, h = y1 - y0 || 1, pad = 0.03;
  const k = max / Math.max(w, h) / (1 + 2 * pad), W = Math.round(w * k * (1 + 2 * pad)), H = Math.round(h * k * (1 + 2 * pad));
  const X = (x: number) => (x - x0) * k + W * pad / (1 + 2 * pad), Y = (y: number) => H - ((y - y0) * k + H * pad / (1 + 2 * pad));
  const px = new Uint8Array(W * H * 3).fill(255);
  const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) || 0);
  // Pixel mescolato al colore con opacita' a (0..1).
  const plot = (x: number, y: number, a: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3; for (let j = 0; j < 3; j++) px[i + j] = Math.round(px[i + j] * (1 - a) + c[j] * a);
  };
  // Linea sfumata ai bordi (algoritmo di Wu).
  const linea = (ax: number, ay: number, bx: number, by: number, c: number[]) => {
    const ripida = Math.abs(by - ay) > Math.abs(bx - ax);
    if (ripida) [ax, ay, bx, by] = [ay, ax, by, bx];
    if (ax > bx) [ax, ay, bx, by] = [bx, by, ax, ay];
    const dx = bx - ax, g = dx ? (by - ay) / dx : 1;
    const p = (x: number, y: number, a: number) => (ripida ? plot(y, x, a, c) : plot(x, y, a, c));
    for (let x = Math.round(ax), xe = Math.round(bx); x <= xe; x++) {
      const y = ay + g * (x - ax), yi = Math.floor(y), f = y - yi;
      p(x, yi, 1 - f); p(x, yi + 1, f);
    }
  };
  // Area piena (SOLID): riempimento per righe orizzontali, regola pari/dispari.
  const area = (pts: { x: number; y: number }[], c: number[]) => {
    const q = pts.map(p => ({ x: X(p.x), y: Y(p.y) }));
    const ya = Math.max(0, Math.floor(Math.min(...q.map(p => p.y)))), yb = Math.min(H - 1, Math.ceil(Math.max(...q.map(p => p.y))));
    for (let y = ya; y <= yb; y++) {
      const yc = y + 0.5, xs: number[] = [];
      q.forEach((a, i) => { const b = q[(i + 1) % q.length]; if ((a.y <= yc) !== (b.y <= yc)) xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x)); });
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.round(xs[i])); x < Math.min(W, Math.round(xs[i + 1])); x++) plot(x, y, 1, c);
    }
  };
  for (const p of L.prims) {
    if (p.t === 'text') continue;
    const c = rgb(p.c);
    if (p.t === 'fill') { area(p.pts, c); continue; }
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    for (let i = 1; i < pts.length; i++) linea(X(pts[i - 1].x), Y(pts[i - 1].y), X(pts[i].x), Y(pts[i].y), c);
  }
  return { png: png(px, W, H), w: W, h: H };
}

/* ---------- PNG (RGB a 8 bit) ---------- */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function blocco(tipo: string, dati: Uint8Array) {
  const out = new Uint8Array(12 + dati.length), v = new DataView(out.buffer);
  v.setUint32(0, dati.length); out.set(new TextEncoder().encode(tipo), 4); out.set(dati, 8);
  v.setUint32(8 + dati.length, crc32(out.subarray(4, 8 + dati.length)));
  return out;
}
function png(px: Uint8Array, W: number, H: number) {
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, W); v.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 2;   // 8 bit, RGB
  const righe = new Uint8Array(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) righe.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1);   // filtro 0 per riga
  const parti = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), blocco('IHDR', ihdr), blocco('IDAT', deflateSync(righe)), blocco('IEND', new Uint8Array())];
  const out = new Uint8Array(parti.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of parti) { out.set(p, o); o += p.length; }
  return out;
}

/** Tipo e dimensioni di un'immagine PNG o JPG dai suoi primi byte; null se non e' nessuna delle due. */
export function dimensioni(b: Uint8Array): { tipo: 'png' | 'jpeg'; w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { tipo: 'png', w: v.getUint32(16), h: v.getUint32(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = v.getUint16(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { tipo: 'jpeg', w: v.getUint16(i + 7), h: v.getUint16(i + 5) };
    i += 2 + len;
  }
  return null;
}

/** Scarica da Telegram il file mandato al bot (fino a 20 MB, limite di Telegram). */
async function scarica(token: string, fileId: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const j: any = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(/too big/i.test(j.description || '') ? 'il file supera i 20 MB che Telegram lascia scaricare ai bot' : 'file non trovato su Telegram: rimandalo');
  const f = await fetch(`https://api.telegram.org/file/bot${token}/${j.result.file_path}`);
  if (!f.ok) throw new Error('file non scaricabile da Telegram: rimandalo');
  return { bytes: new Uint8Array(await f.arrayBuffer()), path: String(j.result.file_path) };
}

/** Campi del layout per prev.offerta (come nell'app), dal file mandato su Telegram. Errori in parole semplici. */
export async function layoutDaTelegram(token: string, fileId: string, nome: string) {
  const { bytes, path } = await scarica(token, fileId);
  const n = nome || path.split('/').pop() || 'layout';
  if (/\.dxf$/i.test(n)) {
    const L = leggiDxf(new TextDecoder().decode(bytes)), img = rasterizza(L);
    return { layout: 'data:image/png;base64,' + Buffer.from(img.png).toString('base64'), layoutW: img.w, layoutH: img.h, layoutNome: n,
      dxf: Object.keys(L.tracker).length ? L.tracker : null };
  }
  const d = dimensioni(bytes);
  if (!d) throw new Error('formato non riconosciuto: manda un DXF, una foto o un PNG/JPG');
  if (bytes.length > MAX_IMG) throw new Error("immagine troppo grande: mandala come foto (non come file), così Telegram la riduce");
  return { layout: `data:image/${d.tipo};base64,` + Buffer.from(bytes).toString('base64'), layoutW: d.w, layoutH: d.h, layoutNome: n, dxf: null };
}
