// src/lib/googleAuth.js
// Path: src/lib/googleAuth.js  (overwrite the existing one)
//
// Client-side only — no backend required. Uses Google Identity Services'
// token client: connectGoogle() does the one-time popup consent, and
// getSilentToken() re-requests a token with prompt:'' (no UI) whenever
// the cached one has expired. As long as the browser still has an active
// Google session and isn't blocking third-party auth, this refreshes
// silently in the background — matching what useGoogleStore.ts already
// expects from every one of these functions.
//
// Requires this script tag in index.html:
//   <script src="https://accounts.google.com/gsi/client" async defer></script>

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

function getTokenClient() {
  if (!isGoogleConfigured) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set.');
  }
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services script not loaded yet. Check index.html.');
  }
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
export function connectGoogle() {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = getTokenClient();
    } catch (err) {
      reject(err);
      return;
    }
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
export function getSilentToken() {
  if (currentToken && Date.now() < tokenExpiresAt) {
    return Promise.resolve(currentToken);
  }

  return new Promise((resolve) => {
    let client;
    try {
      client = getTokenClient();
    } catch {
      resolve(null);
      return;
    }
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
