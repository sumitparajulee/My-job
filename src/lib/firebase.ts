import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// All six values come straight from the Firebase console (Project
// Settings -> your app's config snippet) — copy/paste, no CLI. If any are
// missing, sync is off and the app runs fully local, same as before.
export const isSyncConfigured = Boolean(config.apiKey && config.projectId);

export const app: FirebaseApp | null = isSyncConfigured ? initializeApp(config) : null;
export const dbFirestore: Firestore | null = app ? getFirestore(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;

if (dbFirestore) {
  // Firestore's own offline queue: writes made while offline are cached
  // and automatically retried on reconnect, and cached reads work
  // immediately on reload. This is why the Firebase version doesn't need
  // its own hand-rolled outbox table the way the Supabase/Convex versions
  // did — the SDK already does it.
  enableIndexedDbPersistence(dbFirestore).catch(() => {
    // Fails if multiple tabs are open (only one tab can hold the
    // persistence lock) or the browser doesn't support it — sync still
    // works, it just won't have offline cache in that tab.
  });
}
