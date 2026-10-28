import { describe, expect, it } from 'vitest';
import { newPrev } from './model';
import { calcolaFisso, comuniDi, sitoDi } from './fisso';
import { pressioni, vento } from './vento';
import { categoriaPer, cercaArchivio, datiTecnici, leggibile, type DocArchivio } from './esperto';
import { eseguiEsperto, senzaFile } from '../../api/_esperto';

const doc = (o: Partial<DocArchivio>): DocArchivio => ({ id: 'x', preventivo_id: null, categoria: 'altro', privato: false, titolo: '', testo: null, scheda: null, letto: null,
  percorso: 'a/b.pdf', mime: 'application/pdf', dimensione: 1, creato_da: 'a@t.it', creato: '2026-10-01T00:00:00Z', ...o });

describe('archivio tecnico', () => {
  it('categoria proposta dal nome del file', () => {
    expect(categoriaPer('Report prove PULL-OUT Foggia.pdf')).toBe('pullout');
    expect(categoriaPer('Relazione geologica Cerignola.pdf')).toBe('geologia');
    expect(categoriaPer('NTC2018_cap6.pdf')).toBe('normativa');
    expect(categoriaPer('foto cantiere.jpg')).toBe('altro');
  });
  it("l'AI legge PDF, immagini e testo, non Word ed Excel", () => {
    expect(leggibile('application/pdf')).toBe(true);
    expect(leggibile('image/png')).toBe(true);
    expect(leggibile('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBe(false);
    expect(leggibile('', 'prove.pdf')).toBe(true);
  });
  it('cerca tutte le parole (senza accenti) e mette prima i documenti della commessa', () => {
    const dd = [doc({ id: '1', titolo: 'Pull-out Foggia', creato: '2026-10-05T00:00:00Z' }), doc({ id: '2', titolo: 'Prove', scheda: 'pull-out pali IPE a Foggia, qualità argille', preventivo_id: 'P1' }),
      doc({ id: '3', titolo: 'SPT Bari' })];
    expect(cercaArchivio(dd, 'foggia pull', 'P1').map(d => d.id)).toEqual(['2', '1']);
    expect(cercaArchivio(dd, 'qualita', null).map(d => d.id)).toEqual(['2']);
    expect(cercaArchivio(dd, '', null).map(d => d.id)).toEqual(['1', '2', '3']);
  });
});

describe('dati tecnici per il consulente', () => {
  it('impianto fisso: forze medie per palo dal vento NTC e dai pesi', () => {
    const P: any = newPrev('fisso');
    P.fisso.taglie = [{ moduli: 36, n_strutture: 19, controventi: '', lunghezza_arc_unico: '' }];
    P.fisso.comuni.peso_modulo = 38.5;
    P.luogo = { nome: 'Cerignola (FG)', lat: 41.2648, lng: 15.8997 };
    Object.assign(P.fisso.sito, { zona_vento: 3, altitudine: 120, categoria: 'II', cp_giu: 0.8, cp_su: 1.2 });
    const t = datiTecnici(P);
    expect(t).toContain('19 strutture, 684 moduli');
    expect(t).toContain('Infissione: palo anteriore 700 mm, posteriore 1200 mm');
    // Conto a mano: sollevamento = qp · cp_su · cd · area dei moduli / pali; G = (struttura + moduli) · g / pali.
    const r = calcolaFisso(P).r!.taglie[0], c = comuniDi(P), s = sitoDi(P), pali = 2 * r.telai;
    const qk = Math.abs(pressioni(s, vento(s, r.geometria.sezione.altezza_alta / 1000)).su!) * 36 * c.lunghezza_modulo * c.larghezza_modulo / 1e6 / 1000 / pali;
    const G = (r.massa_struttura + 36 * 38.5) * 9.81 / 1000 / pali;
    expect(t).toContain(`${pali} pali`);
    expect(t).toContain(`Qk ≈ ${qk.toFixed(2).replace('.', ',')} kN`);
    expect(t).toContain(`1,0·G ≈ ${(1.5 * qk - G).toFixed(2).replace('.', ',')} kN`);
  });
  it('senza cp di sollevamento lo dice invece di inventare', () => {
    const P: any = newPrev('fisso');
    P.fisso.taglie = [{ moduli: 36, n_strutture: 1, controventi: '', lunghezza_arc_unico: '' }];
    expect(datiTecnici(P)).toContain('Vento NTC non calcolato');
    expect(datiTecnici(P)).toContain('sollevamento non calcolato');
  });
});

describe('strumenti del consulente sul server', () => {
  // Supabase finto: la query dell'archivio ritorna le righe già filtrate per l'utente.
  const righe = [doc({ id: 'd1', titolo: 'Pull-out Foggia', scheda: 'p. 3: 18,2 kN' }), doc({ id: 'd2', titolo: 'Nota', percorso: null, mime: null, testo: 'Infissione minima 1,5 m' })];
  let filtro = '';
  const admin: any = { from: () => ({ select: () => ({ or: (f: string) => { filtro = f; return { order: async () => ({ data: righe, error: null }) }; } }) }) };
  const ctx = () => ({ admin, email: 'mario@t.it', D: { listino: [], template: [], sizes: {}, preventivi: [{ id: 'P1', num: '2026/045', nome: 'DE VITA', cliente: '' }] } as any });

  it('cerca solo tra i condivisi e i privati di chi chiede', async () => {
    const x = await eseguiEsperto('cerca_archivio', { testo: 'foggia', categoria: null }, ctx(), 't1');
    expect(filtro).toBe('privato.eq.false,creato_da.eq."mario@t.it"');
    expect(x!.contenuto).toContain('[id d1');
    expect(x!.contenuto).toContain('18,2 kN');
  });
  it('una nota scritta si legge come testo, un documento sconosciuto è un errore', async () => {
    const x = await eseguiEsperto('leggi_documento', { id: 'd2' }, ctx(), 't2');
    expect(JSON.stringify(x!.contenuto)).toContain('Infissione minima 1,5 m');
    expect((await eseguiEsperto('leggi_documento', { id: 'zz' }, ctx(), 't3'))!.errore).toBe(true);
  });
  it('proponi_memoria prepara la proposta legata al preventivo', async () => {
    const x = await eseguiEsperto('proponi_memoria', { titolo: 'Verifica', testo: 'ok', categoria: 'risposta', preventivo: '2026/045' }, ctx(), 't4');
    expect(x!.proposta).toMatchObject({ tipo: 'memoria', preventivo_id: 'P1', commessa: 'N° 2026/045 · DE VITA' });
    expect(await eseguiEsperto('cerca_articoli', {}, ctx(), 't5')).toBeNull();
  });
  it('i file letti non tornano al browser', () => {
    const m: any = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'text', text: 'x' }, { type: 'document', source: { type: 'base64', data: 'AAAA' } }] }] }];
    expect(JSON.stringify(senzaFile(m))).not.toContain('AAAA');
    expect(JSON.stringify(senzaFile(m))).toContain('leggi_documento');
  });
});
