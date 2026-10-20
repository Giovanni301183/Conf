// Offerta tecnico-economica: dati presi dal preventivo e compilazione del modello PowerPoint (public/offerta/modello-offerta.pptx).
// Nel modello i campi sono segnaposto {{nome}}; {{#lista}}…{{/lista}} in un paragrafo lo ripete per ogni elemento.
// L'immagine chiamata IMG_LAYOUT viene sostituita dal layout dell'impianto; le altre slide restano come sono.
import JSZip from 'jszip';
import { pesoTot } from './compute.js';
import { fDate, fN, fPeso } from './format.js';
import { CATS, defOfferta, num } from './model.js';

/* ---------- Impostazioni condivise (nel listino, valgono per tutti i preventivi) ---------- */
export const INCLUSI0 = ['Struttura metallica in acciaio S355 zincato a caldo', 'Cuscinetti, inclinometri programmati e finecorsa',
  'Motoriduttore e quadro sotto-motore per ogni tracker', 'Omega di supporto pannelli e bulloneria', 'Calcolo strutturale depositato al Genio Civile',
  'Sistema di controllo TTS® Agri Solar Control'];
export const GARANZIE0 = { struttura: 20, commerciali: 5, assistenza: 2 };
export function offCfg(data: any) {
  const p = data.params; if (!p.offerta) p.offerta = {};
  const o = p.offerta;
  if (!Array.isArray(o.inclusi)) o.inclusi = [...INCLUSI0];
  o.garanzie = { ...GARANZIE0, ...(o.garanzie || {}) };
  return o;
}

/* ---------- Dati dell'offerta nel preventivo ---------- */
// Campi della slide "Dati di progetto" compilati a mano: [chiave nel modello, etichetta, esempio].
export const PROGETTO = [
  ['modulo_tipo', 'Tipo modulo', 'bifacciale'], ['modulo_dimensioni', 'Dimensioni modulo (mm)', '2384 × 1303 × 35'], ['modulo_peso_kg', 'Peso modulo (kg)', '38'],
  ['vento_ms', 'Vento di progetto (m/s)', '27'], ['categoria_terreno', 'Categoria terreno (Eurocodice)', 'II'], ['altitudine_m', 'Altitudine (m s.l.m.)', '120'],
  ['classe_corrosivita', 'Classe di corrosività', 'C3'], ['pendenza_ns', 'Pendenza N-S', '3 %'], ['altezza_min_modulo_m', 'Altezza minima modulo (m)', '2,10'],
  ['infissione_m', 'Infissione (m)', '1,80'], ['angolo_rotazione', 'Angolo di rotazione (±°)', '55'],
] as const;
export function offPrev(P: any) {
  if (!P.offerta) P.offerta = defOfferta();
  const o = P.offerta;
  for (const [k, v] of Object.entries(defOfferta())) if (o[k] === undefined) o[k] = v;
  for (const [k] of PROGETTO) if (o.prog[k] == null) o.prog[k] = '';
  return o;
}

export type DatiOfferta = {
  campi: Record<string, string>;                       // segnaposto semplici
  liste: Record<string, Record<string, string>[]>;     // blocchi ripetuti {{#nome}}…{{/nome}}
  paragrafi: Record<string, string | null>;            // paragrafo che contiene il segnaposto: testo al posto suo, o null = tolto
  righe: { n: number; taglia: string }[];
  prezzi: { label: string; value: string; strike?: string; nota?: string }[];
  avvisi: string[];
};
const euro = (v: number) => fN(v, 2);
const isTrasporto = (l: any) => /traspor/i.test(l.desc || '');

/** Raccoglie dal preventivo tutto quello che va nell'offerta. `montTot` = totale della scheda Montaggio (per la posa in opera). */
export function datiOfferta(P: any, R: any, data: any, montTot: number): DatiOfferta {
  const O = offPrev(P), cfg = offCfg(data), avvisi: string[] = [];
  // Tracker per taglia (in ordine decrescente, come nel modello).
  const perTaglia = new Map<string, number>();
  P.righe.forEach((r: any) => { if (num(r.n) > 0) perTaglia.set(String(r.taglia), (perTaglia.get(String(r.taglia)) || 0) + num(r.n)); });
  const righe = [...perTaglia].sort((a, b) => num(b[0]) - num(a[0])).map(([taglia, n]) => ({ n, taglia }));
  const profili = [...new Set(P.righe.filter((r: any) => num(r.n) > 0).map((r: any) => r.prof))].join(' / ');

  // Prezzi di vendita. Il modello ha posto solo per il trasporto: le altre voci extra vanno in "struttura e componenti".
  const extra = R.lines.filter((l: any) => l.riga === 'extra'), altre = extra.filter((l: any) => !isTrasporto(l));
  const pStr = R.lines.filter((l: any) => l.riga !== 'extra' || !isTrasporto(l)).reduce((s: number, l: any) => s + l.prezzo, 0);
  const trasp = O.trasporto === '' || O.trasporto == null ? extra.filter(isTrasporto).reduce((s: number, l: any) => s + l.prezzo, 0) : num(O.trasporto);
  const pieno = num(O.pieno), posa = O.posa === '' || O.posa == null ? montTot : num(O.posa);
  if (altre.length) avvisi.push(`Il modello ha posto solo per il trasporto: ${altre.map((l: any) => l.desc || 'voce extra').join(', ')} ${altre.length > 1 ? 'sono incluse' : 'è inclusa'} nel prezzo di struttura e componenti.`);

  const lu = P.luogo || {}, pr = O.prog;
  const campi: Record<string, string> = {
    nome_impianto: O.nome || P.rif || P.cliente || '', cliente: P.cliente || '', referente: O.referente || '',
    numero_offerta: P.num || '', revisione: O.rev === '' || O.rev == null ? '0' : String(O.rev), data_offerta: fDate(O.data || P.data),
    potenza_kwp: fN(R.kwp, 2), potenza_modulo_w: fN(R.wp, 0), moduli_totali: fN(R.nModuli, 0), modulo_modello: P.modulo?.marca || '',
    localita: lu.nome || '', coordinate: lu.lat != null && lu.lng != null ? `${(+lu.lat).toFixed(5)}, ${(+lu.lng).toFixed(5)}` : '',
    n_quadri_area: fN(P.imp?.quadA, 0), n_quadri_generali: fN(P.imp?.quadGen, 0),
    prezzo_offerta: euro(pStr), prezzo_listino: euro(pieno), costo_trasporto: euro(trasp), costo_posa: euro(posa),
    nota_posa: O.posaNota || '', modalita_posa: O.posaModo || '',
    prezzo_kwp: R.kwp ? fN(pStr / R.kwp, 0) : '–', peso_struttura_ton: fN(R.steel / 1000, 1), profilo_acciaio: profili ? profili + ' S355' : '',
    // Pesi per categoria (slide Dati di progetto): {{peso_struttura}}, {{peso_bulloneria}}, … e {{peso_totale}}.
    ...Object.fromEntries(CATS.map(c => ['peso_' + c.toLowerCase(), fPeso(R.pesi?.[c] || 0)])), peso_totale: fPeso(R.pesi ? pesoTot(R.pesi) : 0),
    anni_garanzia_struttura: String(cfg.garanzie.struttura), anni_garanzia_commerciali: String(cfg.garanzie.commerciali), anni_assistenza_gratuita: String(cfg.garanzie.assistenza),
    ...Object.fromEntries(PROGETTO.map(([k]) => [k, String(pr[k] ?? '').trim()])),
  };
  // Righe che senza valore non hanno senso: tolte (null) o sostituite da una dicitura.
  const paragrafi: Record<string, string | null> = {};
  if (!(pieno > pStr)) paragrafi.prezzo_listino = null;
  if (!(trasp > 0)) paragrafi.costo_trasporto = 'Escluso';
  if (!(posa > 0)) paragrafi.costo_posa = 'Non inclusa';
  if (!O.posaModo) paragrafi.modalita_posa = null;
  if (!(num(P.imp?.quadA) > 0)) paragrafi.n_quadri_area = null;
  if (!(num(P.imp?.quadGen) > 0)) paragrafi.n_quadri_generali = null;
  const liste = {
    tracker: righe.map(r => ({ quantita: fN(r.n, 0), moduli: r.taglia })),
    inclusi: cfg.inclusi.map((v: string) => String(v).trim()).filter(Boolean).map((voce: string) => ({ voce })),
  };

  // Campi descrittivi vuoti: nel PowerPoint «–» (gli altri segnaposto vuoti restano vuoti, es. la nota della posa).
  const vuoti = [['referente', 'referente'], ['localita', 'località'], ['coordinate', 'coordinate'], ['modulo_modello', 'modello del modulo'], ...PROGETTO.map(([k, l]) => [k, l.toLowerCase()])]
    .filter(([k]) => !campi[k]).map(([k, l]) => { campi[k] = '–'; return l; });
  if (!campi.numero_offerta) campi.numero_offerta = '–';

  if (!P.num) avvisi.push("Il preventivo non ha ancora un numero: salvalo per assegnarlo (in copertina comparirebbe «–»).");
  if (!P.cliente) avvisi.push('Manca il cliente (Configura → Commessa).');
  if (!righe.length) avvisi.push('Nessun tracker nel preventivo.');
  if (!(R.prezzo > 0)) avvisi.push('Il prezzo di vendita è zero.');
  if (R.total > 0 && R.prezzo - R.total < 0.5) avvisi.push("Margine 0 %: nell'offerta il prezzo di vendita è uguale al costo. Imposta il margine qui sotto (Prezzi) o nella scheda Margini.");
  if (!O.layout) avvisi.push('Nessun layout caricato: nella slide del layout resterà l\'immagine di esempio del modello.');
  if (vuoti.length) avvisi.push(`Slide "Dati di progetto": ${vuoti.length} campi vuoti (${vuoti.join(', ')}), compariranno come «–».`);
  if (O.dxf) {
    const diff = [...new Set([...Object.keys(O.dxf), ...righe.map(r => r.taglia)])]
      .filter(t => (O.dxf![t] || 0) !== (perTaglia.get(t) || 0)).map(t => `${t} moduli: DXF ${O.dxf![t] || 0}, preventivo ${perTaglia.get(t) || 0}`);
    if (diff.length) avvisi.push('Il DXF non corrisponde al preventivo · ' + diff.join(' · '));
  }
  const prezzi = [
    { label: 'Struttura e componenti', value: `€ ${campi.prezzo_offerta} + IVA`, strike: pieno > pStr ? `€ ${campi.prezzo_listino}` : undefined },
    { label: 'Trasporto', value: trasp > 0 ? `€ ${campi.costo_trasporto} + IVA` : 'Escluso' },
    { label: 'Posa in opera', value: posa > 0 ? `€ ${campi.costo_posa} + IVA` : 'Non inclusa', nota: [O.posaNota, O.posaModo].filter(Boolean).join(' · ') || undefined },
    { label: 'Prezzo per kWp', value: `${campi.prezzo_kwp} €/kWp` },
  ];
  return { campi, liste, paragrafi, righe, prezzi, avvisi };
}

/* ---------- Compilazione del PowerPoint ---------- */
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Paragrafo che contiene il testo indicato (non attraversa altri paragrafi).
const paraRe = (t: string) => new RegExp(`<a:p>(?:(?!<a:p>)[\\s\\S])*?${reEsc(t)}[\\s\\S]*?</a:p>`);
const tokens = (x: string, map: Record<string, string>) => x.replace(/\{\{([a-z_0-9]+)\}\}/g, (m, k) => (k in map ? esc(map[k]) : m));
// Paragrafo ridotto a un solo testo, con la formattazione del primo pezzo (senza barrato).
function paraText(p: string, text: string) {
  const pPr = /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/.exec(p)?.[0] ?? '';
  const rPr = (/<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/.exec(p)?.[0] ?? '').replace(/ strike="[^"]*"/, '');
  return `<a:p>${pPr}<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r></a:p>`;
}

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const compilaPptx = async (modello: ArrayBuffer, D: DatiOfferta, layout?: Layout) =>
  (await compila(modello, D, layout)).generateAsync({ type: 'blob', mimeType: PPTX, compression: 'DEFLATE' });
// Stesso file in byte, per il server (la funzione che lo manda su Telegram).
export const compilaPptxBytes = async (modello: ArrayBuffer | Uint8Array, D: DatiOfferta, layout?: Layout) =>
  (await compila(modello, D, layout)).generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

// Immagine del layout: PNG (disegno del DXF o immagine caricata nell'app) o JPG (foto mandata al bot).
type Layout = { img: Uint8Array; w: number; h: number; ext?: 'png' | 'jpeg' };
/** Layout salvato nel preventivo (data URL in prev.offerta.layout), pronto per il PowerPoint; undefined se non c'e'. */
export const layoutImg = (O: any): Layout | undefined =>
  O.layout ? { img: dataUrlBytes(O.layout), w: O.layoutW, h: O.layoutH, ext: /^data:image\/jpe?g/i.test(O.layout) ? 'jpeg' : 'png' } : undefined;
async function compila(modello: ArrayBuffer | Uint8Array, D: DatiOfferta, layout?: Layout) {
  const zip = await JSZip.loadAsync(modello);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const n of slides) {
    let x = await zip.file(n)!.async('string');
    const orig = x;
    // Blocchi ripetuti: il paragrafo con {{#nome}}…{{/nome}} si ricopia per ogni elemento (e sparisce se la lista è vuota).
    for (const [nome, items] of Object.entries(D.liste)) {
      let m: RegExpExecArray | null;
      while ((m = paraRe(`{{#${nome}}}`).exec(x))) {
        const p = m[0].replace(`{{#${nome}}}`, '').replace(`{{/${nome}}}`, '');
        x = x.replace(m[0], items.map(it => tokens(p, { ...D.campi, ...it })).join(''));
      }
    }
    for (const [k, v] of Object.entries(D.paragrafi)) {
      const m = paraRe(`{{${k}}}`).exec(x);
      if (m) x = x.replace(m[0], v == null ? '' : paraText(m[0], v));
    }
    // Layout: l'immagine IMG_LAYOUT (o con descrizione {{LAYOUT}}) prende il disegno, adattato alle sue proporzioni.
    const pm = /<p:pic>(?:(?!<p:pic>)[\s\S])*?(?:name="IMG_LAYOUT"|descr="\{\{LAYOUT\}\}")[\s\S]*?<\/p:pic>/.exec(x);
    if (pm && layout) {
      let pic = pm[0];
      const rid = /r:embed="([^"]+)"/.exec(pic)![1];
      const relsN = n.replace('slides/', 'slides/_rels/') + '.rels', rels = await zip.file(relsN)!.async('string');
      const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${reEsc(rid)}"[^>]*/>`).exec(rels)?.[0];
      if (rel) {
        // File nuovo: l'immagine del modello potrebbe servire anche altrove o avere un altro formato.
        const media = `layout_${n.match(/slide(\d+)/)![1]}.${layout.ext || 'png'}`;
        zip.file('ppt/media/' + media, layout.img);
        zip.file(relsN, rels.replace(rel, rel.replace(/Target="[^"]*"/, `Target="../media/${media}"`)));
        const o = /<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(pic)!;
        const [bx, by, bw, bh] = [+o[1], +o[2], +o[3], +o[4]], ar = layout.w / layout.h;
        const W = Math.round(ar > bw / bh ? bw : bh * ar), H = Math.round(W / ar);
        pic = pic.replace(o[0], `<a:off x="${bx + Math.round((bw - W) / 2)}" y="${by + Math.round((bh - H) / 2)}"/><a:ext cx="${W}" cy="${H}"/>`)
          .replace(/<a:srcRect[^>]*\/>/, '');
        x = x.replace(pm[0], pic);
      }
    }
    x = tokens(x, D.campi);
    if (x !== orig) zip.file(n, x);
  }
  // Il tipo dell'immagine deve essere dichiarato (il .png di solito c'e' gia').
  const ext = layout?.ext || 'png';
  const ct = await zip.file('[Content_Types].xml')!.async('string');
  if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) zip.file('[Content_Types].xml', ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="image/${ext}"/>`));
  return zip;
}

export const dataUrlBytes = (u: string) => { const b = atob(u.split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
