/// <reference types="node" />
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { leggiDxf, tagliaDa } from './dxf';
import { fN } from './format';
import { defaultData, newPrev } from './model';
import { compilaPptx, datiOfferta } from './offerta';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));

function prev() {
  const p: any = newPrev(); p.cliente = 'Azienda Agricola Prova'; p.modulo.wp = 770; p.num = '2026/007';
  p.righe = [{ ...p.righe[0], taglia: '40', n: 32 }, { ...p.righe[0], taglia: '20', n: 4, tipo: 'Basso', prof: 'IPEA 140' }];
  p.extra = [{ desc: 'Trasporto', modo: 'corpo', val: 3500, voce: 'altro' }];
  p.marg.gen = 20; p.offerta.posaNota = '(esclusa trivellazione)'; p.offerta.rev = '1'; p.imp.quadA = 3;
  return p;
}
async function compila(P: any, montTot = 0, layout = true) {
  const D0 = defaultData(), D = datiOfferta(P, compute(D0, P), D0, montTot);
  const buf = readFileSync('public/offerta/modello-offerta.pptx');
  const blob = await compilaPptx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, D, layout ? { png: PNG, w: 4, h: 3 } : undefined);
  const out = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = (await Promise.all(Object.keys(out.files).filter(n => /slides\/slide\d+\.xml$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
  return { D, xml, out, testo: xml.replace(/<[^>]+>/g, '') };
}

describe('offerta', () => {
  it('dati: trasporto a parte, posa in opera fuori dal totale, numero e revisione', () => {
    const P = prev(), D0 = defaultData(), R = compute(D0, P);
    const D = datiOfferta(P, R, D0, 140000);
    expect(D.righe).toEqual([{ n: 32, taglia: '40' }, { n: 4, taglia: '20' }]);
    expect(D.liste.tracker).toEqual([{ quantita: '32', moduli: '40' }, { quantita: '4', moduli: '20' }]);
    expect(D.prezzi.map(c => c.label)).toEqual(['Struttura e componenti', 'Trasporto', 'Posa in opera', 'Prezzo per kWp']);
    const trasp = R.lines.find((l: any) => l.riga === 'extra').prezzo;
    expect(D.campi.costo_trasporto).toBe(fN(trasp, 2));
    expect(D.campi.prezzo_offerta).toBe(fN(R.prezzo - trasp, 2));
    expect(D.campi.costo_posa).toBe(fN(140000, 2));
    expect([D.campi.numero_offerta, D.campi.revisione]).toEqual(['2026/007', '1']);
    expect(D.paragrafi).toMatchObject({ prezzo_listino: null, modalita_posa: null, n_quadri_generali: null });
  });

  it('compila il modello senza lasciare segnaposto', async () => {
    const { xml, testo, out } = await compila(prev(), 140000);
    expect(xml).not.toMatch(/\{\{[#/]?[a-z_0-9]+\}\}/);
    expect(testo).toContain('OFFERTA TECNICO ECONOMICA');
    expect(testo).toContain('Azienda Agricola Prova');
    expect(testo).toContain('2026/007 rev. 1');
    expect(testo).toContain('N.32 TRACKER TTS.40 MODULI');
    expect(testo).toContain('N.4 TRACKER TTS.20 MODULI');
    expect(testo).toContain('N.3 QUADRI DI CAMPO');
    expect(testo).not.toContain('QUADRO GENERALE');
    expect(testo).toContain('IPE 140 / IPEA 140 S355');
    expect(testo).toContain('Calcolo strutturale depositato al Genio Civile');
    expect(testo).toContain('20 anni di garanzia');
    expect(testo).toContain('(esclusa trivellazione)');
    // Il layout va in un'immagine nuova collegata alla slide del layout.
    expect(Object.keys(out.files).some(n => /ppt\/media\/layout_\d+\.png$/.test(n))).toBe(true);
    const rels = (await Promise.all(Object.keys(out.files).filter(n => /slides\/_rels\/.+\.rels$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
    expect(rels).toMatch(/media\/layout_\d+\.png/);
  });

  it('senza trasporto, posa e numero: diciture al posto dei prezzi', async () => {
    const P = prev(); P.extra = []; P.num = '';
    const { testo } = await compila(P, 0, false);
    expect(testo).toContain('Escluso');
    expect(testo).toContain('Non inclusa');
    expect(testo).toContain('Offerta n. – rev. 1');
  });
});

// DXF minimo: un blocco "Struttura 40 moduli" inserito 2 volte sul layer "Inseguitore 40" e 1 volta su "Inseguitore 20".
const g = (...p: (string | number)[]) => p.join('\n');
const ins = (layer: string, x: number) => g(0, 'INSERT', 8, layer, 2, 'Struttura 40 moduli', 10, x, 20, 0, 30, 0);
const DXF = g(0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 8, 0, 2, 'Struttura 40 moduli', 70, 0, 10, 0, 20, 0, 30, 0, 3, 'Struttura 40 moduli',
  0, 'LINE', 8, 0, 10, 0, 20, 0, 30, 0, 11, 1, 21, 10, 31, 0, 0, 'ENDBLK', 0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES', ins('Inseguitore 40', 0), ins('Inseguitore 40', 5), ins('Inseguitore 20', 10),
  0, 'LINE', 8, 'RECINZIONE', 10, -2, 20, -2, 30, 0, 11, 14, 21, -2, 31, 0, 0, 'ENDSEC', 0, 'EOF');

describe('layout DXF', () => {
  it('conta i tracker dai layer e calcola gli ingombri', () => {
    const L = leggiDxf(DXF);
    expect(L.tracker).toEqual({ '40': 2, '20': 1 });
    expect(L.bbox).toEqual({ x0: -2, y0: -2, x1: 14, y1: 10 });
  });
  it('taglia da layer o nome del blocco', () => {
    expect(tagliaDa('Inseguitore 36', '')).toBe('36');
    expect(tagliaDa('TRACKER', 'Struttura 22 moduli')).toBe('22');
    expect(tagliaDa('RECINZIONE', 'Cabina')).toBe('');
  });
});
