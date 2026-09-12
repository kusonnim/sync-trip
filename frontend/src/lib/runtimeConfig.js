const env = import.meta.env ?? {};
const forcedSyncMode = globalThis.__SYNCTRIP_SYNC_MODE__;
const forcedApiMode = globalThis.__SYNCTRIP_API_MODE__;

export const SYNC_MODE = forcedSyncMode || env.VITE_SYNC_MODE || (env.DEV ? 'mock' : 'firestore');
export const API_MODE = forcedApiMode || env.VITE_API_MODE || (env.DEV ? 'mock' : 'backend');
export const API_BASE = (env.VITE_API_BASE || '').replace(/\/$/, '');

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export function validateRuntimeConfig() {
  if (!['mock', 'firestore'].includes(SYNC_MODE)) throw new Error('VITE_SYNC_MODE must be either "mock" or "firestore".');
  if (!['mock', 'backend'].includes(API_MODE)) throw new Error('VITE_API_MODE must be either "mock" or "backend".');
  if (API_MODE === 'backend' && !API_BASE) throw new Error('The backend URL is missing. Set VITE_API_BASE or use VITE_API_MODE=mock for a local demo.');
  if (SYNC_MODE === 'firestore') {
    const missing = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) throw new Error(`Firebase configuration is incomplete (${missing.join(', ')}).`);
  }
}
