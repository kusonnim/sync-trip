import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SYNC_MODE, validateRuntimeConfig } from './runtimeConfig.js';

let client = null;

export function getSupabase() {
  if (SYNC_MODE !== 'supabase') return null;
  validateRuntimeConfig();
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
