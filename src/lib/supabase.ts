import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null finché .env.local non contiene URL e chiave pubblica del progetto.
export const supabase = url && key && !url.includes('xxxx') ? createClient(url, key) : null;
