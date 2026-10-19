// Funzione Vercel: invito di un nuovo utente. Serve la chiave service_role, che resta solo sul server
// (variabile d'ambiente SUPABASE_SERVICE_ROLE_KEY su Vercel, mai con prefisso VITE_).
// Ruolo, nome e attivazione si cambiano invece dal browser: li protegge la RLS della tabella utenti.
import { createClient } from '@supabase/supabase-js';

const DOMINIO = '@terranovasrl.net';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Sul server manca SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Chi chiama deve essere un amministratore attivo.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const me = who.user?.email?.toLowerCase();
  if (!me) return json(401, { error: 'Accesso scaduto: esci e rientra.' });
  const { data: row } = await admin.from('utenti').select('ruolo, attivo').eq('email', me).maybeSingle();
  if (!row || !row.attivo || row.ruolo !== 'admin') return json(403, { error: 'Solo un amministratore può invitare utenti.' });

  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase(), nome = String(b.nome || '').trim() || null, ruolo = b.ruolo === 'admin' ? 'admin' : 'utente';
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || !email.endsWith(DOMINIO)) return json(400, { error: `Serve un'email aziendale ${DOMINIO}.` });

  const { error: e1 } = await admin.from('utenti').upsert({ email, nome, ruolo, attivo: true, invitato_da: me });
  if (e1) return json(500, { error: e1.message });
  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const { error: e2 } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: origin });
  // Account gia' esistente (es. creato a mano o riattivato): basta l'abilitazione, la password l'ha gia'.
  if (e2 && !/already|registered|exists/i.test(e2.message)) return json(500, { error: 'Invito non inviato: ' + e2.message });
  return json(200, { ok: true, esistente: !!e2 });
}
