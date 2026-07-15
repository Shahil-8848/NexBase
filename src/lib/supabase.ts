import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Hard-fail in development if credentials are missing or still placeholder
if (import.meta.env.DEV) {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    throw new Error(
      '[ChainArena] VITE_SUPABASE_URL is missing or still set to the placeholder value.\n' +
      'Open chainarena/.env and replace it with your real Supabase project URL.'
    )
  }
  if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
    throw new Error(
      '[ChainArena] VITE_SUPABASE_ANON_KEY is missing or still set to the placeholder value.\n' +
      'Open chainarena/.env and replace it with your real anon key from the Supabase dashboard.'
    )
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'chainarena-auth',
  },
})
