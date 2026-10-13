import { useRef, useState } from 'react';
import { Fold } from '../components/Fold';
import { type ArchEntry, download, fileName, loadArch, mergeImport, newId, saveArch } from '../lib/archivio';
import { eur, fDate, fDateTime, fN } from '../lib/format';

export function Preventivi({ toast }: { toast: (m: string) => void }) {
  const [arch, setArchState] = useState<ArchEntry[]>(loadArch);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const setArch = (list: ArchEntry[]) => {
    if (saveArch(list)) setArchState(list);
  };

  const query = q.trim().toLowerCase();
  const list = arch.filter(e => !query || [e.nome, e.cliente, e.rif, e.righe].join(' ').toLowerCase().includes(query));

  const dup = (e: ArchEntry) => {
    const id = newId();
    const nome = e.nome + ' (copia)';
    setArch([{ ...structuredClone(e), id, nome, salvato: new Date().toISOString(), prev: { ...e.prev, _id: id, _nome: nome } }, ...arch]);
  };
  const del = (e: ArchEntry) => {
    if (confirm(`Eliminare definitivamente "${e.nome}" dall'archivio?`)) setArch(arch.filter(a => a.id !== e.id));
  };
  const dl = (e: ArchEntry) =>
    download(`${fileName(e.nome)}.json`, JSON.stringify({ tipo: 'preventivo', nome: e.nome, prev: e.prev, data: e.dati }));
  const exportAll = () =>
    download(`archivio_preventivi_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ tipo: 'archivio', preventivi: arch }));

  const importFile = async (f: File) => {
    try {
      const r = mergeImport(arch, JSON.parse(await f.text()));
      setArch(r.list);
      toast(`${r.n} preventiv${r.n === 1 ? 'o importato' : 'i importati'} nell'archivio`);
    } catch (err) {
      alert('Impossibile importare il file: ' + (err as Error).message);
    }
  };

  const nonAncora = () => toast('La configurazione del preventivo non è ancora migrata');

  return (
    <>
      <div className="card head">
        <div className="headrow">
          <div>
            <h2>Archivio preventivi</h2>
            <p className="hint" style={{ margin: 0 }}>
              {arch.length} preventiv{arch.length === 1 ? 'o salvato' : 'i salvati'} in questo browser. Ogni preventivo conserva anche il listino usato.
            </p>
          </div>
          <span className="sp" />
          <input placeholder="Cerca per nome, cliente, commessa…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />
          <button className="btn p" onClick={nonAncora}>+ Nuovo preventivo</button>
        </div>
      </div>

      {!list.length ? (
        <div className="card">
          <div className="empty">
            {arch.length ? (
              'Nessun preventivo corrisponde alla ricerca.'
            ) : (
              <>L'archivio è vuoto. Importa l'archivio esportato dall'app precedente da <b>Backup e trasferimento</b>.</>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="arch">
              <thead>
                <tr>
                  <th>Preventivo</th>
                  <th>Commessa</th>
                  <th>Tracker</th>
                  <th className="n">kWp</th>
                  <th className="n">Costo</th>
                  <th className="n">Prezzo</th>
                  <th>Salvato</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map(e => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.nome}</b>
                      <div className="muted small">{e.cliente || '–'}</div>
                    </td>
                    <td>
                      {e.rif || '–'}
                      <div className="muted small">{fDate(e.data)}</div>
                    </td>
                    <td className="small">{e.righe}</td>
                    <td className="n">{fN(e.kwp, 2)}</td>
                    <td className="n">{eur(e.totale)}</td>
                    <td className="n">
                      <b>{e.prezzo != null ? eur(e.prezzo) : '–'}</b>
                    </td>
                    <td className="small muted">{fDateTime(e.salvato)}</td>
                    <td className="acts">
                      <button className="btn s p" onClick={nonAncora}>Apri</button>
                      <button className="btn s" onClick={() => dup(e)} title="Duplica">Duplica</button>
                      <button className="btn s" onClick={() => dl(e)} title="Scarica come file">Scarica</button>
                      <button className="btn x" onClick={() => del(e)} title="Elimina">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Fold title="Backup e trasferimento" sum="Esporta tutto l'archivio su file o importa preventivi da file (per altri PC o colleghi)">
        <p className="hint">
          L'archivio vive nel browser di questo PC. Per sicurezza esportalo ogni tanto su file; il file si importa da qui su un altro PC.
        </p>
        <div className="toolbar">
          <button className="btn" onClick={exportAll} disabled={!arch.length}>Esporta tutto l'archivio</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importa da file…</button>
          <span className="muted">Accetta l'archivio completo esportato dall'app precedente.</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hide"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </Fold>
    </>
  );
}
