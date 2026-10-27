"""Generatore DXF degli impianti fissi, costruito sulla tavola DE VITA rev. IV (36 moduli 2384x1303).
Portato dal configuratore in Desktop/Impianto Fisso (engine/dxf.py): il calcolo ora e' in TypeScript (src/domain/fisso.ts)
e qui arriva il suo risultato in JSON (vedi risultato()), con gli stessi nomi dei campi.

Le tavole che non dipendono dalla taglia (dettagli, nodi, sezioni, vista montata, cartiglio)
si copiano dal riferimento: cambiano solo titolo, data e quantità per struttura.
Le due tavole che dipendono dalla lunghezza (pianta pali; vista frontale e posteriore)
si ricostruiscono con gli stessi blocchi del riferimento, spostati sui telai calcolati dal motore.
Il modello è disegnato in mm reali, quindi le coordinate del motore si usano direttamente.
"""

import datetime
import io
import os
import re
from dataclasses import dataclass, field

import ezdxf
from ezdxf import bbox
from ezdxf.entities import DimStyleOverride

from types import SimpleNamespace
from typing import Any

Risultato = Any


def risultato(d: dict) -> SimpleNamespace:
    """Risultato di calcola() di src/domain/fisso.ts (JSON) con gli attributi che usano le funzioni qui sotto."""
    return SimpleNamespace(
        input=SimpleNamespace(**d["input"]),
        righe=[SimpleNamespace(**r) for r in d["righe"]],
        geometria=d["geometria"],
        colonne=d["colonne"],
        telai=d["telai"],
        lunghezza=d["lunghezza"],
    )

TEMPLATE = os.path.join(os.path.dirname(__file__), "template", "riferimento_36.dxf")

PASSO_CAMPATA = 2646.0
PASSO_COLONNA = 1323.0
# Telai della 36 relativi al primo: prima campata 2405, poi 8 x 2646.
REF_T = [0.0] + [2405.0 + PASSO_CAMPATA * k for k in range(9)]
REF_ULTIMO = len(REF_T) - 1
REF_MEDIO = 3  # telaio intermedio "pulito" usato come modello per quelli centrali
REF_CAMPATE = 9

BLOCCO_ARC_SX = "A$Cd710f2a6"
BLOCCO_ARC_INT = "A$C22eec250"
BLOCCO_ARC_DX = "A$C5c61dd9e"
BLOCCO_NODO = "A$C5c80db92"
BLOCCO_CROCE = "A$Cfa87487f"
BLOCCO_TICK = "_Oblique"


@dataclass
class Zona:
    nome: str
    box: tuple[float, float, float, float]  # x0, y0, x1, y1
    primo_telaio: float  # x del primo telaio nella tavola di riferimento
    entita: list = field(default_factory=list)


def _zone() -> list[Zona]:
    return [
        Zona("pianta pali", (-39400, -82300, -14000, -76500), -38794.0),
        Zona("vista frontale", (2300, -77400, 27000, -70300), 2882.1),
        Zona("vista posteriore", (1500, -83500, 27400, -77900), 2882.1),
    ]


def _punto_rapido(e):
    t = e.dxftype()
    try:
        if t == "LINE":
            return e.dxf.start
        if t in ("INSERT", "MTEXT", "TEXT"):
            return e.dxf.insert
        if t == "DIMENSION":
            return e.dxf.defpoint
        if t == "LWPOLYLINE":
            return e[0]
    except Exception:
        return None
    return None


def _dentro(b, box, margine=0.0) -> bool:
    x0, y0, x1, y1 = box
    return (
        b.extmin.x >= x0 - margine and b.extmax.x <= x1 + margine
        and b.extmin.y >= y0 - margine and b.extmax.y <= y1 + margine
    )


def _indice_telaio(x: float, zona: Zona) -> int:
    rel = x - zona.primo_telaio
    return min(range(len(REF_T)), key=lambda i: abs(rel - REF_T[i]))


def _clona(msp, e, dx: float, dy: float = 0.0):
    c = e.copy()
    msp.add_entity(c)
    c.translate(dx, dy, 0)
    return c


def _altezza_testo_quota(dim) -> float | None:
    blk = dim.get_geometry_block()
    if blk is None:
        return None
    for e in blk:
        if e.dxftype() == "MTEXT":
            return e.dxf.char_height
    return None


def _nuova_quota(msp, modello, p1x, p2x, basex, testo=None):
    """Quota lineare con lo stesso stile di `modello`, nuove x, stesse y."""
    ovr = dict(DimStyleOverride(modello).dimstyle_attribs)
    h = _altezza_testo_quota(modello)
    if h:
        ovr["dimscale"] = h / (msp.doc.dimstyles.get(modello.dxf.dimstyle).dxf.dimtxt or 2.5)
    d = msp.add_linear_dim(
        base=(basex, modello.dxf.defpoint.y),
        p1=(p1x, modello.dxf.defpoint2.y),
        p2=(p2x, modello.dxf.defpoint3.y),
        angle=modello.dxf.get("angle", 0.0),
        dimstyle=modello.dxf.dimstyle,
        override=ovr,
        text=testo if testo is not None else "<>",
        dxfattribs={"layer": modello.dxf.layer},
    )
    d.render()


def _ricostruisci(msp, zona: Zona, ris: Risultato, cache):
    g = ris.geometria
    tn = [t - g["telai_x"][0] for t in g["telai_x"]]  # telai nuovi relativi al primo
    K = len(tn) - 1
    a = zona.primo_telaio

    def x_nuova(x: float) -> float:
        i = _indice_telaio(x, zona)
        j = 0 if i == 0 else (K if i == REF_ULTIMO else min(i, K))
        return a + tn[j] + (x - a - REF_T[i])

    gruppi: dict[int, list] = {}
    moduli, quote_or, quote_vert, cancella = [], [], [], []
    arc = {BLOCCO_ARC_SX: [], BLOCCO_ARC_INT: [], BLOCCO_ARC_DX: [], BLOCCO_NODO: [], BLOCCO_CROCE: []}

    for e in zona.entita:
        t = e.dxftype()
        b = bbox.extents([e], cache=cache)
        w, h = b.extmax.x - b.extmin.x, b.extmax.y - b.extmin.y
        if t == "DIMENSION":
            if abs(e.dxf.get("angle", 0.0)) < 1:
                if round(e.get_measurement()) == 2644:
                    if K < 3:
                        cancella.append(e)  # senza arcarecci intermedi la quota non serve
                    continue
                quote_or.append(e)
            elif round(e.get_measurement()) == 3270:
                quote_vert.append(e)
            else:
                # dettagli sui primi pilastri: restano se il pilastro (e la croce) esistono
                i = _indice_telaio(e.dxf.defpoint2.x, zona)
                if i > K or (i == 2 and 1 not in g["campate_controventi"]):
                    cancella.append(e)
            continue
        if t == "MTEXT" and e.plain_text().strip() == "2405":
            cancella.append(e)
            continue
        if t == "MULTILEADER":
            # richiami "controvento" (croce in campata 1) e "pilastro" (telaio 2)
            su_pilastro = b.extmin.x > a + REF_T[2] - 500
            if (su_pilastro and K < 2) or (not su_pilastro and 1 not in g["campate_controventi"]):
                cancella.append(e)
            continue
        if t == "MTEXT":
            continue
        if t == "INSERT" and e.dxf.name in arc:
            arc[e.dxf.name].append(e)
            continue
        if t == "INSERT" and e.dxf.name == BLOCCO_TICK:
            cancella.append(e)
            continue
        if t == "LWPOLYLINE" and e.closed and abs(w - 1303) < 2 and abs(h - 2384) < 2:
            moduli.append((e, b))
            continue
        if t == "LWPOLYLINE" and 500 < w < 1500:
            cancella.append(e)  # riquadro evidenziato attorno al "2405"
            continue
        if t == "LINE":
            lv, lo = abs(e.dxf.end.y - e.dxf.start.y), abs(e.dxf.end.x - e.dxf.start.x)
            if (lo < 1 and abs(lv - 981) < 2) or (lv < 1 and abs(lo - 2405) < 2):
                cancella.append(e)  # quota del 2405 disegnata a mano
                continue
            if w > 10000:
                e.dxf.start = (x_nuova(e.dxf.start.x), e.dxf.start.y, 0)
                e.dxf.end = (x_nuova(e.dxf.end.x), e.dxf.end.y, 0)
                continue
        if w <= 300:
            gruppi.setdefault(_indice_telaio((b.extmin.x + b.extmax.x) / 2, zona), []).append(e)
            continue
        # entità larghe non classificate: restano al loro posto

    # Telai: pali, falde, pilastri e dettagli vicini, copiati sui nuovi telai.
    for j in range(K + 1):
        sorgente = 0 if j == 0 else (REF_ULTIMO if j == K else REF_MEDIO)
        for e in gruppi.get(sorgente, []):
            _clona(msp, e, tn[j] - REF_T[sorgente])

    # Moduli: la colonna 0 ripetuta su tutte le colonne.
    if moduli:
        x0 = min(b.extmin.x for _, b in moduli)
        colonna0 = [e for e, b in moduli if b.extmin.x - x0 < PASSO_COLONNA / 2]
        for c in range(ris.colonne):
            for e in colonna0:
                _clona(msp, e, c * PASSO_COLONNA)

    # Arcarecci e nodi, fila per fila.
    def per_fila(lista):
        file = {}
        for e in lista:
            file.setdefault(round(e.dxf.insert.y), []).append(e)
        return [sorted(v, key=lambda e: e.dxf.insert.x) for _, v in sorted(file.items())]

    if K == 1:
        for sx in arc[BLOCCO_ARC_SX]:
            b = bbox.extents([sx], cache=cache)
            L = ris.input.lunghezza_arc_unico or 2731
            xc = a + tn[1] / 2
            msp.add_lwpolyline(
                [(xc - L / 2, b.extmin.y), (xc + L / 2, b.extmin.y), (xc + L / 2, b.extmax.y), (xc - L / 2, b.extmax.y)],
                close=True,
                dxfattribs={"layer": sx.dxf.layer},
            )
        cancella += arc[BLOCCO_ARC_SX] + arc[BLOCCO_ARC_DX]
    else:
        ultima = tn[K] - tn[K - 1]
        for dx in arc[BLOCCO_ARC_DX]:
            dx.translate((K - REF_CAMPATE) * PASSO_CAMPATA, 0, 0)
            if ultima < PASSO_CAMPATA - 1:
                # ultima campata ridotta (taglia con riserva): testata accorciata, stesso attacco
                b0 = bbox.extents([dx])
                dx.dxf.xscale *= (b0.extmax.x - b0.extmin.x - (PASSO_CAMPATA - ultima)) / (b0.extmax.x - b0.extmin.x)
                b1 = bbox.extents([dx])
                dx.translate(b0.extmin.x - b1.extmin.x, 0, 0)
        for fila in per_fila(arc[BLOCCO_ARC_INT]):
            for k in range(K - 2):
                _clona(msp, fila[0], k * PASSO_CAMPATA)
        for fila in per_fila(arc[BLOCCO_NODO]):
            for k in range(K - 1):
                _clona(msp, fila[0], k * PASSO_CAMPATA)

    # Croci di controvento: il modello è la croce della campata 1.
    croci = [e for e in arc[BLOCCO_CROCE] if _indice_telaio(bbox.extents([e], cache=cache).extmin.x, zona) == 1]
    for campata in g["campate_controventi"]:
        luce = tn[campata + 1] - tn[campata]
        for e in croci:
            c = _clona(msp, e, tn[campata] - REF_T[1])
            if abs(luce - PASSO_CAMPATA) > 1:
                b0 = bbox.extents([c])
                c.dxf.xscale *= luce / PASSO_CAMPATA
                b1 = bbox.extents([c])
                c.translate(b0.extmin.x - b1.extmin.x, 0, 0)

    # Quote orizzontali: catene di campate e quote totali, rifatte sui nuovi telai.
    livelli: dict[int, list] = {}
    for d in quote_or:
        livelli.setdefault(round(d.dxf.defpoint.y / 100), []).append(d)
    for quote in livelli.values():
        for d in quote:
            if d.get_measurement() > 10000:
                testo = None
                if d.dxf.text:
                    testo = f"{round(ris.lunghezza)}"
                p1 = a + tn[0] + (d.dxf.defpoint2.x - a - REF_T[0])
                p2 = a + tn[K] + (d.dxf.defpoint3.x - a - REF_T[REF_ULTIMO])
                _nuova_quota(msp, d, p1, p2, p2, testo)
        catena = [d for d in quote if d.get_measurement() < 10000]
        if catena:
            modello = max(catena, key=lambda d: d.dxf.defpoint2.x)
            j = _indice_telaio(modello.dxf.defpoint2.x, zona)
            o1 = modello.dxf.defpoint2.x - a - REF_T[j]
            o2 = modello.dxf.defpoint3.x - a - REF_T[j + 1]
            for i in range(K):
                _nuova_quota(msp, modello, a + tn[i] + o1, a + tn[i + 1] + o2, a + tn[i + 1] + o2)

    for d in quote_vert:
        dx = tn[K] - REF_T[REF_ULTIMO]
        _nuova_quota(msp, d, d.dxf.defpoint2.x + dx, d.dxf.defpoint3.x + dx, d.dxf.defpoint.x + dx)

    da_togliere = cancella + quote_or + quote_vert + [e for e, _ in moduli]
    da_togliere += [e for v in gruppi.values() for e in v]
    da_togliere += arc[BLOCCO_ARC_INT] + arc[BLOCCO_NODO] + arc[BLOCCO_CROCE]
    for e in da_togliere:
        if e.is_alive:
            msp.delete_entity(e)


def _aggiorna_testi(msp, ris: Risultato):
    inp = ris.input
    data = inp.data or datetime.date.today().strftime("%d/%m/%Y")
    q = {r.codice: r.quantita for r in ris.righe}
    contr = q.get("controvento", 0)
    arc_int = q.get("arc_centrale", 0)
    arc_test = q.get("arc_sx", q.get("arc_unico", 0))
    T = ris.telai

    # Quantità per tavola: (x min, x max) del foglio nel riferimento -> nuovo valore.
    quantita = [
        ((18740, 22740), T),  # pilastro anteriore
        ((23333, 29733), T),  # pilastro posteriore
        ((30596, 31364), 2 * T),  # giunto di collegamento verticale
        ((32307, 36307), T),  # puntone anteriore
        ((37169, 41169), T),  # puntone posteriore
        ((42536, 46536), contr),  # controvento
        ((-61733, -55733), arc_test),  # arcareccio testata sinistra
        ((-53145, -47145), arc_int),  # arcareccio intermedio
        ((-45357, -39357), arc_test),  # arcareccio testata destra
    ]
    for e in msp.query("MTEXT"):
        s = e.text
        if "impianto fisso" in s:
            if inp.cliente:
                s = re.sub(r"impianto fisso .*?\\P", f"impianto fisso {inp.cliente.upper()}\\\\P", s)
            n = inp.n_strutture
            s = re.sub(
                r"\d+ pannelli \d+x\d+",
                f"{inp.moduli} pannelli {inp.lunghezza_modulo:g}x{inp.larghezza_modulo:g}"
                f" - n. {n} {'struttura' if n == 1 else 'strutture'}",
                s,
            )
            e.text = s
        elif re.search(r"\d{2}/\d{2}/\d{4}", s):
            e.text = re.sub(r"\d{2}/\d{2}/\d{4}", data, s)
        elif re.search(r"ogni struttura", s):
            x = e.dxf.insert.x
            for (x0, x1), v in quantita:
                if x0 <= x <= x1:
                    e.text = re.sub(r"\d+", f"{v:g}", s, count=1)
                    break


# Sezioni trasversali con il piano di campagna: lì stanno le quote di infissione.
SEZIONI_INFISSIONE = [(-27000, -50000, -14000, -38000), (100000, -50000, 112000, -38000)]


def _riscrivi_quota(d, valore: float):
    """Cambia il testo di una quota esistente (anche nel blocco già disegnato), senza ridisegnarla."""
    testo = f"{valore:g}"
    vecchio = f"{round(d.get_measurement())}"
    d.dxf.text = testo
    blocco = d.get_geometry_block()
    if blocco is not None:
        for t in blocco.query("MTEXT TEXT"):
            if t.dxftype() == "MTEXT" and t.plain_text().strip() in (vecchio, d.dxf.get("text", "")):
                t.text = testo
            elif t.dxftype() == "TEXT" and t.dxf.text.strip() == vecchio:
                t.dxf.text = testo


def _quote_pilastri(msp, ris: Risultato):
    """Lunghezze dei montanti e infissioni: le quote seguono i valori scelti dall'utente."""
    inp = ris.input
    L = {r.codice: r.lunghezza for r in ris.righe}
    lunghezze = {1390: L.get("montante_basso", 1390), 3415: L.get("montante_alto", 3415)}
    infissioni = {700: inp.infissione_ant, 1200: inp.infissione_post}
    for d in msp.query("DIMENSION"):
        m = round(d.get_measurement())
        if m in lunghezze and lunghezze[m] != m:
            _riscrivi_quota(d, lunghezze[m])
        elif m in infissioni and infissioni[m] != m and round(d.dxf.get("angle", 0)) == 90:
            p = d.dxf.defpoint
            if any(x0 <= p.x <= x1 and y0 <= p.y <= y1 for x0, y0, x1, y1 in SEZIONI_INFISSIONE):
                _riscrivi_quota(d, infissioni[m])


def genera(ris: Risultato) -> bytes:
    doc = ezdxf.readfile(TEMPLATE)
    msp = doc.modelspace()
    cache = bbox.Cache()
    zone = _zone()

    for e in msp:
        p = _punto_rapido(e)
        for z in zone:
            x0, y0, x1, y1 = z.box
            if p is not None and not (x0 - 500 <= p[0] <= x1 + 500 and y0 - 500 <= p[1] <= y1 + 500):
                continue
            b = bbox.extents([e], cache=cache)
            if b.has_data and _dentro(b, z.box, 1):
                z.entita.append(e)
                break

    for z in zone:
        _ricostruisci(msp, z, ris, cache)
    _aggiorna_testi(msp, ris)
    _quote_pilastri(msp, ris)

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")
