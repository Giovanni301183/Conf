// Archivio tecnico lato server, per il consulente dell'assistente (app e Telegram): ricerca, lettura dei file e scheda dell'AI.
// L'archivio sono i Documenti con un'etichetta tecnica (e i file allegati alle note che ne hanno una).
// Con la chiave di servizio le regole del database non valgono: qui si applicano a mano (un documento privato è solo di chi l'ha caricato).
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cercaArchivio, leggibile } from '../src/domain/esperto.js';
import { TECNICHE, nomiEtichette, pulisciEtichette, tecnico, type Documento } from '../src/domain/documenti.js';
import type { DatiAssistente, Proposta } from '../src/domain/assistente.js';

const MODELLO = 'claude-opus-5-5';
const BUCKET = 'documenti';
const MAX_PDF = 25 * 1024 * 1024, MAX_IMG = 5 * 1024 * 1024, MAX_TESTO = 200_000;
type Blocco = Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock;

/** Documenti dell'archivio che l'utente può vedere: i condivisi e i suoi privati. */
export async function archivioDi(admin: SupabaseClient, email: string): Promise<Documento[]> {
  const { data, error } = await admin.from('documenti').select('*').or(`privato.eq.false,creato_da.eq."${email.replace(/"/g, '')}"`).order('creato', { ascending: false });
  if (error) throw new Error(/privato/.test(error.message) ? 'manca la migrazione 20261028020000_archivio_unico.sql' : error.message);
  const tutti = data as Documento[];
  return tutti.filter(d => tecnico(d, tutti));
}

/** Il file come blocco per Claude: PDF (document), immagine o testo. Errore in parole semplici se non si può leggere. */
export async function bloccoFile(admin: SupabaseClient, d: Documento): Promise<Blocco> {
  if (!d.percorso) return { type: 'text', text: d.testo || '' };
  if (!leggibile(d.mime, d.titolo)) throw new Error(`«${d.titolo}» non si può leggere (${d.mime || 'tipo sconosciuto'}): salvalo in PDF e ricaricalo.`);
  const { data, error } = await admin.storage.from(BUCKET).download(d.percorso);
  if (error || !data) throw new Error(`file «${d.titolo}» non trovato nell'archivio`);
  const buf = Buffer.from(await data.arrayBuffer()), mime = d.mime || (/\.pdf$/i.test(d.titolo) ? 'application/pdf' : 'text/plain');
  if (mime === 'application/pdf') {
    if (buf.length > MAX_PDF) throw new Error(`«${d.titolo}» supera 25 MB: dividilo in più PDF.`);
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') }, title: d.titolo };
  }
  if (mime.startsWith('image/')) {
    if (buf.length > MAX_IMG) throw new Error(`l'immagine «${d.titolo}» supera 5 MB: riducila o salvala in PDF.`);
    return { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: buf.toString('base64') } };
  }
  return { type: 'text', text: `Documento «${d.titolo}»:\n${buf.toString('utf8').slice(0, MAX_TESTO)}` };
}

const SCHEDA = `Sei un ingegnere strutturista e un geologo/geotecnico esperto di pali infissi e prove di pull-out. Leggi il documento allegato e scrivi in italiano la sua scheda tecnica per un archivio che un assistente consulterà in seguito.
Struttura (testo semplice, niente markdown pesante, al massimo 600 parole):
Tipo: che documento è, autore/ente, data, sito o commessa, se compaiono.
Contenuto: di cosa tratta in 2-3 frasi.
Dati e valori: tutti i numeri utili con unità e pagina (es. "p. 4: pull-out palo P3 IPE 160 infisso 1,5 m: 18,2 kN a 10 mm di spostamento"; stratigrafia, NSPT, qc, falda, categoria di sottosuolo, carichi, profili, verifiche, coefficienti).
Conclusioni: quelle del documento, con la pagina.
Parole chiave: 5-15 parole per ritrovarlo (luogo, cliente, prova, profilo, norma).
Non aggiungere valori che il documento non contiene; se una parte è illeggibile dillo.`;

/** Scheda dell'AI per un documento dell'archivio: la scrive e la salva sulla riga. */
export async function scriviScheda(admin: SupabaseClient, client: Anthropic, d: Documento): Promise<string> {
  const b = await bloccoFile(admin, d);
  const r = await client.beta.messages.create({
    model: MODELLO, max_tokens: 4000, system: SCHEDA, output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: [b, { type: 'text', text: `Titolo nell'archivio: ${d.titolo}. Etichette: ${nomiEtichette(d.etichette) || 'allegato di una nota tecnica'}. Scrivi la scheda.` }] }],
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
  });
  const scheda = r.content.flatMap(c => (c.type === 'text' ? [c.text] : [])).join('\n').trim();
  if (!scheda) throw new Error('il documento non è stato letto: riprova');
  const { error } = await admin.from('documenti').update({ scheda, letto: new Date().toISOString() }).eq('id', d.id);
  if (error) throw new Error(error.message);
  return scheda;
}

export interface CtxEsperto { admin: SupabaseClient; email: string; D: DatiAssistente; docs?: Documento[] }
const norm = (x: string) => x.toUpperCase().replace(/\s+/g, ' ').trim();
const intesta = (d: Documento, D: DatiAssistente) => {
  const p = d.preventivo_id ? D.preventivi?.find(x => x.id === d.preventivo_id) : null;
  return `[id ${d.id} · ${nomiEtichette(d.etichette) || 'allegato'} · ${String(d.creato).slice(0, 10)}${p ? ` · N° ${p.num} ${p.nome}` : ''}${d.privato ? ' · privato' : ''}${d.percorso ? '' : ' · nota scritta'}${d.nota_id ? ` · allegato alla nota ${d.nota_id}` : ''}] ${d.titolo}`;
};

/** Esegue uno strumento del consulente. Il contenuto può contenere il file (PDF o immagine) da leggere. */
export async function eseguiEsperto(nome: string, input: any, ctx: CtxEsperto, id: string): Promise<{ contenuto: string | Blocco[]; errore?: boolean; proposta?: Proposta } | null> {
  if (!['cerca_archivio', 'leggi_documento', 'proponi_memoria'].includes(nome)) return null;
  try {
    if (nome === 'proponi_memoria') {
      const titolo = String(input.titolo || '').trim().slice(0, 200), testo = String(input.testo || '').trim().slice(0, 30_000);
      if (!titolo || !testo) return { contenuto: 'Servono titolo e testo.', errore: true };
      const pp = ctx.D.preventivi || [], q = norm(String(input.preventivo || ''));
      const e = q ? pp.find(x => norm(x.num) === q) || pp.find(x => norm(x.nome) === q) || pp.find(x => norm(`${x.nome} ${x.cliente}`).includes(q)) : null;
      if (q && !e) return { contenuto: `Preventivo "${input.preventivo}" non trovato: chiedi il numero o salva senza preventivo (null).`, errore: true };
      const etichette = pulisciEtichette(input.etichette).filter(k => TECNICHE.includes(k));
      return { contenuto: "Proposta pronta: l'utente sceglie condiviso o privato e conferma nell'app. Non dire che è già salvata.",
        proposta: { id, tipo: 'memoria', titolo, testo, etichette: etichette.length ? etichette : ['tecnico'], preventivo_id: e?.id || null, commessa: e ? `N° ${e.num} · ${e.nome}` : '' } };
    }
    ctx.docs ??= await archivioDi(ctx.admin, ctx.email);
    if (nome === 'cerca_archivio') {
      const tutti = ctx.docs, trovati = cercaArchivio(tutti, String(input.testo || ''), ctx.D.aperto || null, input.etichetta || null).slice(0, 12);
      if (!trovati.length) return { contenuto: tutti.length ? "Nessun documento trovato: prova con altre parole (o meno parole)." : "L'archivio tecnico è vuoto: è fatto dai documenti e dalle note con un'etichetta tecnica (si caricano anche da Dati comuni → Archivio tecnico)." };
      return { contenuto: trovati.map(d => `${intesta(d, ctx.D)}\n${(d.scheda || d.testo || (d.percorso ? 'Scheda non ancora scritta: apri il file con leggi_documento.' : '')).slice(0, 4000)}`).join('\n\n') };
    }
    const d = ctx.docs.find(x => x.id === String(input.id));
    if (!d) return { contenuto: `Documento ${input.id} non trovato (o privato di un collega): cercalo con cerca_archivio.`, errore: true };
    return { contenuto: [{ type: 'text', text: intesta(d, ctx.D) }, await bloccoFile(ctx.admin, d)] };
  } catch (e) { return { contenuto: 'Archivio non disponibile: ' + (e as Error).message, errore: true }; }
}

/** Nella conversazione che torna al browser i file letti diventano una riga di testo: si rileggono se servono. */
export function senzaFile(messages: Anthropic.Beta.BetaMessageParam[]) {
  return messages.map(m => m.role !== 'user' || typeof m.content === 'string' ? m : {
    ...m, content: m.content.map(c => c.type !== 'tool_result' || typeof c.content === 'string' || !c.content ? c : {
      ...c, content: c.content.map(x => (x.type === 'document' || x.type === 'image' ? { type: 'text' as const, text: '[file letto: per rileggerlo usa di nuovo leggi_documento]' } : x)),
    }),
  });
}
