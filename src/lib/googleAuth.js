// src/lib/googleAuth.js
// Deploy path: part of your normal frontend build (Vite). No separate deployment.
// Requires this script tag in index.html:
//   <script src="https://accounts.google.com/gsi/client" async defer></script>

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

/**
 * Starts the one-time Google consent flow. Only needs to run once per user
 * (or again if they revoke access) — after this, all token refreshing
 * happens silently on the backend, no more popups.
 *
 * @param {string} firebaseIdToken - current user's Firebase ID token, used
 *   so the backend knows which account to attach the Google refresh token to.
 * @returns {Promise<void>} resolves when the backend confirms it's connected.
 */
export function connectGoogleAccount(firebaseIdToken) {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      reject(new Error("Google Identity Services script not loaded yet. Check index.html."));
      return;
    }

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      ux_mode: "popup",
      access_type: "offline", // required to receive a refresh_token
      prompt: "consent",      // forces refresh_token issuance even for returning users
      callback: async (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        try {
          const res = await fetch("/api/auth/google/exchange", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${firebaseIdToken}`,
            },
            body: JSON.stringify({ code: response.code }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Exchange failed with status ${res.status}`);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      },
    });

    client.requestCode();
  });
}
