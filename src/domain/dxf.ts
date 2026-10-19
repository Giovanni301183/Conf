// Layout dell'impianto da DXF: geometria in coordinate di disegno, conteggio dei tracker e disegno su immagine (PNG).
// Supporta linee, polilinee (anche con archi), cerchi, archi, solidi, testi e blocchi annidati. Le campiture (HATCH) non sono disegnate.
import DxfParser from 'dxf-parser';

type Pt = { x: number; y: number };
type M = [number, number, number, number, number, number];   // x' = a x + c y + e ; y' = b x + d y + f
export type Prim = { t: 'line'; pts: Pt[]; closed: boolean; c: string } | { t: 'fill'; pts: Pt[]; c: string } | { t: 'text'; p: Pt; h: number; rot: number; s: string; c: string };
export type Layout = { prims: Prim[]; bbox: { x0: number; y0: number; x1: number; y1: number }; tracker: Record<string, number>; nInsert: number };

const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: M, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const hex = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

/** Colori pensati per lo sfondo bianco: il bianco (ACI 7) diventa nero, i colori troppo chiari si scuriscono. */
function ink(rgb: number | undefined) {
  if (rgb == null) return '#1f2b33';
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  if (r > 235 && g > 235 && b > 235) return '#1f2b33';
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (l > 0.62) { const k = 0.62 / l; return hex((Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k)); }
  return hex(rgb);
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number) {
  while (a1 <= a0) a1 += Math.PI * 2;
  const n = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64)), out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return out;
}
// Segmento di polilinea con "bulge" (arco): bulge = tan(angolo/4).
function bulgePts(p: Pt, q: Pt, b: number): Pt[] {
  const d = Math.hypot(q.x - p.x, q.y - p.y); if (!b || !d) return [q];
  // Centro sulla normale sinistra della corda (arco antiorario se bulge > 0).
  const nx = -(q.y - p.y) / d, ny = (q.x - p.x) / d, off = (d * (1 - b * b)) / (4 * b), r = (d * (1 + b * b)) / (4 * Math.abs(b));
  const cx = (p.x + q.x) / 2 + nx * off, cy = (p.y + q.y) / 2 + ny * off;
  const a0 = Math.atan2(p.y - cy, p.x - cx), sweep = 4 * Math.atan(b), n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) { const a = a0 + (sweep * i) / n; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  out.push(q);
  return out;
}
const cleanText = (s: string) => String(s || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\[A-Za-z]/g, '').replace(/[{}]/g, '').trim();

/** Numero di moduli del tracker da layer o nome del blocco, es. "Inseguitore 40" o "Struttura 40 moduli". */
export function tagliaDa(layer: string, block: string) {
  const m = /inseguitor\w*\D*(\d+)/i.exec(layer) || /(\d+)\s*mod/i.exec(block) || /tracker\D*(\d+)/i.exec(layer + ' ' + block);
  return m ? m[1] : '';
}

export function leggiDxf(testo: string): Layout {
  const d: any = new DxfParser().parseSync(testo);
  const layers: Record<string, any> = d?.tables?.layer?.layers || {};
  const prims: Prim[] = [], tracker: Record<string, number> = {};
  let nInsert = 0;
  const visibile = (l: string) => { const L = layers[l]; return !L || (L.visible !== false && !L.frozen); };
  const colore = (e: any, parent: string | null) => {
    if (e.colorIndex === 0 && parent) return parent;                                      // DAL BLOCCO
    if (e.color != null && e.colorIndex !== 256) return ink(e.color);
    const L = layers[e.layer];
    if (parent && (!L || L.colorIndex === 7 || e.layer === '0')) return parent;           // bianco/layer 0 dentro un blocco: colore del tracker
    return ink(L?.color);
  };
  const walk = (ents: any[], m: M, parent: string | null, depth: number) => {
    for (const e of ents || []) {
      if (!visibile(e.layer) && depth === 0) continue;
      const c = colore(e, parent);
      switch (e.type) {
        case 'LINE': prims.push({ t: 'line', pts: e.vertices.map((p: Pt) => ap(m, p)), closed: false, c }); break;
        case 'LWPOLYLINE': case 'POLYLINE': {
          const v: any[] = e.vertices || []; if (v.length < 2) break;
          const closed = !!e.shape || !!e.closed, pts: Pt[] = [v[0]];
          for (let i = 0; i < v.length - (closed ? 0 : 1); i++) pts.push(...bulgePts(v[i], v[(i + 1) % v.length], v[i].bulge || 0));
          prims.push({ t: 'line', pts: pts.map(p => ap(m, p)), closed, c }); break;
        }
        case 'CIRCLE': prims.push({ t: 'line', pts: arcPts(e.center.x, e.center.y, e.radius, 0, Math.PI * 2).map(p => ap(m, p)), closed: true, c }); break;
        case 'ARC': prims.push({ t: 'line', pts: arcPts(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle).map(p => ap(m, p)), closed: false, c }); break;
        case 'SOLID': { const p = e.points || []; if (p.length >= 3) prims.push({ t: 'fill', pts: (p.length === 4 ? [p[0], p[1], p[3], p[2]] : p).map((q: Pt) => ap(m, q)), c }); break; }
        case 'TEXT': case 'MTEXT': {
          const s = cleanText(e.text); if (!s) break;
          const p = ap(m, e.startPoint || e.position), h = (e.textHeight || e.height || 1) * Math.hypot(m[0], m[1]);
          const rot = e.directionVector ? Math.atan2(e.directionVector.y, e.directionVector.x) : ((e.rotation || 0) * Math.PI) / 180;
          prims.push({ t: 'text', p, h, rot: rot + Math.atan2(m[1], m[0]), s, c }); break;
        }
        case 'INSERT': {
          const b = d.blocks?.[e.name]; if (!b || depth > 8) break;
          if (depth === 0) { nInsert++; const t = tagliaDa(e.layer || '', e.name || ''); if (t) tracker[t] = (tracker[t] || 0) + 1; }
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = ((e.rotation || 0) * Math.PI) / 180, bp = b.position || { x: 0, y: 0 };
          const cs = Math.cos(r), sn = Math.sin(r);
          // inserimento = traslazione(pos) · rotazione · scala · traslazione(-punto base)
          const local: M = [cs * sx, sn * sx, -sn * sy, cs * sy, 0, 0];
          const tb = ap(local, { x: -bp.x, y: -bp.y });
          const mi: M = [local[0], local[1], local[2], local[3], e.position.x + tb.x, e.position.y + tb.y];
          walk(b.entities, mul(m, mi), c, depth + 1); break;
        }
      }
    }
  };
  walk(d?.entities || [], I, null, 0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of prims) for (const q of p.t === 'text' ? [p.p] : p.pts) { if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x > x1) x1 = q.x; if (q.y > y1) y1 = q.y; }
  if (!isFinite(x0)) throw new Error('il DXF non contiene elementi disegnabili');
  return { prims, bbox: { x0, y0, x1, y1 }, tracker, nInsert };
}

/** Disegna il layout su un canvas bianco (lato lungo = max px) e restituisce PNG come data URL, con le dimensioni. */
export function disegna(L: Layout, max = 1800) {
  const { x0, y0, x1, y1 } = L.bbox, w = x1 - x0 || 1, h = y1 - y0 || 1, pad = 0.03;
  const k = max / Math.max(w, h) / (1 + 2 * pad), W = Math.round(w * k * (1 + 2 * pad)), H = Math.round(h * k * (1 + 2 * pad));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const X = (x: number) => (x - x0) * k + W * pad / (1 + 2 * pad), Y = (y: number) => H - ((y - y0) * k + H * pad / (1 + 2 * pad));
  g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = Math.max(1, max / 1400);
  for (const p of L.prims) {
    if (p.t === 'text') {
      const fs = p.h * k; if (fs < 4) continue;
      g.save(); g.translate(X(p.p.x), Y(p.p.y)); g.rotate(-p.rot); g.fillStyle = p.c; g.font = `${fs}px Arial, sans-serif`; g.fillText(p.s, 0, 0); g.restore();
      continue;
    }
    g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))));
    if (p.t === 'fill') { g.closePath(); g.fillStyle = p.c; g.fill(); } else { if (p.closed) g.closePath(); g.strokeStyle = p.c; g.stroke(); }
  }
  return { url: cv.toDataURL('image/png'), w: W, h: H };
}

/** Immagine (PNG/JPG) caricata: ridimensionata e convertita in PNG su fondo bianco. */
export function immagineInPng(file: File, max = 1800): Promise<{ url: string; w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(u); res({ url: cv.toDataURL('image/png'), w: W, h: H });
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("immagine non leggibile")); };
    img.src = u;
  });
}
