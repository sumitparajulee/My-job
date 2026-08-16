// api/_lib/getFreshAccessToken.js
// Deploy path: shared helper, imported by any /api endpoint that needs to
// call Google Drive/Sheets/Gmail on the user's behalf.

import { getRefreshTokenForUser } from "./googleTokens.js";

export async function getFreshAccessToken(uid) {
  const refreshToken = await getRefreshTokenForUser(uid);
  if (!refreshToken) {
    const err = new Error("No connected Google account for this user");
    err.code = "NOT_CONNECTED";
    throw err;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    // invalid_grant usually means the user revoked access on Google's side
    const err = new Error(data.error_description || "Failed to refresh access token");
    err.code = data.error === "invalid_grant" ? "REVOKED" : "REFRESH_FAILED";
    throw err;
  }

  return data.access_token;
}
