// Sealed tokens: everything the connector hands out (client ids, sign-in page state,
// authorization codes, access and refresh tokens) is a small JSON payload encrypted
// with AES-256-GCM under a key derived from the HH_SECRET setting. The server keeps
// no database: a token is only valid if this server made it, it is for the stated
// purpose (the purpose is bound in as associated data), and it has not expired.

const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const MIN_SECRET_LENGTH = 32;
/** A usable HH_SECRET: long, and random-looking rather than a repeated word or a placeholder. */
export const secretOk = s => typeof s === "string" && s.length >= MIN_SECRET_LENGTH && new Set(s).size >= 8 && !/(^|[-_ .])(your|secret|change|example|random)([-_ .]|$)/i.test(s);

let cachedSecret = null, cachedKey = null;
async function keyFor(secret) {
  if (cachedSecret !== secret) {
    cachedSecret = secret;
    cachedKey = (async () => {
      const base = await subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
      return subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode("happy-home-claude-connector"), info: enc.encode("sealed-token-v1") },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    })();
  }
  return cachedKey;
}

const PREFIX = { client: "hhc", req: "hhq", mfa: "hhm", code: "hha", access: "hht", refresh: "hhr" };

export async function seal(secret, purpose, payload, ttlSeconds) {
  if (!PREFIX[purpose]) throw new Error("unknown token purpose");
  const body = enc.encode(JSON.stringify({ d: payload, p: purpose, x: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(purpose) }, await keyFor(secret), body));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return PREFIX[purpose] + "_" + Buffer.from(out).toString("base64url");
}

// Returns the payload, or null if the token is not ours, is for another purpose, or has expired.
export async function unseal(secret, purpose, token) {
  try {
    if (typeof token !== "string" || token.length > 8192 || !token.startsWith(PREFIX[purpose] + "_")) return null;
    const body = token.slice(4), raw = Buffer.from(body, "base64url");
    if (raw.toString("base64url") !== body) return null;   // one spelling per token, so a used code can't be re-spelled
    if (raw.length < 12 + 16) return null;
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: enc.encode(purpose) }, await keyFor(secret), raw.subarray(12));
    const data = JSON.parse(dec.decode(pt));
    if (data.p !== purpose || !(data.x > Date.now() / 1000) || !data.d || typeof data.d !== "object") return null;
    return data.d;
  } catch { return null; }
}

export async function sha256base64url(text) {
  return Buffer.from(await subtle.digest("SHA-256", enc.encode(text))).toString("base64url");
}

export async function pkceMatches(verifier, challenge) {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  if (typeof challenge !== "string") return false;
  return (await sha256base64url(verifier)) === challenge;
}

// Document ids in the same style as the app (random letters and digits).
export function newId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  let s = ""; for (const b of bytes) s += alphabet[b % 36];
  return s;
}
