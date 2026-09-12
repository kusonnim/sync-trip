import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig, SYNC_MODE, validateRuntimeConfig } from './runtimeConfig.js';

let database = null;

export function getDatabase() {
  if (SYNC_MODE !== 'firestore') return null;
  validateRuntimeConfig();
  if (!database) {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    database = getFirestore(app);
  }
  return database;
}
