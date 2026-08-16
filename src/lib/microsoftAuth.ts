// Microsoft auth, client-side only — same "no backend" shape as
// googleAuth.ts. Uses MSAL.js (SPA flow) instead of a hand-rolled
// popup/redirect handler, since @azure/msal-browser already handles
// token caching, silent renewal, and multi-tab session sync for us.
//
// Like Google's GIS, MSAL's browser flow issues short-lived access
// tokens with no long-lived refresh token exposed to JS (delegated
// tokens for public clients are intentionally capped, ~60-90 min).
// MSAL caches the session (localStorage) so acquireTokenSilent usually
// succeeds without a popup across reloads — but if that session lapses,
// a real interactive popup is needed. Same practical effect as Google:
// daily OneDrive backup and live Excel sync are "best-effort while the
// app is open," not a true background job.

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser';

const CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;

export const isMicrosoftConfigured = Boolean(CLIENT_ID);

// Files.ReadWrite.AppFolder: Docket can only read/write inside a
// dedicated "Apps/Docket" folder OneDrive creates for this app — it
// cannot browse or touch anything else already in the account.
// User.Read: basic profile read, used only to confirm which account is
// connected. Both are delegated Graph permissions that don't need admin
// consent for personal Microsoft accounts.
const SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read'];

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID ?? '',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

// PublicClientApplication.initialize() is required before any other
// MSAL call as of msal-browser v3 — lazily created and cached so
// callers never have to think about init ordering.
async function getInstance(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = new PublicClientApplication(msalConfig);
    await instance.initialize();
    // Handles the redirect-back leg if this load is returning from a
    // popup/redirect; a no-op most of the time since Connect uses
    // loginPopup below rather than a full-page redirect.
    await instance.handleRedirectPromise();
    msalInstance = instance;
    return instance;
  })();
  return initPromise;
}

function getCachedAccount(instance: PublicClientApplication): AccountInfo | null {
  const accounts = instance.getAllAccounts();
  return accounts[0] ?? null;
}

// Call from a click handler — the one time a popup is expected/allowed.
export async function connectMicrosoft(): Promise<{ token: string; account: AccountInfo }> {
  if (!CLIENT_ID) {
    throw new Error(
      'Microsoft isn\u2019t configured yet \u2014 add VITE_MICROSOFT_CLIENT_ID to your environment.',
    );
  }
  const instance = await getInstance();
  const result = await instance.loginPopup({ scopes: SCOPES });
  instance.setActiveAccount(result.account);
  return { token: result.accessToken, account: result.account };
}

// Returns a usable token without prompting, or null if one isn't
// available (caller should treat null as "ask the user to hit Connect
// again"). Safe to call from a background timer.
export async function getSilentToken(): Promise<string | null> {
  if (!CLIENT_ID) return null;
  const instance = await getInstance();
  const account = instance.getActiveAccount() ?? getCachedAccount(instance);
  if (!account) return null;

  try {
    const result = await instance.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (err) {
    // InteractionRequiredAuthError means the cached session genuinely
    // needs a fresh interactive sign-in — nothing silent can fix that.
    // Any other error (network blip, etc.) is also treated as "not
    // available right now" rather than thrown, matching getSilentToken's
    // contract in googleAuth.ts.
    if (err instanceof InteractionRequiredAuthError) return null;
    return null;
  }
}

// Silent-only reconnect for app load — never pops a window. Returns
// true if a cached session picked back up without any prompt.
export async function trySilentMicrosoftReconnect(): Promise<boolean> {
  const token = await getSilentToken();
  return token !== null;
}

export async function disconnectMicrosoft(): Promise<void> {
  if (!CLIENT_ID) return;
  const instance = await getInstance();
  const account = instance.getActiveAccount() ?? getCachedAccount(instance);
  if (account) {
    await instance.clearCache({ account });
  }
}
