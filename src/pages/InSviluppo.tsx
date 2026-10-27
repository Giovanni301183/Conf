// Scheda di un settore non ancora pronto: cosa ci sarà e a che punto siamo. Scheda con aperto un preventivo di un altro settore.
import { infoSettore, settoreDi } from '../domain/settori';
import { newPreventivo } from '../store/actions';
import { S, TABS, commit } from '../store/state';

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

/** Scheda di un settore mentre è aperto un preventivo (non vuoto) di un altro settore: si torna al suo settore o se ne inizia uno nuovo. */
export function AltroSettore() {
  const s = infoSettore(S.ui.set), suo = infoSettore(settoreDi(S.prev));
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{s.nome} · {LABEL[S.ui.tab]}</h2>
      <p>Il preventivo aperto, <b>{S.prev._nome || S.prev.cliente || 'senza nome'}</b>, è di <b>{suo.nome}</b>: le schede di {s.nome} lavorano su un preventivo di {s.nome}.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn p" onClick={() => { newPreventivo(s.k); commit(); }}>Nuovo preventivo {s.nome}</button>
        <button className="btn" onClick={() => { S.ui.set = suo.k; S.ui.area = suo.gruppo; S.ui.sopen = true; commit(); }}>Torna a {suo.nome}</button>
      </div>
    </div>
  );
}
