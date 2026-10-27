"""Crea public/offerta/modello-offerta-fisso.pptx (impianti fissi) dalla presentazione BIPALO di DE VITA.

    python scripts/offerta-fisso/modello_fisso.py

Portato in Conf dal configuratore di Desktop/Impianto Fisso (scripts/modello_fisso.py). Stesse pagine dell'offerta dei tracker
(soluzione proposta, dati di progetto, layout, investimento, servizi, condizioni, garanzie) più il calcolo strutturale (vento NTC 2018,
azioni sui moduli, geometria per taglia) e le slide di presentazione SOLAR MAX. Le righe che si ripetono sono forme con descrizione
{{#nome}} (vedi righeForme in src/domain/offerta.ts): configurazione (soluzione proposta), geometria (calcolo), taglie (struttura),
voci (investimento: strutture, poi trasporto, posa e ogni voce extra, sempre a parte), servizi; le forme {{segue:nome}} scendono
sotto l'ultima riga.

Parte da scripts/modello-offerta-bipalo.pptx (copia di
\\\\192.168.80.253\\tts\\PREVENTIVI\\SVILIPPATI\\DE VITA\\OFFERTA TECNICO ECONOMICA BIPALO.pptx) e:
- mette i segnaposto {{campo}} al posto dei dati di DE VITA nella slide del layout (nome impianto, una riga per taglia,
  potenze; la foto aerea diventa IMG_LAYOUT) e in quella del totale (potenza, verifica dei carichi, materiali, peso);
- nella slide del totale rifà le righe di destra: strutture, trasporti e servizio gru, ognuna col suo prezzo;
- aggiunge, con la stessa grafica (sfondo, loghi, caratteri Open Sauce / Canva Sans), le slide dell'offerta dei tracker
  di Conf adattate agli impianti fissi: copertina, informazioni generali con indice, dati di progetto, forniture e
  servizi opzionali, condizioni commerciali, garanzie e certificazioni.
Le slide di presentazione (Solar Max, vantaggio, custom, benefici) restano come sono. Il file ottenuto si può ritoccare
in PowerPoint mantenendo i segnaposto.
"""

import os
import re
import zipfile
from xml.sax.saxutils import escape

QUI = os.path.dirname(os.path.abspath(__file__))
SORGENTE = os.path.join(QUI, "modello-offerta-bipalo.pptx")
DESTINAZIONE = os.path.join(QUI, "..", "..", "public", "offerta", "modello-offerta-fisso.pptx")

EMU = 914400
VERDE, VERDE_SCURO, BIANCO, NERO, GRIGIO = "79E920", "305810", "FFFFFF", "000000", "B5B5B5"
CARTA, CARTA2, RIGA = "262626", "1C1C1C", "3A3A3A"   # fondi di schede e tabelle sullo sfondo scuro
TITOLI, TESTO, TESTO_B = "Open Sauce Bold", "Canva Sans", "Canva Sans Bold"

# Pezzi di testo (<a:t>) da cambiare, interi, slide per slide, nell'ordine in cui compaiono.
TESTI = {
    4: [
        ("TEKNA", "{{nome_impianto}}"),
        # Una riga per taglia: il paragrafo {{#strutture}}…{{/strutture}} si ripete.
        ("N.", "{{#strutture}}N."),
        ("19", "{{quantita}}"),
        (".36 MODULI", ".{{moduli}} MODULI{{/strutture}}"),
        (" da 7", " da "),
        ("35", "{{potenza_modulo_w}}"),
        ("502", "{{potenza_kwp}}"),
        (",74 ", " "),
        ("kWh.", "kWp."),
    ],
    6: [
        ("A 140 KG / M2", "{{verifica_carichi}}"),
        ("Investimento 502, 74 kW", "Impianto {{potenza_kwp}} kWp"),   # i prezzi stanno nella slide Investimento
        ("TOT PESO 18 TON ", "TOT PESO {{peso_struttura_ton}} TON "),
    ],
}
# Immagine sostituita dal layout dell'impianto (slide 4, foto aerea in alto a destra).
LAYOUT = (4, "Immagine 8")
# Slide del totale BIPALO: righe di destra rifatte da capo (una per taglia, senza prezzi: i prezzi stanno in Investimento), materiali con segnaposto.
TOTALE_VIA = ["Group 3", "Group 6", "Group 9", "Group 12", "TextBox 20", "TextBox 21", "TextBox 22", "TextBox 23"]

# Ordine finale: "N<k>" = slide nuova (NUOVE[k]), numero = slide della presentazione BIPALO.
ORDINE = ["N0", "N1", 1, 2, 3, 5, "N6", "N2", "N7", 4, 6, "N8", "N3", "N4", "N5"]
# Base delle slide nuove: la copertina BIPALO (sfondo, decorazioni, loghi) senza i suoi due testi.
BASE, BASE_VIA = 1, ["TextBox 7", "TextBox 8"]


def e(v: float) -> int:
    return round(v * EMU)


# ---------- forme ----------
def rpr(sz, colore, font=TESTO):
    return (f'<a:rPr lang="it-IT" sz="{sz}" b="{int(font != TESTO)}" dirty="0"><a:solidFill><a:srgbClr val="{colore}"/></a:solidFill>'
            f'<a:latin typeface="{font}"/><a:ea typeface="{font}"/><a:cs typeface="{font}"/><a:sym typeface="{font}"/></a:rPr>')


def par(*pezzi, algn="l", dopo=0, punto=False):
    """Paragrafo da pezzi (testo, dimensione in centesimi di punto, colore, carattere)."""
    ppr = f'<a:pPr algn="{algn}"' + (' marL="342900" indent="-342900">' if punto else ">")
    ppr += f'<a:spcAft><a:spcPts val="{dopo}"/></a:spcAft>'
    if punto:
        ppr += f'<a:buClr><a:srgbClr val="{VERDE}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>'
    ppr += "</a:pPr>"
    corpo = "".join(f"<a:r>{rpr(sz, col, font)}<a:t>{escape(t)}</a:t></a:r>" for t, sz, col, font in pezzi)
    return f"<a:p>{ppr}{corpo}</a:p>"


def voce(*coppie, sz=2200, dopo=900):
    """Riga «Etichetta: valore»: etichette grigie, valori bianchi in grassetto (pezzi separati per i segnaposto)."""
    pezzi = []
    for k in range(0, len(coppie), 2):
        pezzi += [(coppie[k] + " ", sz, GRIGIO, TESTO), (coppie[k + 1], sz, BIANCO, TESTO_B)]
    return par(*pezzi, dopo=dopo)


class Slide:
    def __init__(self, primo_id=100):
        self.id = primo_id
        self.forme = []

    def nid(self):
        self.id += 1
        return self.id

    def testo(self, x, y, w, h, paragrafi, anchor="t", fondo=None, geom="rect", raggio=0, ins=0.0, ins_sx=None, nome="Testo", descr=""):
        geo = (f'<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {raggio}"/></a:avLst></a:prstGeom>'
               if geom == "roundRect" else f'<a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>')
        fill = f'<a:solidFill><a:srgbClr val="{fondo}"/></a:solidFill>' if fondo else "<a:noFill/>"
        i, sx = e(ins), e(ins if ins_sx is None else ins_sx)
        tx = "".join(paragrafi) or '<a:p><a:endParaRPr lang="it-IT"/></a:p>'
        n = self.nid()
        self.forme.append(
            f'<p:sp><p:nvSpPr><p:cNvPr id="{n}" name="{nome} {n}"{f' descr="{descr}"' if descr else ""}/><p:cNvSpPr{"" if fondo else " txBox=" + chr(34) + "1" + chr(34)}/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm>{geo}{fill}<a:ln><a:noFill/></a:ln></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="square" lIns="{sx}" tIns="{i // 2}" rIns="{i}" bIns="{i // 2}" rtlCol="0" anchor="{anchor}"><a:noAutofit/></a:bodyPr>'
            f"<a:lstStyle/>{tx}</p:txBody></p:sp>")

    def scheda(self, x, y, w, h, colore=CARTA, raggio=6000):
        self.testo(x, y, w, h, [], fondo=colore, geom="roundRect", raggio=raggio, nome="Scheda")

    def titolo(self, bianco, verde):
        """Titolo a due righe come «IL NOSTRO / vantaggio»: parola bianca, poi verde più grande e spostata a destra."""
        self.testo(1.6, 0.35, 13.5, 1.1, [par((bianco, 6000, BIANCO, TITOLI))], nome="Titolo")
        self.testo(3.65, 1.0, 13.0, 1.2, [par((verde, 6500, VERDE, TITOLI))], nome="Titolo")

    def tabella(self, x, y, colonne, righe, h_riga=0.62, sz=2000):
        """Tabella: intestazione verde, righe a fondo alterno; righe = liste di testi (la prima è l'intestazione)."""
        n = self.nid()
        grid = "".join(f'<a:gridCol w="{e(c)}"/>' for c in colonne)

        def cella(t, fondo, col, font):
            bordi = "".join(f'<a:{l} w="12700"><a:solidFill><a:srgbClr val="{RIGA}"/></a:solidFill></a:{l}>' for l in ("lnL", "lnR", "lnT", "lnB"))
            return (f'<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>{par((t, sz, col, font))}</a:txBody>'
                    f'<a:tcPr marL="{e(0.2)}" marR="{e(0.2)}" marT="{e(0.06)}" marB="{e(0.06)}" anchor="ctr">{bordi}'
                    f'<a:solidFill><a:srgbClr val="{fondo}"/></a:solidFill></a:tcPr></a:tc>')

        trs = ""
        for k, r in enumerate(righe):
            if k == 0:
                celle = "".join(cella(t, VERDE, NERO, TITOLI) for t in r)
            else:
                fondo = CARTA if k % 2 else CARTA2
                celle = cella(r[0], fondo, BIANCO, TESTO_B) + "".join(cella(t, fondo, VERDE, TESTO_B) for t in r[1:])
            trs += f'<a:tr h="{e(h_riga)}">{celle}</a:tr>'
        self.forme.append(
            f'<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="{n}" name="Tabella {n}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
            f'<p:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(sum(colonne))}" cy="{e(h_riga * len(righe))}"/></p:xfrm>'
            f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>'
            f"<a:tblGrid>{grid}</a:tblGrid>{trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>")

    def xml(self):
        return "".join(self.forme)


# ---------- slide nuove ----------
def copertina():
    s = Slide()
    s.testo(1.6, 0.55, 14.5, 1.1, [par(("OFFERTA TECNICO ECONOMICA", 6000, BIANCO, TITOLI))])
    s.testo(1.6, 1.85, 15.3, 2.5, [par(("{{nome_impianto}}", 7000, VERDE, TITOLI))])
    s.testo(1.6, 4.55, 15.3, 0.9, [par(("{{potenza_kwp}} kWp · pannelli da {{potenza_modulo_w}} W", 4000, BIANCO, TITOLI))])
    s.testo(1.6, 5.5, 15.3, 0.8, [par(("Strutture fotovoltaiche fisse SOLAR MAX", 3200, VERDE, TESTO_B))])
    s.scheda(10.4, 6.75, 8.9, 2.45)
    s.testo(10.4, 6.75, 8.9, 2.45, [voce("Cliente", "{{cliente}}", sz=2600, dopo=600),
                                     voce("Offerta n.", "{{numero_offerta}}", "  rev.", "{{revisione}}", sz=2600, dopo=600),
                                     voce("Data", "{{data_offerta}}", sz=2600, dopo=0)], anchor="ctr", ins=0.45)
    return s


INDICE = [("La soluzione SOLAR MAX", 3), ("Soluzione proposta", 7), ("Dati di progetto", 8), ("Calcolo strutturale", 9),
          ("Layout dell'impianto", 10), ("Offerta economica", 12), ("Forniture e servizi opzionali", 13), ("Condizioni commerciali", 14),
          ("Garanzie e certificazioni", 15)]


def informazioni():
    s = Slide()
    s.titolo("INFORMAZIONI", "Generali")
    s.testo(1.6, 2.65, 9.4, 6.6, [
        voce("Riferimento offerta:", "{{numero_offerta}}", "  rev.", "{{revisione}}"),
        voce("Data offerta:", "{{data_offerta}}"),
        voce("Progetto:", "{{tipo_progetto}}"),
        voce("Cliente:", "{{cliente}}"),
        voce("Località:", "{{localita}}"),
        voce("Zona:", "{{zona}}"),
        voce("Coordinate:", "{{coordinate}}"),
        voce("Potenza richiesta:", "{{potenza_kwp}} kWp"),
        voce("Referente:", "{{referente}}"),
        voce("E-mail:", "{{email_referente}}", dopo=0),
    ])
    s.scheda(11.4, 2.55, 7.9, 6.6)
    s.testo(11.85, 2.75, 7.0, 0.7, [par(("INDICE", 3000, VERDE, TITOLI))])
    for k, (t, pag) in enumerate(INDICE):
        y = 3.5 + k * 0.6
        s.testo(11.85, y, 0.55, 0.55, [par((str(k + 1), 2000, NERO, TITOLI), algn="ctr")], anchor="ctr", fondo=VERDE, geom="ellipse", nome="Numero")
        s.testo(12.65, y - 0.02, 4.9, 0.6, [par((t, 2100, BIANCO, TESTO_B))], anchor="ctr")
        s.testo(17.45, y - 0.02, 1.5, 0.6, [par((f"pag. {pag}", 1900, VERDE, TESTO_B), algn="r")], anchor="ctr")
    return s


def dati_progetto():
    s = Slide()
    s.titolo("DATI DI", "Progetto")
    schede = [
        (1.6, 5.5, "CLIENTE E SITO", [("Cliente:", "{{cliente}}"), ("Referente:", "{{referente}}"), ("Località:", "{{localita_zona}}"),
                                       ("Coordinate:", "{{coordinate}}"), ("Potenza:", "{{potenza_kwp}} kWp")]),
        (7.35, 5.5, "MODULO FOTOVOLTAICO", [("Modello:", "{{modulo_modello}}"), ("Tipo:", "{{modulo_tipo}}"), ("Potenza:", "{{potenza_modulo_w}} Wp"),
                                            ("Dimensioni:", "{{modulo_dimensioni}} mm"), ("Peso:", "{{modulo_peso_kg}} kg"), ("Quantità:", "{{moduli_totali}} pz")]),
        (13.1, 6.2, "CONDIZIONI DI PROGETTO", [("Vento NTC 2018:", "{{vento_ms}} m/s"), ("Zona vento:", "{{zona_vento}}"), ("Terreno:", "cat. {{categoria_terreno}}"),
                                               ("Altitudine:", "{{altitudine_m}} m s.l.m."), ("Corrosività:", "{{classe_corrosivita}}"),
                                               ("Pendenza N-S:", "{{pendenza_ns}}"), ("Inclinazione:", "{{inclinazione}}°"),
                                               ("Altezza min. bordo:", "{{altezza_min_modulo_m}} m"), ("Infissione ant. / post.:", "{{infissione_m}} m*")]),
    ]
    for x, w, tit, voci in schede:
        s.scheda(x, 2.45, w, 4.6)
        s.testo(x, 2.45, w, 4.6, [par((tit, 2200, VERDE, TITOLI), dopo=800)] + [voce(a, b, sz=1900, dopo=420) for a, b in voci], ins=0.3)
    s.testo(1.6, 7.25, 5.0, 0.5, [par(("PESI DELLA FORNITURA", 2200, VERDE, TITOLI))])
    pesi = [("Struttura", "{{peso_struttura}}"), ("Bulloneria", "{{peso_bulloneria}}"), ("Agganci in alluminio", "{{peso_alluminio}}"), ("Totale", "{{peso_totale}}")]
    for k, (a, b) in enumerate(pesi):
        x, ultimo = 1.6 + k * 4.4, k == len(pesi) - 1
        s.testo(x, 7.8, 4.2, 1.15, [par((a, 1800, NERO if ultimo else VERDE, TESTO_B), algn="ctr"), par((b, 2800, NERO if ultimo else BIANCO, TITOLI), algn="ctr")],
                anchor="ctr", fondo=VERDE if ultimo else CARTA, geom="roundRect", raggio=50000)
    s.testo(6.6, 9.1, 12.7, 0.75, [par(("* Profondità di infissione da validare con pull-out test o studio geotecnico. Moduli fotovoltaici non inclusi nella fornitura.", 1500, GRIGIO, TESTO))])
    return s


def opzionali():
    s = Slide()
    s.titolo("FORNITURE E SERVIZI", "Opzionali")
    # Tabella dei servizi: intestazione fissa, poi una riga per servizio (lista servizi, scelta nel preventivo); sfondo a righe alterne.
    X, W1, W2, H = 1.6, 12.4, 5.3, 0.7
    s.testo(X, 2.55, W1, H, [par(("Voce", 1800, NERO, TITOLI))], anchor="ctr", fondo=VERDE, ins=0.2, nome="Intestazione")
    s.testo(X + W1, 2.55, W2, H, [par(("Prezzo", 1800, NERO, TITOLI))], anchor="ctr", fondo=VERDE, ins=0.2, nome="Intestazione")
    s.testo(X, 2.55 + H, W1 + W2, H, [], fondo=CARTA, nome="Fondo riga", descr="{{#servizi:alterna}}")
    s.testo(X, 2.55 + H, W1, H, [par(("{{voce}}", 1800, BIANCO, TESTO_B))], anchor="ctr", ins=0.2, nome="Servizio", descr="{{#servizi}}")
    s.testo(X + W1, 2.55 + H, W2, H, [par(("{{prezzo}}", 1800, VERDE, TESTO_B))], anchor="ctr", ins=0.2, nome="Prezzo", descr="{{#servizi}}")
    s.testo(X, 2.55 + 2 * H + 0.2, W1 + W2, 0.9, [par(("Prezzi IVA esclusa. Le voci «Su richiesta» vengono quotate su specifica esigenza del cliente e confermate in fase d'ordine.", 1500, GRIGIO, TESTO))],
            nome="Nota", descr="{{segue:servizi}}")
    return s


def condizioni():
    s = Slide()
    s.titolo("CONDIZIONI", "Commerciali")
    s.tabella(1.6, 2.55, [4.6, 5.9], [
        ["Condizione", "Dettaglio"],
        ["Resa (Incoterms 2020)", "{{resa}}"],
        ["Valuta", "EUR (€)"],
        ["Prezzi", "IVA esclusa"],
        ["Condizioni di pagamento", "{{pagamento}}"],
        ["Tempi di consegna", "{{consegna}}"],
        ["Validità dell'offerta", "{{validita}}"],
    ], h_riga=0.85, sz=2000)
    s.scheda(12.6, 2.55, 6.7, 5.95)
    s.testo(12.6, 2.55, 6.7, 5.95, [par(("DOCUMENTAZIONE INCLUSA", 2200, VERDE, TITOLI), dopo=1200)] + [
        par((t, 2000, BIANCO, TESTO), dopo=900, punto=True) for t in
        ("Calcolo strutturale con verifica al vento NTC 2018", "Certificazione CE EN 1090", "Esecutivi della struttura", "Layout esecutivo dell'impianto")], ins=0.35)
    return s


def garanzie():
    s = Slide()
    s.titolo("GARANZIE", "e certificazioni")
    for k, (campo, desc) in enumerate([("anni_garanzia_struttura", "di garanzia su struttura e componenti forniti da Terranova"),
                                       ("anni_garanzia_commerciali", "di garanzia sui componenti commerciali"),
                                       ("anni_assistenza_gratuita", "di assistenza tecnica gratuita")]):
        x = 1.6 + k * 5.95
        s.scheda(x, 2.6, 5.65, 4.2)
        s.testo(x, 2.6, 5.65, 4.2, [par(("{{" + campo + "}}", 9600, VERDE, TITOLI), algn="ctr"), par(("ANNI", 3200, BIANCO, TITOLI), algn="ctr", dopo=900),
                                     par((desc, 2000, BIANCO, TESTO), algn="ctr")], anchor="ctr", ins=0.35)
    s.testo(6.6, 7.3, 12.7, 1.6, [par(("CERTIFICAZIONI", 2000, NERO, TITOLI), algn="ctr", dopo=300),
                                  par(("CE EN 1090 · calcolo strutturale secondo NTC 2018", 2600, NERO, TESTO_B), algn="ctr")],
            anchor="ctr", fondo=VERDE, geom="roundRect", raggio=50000)
    return s


def tabella_righe(s, x, y, colonne, intestazione, riga, lista, totale=None, nota=None, h=0.6, sz=1800):
    """Tabella con righe ripetute dall'app: intestazione verde, una riga d'esempio (lista) a righe alterne,
    poi l'eventuale riga del totale (verde) e la nota, che scendono sotto l'ultima riga."""
    xs = [x + sum(colonne[:k]) for k in range(len(colonne))]
    W = sum(colonne)
    for k, t in enumerate(intestazione):
        s.testo(xs[k], y, colonne[k], h, [par((t, sz - 100, NERO, TITOLI), algn="l" if k == 0 else "ctr")], anchor="ctr", fondo=VERDE, ins=0.15, nome="Intestazione")
    y1 = y + h
    s.testo(x, y1, W, h, [], fondo=CARTA, nome="Fondo riga", descr=f"{{{{#{lista}:alterna}}}}")
    s.testo(x, y1, W, h, [], nome="Passo riga", descr=f"{{{{#{lista}}}}}")
    for k, t in enumerate(riga):
        s.testo(xs[k], y1, colonne[k], h, [par((t, sz, BIANCO if k == 0 else VERDE, TESTO_B), algn="l" if k == 0 else "ctr")], anchor="ctr", ins=0.15,
                nome="Cella", descr=f"{{{{#{lista}}}}}")
    y2 = y1 + h
    if totale:
        for k, t in enumerate(totale):
            s.testo(xs[k], y2, colonne[k], h, [par((t, sz, NERO, TITOLI), algn="l" if k == 0 else "ctr")], anchor="ctr", fondo=VERDE, ins=0.15,
                    nome="Totale", descr=f"{{{{segue:{lista}}}}}")
        y2 += h
    if nota:
        s.testo(x, y2 + 0.12, W, 0.6, [par((nota, 1500, GRIGIO, TESTO))], nome="Nota", descr=f"{{{{segue:{lista}}}}}")


def soluzione():
    """Come «Soluzione proposta» dei tracker: numeri dell'impianto e configurazione per taglia."""
    s = Slide()
    s.titolo("SOLUZIONE", "Proposta")
    kpi = [("{{n_strutture}}", "Strutture totali"), ("{{moduli_totali}}", "Moduli fotovoltaici"), ("{{potenza_kwp}}", "kWp potenza complessiva"),
           ("{{potenza_modulo_w}} Wp", "Potenza modulo")]
    for k, (v, l) in enumerate(kpi):
        x = 1.6 + k * 4.45
        s.scheda(x, 2.45, 4.25, 1.75)
        s.testo(x, 2.45, 4.25, 1.75, [par((v, 4400, VERDE, TITOLI), algn="ctr"), par((l, 1800, BIANCO, TESTO_B), algn="ctr")], anchor="ctr", ins=0.2)
    s.testo(1.6, 4.4, 17.7, 0.6, [par(("Tipo di struttura: ", 2000, GRIGIO, TESTO), ("{{tipo_struttura}}", 2000, BIANCO, TESTO_B),
                                      ("   ·   Inclinazione: ", 2000, GRIGIO, TESTO), ("{{inclinazione}}°", 2000, BIANCO, TESTO_B),
                                      ("   ·   File di moduli: ", 2000, GRIGIO, TESTO), ("{{file_verticali}} in verticale", 2000, BIANCO, TESTO_B))])
    tabella_righe(s, 1.6, 5.15, [3.9, 2.6, 2.9, 2.9, 2.4, 3.0],
                  ["Configurazione", "Moduli/struttura", "Potenza/struttura", "Campate · telai", "N. strutture", "Potenza totale"],
                  ["SOLAR MAX.{{moduli}}", "{{moduli}}", "{{potenza_struttura}} kWp", "{{campate}} · {{telai}}", "{{quantita}}", "{{potenza_riga}} kWp"],
                  "configurazione", totale=["Totale impianto", "", "", "", "{{n_strutture}}", "{{potenza_kwp}} kWp"],
                  nota="Moduli fotovoltaici non inclusi nella fornitura.")
    return s


def calcolo():
    """Calcolo strutturale: vento NTC 2018 (§ 3.3), azioni sui moduli, struttura e geometria per taglia."""
    s = Slide()
    s.titolo("CALCOLO", "Strutturale")
    schede = [
        (1.6, 5.7, "VENTO · NTC 2018 § 3.3", [("Zona vento:", "{{zona_vento}} · {{altitudine_m}} m s.l.m."), ("vb0 · a0 · ks:", "{{vb0}} m/s · {{a0}} m · {{ks}}"),
                                              ("Coeff. di altitudine ca:", "{{ca}}"), ("Velocità base vb:", "{{vb}} m/s"),
                                              ("Ritorno TR:", "{{tr}} anni · cr {{cr}}"), ("Velocità di riferimento vr:", "{{vento_ms}} m/s"),
                                              ("Pressione cinetica qr:", "{{qr}} kN/m²"), ("Esposizione:", "cat. {{categoria_terreno}} · z {{z_vento}} m"),
                                              ("Coeff. di esposizione ce:", "{{ce}}"), ("Pressione di picco qp:", "{{pressione_picco}} kN/m²")]),
        (7.5, 5.6, "AZIONI SUI MODULI", [("cp verso il basso:", "{{cp_giu}}"), ("cp in sollevamento:", "{{cp_su}}"), ("Coeff. dinamico cd:", "{{cd}}"),
                                         ("Pressione verso il basso:", "{{p_giu}} kN/m²"), ("  per modulo:", "{{p_giu_modulo}} kN"),
                                         ("Pressione in sollevamento:", "{{p_su}} kN/m²"), ("  per modulo:", "{{p_su_modulo}} kN"),
                                         ("Superficie del modulo:", "{{area_modulo}} m²"), ("Carico neve verificato:", "{{neve}}")]),
        (13.3, 6.0, "STRUTTURA", [("Inclinazione:", "{{inclinazione}}°"), ("File di moduli:", "{{file_verticali}} in verticale"),
                                  ("Bordo basso / alto:", "{{altezza_min_modulo_m}} / {{altezza_max_modulo_m}} m"), ("Infissione ant. / post.:", "{{infissione_m}} m"),
                                  ("Distanza pali ant. / post.:", "{{distanza_pali_m}} m"), ("Fuga tra i moduli:", "{{fuga_mm}} mm"),
                                  ("Massa delle strutture:", "{{peso_totale}}")]),
    ]
    for x, w, tit, voci in schede:
        s.scheda(x, 2.4, w, 4.15)
        s.testo(x, 2.4, w, 4.15, [par((tit, 2000, VERDE, TITOLI), dopo=500)] + [voce(a, b, sz=1500, dopo=180) for a, b in voci], ins=0.25)
    tabella_righe(s, 1.6, 6.75, [3.0, 2.2, 2.0, 2.6, 3.0, 2.4, 2.5],
                  ["Taglia", "Campate", "Telai", "Lunghezza", "1° – ultimo telaio", "Controventi", "Massa / str."],
                  ["{{moduli}} moduli × {{quantita}}", "{{campate}}", "{{telai}}", "{{lunghezza}} m", "{{interasse}} m", "{{controventi}}", "{{massa}} kg"],
                  "geometria", h=0.52, sz=1600,
                  nota="Calcolo del vento secondo NTC 2018 § 3.3 con terreno pianeggiante (ct = 1); cp netti della falda dati dal progettista. Da far verificare al progettista.")
    return s


def investimento():
    """Come «Investimento» dei tracker: incluso nel prezzo a sinistra; a destra strutture, trasporto, posa e ogni voce extra
    (sempre a parte), €/kWp e peso. Sopra la prima riga il prezzo pieno barrato (vuoto se non c'e')."""
    s = Slide()
    s.titolo("TOTALE", "Investimento")
    s.scheda(1.6, 2.55, 7.3, 6.55)
    s.testo(1.6, 2.55, 7.3, 6.55, [par(("INCLUSO NEL PREZZO", 2200, VERDE, TITOLI), dopo=1100),
                                   par(("{{#inclusi}}{{voce}}{{/inclusi}}", 1800, BIANCO, TESTO), dopo=600, punto=True)], ins=0.35)
    s.testo(12.6, 2.05, 6.7, 0.5, [par(("€ {{prezzo_listino}} + IVA", 1900, GRIGIO, TESTO_B), algn="ctr")], anchor="b", nome="Prezzo pieno")
    s.forme[-1] = s.forme[-1].replace(' dirty="0"', ' strike="sngStrike" dirty="0"')   # barrato
    y = 2.6
    s.testo(9.3, y, 10.0, 1.35, [], nome="Passo riga", descr="{{#voci}}")
    # Il prezzo sta nella parte scura che resta scoperta a destra della pillola verde.
    s.testo(12.6, y, 6.7, 1.1, [par(("{{prezzo}}", 2200, BIANCO, TITOLI), algn="ctr")], anchor="ctr", fondo=VERDE_SCURO,
            geom="roundRect", raggio=50000, ins=0.2, ins_sx=1.5, nome="Prezzo", descr="{{#voci}}")
    s.testo(9.3, y, 4.8, 1.1, [par(("{{voce}}", 1900, NERO, TITOLI), algn="ctr")], anchor="ctr", fondo=VERDE,
            geom="roundRect", raggio=50000, ins=0.25, nome="Voce", descr="{{#voci}}")
    s.testo(9.3, y + 1.25, 10.0, 1.3, [par(("Prezzo per kWp: ", 2000, GRIGIO, TESTO), ("{{prezzo_kwp}} €/kWp", 2000, BIANCO, TESTO_B), algn="r", dopo=300),
                                       par(("Peso struttura ~", 1800, GRIGIO, TESTO), ("{{peso_struttura_ton}} t", 1800, BIANCO, TESTO_B), algn="r", dopo=300),
                                       par(("Prezzi IVA esclusa. €/kWp calcolato sulle strutture; trasporto, posa e le altre voci sono a parte.", 1500, GRIGIO, TESTO), algn="r")],
            nome="Note", descr="{{segue:voci}}")
    return s


NUOVE = [copertina, informazioni, dati_progetto, opzionali, condizioni, garanzie, soluzione, calcolo, investimento]


def righe_totale():
    """Slide del totale BIPALO, a destra: una pillola per taglia (lista taglie: «N.19 STRUTTURE DA 36 MODULI» e la sua potenza),
    come nella presentazione; i prezzi stanno nella slide Investimento. La forma vuota alta 1,75 pollici fa da passo tra le righe."""
    s = Slide(200)
    y = 2.55
    s.testo(11.2, y, 8.4, 1.75, [], nome="Passo riga", descr="{{#taglie}}")
    s.testo(14.4, y, 5.2, 1.4, [par(("{{potenza_riga}} kWp", 2400, BIANCO, TITOLI), algn="ctr")], anchor="ctr", fondo=VERDE_SCURO,
            geom="roundRect", raggio=50000, ins=0.2, ins_sx=1.5, nome="Potenza", descr="{{#taglie}}")
    s.testo(11.2, y, 4.6, 1.4, [par(("N.{{quantita}} STRUTTUR{{finale}} DA {{moduli}} MODULI", 2200, NERO, TITOLI), algn="ctr")], anchor="ctr", fondo=VERDE,
            geom="roundRect", raggio=50000, ins=0.25, nome="Taglia", descr="{{#taglie}}")
    return s.xml()


def materiali(x):
    """Paragrafi dei materiali (spezzati in molti pezzi nella presentazione) con i segnaposto, stessa formattazione."""
    m = re.search(r'(<p:cNvPr id="24" name="TextBox 24"/>.*?<a:lstStyle/>)(<a:p>.*?</a:p>)(<a:p>.*?</a:p>)', x, re.S)
    if not m:
        raise SystemExit("slide 6: testo dei materiali non trovato")
    ppr = re.match(r"<a:p>(<a:pPr.*?</a:pPr>)", m[2], re.S)[1]
    r = re.search(r"<a:rPr.*?</a:rPr>", m[2], re.S)[0].replace(' err="1"', "")
    p1 = f"<a:p>{ppr}<a:r>{r}<a:t>- {{{{materiale_struttura}}}}</a:t></a:r></a:p>"
    p2 = m[3].replace("<a:t>- PILASTRI IN ACCIAIO ZINCATO A CALDO S355JR</a:t>", "<a:t>- {{materiale_pali}}</a:t>")
    if "{{materiale_pali}}" not in p2:
        raise SystemExit("slide 6: riga dei pali non trovata")
    return x.replace(m[0], m[1] + p1 + p2)


# ---------- pacchetto ----------
def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def cambia_testi(x: str, coppie: list[tuple[str, str]], n: int) -> str:
    pos = 0
    for vecchio, nuovo in coppie:
        t = f"<a:t>{esc(vecchio)}</a:t>"
        i = x.find(t, pos)
        if i < 0:
            raise SystemExit(f"slide {n}: testo non trovato: {vecchio!r}")
        x = x[:i] + f"<a:t>{esc(nuovo)}</a:t>" + x[i + len(t):]
        pos = i
    return x


def togli(x: str, nomi: list[str], n: int) -> str:
    for nome in nomi:
        tag = "grpSp" if nome.startswith("Group") else "sp"
        x, k = re.subn(rf'<p:{tag}>(?:(?!<p:{tag}>).)*?name="{re.escape(nome)}".*?</p:{tag}>', "", x, count=1, flags=re.S)
        if k != 1:
            raise SystemExit(f"slide {n}: forma {nome} non trovata")
    return x


def aggiungi(x: str, forme: str) -> str:
    return x.replace("</p:spTree>", forme + "</p:spTree>", 1)


def main():
    zin = zipfile.ZipFile(SORGENTE)
    file = {i.filename: zin.read(i.filename) for i in zin.infolist()}
    info = {i.filename: i for i in zin.infolist()}
    slide = lambda n: file[f"ppt/slides/slide{n}.xml"].decode("utf-8")
    metti = lambda n, x: file.__setitem__(f"ppt/slides/slide{n}.xml", x.encode("utf-8"))

    # Slide della presentazione con i segnaposto.
    for n, coppie in TESTI.items():
        metti(n, cambia_testi(slide(n), coppie, n))
    x, k = re.subn(rf'(<p:cNvPr id="\d+") name="{LAYOUT[1]}"', r'\1 name="IMG_LAYOUT"', slide(LAYOUT[0]))
    if k != 1:
        raise SystemExit(f"slide {LAYOUT[0]}: immagine {LAYOUT[1]} non trovata")
    metti(LAYOUT[0], x)
    metti(6, aggiungi(materiali(togli(slide(6), TOTALE_VIA, 6)), righe_totale()))

    # Slide nuove sulla base della copertina BIPALO, registrate nel pacchetto.
    base = togli(slide(BASE), BASE_VIA, BASE)
    pres_rels = file["ppt/_rels/presentation.xml.rels"].decode()
    ct = file["[Content_Types].xml"].decode()
    rid_slide = {int(n): r for r, n in re.findall(r'Id="(rId\d+)"[^>]*Target="slides/slide(\d+)\.xml"', pres_rels)}
    rid = max(int(r) for r in re.findall(r'Id="rId(\d+)"', pres_rels))
    nuove_rid = []
    for k, crea in enumerate(NUOVE):
        n = 7 + k
        nome, rels = f"ppt/slides/slide{n}.xml", f"ppt/slides/_rels/slide{n}.xml.rels"
        metti(n, aggiungi(base, crea().xml()))
        file[rels] = file[f"ppt/slides/_rels/slide{BASE}.xml.rels"]
        info[nome], info[rels] = zipfile.ZipInfo(nome), zipfile.ZipInfo(rels)
        rid += 1
        nuove_rid.append(f"rId{rid}")
        pres_rels = pres_rels.replace("</Relationships>", f'<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{n}.xml"/></Relationships>')
        ct = ct.replace("</Types>", f'<Override PartName="/{nome}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>')
    file["ppt/_rels/presentation.xml.rels"] = pres_rels.encode("utf-8")
    file["[Content_Types].xml"] = ct.encode("utf-8")

    # Ordine delle slide.
    ids = "".join(f'<p:sldId id="{256 + i}" r:id="{nuove_rid[int(v[1:])] if isinstance(v, str) else rid_slide[v]}"/>' for i, v in enumerate(ORDINE))
    pres = file["ppt/presentation.xml"].decode("utf-8")
    file["ppt/presentation.xml"] = re.sub(r"<p:sldIdLst>.*?</p:sldIdLst>", f"<p:sldIdLst>{ids}</p:sldIdLst>", pres, flags=re.S).encode("utf-8")
    app = file["docProps/app.xml"].decode("utf-8")
    file["docProps/app.xml"] = re.sub(r"<Slides>\d+</Slides>", f"<Slides>{len(ORDINE)}</Slides>", app).encode("utf-8")

    os.makedirs(os.path.dirname(DESTINAZIONE), exist_ok=True)
    with zipfile.ZipFile(DESTINAZIONE, "w", zipfile.ZIP_DEFLATED) as zout:
        for nome in ["[Content_Types].xml"] + [n for n in file if n != "[Content_Types].xml"]:
            info[nome].compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(info[nome], file[nome])
    print("Scritto", os.path.normpath(DESTINAZIONE), f"({len(ORDINE)} slide)")


if __name__ == "__main__":
    main()
