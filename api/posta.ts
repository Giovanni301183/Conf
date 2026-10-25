// Funzione Vercel: pagina ponte per il pulsante «Apri nell'app di posta» della bozza mandata su Telegram (vedi _email.ts).
// I pulsanti di Telegram accettano solo indirizzi https: questa pagina riceve a, oggetto e testo e apre l'app Gmail
// del telefono con la mail gia' compilata (Android: intent verso Gmail; iPhone: googlegmail://), cosi' non parte
// l'app di posta predefinita, che puo' avere un altro account. Resta un link mailto per chi usa un'altra app. Non salva e non invia niente.
import { linkPosta } from '../src/domain/posta.js';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function GET(req: Request) {
  const q = new URL(req.url).searchParams, a = (q.get('a') || '').trim(), su = q.get('su') || '', body = q.get('body') || '';
  const { gmail, mailto } = linkPosta(a, su, body, req.headers.get('user-agent') || '');
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bozza email</title><style>body{font:16px system-ui,sans-serif;margin:0;padding:24px 16px;background:#f6f7f5;color:#1d2b22}
a.b{display:block;text-align:center;background:#1f6b3a;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;margin:16px 0}
a.s{display:block;text-align:center;color:#1f6b3a;margin:8px 0 16px}p.n{font-size:14px;color:#55635a}
pre{white-space:pre-wrap;background:#fff;border:1px solid #dde3dc;border-radius:8px;padding:12px;font:14px system-ui,sans-serif}</style></head>
<body><h3>✉️ ${esc(su || 'Bozza email')}</h3>${a ? `<p>A: ${esc(a)}</p>` : ''}
<a class="b" href="${esc(gmail)}">Apri in Gmail</a>
<p class="n">Se in Gmail hai più account, controlla il mittente nel campo «Da» prima di premere Invia.</p>
<a class="s" href="${esc(mailto)}">Usa un'altra app di posta</a><pre>${esc(body)}</pre>
<script>location.href=${JSON.stringify(gmail).replace(/</g, '\\u003c')};</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
