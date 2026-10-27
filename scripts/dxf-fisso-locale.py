"""Server locale del DXF degli impianti fissi (stessa funzione di api/dxf_fisso.py), per l'anteprima con npm run dev.
Avvio: npm run dev:dxf (porta 8000); in locale l'app chiama direttamente questo server (il proxy di Vite tronca lo ZIP).
Serve ezdxf: pip install -r requirements.txt
"""

import importlib.util
import os
from http.server import ThreadingHTTPServer

qui = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("dxf_fisso", os.path.join(qui, "api", "dxf_fisso.py"))
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)

# Su Windows il riuso dell'indirizzo lascia partire un secondo server sulla stessa porta (e risponde il vecchio): meglio un errore chiaro.
ThreadingHTTPServer.allow_reuse_address = False


class Locale(modulo.handler):
    """La pagina sta su localhost:5173 e chiama la porta 8000: servono le intestazioni CORS."""

    def end_headers(self):
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-expose-headers", "content-disposition")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-methods", "POST")
        self.send_header("access-control-allow-headers", "content-type")
        self.send_header("content-length", "0")
        self.end_headers()


# HTTP/1.1: la connessione la chiude il browser. Con HTTP/1.0 la chiude il server e su Windows lo ZIP arriva troncato.
Locale.protocol_version = "HTTP/1.1"
print("DXF impianti fissi su http://127.0.0.1:8000/api/dxf_fisso (Ctrl+C per fermare)", flush=True)
ThreadingHTTPServer(("127.0.0.1", 8000), Locale).serve_forever()
