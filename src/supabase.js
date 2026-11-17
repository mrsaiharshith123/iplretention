import {createClient} from '@supabase/supabase-js'
// No auth is used anywhere in this app — this is a plain anon-key client.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
