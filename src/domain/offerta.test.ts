/// <reference types="node" />
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { leggiDxf, tagliaDa } from './dxf';
import { fN } from './format';
import { defaultData, newPrev } from './model';
import { DOVE, OBBLIGATORI, bloccoOfferta, compilaPptx, datiOfferta, offCfg } from './offerta';

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
  const blob = await compilaPptx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, D, layout ? { img: PNG, w: 4, h: 3 } : undefined);
  const out = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = (await Promise.all(Object.keys(out.files).filter(n => /slides\/slide\d+\.xml$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
  return { D, xml, out, testo: xml.replace(/<[^>]+>/g, '') };
}

describe('offerta', () => {
  it('dati: trasporto a parte, posa in opera fuori dal totale, numero e revisione', () => {
    const P = prev(), D0 = defaultData(), R = compute(D0, P);
    const D = datiOfferta(P, R, D0, 140000);
    expect(D.righe).toEqual([{ n: 32, taglia: '40' }, { n: 4, taglia: '20' }]);
    expect(D.liste.tracker).toEqual([{ quantita: '32', moduli: '40', potenza_tracker: '30.800', potenza_riga: '985,60' },
      { quantita: '4', moduli: '20', potenza_tracker: '15.400', potenza_riga: '61,60' }]);
    expect([D.campi.n_tracker, D.campi.tipo_progetto, D.campi.profilo_pilastri, D.campi.spessore_asse]).toEqual(['36', 'Impianto agrivoltaico e a terra', 'IPE 140 / IPEA 140', '2,5']);
    expect([D.campi.trasporto_opzionale, D.campi.pagamento, D.campi.resa]).toEqual([`€ ${fN(R.lines.find((l: any) => l.riga === 'extra').prezzo, 2)} + IVA`, 'Da concordare', '–']);
    expect(D.prezzi.map(c => c.label)).toEqual(['Struttura e componenti', 'Trasporto', 'Posa in opera', 'Prezzo per kWp']);
    const trasp = R.lines.find((l: any) => l.riga === 'extra').prezzo;
    expect(D.campi.costo_trasporto).toBe(fN(trasp, 2));
    expect(D.campi.prezzo_offerta).toBe(fN(R.prezzo - trasp, 2));
    expect(D.campi.costo_posa).toBe(fN(140000, 2));
    expect([D.campi.numero_offerta, D.campi.revisione]).toEqual(['2026/007', '1']);
    expect(D.paragrafi).toMatchObject({ prezzo_listino: null, modalita_posa: null, n_quadri_generali: null });
    // Pesi per categoria: la somma per riga coincide con il totale, e lo struttura e' l'acciaio di sempre.
    expect(R.pesi.STRUTTURA).toBeCloseTo(R.steel, 6);
    const perRiga = R.righe.reduce((s: number, r: any) => s + Object.values(r.pesi as Record<string, number>).reduce((a, b) => a + b, 0), 0);
    const imp = R.lines.filter((l: any) => l.riga === 'imp').reduce((s: number, l: any) => s + l.peso, 0);
    expect(perRiga + imp).toBeCloseTo(Object.values(R.pesi as Record<string, number>).reduce((a, b) => a + b, 0), 6);
    expect(D.campi.peso_bulloneria).toMatch(/ (kg|t)$/);
  });

  it('compila il modello senza lasciare segnaposto', async () => {
    const { xml, testo, out } = await compila(prev(), 140000);
    expect(xml).not.toMatch(/\{\{[#/]?[a-z_0-9]+\}\}/);
    expect(testo).toContain('OFFERTA TECNICO ECONOMICA');
    expect(testo).toContain('Azienda Agricola Prova');
    expect(testo).toContain('2026/007 rev. 1');
    expect(testo).toContain('N.32 TRACKER TTS.40 MODULI');
    expect(testo).toContain('N.4 TRACKER TTS.20 MODULI');
    expect(testo).toContain('IPE 140 / IPEA 140 S355');
    // Tabella della soluzione: una riga di forme per taglia, con la potenza per tracker e per riga.
    expect(testo).toContain('Tracker TTS.40');
    expect(testo).toContain('Tracker TTS.20');
    expect(testo).toContain('30.800 W');
    expect(testo).toContain('61,60 kWp');
    expect(xml).not.toMatch(/descr="\{\{/);
    // Incluso nel prezzo con il materiale del preventivo; condizioni commerciali e servizi opzionali.
    expect(testo).toContain('Struttura portante in IPE 140 / IPEA 140 in acciaio S355');
    expect(testo).toContain('Magnelis S320 ZM 310 2,5 mm');
    expect(testo).toContain('Da concordare');
    expect(testo).toContain('Impianto agrivoltaico e a terra');
    expect(testo).toContain('Calcolo strutturale depositato al Genio Civile');
    expect(testo).toContain('20 anni di garanzia');
    expect(testo).toContain('(esclusa trivellazione)');
    expect(testo).toContain('PESI DELLAFORNITURA');
    expect(testo).toMatch(/Struttura[\d.,]+ t/);
    expect(testo).toMatch(/Totale[\d.,]+ t/);
    // Il layout va in un'immagine nuova collegata alla slide del layout.
    expect(Object.keys(out.files).some(n => /ppt\/media\/layout_\d+\.png$/.test(n))).toBe(true);
    const rels = (await Promise.all(Object.keys(out.files).filter(n => /slides\/_rels\/.+\.rels$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
    expect(rels).toMatch(/media\/layout_\d+\.png/);
  });

  it("righe della tabella: una sotto l'altra, e il totale scende solo fino a 2 righe", async () => {
    const P = prev(), tre = { ...P.righe[0], taglia: '24', n: 2 };
    const y = (xml: string, t: string) => { const i = xml.indexOf(t); return +/<a:off x="\d+" y="(\d+)"/.exec(xml.slice(xml.lastIndexOf('<p:sp>', i)))![1]; };
    const due = (await compila(P)).xml; P.righe.push(tre); const tr = (await compila(P)).xml;
    expect(y(due, 'Tracker TTS.20') - y(due, 'Tracker TTS.40')).toBe(680000);
    expect(y(due, 'Totale impianto') - y(due, 'Tracker TTS.40')).toBe(2 * 680000);
    // Con 3 taglie le righe si stringono nello spazio di 2: il totale resta dov'era, sopra il logo.
    expect(y(tr, 'Tracker TTS.20') - y(tr, 'Tracker TTS.24')).toBe(453333);
    expect(y(tr, 'Totale impianto')).toBe(y(due, 'Totale impianto'));
  });

  it('senza trasporto, posa e numero: diciture al posto dei prezzi', async () => {
    const P = prev(); P.extra = []; P.num = '';
    const { testo, xml } = await compila(P, 0, false);
    // Senza layout la slide resta vuota: niente immagine di esempio.
    expect(xml).not.toMatch(/name="IMG_LAYOUT"|descr="\{\{LAYOUT\}\}"/);
    expect(testo).toContain('Escluso');
    expect(testo).toContain('Non inclusa');
    expect(testo).toContain('Offerta n. – rev. 1');
    expect(testo).toContain('Su richiesta');
  });

  it('servizi opzionali: elenco standard, oppure scelto e prezzato nel preventivo', async () => {
    const std = await compila(prev());
    expect(std.D.liste.servizi.map(x => x.voce)).toHaveLength(8);
    expect(std.testo).toContain('Pull-out test'); expect(std.testo).toContain('Prolunga pali (+10 cm)');
    const P = prev();
    P.offerta.servizi = [{ k: 'trasporto', voce: 'Trasporto in cantiere', prezzo: '', on: true }, { voce: 'Pull-out test', prezzo: '1.500', on: true },
      { voce: 'Supervisione al montaggio', prezzo: 'Incluso nel prezzo', on: true }, { voce: 'Prolunga pali (+10 cm)', prezzo: '', on: false }, { voce: 'Collaudo', prezzo: '0', on: true }];
    const { D, testo } = await compila(P);
    expect(D.liste.servizi).toEqual([{ voce: 'Trasporto in cantiere', prezzo: D.campi.trasporto_opzionale }, { voce: 'Pull-out test', prezzo: '€ 1.500,00 + IVA' },
      { voce: 'Supervisione al montaggio', prezzo: 'Incluso nel prezzo' }, { voce: 'Collaudo', prezzo: 'Incluso' }]);
    expect(testo).toContain('€ 1.500,00 + IVA'); expect(testo).not.toContain('Prolunga pali'); expect(testo).not.toContain('{{voce}}');
  });

  it('campi obbligatori: mancanti bloccano, «non disponibile» compare senza unità', async () => {
    const P = prev();
    let D = datiOfferta(P, compute(defaultData(), P), defaultData(), 0);
    expect(D.mancanti).toContain('Peso modulo (kg)');
    expect(bloccoOfferta(D)).toMatch(/non disponibile.*Referente del cliente/);
    for (const [k] of OBBLIGATORI) P.offerta.nd[k] = true;
    P.offerta.prog.vento_ms = '27';
    D = datiOfferta(P, compute(defaultData(), P), defaultData(), 0);
    expect([D.mancanti, bloccoOfferta(D)]).toEqual([[], '']);
    const { testo } = await compila(P);
    expect(testo).toContain('Peso: Non disponibile');
    expect(testo).toContain('Terreno (Eurocodice): Non disponibile');
    expect(testo).toContain('27 m/s');
    expect(testo).not.toMatch(/Non disponibile ?(kg|mm|m\b|°)/);
  });

  it('segnaposto spezzati dal PowerPoint o sconosciuti non arrivano nel PDF', async () => {
    const P = prev(); P.offerta.prog.modulo_tipo = 'bifacciale';
    const D0 = defaultData(); offCfg(D0).inclusi = ['Voce con {{campo_inventato}}'];
    const D = datiOfferta(P, compute(D0, P), D0, 0);
    expect(D.avvisi.join(' ')).toContain('{{campo_inventato}}');
    // Ogni avviso sa dove si corregge, e ogni campo obbligatorio ha la sua destinazione.
    expect(D.avvisiDove).toHaveLength(D.avvisi.length);
    expect(D.avvisiDove[D.avvisi.findIndex(t => t.includes('{{campo_inventato}}'))]).toBe('ignoti');
    expect(D.avvisiDove.filter(Boolean).every(k => DOVE[k])).toBe(true);
    expect(OBBLIGATORI.filter(([k]) => !DOVE[k])).toEqual([]);
    const zip = await JSZip.loadAsync(readFileSync('public/offerta/modello-offerta.pptx'));
    const s5 = await zip.file('ppt/slides/slide5.xml')!.async('string');
    expect(s5).toContain('<a:t>{{modulo_tipo}}</a:t>');
    zip.file('ppt/slides/slide5.xml', s5.replace('<a:t>{{modulo_tipo}}</a:t>', '<a:t>{{modulo_</a:t></a:r><a:r><a:rPr lang="it-IT"/><a:t>tipo}}</a:t>'));
    const out = await JSZip.loadAsync(await (await compilaPptx(await zip.generateAsync({ type: 'arraybuffer' }), D)).arrayBuffer());
    const xml = (await Promise.all(Object.keys(out.files).filter(n => /slides\/slide\d+\.xml$/.test(n)).map(n => out.file(n)!.async('string')))).join('');
    expect(xml.replace(/<[^>]+>/g, '')).toContain('bifacciale');
    expect(xml.replace(/descr="[^"]*"/g, '')).not.toMatch(/\{\{|\}\}/);
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

  it('slide Layout: il nome dell\'impianto non scende sopra l\'elenco dei tracker', async () => {
    const titolo = async (nome: string) => {
      const P = prev(); P.offerta.nome = nome;
      const { out } = await compila(P);
      const x = await out.file('ppt/slides/slide6.xml')!.async('string');
      const sp = [...x.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(m => m[0]);
      const pos = (s: string) => /<a:off x="\d+" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(s)!.slice(1).map(Number);
      const [y, w, h] = pos(sp.find(s => s.includes(nome))!), [yt] = pos(sp.find(s => s.includes('TRACKER TTS'))!);
      return { sz: +/sz="(\d+)"/.exec(sp.find(s => s.includes(nome))!)![1], w, fondo: y + h, yt };
    };
    const corto = await titolo('Masseria Prova');
    expect(corto.sz).toBe(6000);
    expect(corto.fondo).toBeLessThanOrEqual(corto.yt);
    const lungo = await titolo('Impianto Agrivoltaico Masseria San Pietro in Lama - Lotto 2');
    expect(lungo.sz).toBeLessThan(6000);
    expect(lungo.w).toBeLessThan(15765540);   // non arriva al logo
    expect(lungo.fondo).toBeLessThanOrEqual(lungo.yt);
  });
});
