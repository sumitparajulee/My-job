// api/_lib/firebaseAdmin.js
// Deploy path: Vercel auto-deploys everything under /api as serverless functions.
// Files starting with "_" (like this folder's contents if named _lib) are NOT
// turned into routes themselves — they're just shared helpers imported by
// the actual endpoint files. This one initializes Firebase Admin once.

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store newlines as literal \n — convert them back
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const db = admin.firestore();

/**
 * Verifies the Firebase ID token sent from the frontend and returns the
 * decoded token (contains uid, email, etc). Throws if invalid/expired.
 */
export async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    throw new Error("Missing Authorization header");
  }
  return admin.auth().verifyIdToken(idToken);
}
