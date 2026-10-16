// Formati numerici e date all'italiana.
import { num } from './model';

// useGrouping 'always': separa le migliaia anche a 4 cifre (1.548,40).
const GRP = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
export const fN = (n: unknown, d = 2) => (+(n as number) || 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, ...GRP });
export const eur = (n: unknown) => fN(n) + ' €';
export const fQ = (q: number) => fN(q, Number.isInteger(Math.round(q * 1000) / 1000) ? 0 : 2);
export const fL = (L: unknown) => num(L).toLocaleString('it-IT', { maximumFractionDigits: 3, ...GRP });
export const fDate = (d?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : d || '–'; };
export const pct = (a: number, b: number) => (b ? fN((a / b) * 100, 1) + ' %' : '–');
export const fP = (x: number) => fN(x, 1) + ' %';
export const vN = (v: unknown) => (v === '' || v == null ? '' : String(v).replace('.', ','));
export const fileName = (s: string) => String(s).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'preventivo';

export function download(name: string, data: string | Blob, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
