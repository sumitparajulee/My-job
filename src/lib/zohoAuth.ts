// Client-side-only OAuth wrapper for Zoho Mail. There is no backend in
// this app, so this uses Zoho's implicit token grant (response_type=token)
// via a popup window rather than an authorization-code + refresh-token
// flow. Practical consequences of that choice, spelled out rather than
// hidden:
// - No refresh token. The access token Zoho hands back is short-lived
//   (Zoho's default is ~1 hour), and there is no silent way to renew it.
//   connect() has to be re-run from a real user click when it expires -
//   see the "Connect" button copy in Settings.
// - The OAuth popup must be opened directly from a click handler, or
//   browsers will block it as an unrequested popup.
//
// Redirect design: Zoho is registered with a fixed callback route,
// /zoho-callback (not the app root - see vercel.json's rewrite and
// App.tsx's ZohoCallback placeholder for that path). Rather than having
// the popup postMessage the token back to the opener, connectZoho()
// itself polls the popup's own location.href from here in the opener
// window. While the popup is still on accounts.zoho.com, reading
// popup.location.href throws (cross-origin); once Zoho redirects back
// to /zoho-callback on our own origin, the read succeeds and the token
// comes straight out of the URL fragment. This means no code needs to
// run inside the popup/callback page itself - App.tsx's placeholder for
// /zoho-callback can just render "Connecting…" and do nothing else.
//
// Setup: create a "Server-based Applications" (or "Client" for implicit
// grant, depending on current Zoho API Console naming) client in the
// Zoho API Console, and add this app's URL + /zoho-callback as an
// authorized redirect URI. Put the client ID in VITE_ZOHO_CLIENT_ID.
// See ZOHO_SETUP.md.

const ZOHO_CLIENT_ID = import.meta.env.VITE_ZOHO_CLIENT_ID as string | undefined;

// Zoho's accounts/API domains differ by data center (.com for US, .eu,
// .in, .com.cn, .jp). Most personal accounts are on .com; override these
// if your Zoho Mail account lives in a different DC.
const ZOHO_ACCOUNTS_DOMAIN = import.meta.env.VITE_ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.com';
export const zohoMailApiDomain = import.meta.env.VITE_ZOHO_API_DOMAIN || 'https://mail.zoho.com';

export const isZohoConfigured = Boolean(ZOHO_CLIENT_ID);

const SCOPES = ['ZohoMail.accounts.READ', 'ZohoMail.messages.ALL'].join(',');

const LS_TOKEN = 'docket-zoho-token';
const LS_TOKEN_EXPIRES_AT = 'docket-zoho-token-expires-at';

// How often to poll the popup's location while waiting for the redirect
// back to our own origin.
const POLL_INTERVAL_MS = 500;

function redirectUri(): string {
  // Fixed path - must exactly match what's registered in the Zoho API
  // Console. vercel.json rewrites this (and every other path) to
  // index.html, and App.tsx's router renders a plain "Connecting…"
  // placeholder for it; no logic needs to live on that page.
  return window.location.origin + '/zoho-callback';
}

function cacheToken(token: string, expiresInSeconds: number): void {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_TOKEN_EXPIRES_AT, String(expiresAt));
}

export function connectZoho(): Promise<string> {
  if (!ZOHO_CLIENT_ID) {
    return Promise.reject(
      new Error('Zoho OAuth client ID is not configured (set VITE_ZOHO_CLIENT_ID).'),
    );
  }

  const authUrl =
    `${ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/auth` +
    `?response_type=token` +
    `&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    `&access_type=online` +
    `&prompt=consent`;

  const popup = window.open(authUrl, 'zoho-oauth', 'width=500,height=650');
  if (!popup) {
    return Promise.reject(new Error('Popup was blocked - allow popups for this site and try again.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearInterval(pollTimer);
    };

    const pollTimer = setInterval(() => {
      if (settled) {
        cleanup();
        return;
      }

      if (popup.closed) {
        settled = true;
        cleanup();
        reject(new Error('Zoho sign-in was closed before completing.'));
        return;
      }

      // Reading popup.location.href throws while the popup is still on
      // accounts.zoho.com (cross-origin). That's expected and just means
      // "not redirected back yet" - swallow it and keep polling. Once
      // Zoho redirects to our own origin, this read succeeds.
      let currentUrl: string;
      try {
        currentUrl = popup.location.href;
      } catch {
        return;
      }

      if (!currentUrl.startsWith(window.location.origin)) {
        return;
      }

      settled = true;
      cleanup();

      const hash = popup.location.hash;
      popup.close();

      const hashParams = new URLSearchParams(hash.slice(1));
      const accessToken = hashParams.get('access_token');
      const expiresIn = Number(hashParams.get('expires_in') || 3600);

      if (!accessToken) {
        const error = hashParams.get('error');
        reject(new Error(error ? `Zoho sign-in failed: ${error}` : 'Zoho sign-in did not return an access token.'));
        return;
      }

      cacheToken(accessToken, expiresIn);
      resolve(accessToken);
    }, POLL_INTERVAL_MS);
  });
}

export function getCachedZohoToken(): string | null {
  const token = localStorage.getItem(LS_TOKEN);
  const expiresAt = Number(localStorage.getItem(LS_TOKEN_EXPIRES_AT) || 0);
  if (!token || !expiresAt || Date.now() >= expiresAt) {
    return null;
  }
  return token;
}

export function disconnectZoho(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_TOKEN_EXPIRES_AT);
}
