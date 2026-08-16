// api/_lib/googleTokens.js
// Deploy path: shared helper, imported by the actual /api endpoint files.
// Stores each user's Google refresh token in Firestore under
// collection "googleTokens", document ID = Firebase uid.

import { db } from "./firebaseAdmin.js";

export async function saveRefreshTokenForUser(uid, refreshToken) {
  await db.collection("googleTokens").doc(uid).set(
    {
      refreshToken,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function getRefreshTokenForUser(uid) {
  const doc = await db.collection("googleTokens").doc(uid).get();
  if (!doc.exists) return null;
  return doc.data().refreshToken || null;
}
