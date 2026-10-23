// Assistente dell'app: strumenti che Claude puo' usare e loro esecuzione sui dati mandati dal browser.
// Gli strumenti "proponi_*" non cambiano niente: preparano una proposta che l'utente conferma o annulla nell'app.
import { gruppiDistinte, sostituisci } from './referenze.js';

export const GRUPPI = gruppiDistinte();
// Come GENERI in calendario.ts (che qui non si importa: dipende dallo stato del browser).
export const GENERI_EVENTO = ['attivita', 'promemoria', 'scadenza', 'appuntamento', 'urgenza'];

// Dati che il browser manda a ogni domanda: listino (senza prezzi) e distinte base.
export interface DatiAssistente {
  listino: { c: string; d: string; cat: string; sub: string; t: string }[];
  template: { g: string; c: string; d?: string; L?: unknown; qa?: string; qb?: string }[];
  sizes: Record<string, { assi: { c: string; d?: string; L?: unknown; q?: string }[] }>;
  // Appunti (note dei documenti e note degli eventi), per scrivere email di aggiornamento.
  appunti?: Appunto[];
  // Preventivi dell'archivio (per le varianti di materiale) e id di quello aperto, se salvato.
  preventivi?: { id: string; num: string; nome: string; cliente: string }[];
  aperto?: string | null;
}
export interface Appunto { quando: string; commessa: string; titolo: string; testo: string }
export const datiPerAssistente = (data: any, appunti: Appunto[] = [], preventivi: DatiAssistente['preventivi'] = [], aperto: string | null = null): DatiAssistente => ({
  appunti, preventivi, aperto,
  listino: data.listino.map((x: any) => ({ c: x.c, d: x.d, cat: x.cat, sub: x.sub, t: x.t })),
  template: data.template.map((r: any) => ({ g: r.g, c: r.c, d: r.d, L: r.L, qa: r.qa, qb: r.qb })),
  sizes: Object.fromEntries(Object.entries<any>(data.sizes).map(([k, s]) => [k, { assi: s.assi.map((a: any) => ({ c: a.c, d: a.d, L: a.L, q: a.q })) }])),
});

export interface Coppia { da: string; a: string; descrizione_nuovo: string | null; peso_kg: number | null; costo: number | null }
export type Proposta =
  | { id: string; tipo: 'sostituzione'; coppie: Coppia[]; gruppi: string[]; righe: { g: string; da: string; a: string; n: number; taglie: string[] }[]; nuovi: string[] }
  | { id: string; tipo: 'evento'; titolo: string; giorno: string; ora: string | null; genere: string; nota: string | null }
  | { id: string; tipo: 'email'; a: string; oggetto: string; testo: string }
  | { id: string; tipo: 'varianti'; base: string; nome: string; varianti: { prof: string | null; asse: number | null; omega: number | null }[] };

const s = (description: string) => ({ type: 'string', description });
const ns = (description: string) => ({ type: ['string', 'null'], description });
const nn = (description: string) => ({ type: ['number', 'null'], description });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const TOOLS = [
  { name: 'cerca_articoli', description: 'Cerca articoli nel listino per codice o descrizione (es. "M16", "rondella 16", "IPE"). Ritorna codice, descrizione, categoria.',
    input_schema: obj({ testo: s('Parole da cercare') }) },
  { name: 'righe_distinta', description: 'Righe delle distinte base di un gruppo: codice, descrizione e quantità per tracker (formule con MOT, CUSC, OMEGA, PANN). Il gruppo ASSI DI ROTAZIONE è diviso per taglia.',
    input_schema: obj({ gruppo: { type: 'string', enum: GRUPPI } }) },
  { name: 'proponi_sostituzione', description: "Prepara la sostituzione di uno o più codici nelle righe delle distinte base dei gruppi scelti. Non cambia niente: l'utente vede l'anteprima e conferma nell'app. Se il codice nuovo non è nel listino viene creato copiando la voce vecchia, con descrizione, peso e costo indicati (null = da completare poi nel listino).",
    input_schema: obj({
      coppie: { type: 'array', items: obj({ da: s('Codice attuale, già nel listino'), a: s('Codice nuovo'), descrizione_nuovo: ns('Descrizione se il codice nuovo va creato, altrimenti null'),
        peso_kg: nn('Peso in kg se il codice nuovo va creato e lo si conosce'), costo: nn('Costo €/pz se il codice nuovo va creato e lo si conosce') }) },
      gruppi: { type: 'array', items: { type: 'string', enum: GRUPPI }, description: 'Gruppi in cui sostituire' } }) },
  { name: 'proponi_evento', description: "Prepara un evento nel calendario della Home. Non lo crea: l'utente conferma nell'app.",
    input_schema: obj({ titolo: s('Titolo breve'), giorno: s('Data AAAA-MM-GG'), ora: ns('Ora HH:MM, o null se senza ora'),
      genere: { type: 'string', enum: GENERI_EVENTO, description: 'attivita = da fare, promemoria, scadenza, appuntamento, urgenza' }, nota: ns('Nota facoltativa') }) },
  { name: 'cerca_appunti', description: 'Cerca negli appunti (note dei documenti e note degli eventi del calendario) per commessa, cliente o parole del testo. Testo vuoto = gli ultimi appunti. Ritorna data, commessa, titolo e testo.',
    input_schema: obj({ testo: s('Parole da cercare, anche vuoto') }) },
  { name: 'proponi_email', description: "Prepara un'email di aggiornamento. Non la invia: l'utente la vede, la può correggere e la apre già compilata nel suo Gmail.",
    input_schema: obj({ a: ns('Indirizzi email dei destinatari separati da virgola, solo se l\'utente li ha detti; altrimenti null'),
      oggetto: s('Oggetto breve, con il riferimento della commessa se c\'è'), testo: s('Corpo in testo semplice, con saluto iniziale e chiusura "Cordiali saluti,"') }) },
  { name: 'proponi_varianti', description: "Prepara altri preventivi uguali a uno dell'archivio che cambiano solo il materiale su tutte le righe (profilo dei pilastri, spessore dell'asse, spessore dell'omega): uno per ogni combinazione detta dall'utente. Non crea niente: l'utente vede il confronto dei prezzi e conferma; ognuno diventa un preventivo con il numero successivo.",
    input_schema: obj({ preventivo: ns('Numero (es. 2026/014) o nome del preventivo base; null = quello aperto'),
      varianti: { type: 'array', items: obj({ prof: ns('Profilo: famiglia (IPE, IPEA) o codice (IPE 140); null = come il base'),
        asse: nn('Spessore asse in mm: 2.5 o 3; null = come il base'), omega: nn('Spessore omega in mm: 2 o 1.8; null = come il base') }), description: "Le combinazioni dette dall'utente, una per preventivo" } }) },
].map(t => ({ ...t, strict: true }));

const norm = (x: string) => x.toUpperCase().replace(/\s+/g, ' ').trim();
const compatto = (x: string) => x.toUpperCase().replace(/[\s.]/g, '');

/** Esegue uno strumento. Ritorna il testo per Claude e, per gli strumenti proponi_*, la proposta da mostrare. */
export function esegui(nome: string, input: any, D: DatiAssistente, id: string): { testo: string; errore?: boolean; proposta?: Proposta } {
  const L = new Map(D.listino.map(x => [x.c, x]));
  if (nome === 'cerca_articoli') {
    const parole = norm(String(input.testo || '')).split(' ').filter(Boolean);
    const trovati = D.listino.filter(x => { const t = compatto(x.c + ' ' + x.d); return parole.every(p => t.includes(compatto(p))); }).slice(0, 40);
    return { testo: trovati.length ? trovati.map(x => `${x.c} — ${x.d} (${x.cat}, ${x.t === 'comm' ? 'a pezzo' : x.t === 'barra' ? 'profilo al metro' : 'carpenteria'})`).join('\n') : 'Nessun articolo trovato.' };
  }
  if (nome === 'righe_distinta') {
    const g = String(input.gruppo), desc = (c: string, d?: string) => d || L.get(c)?.d || (c.startsWith('$') ? 'segnaposto scelto in Configura' : 'NON NEL LISTINO');
    if (g === 'ASSI DI ROTAZIONE') return { testo: Object.entries(D.sizes).map(([k, sz]) => `Taglia ${k}: ` + sz.assi.map(a => `${a.c} (${desc(a.c, a.d)}) ×${a.q}`).join('; ')).join('\n') };
    const rr = D.template.filter(r => r.g === g);
    return { testo: rr.length ? rr.map(r => `${r.c} — ${desc(r.c, r.d)} · Agrivoltaico ${r.qa}${r.qb ? ` · Basso ${r.qb}` : ''}`).join('\n') : 'Gruppo vuoto.' };
  }
  if (nome === 'proponi_sostituzione') {
    const coppie: Coppia[] = (input.coppie || []).map((c: any) => ({ ...c, da: String(c.da).trim(), a: String(c.a).trim() }));
    const gruppi: string[] = (input.gruppi || []).filter((g: string) => GRUPPI.includes(g));
    const ignoti = coppie.filter(c => !L.has(c.da)).map(c => c.da);
    if (ignoti.length) return { testo: `Codici da sostituire non nel listino: ${ignoti.join(', ')}. Cercali con cerca_articoli.`, errore: true };
    if (!gruppi.length) return { testo: 'Indica almeno un gruppo.', errore: true };
    const righe = sostituisci(JSON.parse(JSON.stringify(D)), coppie.map(c => [c.da, c.a] as [string, string]), new Set(gruppi), true);
    if (!righe.length) return { testo: 'Nessuna riga dei gruppi scelti usa questi codici: controlla con righe_distinta.', errore: true };
    const nuovi = [...new Set(coppie.filter(c => !L.has(c.a)).map(c => c.a))];
    const n = righe.reduce((t, r) => t + r.n, 0);
    return { testo: `Proposta pronta: ${n} righe (${righe.map(r => `${r.g} ${r.da}→${r.a} ×${r.n}`).join('; ')}).` + (nuovi.length ? ` Codici nuovi da creare: ${nuovi.join(', ')}.` : '')
      + " L'utente la vede con i pulsanti Conferma e Annulla: non dire che è già fatta.", proposta: { id, tipo: 'sostituzione', coppie, gruppi, righe, nuovi } };
  }
  if (nome === 'proponi_evento') {
    const giorno = String(input.giorno || ''), ora = input.ora ? String(input.ora) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || isNaN(Date.parse(giorno))) return { testo: 'Data non valida: usa AAAA-MM-GG.', errore: true };
    if (ora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) return { testo: 'Ora non valida: usa HH:MM.', errore: true };
    const titolo = String(input.titolo || '').trim().slice(0, 120);
    if (!titolo) return { testo: 'Manca il titolo: chiedilo.', errore: true };
    const genere = GENERI_EVENTO.includes(input.genere) ? input.genere : 'attivita';
    return { testo: "Proposta pronta: l'utente la vede con i pulsanti Conferma e Annulla. Non dire che è già creata.",
      proposta: { id, tipo: 'evento', titolo, giorno, ora, genere, nota: input.nota ? String(input.nota).slice(0, 500) : null } };
  }
  if (nome === 'cerca_appunti') {
    const parole = norm(String(input.testo || '')).split(' ').filter(Boolean), tutti = D.appunti || [];
    const trovati = tutti.filter(x => { const t = norm(`${x.commessa} ${x.titolo} ${x.testo}`); return parole.every(p => t.includes(p)); }).slice(0, 15);
    return { testo: trovati.length ? trovati.map(x => `[${x.quando}${x.commessa ? ' · ' + x.commessa : ''}] ${x.titolo}${x.testo ? '\n' + x.testo : ''}`).join('\n\n')
      : tutti.length ? 'Nessun appunto trovato: prova con altre parole.' : 'Non ci sono appunti.' };
  }
  if (nome === 'proponi_email') {
    const oggetto = String(input.oggetto || '').trim().slice(0, 300), testo = String(input.testo || '').trim().slice(0, 20_000);
    if (!testo) return { testo: "Manca il testo dell'email.", errore: true };
    return { testo: "Bozza pronta: l'utente la vede, può correggerla e aprirla in Gmail per inviarla. Non dire che è già inviata.",
      proposta: { id, tipo: 'email', a: input.a ? String(input.a).trim().slice(0, 1000) : '', oggetto, testo } };
  }
  if (nome === 'proponi_varianti') {
    const pp = D.preventivi || [], q = norm(String(input.preventivo || ''));
    const e = !q ? pp.find(x => x.id === D.aperto) : pp.find(x => norm(x.num) === q) || pp.find(x => norm(x.nome) === q) || pp.find(x => norm(`${x.nome} ${x.cliente}`).includes(q));
    if (!e) return { testo: q ? `Preventivo "${input.preventivo}" non trovato in archivio: chiedi il numero.` : 'Nessun preventivo salvato aperto: chiedi il numero del preventivo base (o di salvare quello aperto).', errore: true };
    const varianti = (input.varianti || []).map((v: any) => ({ prof: v.prof || null, asse: v.asse ?? null, omega: v.omega ?? null }));
    if (!varianti.length || varianti.length > 8) return { testo: 'Servono da 1 a 8 combinazioni.', errore: true };
    return { testo: `Proposta pronta per N° ${e.num} (${e.nome}): l'utente vede il confronto dei prezzi con Conferma e Annulla. Non dire che sono già creati.`,
      proposta: { id, tipo: 'varianti', base: e.id, nome: `N° ${e.num} · ${e.nome}`, varianti } };
  }
  return { testo: `Strumento sconosciuto: ${nome}`, errore: true };
}

export function sistema(oggi: Date): string {
  const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(oggi);
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(oggi);
  return `Sei l'assistente dell'app di preventivi dei tracker solari di Terranova. Rispondi in italiano, in modo breve e concreto.
Oggi è ${f} (${iso}), ora italiana.

Puoi aiutare a:
- cambiare articoli nelle distinte base (es. sostituire bullone, dado e rondella M16 con M20 nel pilastro motore);
- aggiungere eventi al calendario della Home;
- scrivere email di aggiornamento a partire dagli appunti (note dei documenti e degli eventi);
- preparare più preventivi uguali per lo stesso cliente che cambiano solo il materiale (es. IPEA con asse 2,5, IPE con asse 3).

Come lavori:
- Prima di proporre una sostituzione guarda le righe del gruppo con righe_distinta e cerca i codici con cerca_articoli: usa solo codici che esistono davvero. Per "bullone, dado e rondella" trova tutti e tre i codici usati nel gruppo.
- Se il codice nuovo non esiste nel listino, proponi un nome sullo stile dei codici esistenti (es. 10BZM16X60 → 10BZM20X60) e dillo chiaramente: verrà creato copiando la voce vecchia, con peso e prezzo da completare se non li conosci.
- Se nel gruppo c'è un codice simile ma diverso da quello detto (es. l'utente dice M16x25 ma il gruppo usa M16x60), fallo notare e chiedi, invece di indovinare.
- Varianti di materiale: le combinazioni le dice l'utente, una per preventivo; non aggiungerne e non indovinarne. Il base è il preventivo aperto, se non ne indica un altro (numero o nome). Profilo, asse e omega non detti restano quelli del base.
- Le modifiche le fai solo con proponi_sostituzione, proponi_evento, proponi_email e proponi_varianti: preparano una proposta che l'utente conferma con un pulsante. Non dire mai che una modifica è fatta finché l'app non lo conferma.
- Per un evento servono titolo, data e, se detta, l'ora. Se manca il titolo chiedilo. Un'ora da 1 a 7 senza "di mattina" intendila del pomeriggio (es. "alle 5" = 17:00) e dillo.
- Per un'email trova prima gli appunti giusti con cerca_appunti, poi proponila con proponi_email. Usa solo quello che c'è negli appunti: non inventare date, quantità, prezzi o impegni. Tono cordiale e professionale, testo semplice senza markdown. L'email parte dal Gmail dell'utente, che preme Invia.
- Se una richiesta non riguarda queste cose, dillo in una frase.`;
}
