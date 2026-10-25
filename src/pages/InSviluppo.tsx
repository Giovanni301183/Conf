// Scheda di un settore non ancora pronto: cosa ci sarà e a che punto siamo.
import { infoSettore } from '../domain/settori';
import { S, TABS } from '../store/state';

const LABEL = Object.fromEntries(TABS) as Record<string, string>;

export function InSviluppo() {
  const s = infoSettore(S.ui.set);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{s.nome} · {LABEL[S.ui.tab]} <span className="tag">in sviluppo</span></h2>
      <p>{s.cosa}</p>
      <p className="hint" style={{ margin: 0 }}>Questo settore avrà la stessa cascata dei tracker: distinta base, configurazione, costi, voci extra, margini, offerta, documenti,
        distinta di lavorazione e montaggio. I preventivi restano nell'archivio comune, in <b>Preventivi</b>, con il filtro per settore.</p>
    </div>
  );
}
