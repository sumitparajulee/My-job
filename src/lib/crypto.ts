// PBKDF2-SHA256 password hashing via the browser's native Web Crypto API.
// Nothing here is sent anywhere — it only gates the local UI. The plaintext
// password never touches storage, only a salted hash does.

const ITERATIONS = 150_000;

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bufToBase64(bits);
}

export interface StoredCredential {
  salt: string; // base64
  hash: string; // base64
}

export async function createCredential(password: string): Promise<StoredCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt);
  return { salt: bufToBase64(salt.buffer as ArrayBuffer), hash };
}

// Plain `===` on the two base64 strings would short-circuit at the first
// differing character, which leaks timing information about how much of
// the hash matched. It's a mild concern at best for a local-only lock
// screen with no network round-trip to measure, but a constant-time
// comparison costs nothing here, so we use one anyway.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyCredential(
  password: string,
  credential: StoredCredential,
): Promise<boolean> {
  const salt = base64ToBuf(credential.salt);
  const hash = await deriveHash(password, salt);
  return timingSafeEqual(hash, credential.hash);
}
