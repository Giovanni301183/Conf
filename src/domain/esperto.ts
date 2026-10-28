// Consulente tecnico dell'assistente (app e, in seguito, Telegram): competenze di un ingegnere strutturista e di un geologo
// esperto di pull-out e terreni, archivio tecnico come memoria e dati tecnici del preventivo aperto.
// L'archivio tecnico sono i Documenti con un'etichetta tecnica (TECNICHE in documenti.ts). Gli strumenti li esegue il server
// (api/_esperto.ts): leggono solo i documenti che l'utente può vedere.
import { calcolaFisso, comuniDi, sitoDi } from './fisso.js';
import { fN } from './format.js';
import { pressioni, vento } from './vento.js';
import { TECNICHE, etichetteDi, nomeEtichetta, nomiEtichette, type Documento } from './documenti.js';

/** Tipi di file che l'AI sa leggere: PDF, immagini e testo. Word ed Excel vanno salvati in PDF. */
export const leggibile = (mime: string | null | undefined, nome = '') => !!mime && (mime === 'application/pdf' || /^image\/(jpeg|png|gif|webp)$/.test(mime) || mime.startsWith('text/'))
  || /\.(pdf|txt|csv|md)$/i.test(nome);

/** Cerca nell'archivio: tutte le parole in titolo, etichette, scheda o testo. Prima i documenti della commessa, poi i più recenti. */
export function cercaArchivio(dd: Documento[], testo: string, preventivo: string | null, etichetta?: string | null) {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const parole = norm(testo).split(/\s+/).filter(p => p.length > 1);
  return dd.filter(d => (!etichetta || etichetteDi(d).includes(etichetta)) && parole.every(p => norm(`${d.titolo} ${nomiEtichette(d.etichette)} ${d.scheda || ''} ${d.testo || ''}`).includes(p)))
    .sort((a, b) => +(b.preventivo_id === preventivo && !!preventivo) - +(a.preventivo_id === preventivo && !!preventivo) || b.creato.localeCompare(a.creato));
}

const s = (description: string) => ({ type: 'string', description });
const ns = (description: string) => ({ type: ['string', 'null'], description });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const TEMI = TECNICHE.map(k => `${k} = ${nomeEtichetta(k)}`).join(', ');

export const TOOLS_ESPERTO = [
  { name: 'cerca_archivio', description: `Cerca nell'archivio tecnico: i documenti e le note con un'etichetta tecnica (${TEMI}) e i file allegati a quelle note, arrivati dall'app, da Telegram o dalle email. Ritorna id, titolo, etichette, commessa e la scheda di ogni documento (riassunto con valori e pagine). Testo vuoto = gli ultimi documenti. Prima i documenti della commessa aperta.`,
    input_schema: obj({ testo: s('parole da cercare, es. "pull-out Foggia", "SPT", "NTC tabella 6.4"; vuoto per gli ultimi'), etichetta: { type: ['string', 'null'], enum: [...TECNICHE, null], description: 'solo questa etichetta, o null' } }) },
  { name: 'leggi_documento', description: "Apre il file originale di un documento dell'archivio (PDF, immagine o testo, id da cerca_archivio) per leggerne tabelle, diagrammi e valori esatti. Usalo quando la scheda non basta o per citare un valore con la pagina.",
    input_schema: obj({ id: s("id del documento dell'archivio") }) },
  { name: 'proponi_memoria', description: "Prepara il salvataggio nell'archivio tecnico di una risposta o di una conclusione tecnica (memoria per le domande future): diventa una nota con etichetta tecnica. Non salva: l'utente sceglie condivisa o privata e conferma nell'app.",
    input_schema: obj({ titolo: s('titolo breve, es. "Verifica pull-out pali IPE Foggia"'), testo: s('testo da conservare: dati, ipotesi, calcolo, conclusione e documenti usati'),
      etichette: { type: 'array', items: { type: 'string', enum: TECNICHE }, description: `1-2 etichette tecniche: ${TEMI}` }, preventivo: ns('numero o nome del preventivo a cui legarla, o null') }) },
];

/** Competenze del consulente: si aggiungono alle istruzioni dell'assistente. */
export const ESPERTO = `
Sei anche il consulente tecnico di Terranova, sempre a disposizione: ragioni come un ingegnere strutturista e come un geologo/geotecnico esperto di pali infissi, prove di pull-out e terreni.
Competenze:
- Strutture: NTC 2018 e Circolare 2019 n. 7, Eurocodici (EN 1990, 1991-1-3 neve, 1991-1-4 vento, 1993 acciaio, 1997 geotecnica, 1998), CNR-DT 207. Azioni e combinazioni (SLU, SLE, EQU), coefficienti parziali, verifiche di profili in acciaio formati a freddo e laminati (IPE, HEA, C, Z, omega), collegamenti bullonati, instabilità, deformabilità; strutture fotovoltaiche fisse e tracker monoassiali, vento sui moduli (cp netti di falda, effetti dinamici, stow dei tracker).
- Geotecnica: pali battuti/infissi in acciaio per fotovoltaico; capacità a trazione (pull-out), compressione e carico laterale; metodi α e β, Broms, curve p-y; prove di pull-out in sito (numero e scelta dei pali, cicli di carico, criteri di rottura e di spostamento, lettura dei diagrammi carico-spostamento), correlazioni con prove SPT, CPT/CPTU, DPSH/penetrometriche, MASW, sondaggi; categorie di sottosuolo (NTC § 3.2.2), falda, terreni coesivi e granulari, riporti e rocce tenere, rifiuto all'infissione, pre-foratura, corrosività del terreno e spessori sacrificali (EN 1993-5, ISO 9223, EN ISO 1461), effetti del gelo e della variazione stagionale dell'umidità.
- Valori di riferimento NTC 2018 per i pali (da verificare sul testo vigente prima di usarli in un progetto): approccio 2 (A1+M1+R3); γR per pali infissi: base 1,15, laterale in compressione 1,15, laterale in trazione 1,25 (Tab. 6.4.II); da prove di carico statiche Rk = min(Rmedia/ξ1; Rmin/ξ2) con ξ1 = 1,40-1,30-1,20-1,10-1,00 e ξ2 = 1,40-1,20-1,05-1,00-1,00 per 1, 2, 3, 4, ≥5 prove (Tab. 6.4.III). Azione variabile sfavorevole γQ = 1,5; permanenti favorevoli γG1 = 1,0 (STR) o 0,9 (EQU).
Come lavori da consulente:
- Prima di rispondere su un sito, una commessa o una prova cerca nell'archivio tecnico (cerca_archivio) e, se servono valori esatti, apri il file con leggi_documento. Cita sempre il documento e la pagina da cui prendi un dato.
- Usa i dati tecnici del preventivo aperto (li ricevi nella richiesta, se c'è un preventivo) per i conti: forze per palo, infissione, vento.
- Mostra il ragionamento come in una relazione: dati di partenza, ipotesi, formule con i numeri, risultato con l'unità di misura, conclusione. Separa i dati misurati dalle stime e dalle correlazioni.
- Se mancano dati (stratigrafia, numero di prove, profilo, spessore, quota di falda) dillo e indica cosa serve e come ottenerlo (es. quante prove di pull-out, su quali pali, fino a che carico). Non inventare valori di terreni o di prove.
- Sei un supporto tecnico: per conclusioni che vanno in un progetto o in una relazione scrivi che la verifica finale e la firma spettano al progettista abilitato.
- Quando arrivi a una conclusione utile per il futuro (valori di pull-out di un sito, una verifica, un criterio scelto), offri di salvarla nell'archivio con proponi_memoria.`;

/** Dati tecnici del preventivo aperto per il consulente: per i fissi geometria, vento, pressioni e forze medie per palo. */
export function datiTecnici(P: any): string {
  if (!P) return '';
  const luogo = [P.luogo?.nome, P.luogo?.lat != null && P.luogo?.lng != null ? `${fN(P.luogo.lat, 4)}, ${fN(P.luogo.lng, 4)}` : ''].filter(Boolean).join(' · ');
  const testa = `Preventivo aperto${P.num ? ' N° ' + P.num : ''}: ${P.nome || 'senza nome'}${P.cliente ? ' · cliente ' + P.cliente : ''}${luogo ? ' · ' + luogo : ''}.`;
  if (P.settore !== 'fisso') return `${testa} Settore tracker solari: righe ${(P.righe || []).map((r: any) => `${r.n}× taglia ${r.taglia} ${r.tipo || ''}`.trim()).join(', ') || '–'}.`;
  const { r, errore } = calcolaFisso(P);
  if (!r) return `${testa} Impianto fisso: calcolo non riuscito (${errore}).`;
  const c = comuniDi(P), st = sitoDi(P), area = (c.lunghezza_modulo * c.larghezza_modulo) / 1e6, g = 9.81;
  const righe = [testa, `Impianto fisso SOLAR MAX bipalo: ${r.totali.strutture} strutture, ${r.totali.moduli} moduli, ${fN(r.totali.potenza, 2)} kWp, massa strutture ${fN(r.totali.massa, 0)} kg.`,
    `Modulo ${c.lunghezza_modulo}×${c.larghezza_modulo} mm (${fN(area, 2)} m²), ${c.potenza_modulo} kWp, peso ${c.peso_modulo ? c.peso_modulo + ' kg' : 'non inserito'}; ${c.file_verticali} file in verticale, inclinazione ${c.inclinazione}°, bordo basso ${c.altezza_min_terra} mm da terra.`,
    `Infissione: palo anteriore ${c.infissione_ant} mm, posteriore ${c.infissione_post} mm. Sito: zona vento ${st.zona_vento ?? '–'}, quota ${st.altitudine ?? '–'} m, categoria ${st.categoria || '–'}, distanza dal mare ${st.km_mare ?? '–'} km, Tr ${st.tr} anni, cp basso ${st.cp_giu ?? '–'}, cp sollevamento ${st.cp_su ?? '–'}, cd ${st.cd}.`];
  for (const t of r.taglie) {
    const v = vento(st, t.geometria.sezione.altezza_alta / 1000), p = pressioni(st, v), pali = 2 * t.telai, A = t.input.moduli * area;
    const G = (t.massa_struttura + t.input.moduli * (c.peso_modulo || 0)) * g / 1000 / pali;   // kN per palo
    const su = p.su != null ? Math.abs(p.su) * A / 1000 / pali : null, giu = p.giu != null ? p.giu * A / 1000 / pali : null;
    righe.push(`Taglia ${t.input.moduli} moduli (${t.input.n_strutture} strutture): ${t.campate} campate, ${t.telai} telai = ${pali} pali, lunghezza ${fN(t.lunghezza / 1000, 2)} m, bordo alto ${fN(t.geometria.sezione.altezza_alta / 1000, 2)} m, massa ${fN(t.massa_struttura, 0)} kg/struttura.`
      + (v ? ` Vento: vr ${fN(v.vr, 1)} m/s, qp ${fN(v.qp / 1000, 3)} kN/m².` : ' Vento NTC non calcolato (mancano zona, quota o categoria).')
      + ` Forze MEDIE per palo (ripartizione uniforme sui ${pali} pali, da verificare con lo schema del telaio: anteriori e posteriori non sono uguali): permanenti G ≈ ${fN(G, 2)} kN`
      + (su != null ? `, sollevamento da vento Qk ≈ ${fN(su, 2)} kN, trazione di progetto 1,5·Qk − 1,0·G ≈ ${fN(1.5 * su - G, 2)} kN` : ', sollevamento non calcolato (manca cp sollevamento)')
      + (giu != null ? `, pressione verso il basso ≈ ${fN(giu, 2)} kN` : '') + '.');
  }
  return righe.join('\n');
}
