// Google auth, client-side only — consistent with the rest of Docket's
// "no backend" architecture (same reason Firebase sync and GitHub Gist
// sync both talk directly from the browser).
//
// Google Identity Services (GIS) issues short-lived access tokens
// (~1 hour) with no refresh token exposed to browser JS — that's
// deliberate on Google's part, refresh tokens are only handed to
// confidential (server-side) clients. Practical effect for Docket:
// - While the app is open, a silent (non-interactive) token request
//   usually succeeds and keeps things working without prompts.
// - If the browser's Google session/consent has lapsed (or this is the
//   very first connection), a token request needs an actual click —
//   silent requests can't summon a consent popup out of nowhere.
// This is why the daily Drive backup is "best-effort while the app is
// open," not a true OS-level background job — doing that for real would
// need a small server holding a refresh token (out of scope here, but
// straightforward to add later with something like a Cloudflare Worker
// if it's ever wanted).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// drive.file: Docket can only see/edit files IT creates (the backup file
// and the tracking spreadsheet) — never arbitrary files already in your
// Drive. spreadsheets: read/write access to Sheets content.
//
// gmail.modify + gmail.send: the Mail page needs more than read-only —
// it also flips the unread flag when you open a message (via Gmail's
// messages.modify endpoint), which gmail.readonly doesn't permit.
// gmail.modify covers list/read/attachments/labels/mark-as-read;
// gmail.send covers sending, replying, and forwarding. Together these
// cover every Gmail call Docket makes (Inbox Signals scan, the Mail
// page, and notification emails) while still leaving out the two
// things Docket never does: permanently deleting mail and changing
// account settings — both only reachable with the full
// https://mail.google.com/ scope, which isn't requested here.
//
// Widening or narrowing this list changes what consent Google asks
// for — anyone who already connected under an old scope set will be
// prompted to re-consent the next time they connect (silent reconnect
// will fail until they do).
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export const isGoogleConfigured = Boolean(CLIENT_ID);

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

// interactive=true shows Google's account picker/consent popup (needs to
// run inside a click handler). interactive=false tries to get a token
// with no UI at all — succeeds if there's already a live consent, throws
// otherwise.
async function requestToken(interactive: boolean): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      'Google isn\u2019t configured yet \u2014 add VITE_GOOGLE_CLIENT_ID to your environment.',
    );
  }
  await loadGisScript();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        accessToken = response.access_token;
        // Trim a minute off the real expiry as a safety margin so a call
        // never starts mid-flight with a token that expires underneath it.
        tokenExpiresAt = Date.now() + (response.expires_in || 3600) * 1000 - 60_000;
        resolve(response.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || err.type || 'Google sign-in failed')),
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

// Call from a click handler — the one time a popup is expected/allowed.
export function connectGoogle(): Promise<string> {
  return requestToken(true);
}

// Returns a usable token without prompting, or null if one isn't
// available right now (caller should treat null as "ask the user to hit
// Connect again"). Safe to call from a background timer.
export async function getSilentToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  try {
    return await requestToken(false);
  } catch {
    return null;
  }
}

export function disconnectGoogle(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
}
