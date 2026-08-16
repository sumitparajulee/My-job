// api/auth/google/exchange.js
// Deploy path: Vercel auto-maps this to POST /api/auth/google/exchange
// No manual deployment step needed — it ships with `vercel deploy` / git push,
// same as your frontend, as long as this file lives under /api at repo root.

import { verifyFirebaseToken } from "../../_lib/firebaseAdmin.js";
import { saveRefreshTokenForUser } from "../../_lib/googleTokens.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseToken(req);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or missing auth token" });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: "postmessage", // required for the popup/code-client flow
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokens);
      return res.status(502).json({ error: "Google token exchange failed" });
    }

    if (!tokens.refresh_token) {
      // Happens if the user previously connected and Google skipped issuing
      // a new refresh_token. prompt=consent on the frontend should prevent
      // this, but handle it gracefully just in case.
      return res.status(200).json({
        connected: true,
        warning: "No new refresh token issued (already connected).",
      });
    }

    await saveRefreshTokenForUser(decodedToken.uid, tokens.refresh_token);

    return res.status(200).json({ connected: true });
  } catch (err) {
    console.error("Exchange error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
