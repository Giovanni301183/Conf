import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Link ricevuto per email (invito o recupero password): va letto prima che il client ripulisca l'indirizzo.
export const linkType = /type=(invite|recovery)/.exec(location.hash)?.[1] ?? null;

// Null finché .env.local non contiene URL e chiave pubblica del progetto (e nei test): l'app resta solo nel browser.
export const supabase = url && key && !url.includes('xxxx') && import.meta.env.MODE !== 'test' ? createClient(url, key) : null;
