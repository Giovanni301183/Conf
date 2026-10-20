"""Rigenera api/_costa.ts: linea di costa Natural Earth 1:10m (dominio pubblico) ritagliata sull'Italia e semplificata (~150 m).

Uso:  python scripts/costa-italia.py ne_10m_coastline.geojson
      (file da https://github.com/nvkelso/natural-earth-vector, cartella geojson)
"""
import json, math, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'api', '_costa.ts')
X0, X1, Y0, Y1 = 5.5, 19.5, 35.0, 47.6   # Italia con circa 40 km di margine
TOL = 0.0014                              # gradi, circa 150 m


def dp(pts, tol):
    """Semplificazione di Douglas-Peucker (distanze con la longitudine corretta per la latitudine)."""
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    kx = math.cos(math.radians((a[1] + b[1]) / 2))

    def dist(p):
        ax, ay, bx, by, px, py = a[0] * kx, a[1], b[0] * kx, b[1], p[0] * kx, p[1]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    i, m = max(((i, dist(p)) for i, p in enumerate(pts[1:-1], 1)), key=lambda x: x[1])
    return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol) if m > tol else [a, b]


d = json.load(open(sys.argv[1], encoding='utf-8'))
linee = []
for f in d['features']:
    g = f['geometry']
    for line in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
        cur = []
        for x, y in line:
            if X0 <= x <= X1 and Y0 <= y <= Y1: cur.append([x, y])
            elif cur: linee.append(cur); cur = []
        if cur: linee.append(cur)
sys.setrecursionlimit(100000)
semp = [[[round(x, 4), round(y, 4)] for x, y in dp(l, TOL)] for l in linee if len(l) > 1]
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write("// Linea di costa (Natural Earth 1:10m, dominio pubblico) ritagliata sull'Italia e semplificata a ~150 m: [lng, lat] per linea.\n")
    f.write('// Serve solo a stimare la distanza dal mare in _sito.ts. Si rigenera con scripts/costa-italia.py.\n')
    f.write('export const COSTA: number[][][] = ' + json.dumps(semp, separators=(',', ':')) + ';\n')
print(f'{len(semp)} linee, {sum(len(l) for l in semp)} punti -> api/_costa.ts')
