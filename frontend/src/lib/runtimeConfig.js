const env = import.meta.env ?? {};
const forcedSyncMode = globalThis.__SYNCTRIP_SYNC_MODE__;
const forcedApiMode = globalThis.__SYNCTRIP_API_MODE__;

export const SYNC_MODE = forcedSyncMode || env.VITE_SYNC_MODE || (env.DEV ? 'mock' : 'supabase');
export const API_MODE = forcedApiMode || env.VITE_API_MODE || (env.DEV ? 'mock' : 'backend');
export const API_BASE = (env.VITE_API_BASE || '').replace(/\/$/, '');

export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export function validateRuntimeConfig() {
  if (!['mock', 'supabase'].includes(SYNC_MODE)) throw new Error('VITE_SYNC_MODE must be either "mock" or "supabase".');
  if (!['mock', 'backend'].includes(API_MODE)) throw new Error('VITE_API_MODE must be either "mock" or "backend".');
  if (API_MODE === 'backend' && !API_BASE) throw new Error('The backend URL is missing. Set VITE_API_BASE or use VITE_API_MODE=mock for a local demo.');
  if (SYNC_MODE === 'supabase' && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Supabase configuration is incomplete. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
}
