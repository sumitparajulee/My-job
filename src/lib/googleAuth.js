// src/lib/googleAuth.js
// Path: src/lib/googleAuth.js  (overwrite the existing one)
//
// Client-side only — no backend required. Loads the Google Identity
// Services script itself (so index.html doesn't need it, and there's no
// race condition), then uses the token client: connectGoogle() does the
// one-time popup consent, and getSilentToken() re-requests a token with
// prompt:'' (no UI) whenever the cached one has expired.

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

export const isGoogleConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

let tokenClient = null;
let currentToken = null;
let tokenExpiresAt = 0; // ms epoch
let gisLoadPromise = null;

/**
 * Loads the Google Identity Services script if it isn't already present,
 * and resolves once window.google.accounts.oauth2 is actually usable.
 * Safe to call many times — subsequent calls reuse the same promise.
 */
function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) {
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

    const onReady = () => {
      // The script can fire "load" slightly before window.google is
      // populated in rare cases — poll briefly as a safety net.
      const start = Date.now();
      const check = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else if (Date.now() - start > 5000) {
          reject(new Error('Google Identity Services loaded but oauth2 API is unavailable.'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    };

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', onReady, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')), { once: true });
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function getTokenClient() {
  if (!isGoogleConfigured) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set.');
  }
  await loadGoogleIdentityServices();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // overridden per-call below
    });
  }
  return tokenClient;
}

/**
 * One-time interactive connect — shows the Google consent popup.
 * Call this from a user click (e.g. "Connect Google" button).
 * Resolves with the access token on success.
 */
export async function connectGoogle() {
  const client = await getTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      currentToken = response.access_token;
      tokenExpiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
      resolve(currentToken);
    };
    client.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Revokes the current token and clears local state.
 */
export function disconnectGoogle() {
  if (currentToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(currentToken, () => {});
  }
  currentToken = null;
  tokenExpiresAt = 0;
}

/**
 * Returns a valid access token, refreshing silently (no popup) if the
 * cached one has expired. Returns null if silent refresh fails — e.g.
 * the browser blocked third-party auth, or the user revoked access on
 * Google's side. Callers (see useGoogleStore.ts) already treat null as
 * "session expired, mark disconnected."
 */
export async function getSilentToken() {
  if (currentToken && Date.now() < tokenExpiresAt) {
    return currentToken;
  }

  let client;
  try {
    client = await getTokenClient();
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    client.callback = (response) => {
      if (response.error) {
        resolve(null);
        return;
      }
      currentToken = response.access_token;
      tokenExpiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
      resolve(currentToken);
    };
    // prompt: '' asks Google to reuse the existing session silently,
    // with no popup and no visible UI, if at all possible.
    client.requestAccessToken({ prompt: '' });
  });
}
