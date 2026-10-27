"""Funzione Vercel (Python): DXF degli impianti fissi, le 17 tavole DE VITA adattate a ogni taglia (fisso_dxf/dxf.py).
L'app manda POST /api/dxf_fisso con { risultati: [calcola() di src/domain/fisso.ts, uno per taglia], nome } e riceve uno ZIP
con un DXF per taglia. Il DXF completo pesa circa 10 MB (1,3 MB compresso) e le risposte delle funzioni arrivano a 4,5 MB:
per questo al massimo MAX_TAGLIE per volta. In locale la serve scripts/dxf-fisso-locale.py (npm run dev:dxf, porta 8000).
"""

import io
import json
import os
import re
import sys
import zipfile
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fisso_dxf import dxf  # noqa: E402

MAX_TAGLIE = 3


def pacchetto(b: dict) -> tuple[bytes, str]:
    rr = b.get("risultati") or []
    if not rr:
        raise ValueError("Nessuna taglia da disegnare.")
    if len(rr) > MAX_TAGLIE:
        raise ValueError(f"Con più di {MAX_TAGLIE} taglie il file supera il limite di download: scarica i DXF una taglia alla volta.")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for d in rr:
            z.writestr(f"struttura_{d['input']['moduli']}_moduli.dxf", dxf.genera(dxf.risultato(d)))
    nome = re.sub(r"[^\w-]+", "_", str(b.get("nome") or "")).strip("_")
    return buf.getvalue(), (f"impianto_{nome or 'fisso'}.zip" if len(rr) > 1 else f"struttura_{rr[0]['input']['moduli']}_moduli.zip")


class handler(BaseHTTPRequestHandler):
    def _risposta(self, status: int, corpo: bytes, tipo: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("content-type", tipo)
        self.send_header("content-length", str(len(corpo)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        try:
            b = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
            dati, nome = pacchetto(b)
        except (ValueError, KeyError, TypeError) as e:
            errore = str(e) if isinstance(e, ValueError) else f"dati non validi ({e})"
            return self._risposta(422, json.dumps({"ok": False, "errore": errore}).encode(), "application/json")
        self._risposta(200, dati, "application/zip", {"content-disposition": f'attachment; filename="{nome}"'})
