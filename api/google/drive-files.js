// api/google/drive-files.js
// Deploy path: Vercel auto-maps this to GET /api/google/drive-files
// Same deploy mechanism as everything else under /api — no separate step.
// Use this file as the template for any other Drive/Sheets/Gmail endpoint
// you add later (just change the Google API URL being called).

import { verifyFirebaseToken } from "../_lib/firebaseAdmin.js";
import { getFreshAccessToken } from "../_lib/getFreshAccessToken.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseToken(req);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or missing auth token" });
  }

  try {
    const accessToken = await getFreshAccessToken(decodedToken.uid);

    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=20",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!driveRes.ok) {
      const errBody = await driveRes.json().catch(() => ({}));
      console.error("Drive API error:", errBody);
      return res.status(502).json({ error: "Drive API request failed" });
    }

    const data = await driveRes.json();
    return res.status(200).json(data);
  } catch (err) {
    if (err.code === "NOT_CONNECTED") {
      return res.status(409).json({ error: "Google account not connected", code: err.code });
    }
    if (err.code === "REVOKED") {
      return res.status(409).json({ error: "Google access was revoked, please reconnect", code: err.code });
    }
    console.error("Drive endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
