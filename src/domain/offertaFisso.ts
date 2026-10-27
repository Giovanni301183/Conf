// Offerta tecnico-economica degli impianti fissi: dati presi dal preventivo per il modello public/offerta/modello-offerta-fisso.pptx
// (grafica BIPALO con le slide dell'offerta dei tracker adattate ai fissi, creato da scripts/offerta-fisso/modello_fisso.py).
// Stessa forma dei dati dei tracker (DatiOfferta), così la scheda Invia preventivo, il PowerPoint, il PDF e il bot sono comuni.
// Sito, vento, modulo, geometria e pesi vengono da Configura (calcolo strutturale compreso). Nella slide Investimento una riga per le
// strutture, poi trasporto, posa e ogni voce extra, sempre a parte con il suo prezzo: le voci extra non entrano mai nel prezzo delle
// strutture (salvo il trasporto scritto «Incluso» nell'offerta, come nei tracker).
import { DISTANZA_PALI_ANT_POST, calcolaFisso, comuniDi, sitoDi } from './fisso.js';
import { fDate, fN, fPeso } from './format.js';
import { num } from './model.js';
import { DOVE, ND, datiOfferta, offPrev, prezzoTesto, type DatiOfferta, type Dove } from './offerta.js';
import { prezzoServizio, serviziDi } from './servizi.js';
import { pressioni, vento } from './vento.js';

/* ---------- Impostazioni condivise dei fissi (data.fisso.offerta, valgono per tutti i preventivi di impianti fissi) ---------- */
export const INCLUSI_FISSO0 = [
  'Struttura in profilati e lamiere piegate di acciaio MAGNELIS® S320GD+ZM310', 'Pali in acciaio S355JR zincato a caldo',
  'Arcarecci in acciaio zincato sp. 2,0 mm', 'Agganci dei moduli in alluminio', 'Bulloneria M10 classe 8.8 zincata',
  'Calcolo strutturale con verifica al vento NTC 2018', 'Esecutivi della struttura',
];
export const GARANZIE_FISSO0 = { struttura: 20, commerciali: 5, assistenza: 2 };
export function offCfgFisso(data: any) {
  const f = (data.fisso ??= {}), o = (f.offerta ??= {});
  if (!Array.isArray(o.inclusi)) o.inclusi = [...INCLUSI_FISSO0];
  o.garanzie = { ...GARANZIE_FISSO0, ...(o.garanzie || {}) };
  return o;
}
// Carico neve per cui la struttura è verificata, come nella presentazione BIPALO.
export const NEVE_VERIFICATA = '140 KG / M2';
export const MATERIALE_STRUTTURA = 'Acciaio al carbonio ad alta resistenza MAGNELIS® S320GD+ZM310';
export const MATERIALE_PALI = 'PILASTRI IN ACCIAIO ZINCATO A CALDO S355JR';

/* ---------- Dati dell'offerta nel preventivo ---------- */
// Campi della scheda «Dati di progetto» scritti a mano (gli altri vengono da Configura). I materiali partono dai testi della
// presentazione; svuotati, la loro riga sparisce dalla slide della struttura.
export const PROGETTO_FISSO = [
  ['modulo_tipo', 'Tipo modulo', 'bifacciale'], ['classe_corrosivita', 'Classe di corrosività', 'C3'], ['pendenza_ns', 'Pendenza N-S', '3 %'],
  ['materiale_struttura', 'Materiale della struttura (slide della struttura)', MATERIALE_STRUTTURA],
  ['materiale_pali', 'Materiale dei pali (slide della struttura)', MATERIALE_PALI],
] as const;
export const OBBLIGATORI_FISSO: readonly (readonly [string, string, string])[] = [
  ['referente', 'Referente del cliente', 'Intestazione'], ['email_referente', 'E-mail del referente', 'Intestazione'], ['zona', 'Zona', 'Intestazione'],
  ['localita', 'Località', 'Configura'], ['coordinate', 'Coordinate', 'Configura'],
  ['vento_ms', 'Vento di progetto', 'Configura'], ['categoria_terreno', 'Categoria di esposizione', 'Configura'], ['altitudine_m', 'Altitudine', 'Configura'],
  ['modulo_modello', 'Modello del modulo', 'Configura'], ['modulo_peso_kg', 'Peso del modulo', 'Configura'], ['modulo_tipo', 'Tipo di modulo', 'Dati di progetto'],
  ['classe_corrosivita', 'Classe di corrosività', 'Dati di progetto'], ['pendenza_ns', 'Pendenza N-S', 'Dati di progetto'],
  ['resa', 'Resa', 'Condizioni commerciali'], ['consegna', 'Tempi di consegna', 'Condizioni commerciali'], ['validita', "Validità dell'offerta", 'Condizioni commerciali'],
];
const SITO: Dove = { tab: 'config', fold: 'cf-sito', path: 'prev.luogo.nome', nome: 'Configura → Sito e vento' };
export const DOVE_FISSO: Record<string, Dove> = {
  ...DOVE,
  localita: SITO, coordinate: SITO,
  vento_ms: { ...SITO, path: 'prev.fisso.sito.zona_vento' }, categoria_terreno: { ...SITO, path: 'prev.fisso.sito.categoria' }, altitudine_m: { ...SITO, path: 'prev.fisso.sito.altitudine' },
  modulo_modello: { tab: 'config', fold: 'cf-mod', path: 'prev.modulo.marca', nome: 'Configura → Moduli fotovoltaici' },
  modulo_peso_kg: { tab: 'config', fold: 'cf-mod', path: 'prev.fisso.comuni.peso_modulo', nome: 'Configura → Moduli fotovoltaici' },
  tracker: { tab: 'config', fold: 'cf-comp', nome: 'Configura → Composizione impianto' },
  ...Object.fromEntries(PROGETTO_FISSO.map(([k]) => [k, { tab: 'invia', fold: 'in-prog', path: `prev.offerta.prog.${k}`, nome: 'Dati di progetto' }])),
};
/** Dati dell'offerta del preventivo, con i campi dei fissi (i materiali partono dai testi della presentazione). */
export function offPrevFisso(P: any) {
  const O = offPrev(P);
  for (const k of ['modulo_tipo', 'classe_corrosivita', 'pendenza_ns']) if (O.prog[k] == null) O.prog[k] = '';
  if (O.prog.materiale_struttura == null) O.prog.materiale_struttura = MATERIALE_STRUTTURA;
  if (O.prog.materiale_pali == null) O.prog.materiale_pali = MATERIALE_PALI;
  return O;
}

const euro = (v: number) => fN(v, 2), iva = (v: number, no: string) => (v > 0 ? `€ ${euro(v)} + IVA` : no);
const isTrasporto = (l: any) => /traspor/i.test(l.desc || ''), isPosa = (l: any) => /posa|montagg/i.test(l.desc || ''), isGru = (l: any) => /\bgru\b/i.test(l.desc || '');
const f = (x: number | null | undefined, d: number) => (x == null || !isFinite(x) ? '–' : fN(x, d));
const somma = (ll: any[]) => ll.reduce((s, l) => s + l.prezzo, 0);

/** Raccoglie dal preventivo di un impianto fisso tutto quello che va nell'offerta (stessa forma dei tracker). */
export function datiOffertaFisso(P: any, R: any, data: any): DatiOfferta {
  const O = offPrevFisso(P), cfg = offCfgFisso(data), avvisi: string[] = [], avvisiDove: string[] = [];
  const avv = (dove: string, t: string) => { avvisi.push(t); avvisiDove.push(dove); };
  const r = calcolaFisso(P).r, c = comuniDi(P), s = sitoDi(P), pr = O.prog, lu = P.luogo || {};
  // Strutture per taglia, dalla più grande (come le righe del modello).
  const righe = (r?.taglie || []).map(t => ({ n: t.input.n_strutture, taglia: String(t.input.moduli) })).sort((a, b) => num(b.taglia) - num(a.taglia));
  const nStr = righe.reduce((a, x) => a + x.n, 0);
  const sez = r?.taglie[0]?.geometria.sezione, v = sez ? vento(s, sez.altezza_alta / 1000) : null, p = pressioni(s, v);
  const area = (c.lunghezza_modulo * c.larghezza_modulo) / 1e6;

  // Prezzi: ogni voce extra ha la sua riga (a parte), il prezzo delle strutture è solo la fornitura.
  // Trasporto: come nei tracker il campo dell'offerta sostituisce il prezzo delle voci di trasporto; «Incluso» le mette nelle strutture.
  const traspTxt = prezzoTesto(O.trasporto), traspIncl = /inclus|compres/i.test(traspTxt);
  const extra = R.lines.filter((l: any) => l.riga === 'extra'), aParte = extra.filter((l: any) => !(traspIncl && isTrasporto(l)));
  const pStr = R.lines.filter((l: any) => !aParte.includes(l)).reduce((a: number, l: any) => a + l.prezzo, 0);
  const tr = aParte.filter(isTrasporto), trasp = traspTxt ? 0 : O.trasporto === '' || O.trasporto == null ? somma(tr) : num(O.trasporto);
  const posaVoci = aParte.filter((l: any) => !isTrasporto(l) && isPosa(l)), posa = O.posa === '' || O.posa == null ? somma(posaVoci) : num(O.posa);
  const gru = somma(aParte.filter((l: any) => !isTrasporto(l) && isGru(l)));
  const pieno = num(O.pieno);
  const descrizione = righe.length === 1
    ? `n. ${righe[0].n} STRUTTUR${righe[0].n === 1 ? 'A' : 'E'} DA ${righe[0].taglia} MODULI`
    : `n. ${fN(nStr, 0)} STRUTTURE (${righe.map(x => `${x.n} DA ${x.taglia}`).join(', ')} MODULI)`;
  const posaNota = [O.posaNota, O.posaModo].filter(Boolean).join(' · ');
  const voci = [
    { voce: descrizione, prezzo: `€ ${euro(pStr)} + IVA` },
    { voce: tr.length === 1 && tr[0].desc ? tr[0].desc.toUpperCase() : 'TRASPORTO', prezzo: traspTxt || iva(trasp, 'Escluso') },
    ...aParte.filter((l: any) => !isTrasporto(l) && !(isPosa(l) && O.posa !== '' && O.posa != null))
      .map((l: any) => ({ voce: (l.desc || 'Voce extra').toUpperCase(), prezzo: iva(l.prezzo, 'Incluso') })),
    // Posa scritta a mano (o nessuna voce di posa): una riga sola, come «Posa in opera» dei tracker.
    ...(O.posa !== '' && O.posa != null ? [{ voce: 'POSA IN OPERA', prezzo: iva(num(O.posa), 'Non inclusa') }] : posaVoci.length ? [] : [{ voce: 'POSA IN OPERA', prezzo: 'Non inclusa' }]),
  ];

  const kg = (k: string) => fPeso(R.pesi?.[k] || 0), pesoTot = ['STRUTTURA', 'BULLONERIA', 'ALLUMINIO'].reduce((a, k) => a + (R.pesi?.[k] || 0), 0);
  const campi: Record<string, string> = {
    nome_impianto: O.nome || P.rif || P.cliente || '', cliente: P.cliente || '', referente: O.referente || '', email_referente: O.email || '',
    n_strutture: fN(nStr, 0), tipo_progetto: 'Impianto fotovoltaico a terra con strutture fisse', descrizione_strutture: descrizione,
    tipo_struttura: 'Struttura fissa SOLAR MAX bipalo', file_verticali: fN(c.file_verticali, 0),
    classe_corrosivita: String(pr.classe_corrosivita ?? '').trim(), pendenza_ns: String(pr.pendenza_ns ?? '').trim(),
    zona: O.zona || '', localita_zona: [lu.nome, O.zona ? 'zona ' + O.zona : ''].filter(Boolean).join(' · '),
    resa: O.resa || '', pagamento: O.pagamento || 'Da concordare', consegna: O.consegna || '', validita: O.validita || '',
    numero_offerta: P.num || '', revisione: O.rev === '' || O.rev == null ? '0' : String(O.rev), data_offerta: fDate(O.data || P.data),
    potenza_kwp: fN(R.kwp, 2), potenza_modulo_w: fN(R.wp, 0), moduli_totali: fN(R.nModuli, 0),
    modulo_modello: P.modulo?.marca || '', modulo_tipo: String(pr.modulo_tipo ?? '').trim(),
    modulo_dimensioni: `${fN(c.lunghezza_modulo, 0)} × ${fN(c.larghezza_modulo, 0)}`, modulo_peso_kg: c.peso_modulo ? fN(c.peso_modulo, 1) : '',
    localita: lu.nome || '', coordinate: lu.lat != null && lu.lng != null && lu.lat !== '' ? `${(+lu.lat).toFixed(5)}, ${(+lu.lng).toFixed(5)}` : '',
    vento_ms: v ? fN(v.vr, 1) : '', pressione_picco: v ? fN(v.qp / 1000, 2) : '–', zona_vento: s.zona_vento ? String(s.zona_vento) : '–',
    // Calcolo strutturale (slide e scheda): vento NTC 2018 § 3.3 e azioni sui moduli, come in Configura → Sito e vento.
    vb0: f(v?.vb0, 0), a0: f(v?.a0, 0), ks: f(v?.ks, 2), ca: f(v?.ca, 3), vb: f(v?.vb, 2), tr: fN(s.tr, 0), cr: f(v?.cr, 3), qr: v ? fN(v.qr / 1000, 3) : '–',
    z_vento: v ? fN(Math.max(v.z, v.zmin), 1) : '–', ce: f(v?.ce, 2), cp_giu: f(s.cp_giu, 2), cp_su: f(s.cp_su, 2), cd: fN(s.cd, 2),
    p_giu: p.giu != null ? fN(p.giu / 1000, 2) : '–', p_su: p.su != null ? fN(Math.abs(p.su) / 1000, 2) : '–',
    p_giu_modulo: p.giu != null ? fN((p.giu * area) / 1000, 2) : '–', p_su_modulo: p.su != null ? fN((Math.abs(p.su) * area) / 1000, 2) : '–',
    area_modulo: fN(area, 2), neve: NEVE_VERIFICATA.toLowerCase().replace('kg / m2', 'kg/m²'),
    distanza_pali_m: fN(DISTANZA_PALI_ANT_POST / 1000, 2), fuga_mm: fN(c.fuga, 0),
    categoria_terreno: s.categoria || '', altitudine_m: s.altitudine != null ? fN(s.altitudine, 0) : '',
    verifica_carichi: `A ${NEVE_VERIFICATA}${v ? ` E AL VENTO NTC 2018: ${fN(v.vr, 1)} M/S` : ''}`,
    inclinazione: fN(c.inclinazione, 0), altezza_min_modulo_m: sez ? fN(sez.altezza_bassa / 1000, 2) : '–', altezza_max_modulo_m: sez ? fN(sez.altezza_alta / 1000, 2) : '–',
    infissione_m: `${fN(c.infissione_ant / 1000, 2)} / ${fN(c.infissione_post / 1000, 2)}`,
    materiale_struttura: String(pr.materiale_struttura ?? '').trim(), materiale_pali: String(pr.materiale_pali ?? '').trim(),
    prezzo_offerta: euro(pStr), prezzo_listino: euro(pieno), prezzo_kwp: R.kwp ? fN(pStr / R.kwp, 0) : '–',
    trasporto_opzionale: traspTxt || iva(trasp, 'Su richiesta'), gru_opzionale: iva(gru, 'Su richiesta'),
    posa_opzionale: posa > 0 ? `€ ${euro(posa)} + IVA${O.posaNota ? ' ' + O.posaNota : ''}` : 'Su richiesta',
    peso_struttura_ton: fN(R.steel / 1000, 1), peso_struttura: kg('STRUTTURA'), peso_bulloneria: kg('BULLONERIA'), peso_alluminio: kg('ALLUMINIO'), peso_totale: fPeso(pesoTot),
    anni_garanzia_struttura: String(cfg.garanzie.struttura), anni_garanzia_commerciali: String(cfg.garanzie.commerciali), anni_assistenza_gratuita: String(cfg.garanzie.assistenza),
  };
  // Materiale svuotato: la sua riga sparisce. Prezzo pieno non più alto delle strutture: niente barrato (il testo resta vuoto).
  const paragrafi: Record<string, string | null> = {};
  if (!campi.materiale_struttura) paragrafi.materiale_struttura = null;
  if (!campi.materiale_pali) paragrafi.materiale_pali = null;
  if (!(pieno > pStr)) paragrafi.prezzo_listino = '';
  const auto = { trasporto: campi.trasporto_opzionale, posa: campi.posa_opzionale, gru: campi.gru_opzionale };
  // Una riga per taglia, dalla più grande: configurazione (soluzione proposta), geometria (calcolo strutturale), taglie (slide della struttura).
  const tt = [...(r?.taglie || [])].sort((a, b) => b.input.moduli - a.input.moduli).map(t => {
    const n = t.input.n_strutture, contr = t.righe.find(x => x.codice === 'controvento')?.quantita ?? 0;
    return { quantita: fN(n, 0), moduli: String(t.input.moduli), finale: n === 1 ? 'A' : 'E', potenza_struttura: fN(t.potenza, 2), potenza_riga: fN(t.potenza * n, 2),
      campate: String(t.campate), telai: String(t.telai), lunghezza: fN(t.lunghezza / 1000, 2), interasse: fN(t.geometria.interasse_pali / 1000, 2),
      controventi: fN(contr, 0), massa: fN(t.massa_struttura, 0) };
  });
  const liste = {
    strutture: righe.map(x => ({ quantita: fN(x.n, 0), moduli: x.taglia })),
    configurazione: tt, geometria: tt, taglie: tt,
    voci,
    inclusi: cfg.inclusi.map((t: string) => String(t).trim()).filter(Boolean).map((voce: string) => ({ voce })),
    servizi: serviziDi(O, 'fisso').filter(x => x.on !== false && String(x.voce || '').trim()).map(x => ({ voce: String(x.voce).trim(), prezzo: prezzoServizio(x, auto) })),
  };

  const nd = O.nd || {}, mancanti: string[] = [], senza: string[] = [];
  for (const [k, l] of OBBLIGATORI_FISSO) {
    if (campi[k]) continue;
    if (!nd[k]) mancanti.push(l);
    campi[k] = nd[k] ? ND : '–'; senza.push(k);
  }
  if (!campi.localita_zona) { campi.localita_zona = nd.localita ? ND : '–'; senza.push('localita_zona'); }
  if (!campi.numero_offerta) campi.numero_offerta = '–';
  const ignoti = [...new Set<string>(cfg.inclusi.join(' ').match(/\{\{[^{}]*\}\}/g) || [])].filter(t => !(t.slice(2, -2) in campi));

  if (!P.num) avv('numero', "Il preventivo non ha ancora un numero: salvalo per assegnarlo (in copertina comparirebbe «–»).");
  if (!P.cliente) avv('cliente', 'Manca il cliente (Configura → Commessa).');
  if (!r) avv('tracker', 'Composizione impianto non valida: ' + (calcolaFisso(P).errore || 'controlla le taglie') + '.');
  else if (!nStr) avv('tracker', 'Nessuna struttura nel preventivo.');
  if (!(R.prezzo > 0)) avv('margine', 'Il prezzo di vendita è zero.');
  if (R.total > 0 && R.prezzo - R.total < 0.5) avv('margine', "Margine 0 %: nell'offerta il prezzo di vendita è uguale al costo. Imposta il margine qui sotto (Prezzi) o nella scheda Margini.");
  if (!v) avv('vento_ms', 'Vento NTC non calcolato (Configura → Sito e vento): nel calcolo strutturale i valori del vento restano «–».');
  else if (p.giu == null || p.su == null) avv('vento_ms', 'Coefficienti di pressione cp non inseriti (Configura → Sito e vento): da far verificare al progettista.');
  if (!O.layout) avv('layout', 'Nessun layout caricato: la slide del layout resterà senza disegno.');
  if (mancanti.length) avv(OBBLIGATORI_FISSO.find(o => o[1] === mancanti[0])![0], `Da compilare o segnare «non disponibile»: ${mancanti.join(', ')}.`);
  if (ignoti.length) avv('ignoti', `Nelle voci incluse ${ignoti.join(', ')} non ${ignoti.length > 1 ? 'sono campi' : 'è un campo'} del modello: nell'offerta ${ignoti.length > 1 ? 'spariranno' : 'sparirà'}.`);

  const prezzi = voci.map((x, i) => ({ label: x.voce, value: x.prezzo, strike: i === 0 && pieno > pStr ? `€ ${campi.prezzo_listino}` : undefined,
    nota: x.voce === 'POSA IN OPERA' && posaNota ? posaNota : undefined }));
  prezzi.push({ label: 'Prezzo per kWp', value: `${campi.prezzo_kwp} €/kWp`, strike: undefined, nota: undefined });
  return { campi, liste, paragrafi, righe, prezzi, avvisi, avvisiDove, mancanti, senza };
}

/* ---------- Comune ai settori ---------- */
/** Dati dell'offerta del settore del preventivo (`montTot` = totale della scheda Montaggio, solo tracker). */
export const datiOffertaDi = (P: any, R: any, data: any, montTot: number): DatiOfferta =>
  (P?.settore === 'fisso' ? datiOffertaFisso(P, R, data) : datiOfferta(P, R, data, montTot));
/** Nome del modello PowerPoint del settore, in public/offerta. */
export const modelloOfferta = (P: any) => (P?.settore === 'fisso' ? 'modello-offerta-fisso.pptx' : 'modello-offerta.pptx');
