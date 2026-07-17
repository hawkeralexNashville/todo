import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service role key.
//
// This app is single-user and lives entirely behind the password gate, so all
// database access happens server-side (route handlers) with the service role
// key. The service key is never sent to the browser.

let cached = null

export function getSupabase() {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
