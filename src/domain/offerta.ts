// Offerta tecnico-economica: dati presi dal preventivo e compilazione del modello PowerPoint (public/offerta/modello-offerta.pptx).
// Nel modello i campi sono segnaposto {{nome}}; {{#lista}}…{{/lista}} in un paragrafo lo ripete per ogni elemento;
// le forme con descrizione {{#lista}} sono una riga di tabella disegnata, ripetuta una sotto l'altra (vedi righeForme).
// L'immagine chiamata IMG_LAYOUT viene sostituita dal layout dell'impianto; le altre slide restano come sono.
import JSZip from 'jszip';
import { pesoTot } from './compute.js';
import { fDate, fN, fPeso } from './format.js';
import { CATS, defOfferta, num } from './model.js';
import { prezzoServizio, serviziDi } from './servizi.js';
export { SERVIZI0, prezzoServizio, serviziDi, type Servizio } from './servizi.js';

/* ---------- Impostazioni condivise (nel listino, valgono per tutti i preventivi) ---------- */
// Nelle voci si possono usare i segnaposto del modello: {{profilo_pilastri}} e {{spessore_asse}} prendono il materiale del preventivo.
export const INCLUSI0 = ['Struttura portante in {{profilo_pilastri}} in acciaio S355 zincato a caldo',
  'Tubo di rotazione 120x120 Magnelis S320 ZM 310 {{spessore_asse}} mm', 'Omega supporto pannelli in lamiera Magnelis S250 ZM 310 (250 mm)',
  'Motoriduttore e quadro sotto-motore per ogni tracker', 'Bulloneria 8.8', 'Calcolo strutturale depositato al Genio Civile',
  'Sistema di controllo TTS® Agri Solar Control'];
// Elenco predefinito del modello precedente: chi non l'aveva cambiato passa al nuovo.
const INCLUSI_VECCHI = ['Struttura metallica in acciaio S355 zincato a caldo', 'Cuscinetti, inclinometri programmati e finecorsa',
  'Motoriduttore e quadro sotto-motore per ogni tracker', 'Omega di supporto pannelli e bulloneria', 'Calcolo strutturale depositato al Genio Civile',
  'Sistema di controllo TTS® Agri Solar Control'];
export const GARANZIE0 = { struttura: 20, commerciali: 5, assistenza: 2 };
export function offCfg(data: any) {
  const p = data.params; if (!p.offerta) p.offerta = {};
  const o = p.offerta;
  if (!Array.isArray(o.inclusi) || o.inclusi.join('|') === INCLUSI_VECCHI.join('|')) o.inclusi = [...INCLUSI0];
  o.garanzie = { ...GARANZIE0, ...(o.garanzie || {}) };
  return o;
}

/* ---------- Dati dell'offerta nel preventivo ---------- */
// Campi della slide "Dati di progetto" compilati a mano: [chiave nel modello, etichetta, esempio].
export const PROGETTO = [
  ['modulo_tipo', 'Tipo modulo', 'bifacciale'], ['modulo_dimensioni', 'Dimensioni modulo (mm)', '2384 × 1303 × 35'], ['modulo_peso_kg', 'Peso modulo (kg)', '38'],
  ['vento_ms', 'Vento di progetto (m/s)', '27'], ['vento_protezione_ms', 'Vento di protezione (m/s)', '20'], ['categoria_terreno', 'Categoria terreno (Eurocodice)', 'II'], ['altitudine_m', 'Altitudine (m s.l.m.)', '120'],
  ['classe_corrosivita', 'Classe di corrosività', 'C3'], ['pendenza_ns', 'Pendenza N-S', '3 %'], ['altezza_min_modulo_m', 'Altezza minima modulo (m)', '2,10'],
  ['infissione_m', 'Infissione (m)', '1,80'], ['angolo_rotazione', 'Angolo di rotazione (±°)', '55'],
] as const;
// Campi obbligatori dell'offerta: [chiave nel modello, etichetta, dove si compila]. Vuoti vanno segnati «non disponibile» (prev.offerta.nd),
// altrimenti dall'app l'offerta non si genera.
export const OBBLIGATORI: readonly (readonly [string, string, string])[] = [
  ['referente', 'Referente del cliente', 'Intestazione'], ['email_referente', 'E-mail del referente', 'Intestazione'], ['zona', 'Zona', 'Intestazione'],
  ['localita', 'Località', 'Configura'], ['coordinate', 'Coordinate', 'Configura'], ['modulo_modello', 'Modello del modulo', 'Configura'],
  ...PROGETTO.map(([k, l]) => [k, l, 'Dati di progetto'] as const),
  ['resa', 'Resa', 'Condizioni commerciali'], ['consegna', 'Tempi di consegna', 'Condizioni commerciali'], ['validita', "Validità dell'offerta", 'Condizioni commerciali'],
];
export const ND = 'Non disponibile';
/** Dove si corregge un avviso o si compila un campo obbligatorio: scheda, tendina e (se c'è) il campo su cui mettere il cursore. */
export type Dove = { tab: string; fold: string; path?: string; nome: string };
export const DOVE: Record<string, Dove> = {
  numero: { tab: 'config', fold: 'cf-comm', path: 'prev.num', nome: 'Configura → Commessa' },
  cliente: { tab: 'config', fold: 'cf-comm', path: 'prev.cliente', nome: 'Configura → Commessa' },
  localita: { tab: 'config', fold: 'cf-comm', path: 'prev.luogo.nome', nome: 'Configura → Commessa' },
  coordinate: { tab: 'config', fold: 'cf-comm', path: 'prev.luogo.nome', nome: 'Configura → Commessa (Trova sulla mappa)' },
  modulo_modello: { tab: 'config', fold: 'cf-mod', path: 'prev.modulo.marca', nome: 'Configura → Moduli fotovoltaici' },
  tracker: { tab: 'config', fold: 'cf-trk', nome: 'Configura → Tracker' },
  margine: { tab: 'invia', fold: 'in-prz', path: 'prev.marg.gen', nome: "Prezzi nell'offerta" },
  prezzi: { tab: 'invia', fold: 'in-prz', nome: "Prezzi nell'offerta" },
  layout: { tab: 'invia', fold: 'in-lay', nome: "Layout dell'impianto" },
  ignoti: { tab: 'invia', fold: 'in-incl', nome: 'Incluso nel prezzo e garanzie' },
  referente: { tab: 'invia', fold: 'in-int', path: 'prev.offerta.referente', nome: "Intestazione dell'offerta" },
  email_referente: { tab: 'invia', fold: 'in-int', path: 'prev.offerta.email', nome: "Intestazione dell'offerta" },
  zona: { tab: 'invia', fold: 'in-int', path: 'prev.offerta.zona', nome: "Intestazione dell'offerta" },
  ...Object.fromEntries(PROGETTO.map(([k]) => [k, { tab: 'invia', fold: 'in-prog', path: `prev.offerta.prog.${k}`, nome: 'Dati di progetto' }])),
  ...Object.fromEntries((['resa', 'consegna', 'validita'] as const).map(k => [k, { tab: 'invia', fold: 'in-comm', path: `prev.offerta.${k}`, nome: 'Condizioni commerciali' }])),
};
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
  avvisiDove: string[];                                // per ogni avviso, dove si corregge (chiave di DOVE, '' = da nessuna parte)
  mancanti: string[];                                  // campi obbligatori vuoti e non segnati «non disponibile»
  senza: string[];                                     // segnaposto senza valore: nel modello resta solo «–» o «Non disponibile», senza unità
};
const euro = (v: number) => fN(v, 2);
const isTrasporto = (l: any) => /traspor/i.test(l.desc || '');

/** Raccoglie dal preventivo tutto quello che va nell'offerta. `montTot` = totale della scheda Montaggio (per la posa in opera). */
export function datiOfferta(P: any, R: any, data: any, montTot: number): DatiOfferta {
  const O = offPrev(P), cfg = offCfg(data), avvisi: string[] = [], avvisiDove: string[] = [];
  const avv = (dove: string, t: string) => { avvisi.push(t); avvisiDove.push(dove); };
  // Tracker per taglia (in ordine decrescente, come nel modello).
  const perTaglia = new Map<string, number>();
  P.righe.forEach((r: any) => { if (num(r.n) > 0) perTaglia.set(String(r.taglia), (perTaglia.get(String(r.taglia)) || 0) + num(r.n)); });
  const righe = [...perTaglia].sort((a, b) => num(b[0]) - num(a[0])).map(([taglia, n]) => ({ n, taglia }));
  const attive = P.righe.filter((r: any) => num(r.n) > 0), diversi = (k: string) => [...new Set(attive.map((r: any) => String(r[k])))].join(' / ');
  const profili = diversi('prof'), tipi = new Set(attive.map((r: any) => r.tipo === 'Basso' ? 'Basso' : 'Agrivoltaico'));
  const agri = tipi.has('Agrivoltaico'), terra = tipi.has('Basso');

  // Prezzi di vendita. Il modello ha posto solo per il trasporto: le altre voci extra vanno in "struttura e componenti".
  const extra = R.lines.filter((l: any) => l.riga === 'extra'), altre = extra.filter((l: any) => !isTrasporto(l));
  const pStr = R.lines.filter((l: any) => l.riga !== 'extra' || !isTrasporto(l)).reduce((s: number, l: any) => s + l.prezzo, 0);
  const trasp = O.trasporto === '' || O.trasporto == null ? extra.filter(isTrasporto).reduce((s: number, l: any) => s + l.prezzo, 0) : num(O.trasporto);
  const pieno = num(O.pieno), posa = O.posa === '' || O.posa == null ? montTot : num(O.posa);
  if (altre.length) avv('prezzi', `Il modello ha posto solo per il trasporto: ${altre.map((l: any) => l.desc || 'voce extra').join(', ')} ${altre.length > 1 ? 'sono incluse' : 'è inclusa'} nel prezzo di struttura e componenti.`);

  const lu = P.luogo || {}, pr = O.prog;
  const campi: Record<string, string> = {
    nome_impianto: O.nome || P.rif || P.cliente || '', cliente: P.cliente || '', referente: O.referente || '', email_referente: O.email || '',
    n_tracker: fN(righe.reduce((s, r) => s + r.n, 0), 0),
    tipo_progetto: agri && terra ? 'Impianto agrivoltaico e a terra' : terra ? 'Impianto fotovoltaico a terra' : 'Impianto agrivoltaico',
    tipo_struttura: `Tracker monoassiale ${agri && terra ? 'agrivoltaico e a terra' : terra ? 'a terra' : 'agrivoltaico'} TTS`,
    profilo_pilastri: profili, spessore_asse: diversi('asse'), spessore_omega: diversi('omega'),
    zona: O.zona || '', localita_zona: [lu.nome, O.zona ? 'zona ' + O.zona : ''].filter(Boolean).join(' · '),
    resa: O.resa || '', pagamento: O.pagamento || 'Da concordare', consegna: O.consegna || '', validita: O.validita || '',
    numero_offerta: P.num || '', revisione: O.rev === '' || O.rev == null ? '0' : String(O.rev), data_offerta: fDate(O.data || P.data),
    potenza_kwp: fN(R.kwp, 2), potenza_modulo_w: fN(R.wp, 0), moduli_totali: fN(R.nModuli, 0), modulo_modello: P.modulo?.marca || '',
    localita: lu.nome || '', coordinate: lu.lat != null && lu.lng != null ? `${(+lu.lat).toFixed(5)}, ${(+lu.lng).toFixed(5)}` : '',
    n_quadri_area: fN(P.imp?.quadA, 0), n_quadri_generali: fN(P.imp?.quadGen, 0),
    prezzo_offerta: euro(pStr), prezzo_listino: euro(pieno), costo_trasporto: euro(trasp), costo_posa: euro(posa),
    // Tabella dei servizi opzionali: il prezzo se c'e', altrimenti «Su richiesta».
    trasporto_opzionale: trasp > 0 ? `€ ${euro(trasp)} + IVA` : 'Su richiesta', posa_opzionale: posa > 0 ? `€ ${euro(posa)} + IVA` : 'Su richiesta',
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
    tracker: righe.map(r => ({ quantita: fN(r.n, 0), moduli: r.taglia, potenza_tracker: fN(num(r.taglia) * R.wp, 0), potenza_riga: fN((r.n * num(r.taglia) * R.wp) / 1000, 2) })),
    inclusi: cfg.inclusi.map((v: string) => String(v).trim()).filter(Boolean).map((voce: string) => ({ voce })),
    servizi: serviziDi(O).filter(x => x.on !== false && String(x.voce || '').trim())
      .map(x => ({ voce: String(x.voce).trim(), prezzo: prezzoServizio(x, { trasporto: campi.trasporto_opzionale, posa: campi.posa_opzionale }) })),
  };

  // Campi obbligatori vuoti: «Non disponibile» se segnati così, altrimenti «–» e l'app non genera l'offerta
  // (gli altri segnaposto vuoti restano vuoti, es. la nota della posa).
  const nd = O.nd || {}, mancanti: string[] = [], senza: string[] = [];
  for (const [k, l] of OBBLIGATORI) {
    if (campi[k]) continue;
    if (!nd[k]) mancanti.push(l);
    campi[k] = nd[k] ? ND : '–'; senza.push(k);
  }
  if (!campi.localita_zona) { campi.localita_zona = nd.localita ? ND : '–'; senza.push('localita_zona'); }
  if (!campi.numero_offerta) campi.numero_offerta = '–';
  // Segnaposto scritti a mano nelle voci incluse che il modello non conosce: nel PDF spariscono, meglio dirlo.
  const ignoti = [...new Set<string>(cfg.inclusi.join(' ').match(/\{\{[^{}]*\}\}/g) || [])].filter(t => !(t.slice(2, -2) in campi));

  if (!P.num) avv('numero', "Il preventivo non ha ancora un numero: salvalo per assegnarlo (in copertina comparirebbe «–»).");
  if (!P.cliente) avv('cliente', 'Manca il cliente (Configura → Commessa).');
  if (!righe.length) avv('tracker', 'Nessun tracker nel preventivo.');
  if (!(R.prezzo > 0)) avv('margine', 'Il prezzo di vendita è zero.');
  if (R.total > 0 && R.prezzo - R.total < 0.5) avv('margine', "Margine 0 %: nell'offerta il prezzo di vendita è uguale al costo. Imposta il margine qui sotto (Prezzi) o nella scheda Margini.");
  if (!O.layout) avv('layout', 'Nessun layout caricato: la slide del layout resterà vuota, senza disegno.');
  if (mancanti.length) avv(OBBLIGATORI.find(o => o[1] === mancanti[0])![0], `Da compilare o segnare «non disponibile»: ${mancanti.join(', ')}.`);
  if (ignoti.length) avv('ignoti', `Nelle voci incluse ${ignoti.join(', ')} non ${ignoti.length > 1 ? 'sono campi' : 'è un campo'} del modello: nell'offerta ${ignoti.length > 1 ? 'spariranno' : 'sparirà'}.`);
  if (O.dxf) {
    const diff = [...new Set([...Object.keys(O.dxf), ...righe.map(r => r.taglia)])]
      .filter(t => (O.dxf![t] || 0) !== (perTaglia.get(t) || 0)).map(t => `${t} moduli: DXF ${O.dxf![t] || 0}, preventivo ${perTaglia.get(t) || 0}`);
    if (diff.length) avv('layout', 'Il DXF non corrisponde al preventivo · ' + diff.join(' · '));
  }
  const prezzi = [
    { label: 'Struttura e componenti', value: `€ ${campi.prezzo_offerta} + IVA`, strike: pieno > pStr ? `€ ${campi.prezzo_listino}` : undefined },
    { label: 'Trasporto', value: trasp > 0 ? `€ ${campi.costo_trasporto} + IVA` : 'Escluso' },
    { label: 'Posa in opera', value: posa > 0 ? `€ ${campi.costo_posa} + IVA` : 'Non inclusa', nota: [O.posaNota, O.posaModo].filter(Boolean).join(' · ') || undefined },
    { label: 'Prezzo per kWp', value: `${campi.prezzo_kwp} €/kWp` },
  ];
  return { campi, liste, paragrafi, righe, prezzi, avvisi, avvisiDove, mancanti, senza };
}
/** Errore da mostrare se l'offerta non si può generare (campi obbligatori), altrimenti ''. */
export const bloccoOfferta = (D: DatiOfferta) =>
  D.mancanti.length ? `compila o segna «non disponibile» in Invia preventivo: ${D.mancanti.join(', ')}` : '';

/* ---------- Compilazione del PowerPoint ---------- */
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
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

// Riga di tabella fatta di forme: quelle con descrizione {{#nome}} sono la riga d'esempio ({{#nome:alterna}}, lo sfondo
// a righe alterne, solo nelle righe dispari). Si ricopiano una sotto l'altra per ogni elemento; le forme con descrizione
// {{segue:nome}} (totale, note) scendono di conseguenza. Oltre RIGHE_MAX le righe si stringono in quello spazio (tracker: 2, sopra il logo).
// Quante righe ci stanno a grandezza piena; oltre, si stringono in quello spazio.
const RIGHE_MAX: Record<string, number> = { tracker: 2, servizi: 8 };
const offRe = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/;
function righeForme(x: string, nome: string, items: Record<string, string>[], campi: Record<string, string>) {
  const forma = (d: string) => new RegExp(String.raw`<p:sp>(?:(?!<p:sp>)[\s\S])*?descr="${reEsc(d)}"[\s\S]*?</p:sp>`, 'g');
  // In ordine di disegno: lo sfondo della riga resta sotto i testi.
  const riga = [...x.matchAll(new RegExp(String.raw`<p:sp>(?:(?!<p:sp>)[\s\S])*?descr="\{\{#${reEsc(nome)}(:alterna)?\}\}"[\s\S]*?</p:sp>`, 'g'))]
    .map(m => ({ s: m[0], alterna: !!m[1] }));
  if (!riga.length) return x;
  const pos = (s: string) => { const o = offRe.exec(s)!; return { m: o[0], x: +o[1], y: +o[2], w: +o[3], h: +o[4] }; };
  const y0 = Math.min(...riga.map(f => pos(f.s).y)), h = Math.max(...riga.map(f => pos(f.s).h));
  const n = items.length, max = RIGHE_MAX[nome] ?? 2, hh = n > max ? Math.round((h * max) / n) : h;
  let id = Math.max(0, ...[...x.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => +m[1]));
  const nuove = items.map((it, i) => riga.filter(f => !f.alterna || i % 2 === 0).map(f => {
    const p = pos(f.s), y = y0 + i * hh + Math.round(((p.y - y0) * hh) / h);
    return tokens(f.s, { ...campi, ...it }).replace(p.m, `<a:off x="${p.x}" y="${y}"/><a:ext cx="${p.w}" cy="${Math.round((p.h * hh) / h)}"/>`)
      .replace(/<p:cNvPr id="\d+"/, () => `<p:cNvPr id="${++id}"`).replace(/ descr="[^"]*"/, '');
  }).join('')).join('');
  const SEGNO = '<!--righe-->';
  riga.forEach((f, i) => { x = x.replace(f.s, i === 0 ? SEGNO : ''); });
  const dy = (Math.min(n, max) - 1) * h;   // esatto: niente arrotondamenti delle righe strette
  x = x.replace(forma(`{{segue:${nome}}}`), s => { const p = pos(s); return s.replace(p.m, `<a:off x="${p.x}" y="${p.y + dy}"/><a:ext cx="${p.w}" cy="${p.h}"/>`).replace(/ descr="[^"]*"/, ''); });
  return x.replace(SEGNO, nuove);
}

// Larghezza dei caratteri (millesimi di em) di Open Sauce Bold, il carattere dei titoli del modello; gli altri contano come una «n» larga.
const CAR = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-'&/()";
const LAR = ('591 643 621 643 640 368 644 605 258 258 596 302 903 605 652 643 643 391 576 383 606 546 844 582 565 555 ' +
  '710 698 767 728 621 604 819 752 280 394 670 546 929 755 820 666 822 689 696 630 737 702 1112 723 700 628 ' +
  '670 451 648 662 647 656 662 592 668 662 268 244 274 365 181 747 473 299 299').split(' ').map(Number);
const largh = (t: string, sz: number, spc: number) =>   // in punti; spc = spaziatura tra lettere in punti
  [...t.normalize('NFD').replace(/\p{M}/gu, '')].reduce((s, c) => s + ((LAR[CAR.indexOf(c)] ?? 680) / 1000) * sz + spc, 0);
// Quante righe occupa il testo andando a capo a parole, come PowerPoint, in una larghezza di w punti.
function aCapo(t: string, w: number, sz: number, spc: number) {
  const righe: string[] = [];
  for (const p of t.split(/\s+/).filter(Boolean)) {
    const ult = righe.length ? righe[righe.length - 1] + ' ' + p : '';
    if (ult && largh(ult, sz, spc) <= w) righe[righe.length - 1] = ult; else righe.push(p);
  }
  return Math.max(1, righe.reduce((n, r) => n + Math.ceil(largh(r, sz, spc) / w), 0));   // una parola troppo lunga si spezza
}

// Nome dell'impianto nella slide Layout: a 60 pt un nome lungo andava a capo sopra l'elenco dei tracker.
// Il riquadro si allarga fino al logo e il carattere (con interlinea e spaziatura) scende finché il nome sta sopra l'elenco.
const EMU = 12700;   // per punto
function titoloLayout(x: string, nome: string) {
  const sp = /<p:sp>(?:(?!<p:sp>)[\s\S])*?\{\{nome_impianto\}\}[\s\S]*?<\/p:sp>/.exec(x)?.[0];
  const o = sp && offRe.exec(sp), r = sp && /<a:rPr\b[^>]*\bsz="(\d+)"[^>]*\bspc="(-?\d+)"/.exec(sp), l = sp && /<a:spcPts val="(\d+)"\/>/.exec(sp);
  if (!sp || !o || !r || !l || !nome.trim()) return x;
  const [bx, by] = [+o[1], +o[2]], sz0 = +r[1] / 100, spc0 = +r[2] / 100, ln0 = +l[1] / 100;
  // Le altre forme: a destra (il logo) fanno da bordo, sotto (l'elenco dei tracker) da fondo.
  const altre = [...x.replace(sp, '').matchAll(new RegExp(offRe, 'g'))].map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] })).filter(f => f.w && f.h);
  const destra = Math.min(18288000, ...altre.filter(f => f.x > bx + +o[3] / 2 && f.y < by + +o[4]).map(f => f.x)) - 300000;
  const fondo = Math.min(...altre.filter(f => f.y > by + +o[4] / 2 && f.x < destra).map(f => f.y)) - 8 * EMU;   // un po' d'aria sopra l'elenco
  const W = Math.max(+o[3], destra - bx), wPt = (W / EMU) * 0.95;   // margine: la misura dei caratteri è approssimata
  let sz = sz0, n = 1;
  for (; sz > 20; sz--) { n = aCapo(nome, wPt, sz, (spc0 * sz) / sz0); if (by + n * ((ln0 * sz) / sz0) * EMU <= fondo) break; }
  const k = sz / sz0, nuovo = sp.replace(o[0], `<a:off x="${bx}" y="${by}"/><a:ext cx="${W}" cy="${Math.round(n * ln0 * k * EMU)}"/>`)
    .replace(/(<a:rPr\b[^>]*\bsz=")\d+("[^>]*\bspc=")-?\d+/g, `$1${sz * 100}$2${Math.round(spc0 * k * 100)}`)
    .replace(/<a:spcPts val="\d+"\/>/g, `<a:spcPts val="${Math.round(ln0 * k * 100)}"/>`);
  return x.replace(sp, nuovo);
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
    // Segnaposto spezzati da PowerPoint su più pezzi di testo (succede ritoccando il modello): il paragrafo si riunisce in uno.
    x = x.replace(/<a:p>(?:(?!<a:p>)[\s\S])*?<\/a:p>/g, p => {
      const t = [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('');
      return (t.match(/\{\{[^{}]*\}\}/g) || []).some(s => !p.includes(s)) ? paraText(p, unesc(t)) : p;
    });
    for (const [nome, items] of Object.entries(D.liste)) x = righeForme(x, nome, items, D.campi);
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
    // Senza DXF ne' foto la slide resta vuota: via l'immagine di esempio del modello.
    if (pm && !layout) x = x.replace(pm[0], '');
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
    if (pm) x = titoloLayout(x, D.campi.nome_impianto ?? '');
    // Campo senza valore: via anche unità e prefissi del suo pezzo di testo («– mm», «cat. –» → «Non disponibile»).
    for (const k of D.senza) x = x.replace(new RegExp(String.raw`<a:t>[^<]*\{\{${k}\}\}[^<]*</a:t>`, 'g'), `<a:t>${esc(D.campi[k])}</a:t>`);
    x = tokens(x, D.campi);
    // Nessun segnaposto deve arrivare nel PDF: quelli sconosciuti spariscono.
    x = x.replace(/<a:t>[^<]*<\/a:t>/g, t => t.replace(/\{\{[^{}<]*\}\}/g, ''));
    if (x !== orig) zip.file(n, x);
  }
  // Il tipo dell'immagine deve essere dichiarato (il .png di solito c'e' gia').
  const ext = layout?.ext || 'png';
  const ct = await zip.file('[Content_Types].xml')!.async('string');
  if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) zip.file('[Content_Types].xml', ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="image/${ext}"/>`));
  return zip;
}

export const dataUrlBytes = (u: string) => { const b = atob(u.split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
