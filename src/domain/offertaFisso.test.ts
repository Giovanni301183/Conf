/// <reference types="node" />
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { fN } from './format';
import { clone, defaultData, newPrev } from './model';
import { bloccoOfferta, compilaPptx } from './offerta';
import { OBBLIGATORI_FISSO, datiOffertaDi, datiOffertaFisso, modelloOfferta } from './offertaFisso';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));

// Impianto DE VITA: 19 strutture da 36 a Cerignola, con trasporto e gru a parte e un imballo dentro le strutture.
function prev() {
  const P: any = newPrev('fisso');
  Object.assign(P, { cliente: 'DE VITA', num: '2026/045' });
  P.fisso.taglie = [{ moduli: 36, n_strutture: 19, controventi: '', lunghezza_arc_unico: '' }, { moduli: 20, n_strutture: 1, controventi: '', lunghezza_arc_unico: '' }];
  P.fisso.comuni.peso_modulo = 38.5;
  P.luogo = { nome: 'Cerignola (FG)', lat: 41.2648, lng: 15.8997 };
  Object.assign(P.fisso.sito, { zona_vento: 3, altitudine: 120, categoria: 'II', cp_giu: 0.8, cp_su: 1.2 });
  P.modulo.marca = 'Marca XYZ 735';
  P.extra = [{ desc: 'Trasporto', voce: 'altro', modo: 'corpo', val: 2000 }, { desc: 'Servizio gru', voce: 'altro', modo: 'corpo', val: 500 },
    { desc: 'Imballo', voce: 'altro', modo: 'corpo', val: 300 }];
  return P;
}
const pz = (R: any, d: string) => R.lines.find((l: any) => l.desc === d).prezzo;
async function compila(P: any) {
  const d = defaultData(), D = datiOffertaDi(P, compute(d, P), d, 0);
  const buf = readFileSync('public/offerta/' + modelloOfferta(P));
  const blob = await compilaPptx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, D, { img: PNG, w: 4, h: 3 });
  const out = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = (await Promise.all(Object.keys(out.files).filter(n => /slides\/slide\d+\.xml$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
  return { D, xml, testo: xml.replace(/<[^>]+>/g, '') };
}

describe('offerta degli impianti fissi', () => {
  it('ogni voce extra a parte nella sua riga: il prezzo delle strutture è solo la fornitura', () => {
    const P = prev(), d = defaultData(), R = compute(d, P), D = datiOffertaFisso(P, R, d);
    const strutture = R.prezzo - pz(R, 'Trasporto') - pz(R, 'Servizio gru') - pz(R, 'Imballo');
    expect(D.liste.voci).toEqual([
      { voce: 'n. 20 STRUTTURE (19 DA 36, 1 DA 20 MODULI)', prezzo: `€ ${fN(strutture, 2)} + IVA` },
      { voce: 'TRASPORTO', prezzo: `€ ${fN(pz(R, 'Trasporto'), 2)} + IVA` },
      { voce: 'SERVIZIO GRU', prezzo: `€ ${fN(pz(R, 'Servizio gru'), 2)} + IVA` },
      { voce: 'IMBALLO', prezzo: `€ ${fN(pz(R, 'Imballo'), 2)} + IVA` },
      { voce: 'POSA IN OPERA', prezzo: 'Non inclusa' },
    ]);
    expect(D.campi.prezzo_kwp).toBe(fN(strutture / R.kwp, 0));
    expect(D.campi.prezzo_offerta).toBe(fN(strutture, 2));
    expect(D.campi.gru_opzionale).toBe(`€ ${fN(pz(R, 'Servizio gru'), 2)} + IVA`);
    expect(D.liste.strutture).toEqual([{ quantita: '19', moduli: '36' }, { quantita: '1', moduli: '20' }]);
  });
  it('trasporto «Incluso»: la voce di trasporto entra nelle strutture; posa scritta a mano', () => {
    const P = prev(); P.offerta.trasporto = 'Incluso'; P.offerta.posa = 12000;
    const d = defaultData(), R = compute(d, P), D = datiOffertaFisso(P, R, d);
    expect(D.liste.voci[1]).toEqual({ voce: 'TRASPORTO', prezzo: 'Incluso' });
    expect(D.liste.voci.at(-1)).toEqual({ voce: 'POSA IN OPERA', prezzo: '€ 12.000,00 + IVA' });
    expect(D.campi.prezzo_offerta).toBe(fN(R.prezzo - pz(R, 'Servizio gru') - pz(R, 'Imballo'), 2));
  });
  it('calcolo strutturale: vento NTC, azioni sui moduli e geometria per taglia', () => {
    const P = prev(), d = defaultData(), D = datiOffertaFisso(P, compute(d, P), d), c = D.campi;
    expect([c.vb0, c.a0, c.ks, c.ca, c.vb, c.tr, c.cd]).toEqual(['27', '500', '0,37', '1,000', '27,00', '50', '1,00']);
    expect(+c.pressione_picco.replace(',', '.')).toBeGreaterThan(0);
    const n = (t: string) => +t.replace(',', '.');
    expect(n(c.p_giu_modulo)).toBeCloseTo(n(c.p_giu) * 2.384 * 1.303, 1);   // per modulo = pressione × superficie
    expect(D.liste.geometria[0]).toMatchObject({ moduli: '36', quantita: '19', campate: '9', telai: '10', controventi: '6' });
    expect(D.liste.configurazione.map(x => x.moduli)).toEqual(['36', '20']);
    expect(D.liste.taglie[1]).toMatchObject({ quantita: '1', finale: 'A', moduli: '20' });
  });
  it('sito, vento e modulo da Configura; campi obbligatori', () => {
    const P = prev(), d = defaultData(), D = datiOffertaFisso(P, compute(d, P), d);
    expect([D.campi.localita, D.campi.zona_vento, D.campi.categoria_terreno, D.campi.modulo_peso_kg, D.campi.modulo_dimensioni]).toEqual(['Cerignola (FG)', '3', 'II', '38,5', '2.384 × 1.303']);
    expect(D.campi.verifica_carichi).toMatch(/^A 140 KG \/ M2 E AL VENTO NTC 2018: \d+,\d M\/S$/);
    expect(D.mancanti).toEqual(['Referente del cliente', 'E-mail del referente', 'Zona', 'Tipo di modulo', 'Classe di corrosività', 'Pendenza N-S', 'Resa', 'Tempi di consegna', "Validità dell'offerta"]);
    expect(bloccoOfferta(D)).toMatch(/Referente/);
    P.offerta.nd = Object.fromEntries(OBBLIGATORI_FISSO.map(([k]) => [k, true]));
    expect(datiOffertaFisso(P, compute(d, P), d).mancanti).toEqual([]);
  });
  it('PowerPoint dei fissi: righe ripetute, prezzo pieno barrato, nessun segnaposto rimasto', async () => {
    const P = prev(); P.offerta.pieno = 99000; P.offerta.referente = 'Mario Rossi';
    const { D, xml, testo } = await compila(P);
    expect(testo).not.toMatch(/\{\{|\}\}/);
    for (const v of D.liste.voci) { expect(testo).toContain(v.voce); expect(testo).toContain(v.prezzo); }
    expect(testo).toContain('€ 99.000,00 + IVA');
    expect(xml).toContain('strike="sngStrike"');
    expect(testo).toContain('Servizio gru per lo scarico');
    expect(testo).toContain('N.19 SOLAR MAX.36 MODULI');
    expect(testo).toContain('Mario Rossi');
    for (const t of ['SOLUZIONE', 'CALCOLO', 'Investimento', 'SOLAR MAX.36', 'Totale impianto', 'N.19 STRUTTURE DA 36 MODULI', 'N.1 STRUTTURA DA 20 MODULI',
      'Pressione di picco qp', '1° – ultimo telaio', 'INCLUSO NEL PREZZO', 'Corrosività']) expect(testo).toContain(t);
  });
  it('i tracker restano sul loro modello', () => {
    expect(modelloOfferta(newPrev())).toBe('modello-offerta.pptx');
    const P = clone(prev()); P.settore = 'tracker';
    expect(modelloOfferta(P)).toBe('modello-offerta.pptx');
  });
});
