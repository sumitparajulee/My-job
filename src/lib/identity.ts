import {
  GoogleAuthProvider,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth as authFirebase } from '@/lib/firebase';

// Login model: Google sign-in or email/password, both restricted to the
// same allowlist. This used to be three interchangeable ways in — an
// access code, GitHub, or Google — intentional for a multi-user shared
// workspace. This deployment is Sumit's personal instance, and the
// access code (anyone who had the string could create a fresh anonymous
// identity and join the workspace) and GitHub (any GitHub account) were
// both open doors that had nothing to do with who was actually signing
// in. Google and email/password, each restricted to ALLOWED_EMAILS, are
// the only paths left: neither can be handed to or guessed by anyone
// else, and pinning both to the same two identities is also what keeps
// sync unambiguous — every device resolves to one of exactly two
// Firebase uids instead of a different anonymous one per browser.
const ALLOWED_EMAILS = ['sumitparazulee@gmail.com', 'hello@cmparajuli.com.np'];

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

const persistenceReady = authFirebase
  ? setPersistence(authFirebase, browserLocalPersistence)
  : Promise.resolve();

export function getCurrentUser(): User | null {
  return authFirebase?.currentUser ?? null;
}

// Signs this browser in via Google OAuth (a popup). Rejects — signs
// back out immediately and throws — any account whose email isn't in
// ALLOWED_EMAILS, so no other Google account can ever reach a
// workspace even if someone has the app URL.
export async function signInWithGoogle(): Promise<User> {
  if (!authFirebase) {
    throw new Error('Firebase auth is not configured');
  }
  await persistenceReady;
  const result = await signInWithPopup(authFirebase, new GoogleAuthProvider());
  if (!isAllowedEmail(result.user.email)) {
    await signOut(authFirebase);
    throw new Error(
      `This app is only associated with ${ALLOWED_EMAILS.join(' or ')}. Other accounts are restricted.`,
    );
  }
  return result.user;
}

// Second sign-in path: email/password. Checks the allowlist *before*
// ever calling Firebase — an email that isn't sumitparazulee@gmail.com
// or hello@cmparajuli.com.np is rejected locally, no network round trip,
// no password-guessing surface exposed for accounts that could never
// succeed anyway. If the address is allowed but Firebase rejects the
// password (or the account doesn't exist — accounts for this app are
// created manually in the Firebase console, there's no self-serve
// sign-up), the underlying Firebase error is surfaced as-is.
export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!authFirebase) {
    throw new Error('Firebase auth is not configured');
  }
  const normalized = email.trim().toLowerCase();
  if (!isAllowedEmail(normalized)) {
    throw new Error(
      `This app is only associated with ${ALLOWED_EMAILS.join(' or ')}. Other accounts are restricted.`,
    );
  }
  await persistenceReady;
  const result = await signInWithEmailAndPassword(authFirebase, normalized, password);
  if (!isAllowedEmail(result.user.email)) {
    await signOut(authFirebase);
    throw new Error(
      `This app is only associated with ${ALLOWED_EMAILS.join(' or ')}. Other accounts are restricted.`,
    );
  }
  return result.user;
}

export async function signOutUser(): Promise<void> {
  if (!authFirebase) return;
  await signOut(authFirebase);
}

export function subscribeToAuthUser(
  callback: (user: User | null) => void,
): () => void {
  if (!authFirebase) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(authFirebase, callback);
}
