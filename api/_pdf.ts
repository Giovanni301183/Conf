// Conversione dell'offerta in PDF con ConvertAPI: la usano il bot Telegram (_preventivo) e la web app (/api/pdf).

/** PowerPoint → PDF con ConvertAPI (usa i caratteri incorporati nel modello). null se non c'e' il token o la conversione non riesce. */
export async function inPdf(pptx: Uint8Array, nome: string): Promise<Uint8Array | null> {
  const token = process.env.CONVERTAPI_TOKEN;
  if (!token) return null;
  const fd = new FormData();
  fd.append('File', new Blob([pptx as BlobPart]), nome);
  const r = await fetch('https://v2.convertapi.com/convert/pptx/to/pdf', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).catch(() => null);
  const j: any = r?.ok ? await r.json().catch(() => null) : null;
  const dati = j?.Files?.[0]?.FileData;
  return dati ? new Uint8Array(Buffer.from(dati, 'base64')) : null;
}
