// Formati numerici e date all'italiana, come nell'app legacy.
// useGrouping true = "always": separa le migliaia anche a 4 cifre (1.548,40).
export const fN = (n: unknown, d = 2) =>
  (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });

export const eur = (n: unknown) => fN(n) + ' €';

export const fDate = (d?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d || '–';
};

export const fDateTime = (iso?: string) => {
  const d = new Date(iso || '');
  return isNaN(+d)
    ? '–'
    : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};
