// Firebase over plain HTTPS, acting as the signed-in family member. The connector never
// holds an admin key: every database call carries that person's own Firebase ID token,
// so the family's Firestore security rules decide what it may read and write.

// Public settings from the app's firebase-config.js (not secrets; the rules protect the data).
const DEFAULT_API_KEY = "AIzaSyCPJZXGrIT2YCZEjd3-RWNyPBGIW-OwxjM";
const DEFAULT_PROJECT = "happy-family-791f1";
const DEFAULT_APP_URL = "https://fwbp1tvifa.github.io/HP/";

export function firebaseSettings(env = {}) {
  const emu = env.HH_EMULATOR_HOST || null; // local testing only, e.g. "127.0.0.1"
  return {
    apiKey: env.HH_FIREBASE_API_KEY || DEFAULT_API_KEY,
    projectId: env.HH_FIREBASE_PROJECT || DEFAULT_PROJECT,
    appUrl: env.HH_APP_URL || DEFAULT_APP_URL,
    authBase: emu ? `http://${emu}:9099/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com",
    tokenBase: emu ? `http://${emu}:9099/securetoken.googleapis.com` : "https://securetoken.googleapis.com",
    firestoreBase: emu ? `http://${emu}:8080/v1` : "https://firestore.googleapis.com/v1",
    emulator: !!emu,
  };
}

/** The person's Firebase sign-in is no longer valid (password changed, account removed...). */
export class SignInExpiredError extends Error {}
/** A sign-in attempt failed; message is safe to show to the person. */
export class SignInError extends Error { constructor(message, code) { super(message); this.code = code; } }
/** Firestore refused or failed; message is safe to show. */
export class DataError extends Error { constructor(message, status) { super(message); this.status = status; } }

const TIMEOUT_MS = 8000; // Claude gives sign-in endpoints about 10 seconds
async function call(url, init, cfg) {
  const headers = { ...(init.headers || {}) };
  // The app's API key may be limited to the app's own web address; say where we come from.
  if (url.includes("googleapis.com") && !cfg.emulator) headers.Referer = cfg.appUrl;
  let res;
  try {
    res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new DataError("Couldn't reach Happy Home's database just now. Please try again in a moment.", 503);
  }
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  return { res, body };
}

const SIGNIN_MESSAGES = {
  INVALID_LOGIN_CREDENTIALS: "That email and password don't match a Happy Home account.",
  EMAIL_NOT_FOUND: "That email and password don't match a Happy Home account.",
  INVALID_PASSWORD: "That email and password don't match a Happy Home account.",
  INVALID_EMAIL: "That doesn't look like an email address.",
  MISSING_PASSWORD: "Please type your password.",
  MISSING_EMAIL: "Please type your email.",
  USER_DISABLED: "This account has been turned off.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Please wait a few minutes and try again.",
  INVALID_MFA_PENDING_CREDENTIAL: "That took too long. Please start again.",
  MFA_PENDING_CREDENTIAL_EXPIRED: "That took too long. Please start again.",
};
function signInMessage(code) {
  const key = String(code || "").split(" ")[0].split(":")[0];
  if (SIGNIN_MESSAGES[key]) return SIGNIN_MESSAGES[key];
  if (/CODE|TOTP|VERIFICATION/.test(key)) return "That code didn't work. Check the 6-digit code in your authenticator app and try again.";
  return "Sign-in didn't work just now. Please try again.";
}

/** Email + password sign-in. Returns {idToken, refreshToken, uid} or {mfa:{pending, factors}}. */
export async function signInWithPassword(cfg, email, password) {
  const { res, body } = await call(`${cfg.authBase}/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }, cfg);
  if (!res.ok) { const code = body?.error?.message; throw new SignInError(signInMessage(code), code); }
  if (body.mfaPendingCredential) {
    const factors = (body.mfaInfo || []).map(f => ({ id: f.mfaEnrollmentId, name: f.displayName || "", type: f.totpInfo ? "totp" : f.phoneInfo ? "phone" : "other" }));
    return { mfa: { pending: body.mfaPendingCredential, factors } };
  }
  return { idToken: body.idToken, refreshToken: body.refreshToken, uid: body.localId };
}

/** Second step for accounts with an authenticator app. */
export async function finishTotpSignIn(cfg, pending, enrollmentId, code) {
  const { res, body } = await call(`${cfg.authBase}/v2/accounts/mfaSignIn:finalize?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaPendingCredential: pending, mfaEnrollmentId: enrollmentId, totpVerificationInfo: { verificationCode: code } }),
  }, cfg);
  if (!res.ok) { const c = body?.error?.message; throw new SignInError(signInMessage(c), c); }
  return { idToken: body.idToken, refreshToken: body.refreshToken, uid: uidFromIdToken(body.idToken) };
}

/** Swap a long-lived Firebase refresh token for a fresh one-hour ID token. */
export async function refreshIdToken(cfg, refreshToken) {
  const { res, body } = await call(`${cfg.tokenBase}/v1/token?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  }, cfg);
  if (!res.ok) {
    const code = String(body?.error?.message || "");
    if (res.status === 400 || res.status === 401 || res.status === 403 || /TOKEN|USER_|INVALID/.test(code)) throw new SignInExpiredError(code || "refresh failed");
    throw new DataError("Couldn't reach Happy Home's sign-in service just now. Please try again in a moment.", 503);
  }
  return { idToken: body.id_token, refreshToken: body.refresh_token || refreshToken, uid: body.user_id, expiresIn: +body.expires_in || 3600 };
}

export function uidFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString()).user_id || null; } catch { return null; }
}

/* ---------------- ID token cache (per server instance, memory only) ---------------- */
const tokenCache = new Map();
export async function idTokenFor(cfg, refreshToken) {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.until > Date.now()) return hit;
  const r = await refreshIdToken(cfg, refreshToken);
  const entry = { idToken: r.idToken, uid: r.uid, until: Date.now() + Math.max(60, r.expiresIn - 300) * 1000 };
  if (tokenCache.size > 200) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(refreshToken, entry);
  return entry;
}
export function forgetIdToken(refreshToken) { tokenCache.delete(refreshToken); }

/* ---------------- Firestore values ---------------- */
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) && !Object.is(v, -0) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  throw new Error("unsupported value");
}
export function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}
export function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return { lat: v.geoPointValue.latitude, lng: v.geoPointValue.longitude };
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}
export function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}

/* ---------------- Firestore REST client ---------------- */
const SAFE_SEGMENT = /^[A-Za-z0-9_\-]{1,120}$/;
export function safeId(id) {
  const s = String(id ?? "");
  if (!SAFE_SEGMENT.test(s)) throw new DataError(`"${s.slice(0, 40)}" isn't a valid item id.`, 400);
  return s;
}

export class Firestore {
  constructor(cfg, idToken) {
    this.cfg = cfg;
    this.idToken = idToken;
    this.root = `projects/${cfg.projectId}/databases/(default)/documents`;
  }
  name(path) { return `${this.root}/${path.map(safeId).join("/")}`; }
  async _req(method, url, body) {
    const { res, body: out } = await call(url, {
      method,
      headers: { Authorization: `Bearer ${this.idToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, this.cfg);
    if (res.ok) return out;
    if (res.status === 401) throw new SignInExpiredError("id token rejected");
    const status = out?.error?.status || "";
    if (res.status === 403 || status === "PERMISSION_DENIED") throw new DataError("Happy Home says you don't have permission to do that.", 403);
    if (res.status === 404 || status === "NOT_FOUND") throw new DataError("That item doesn't exist any more. It may have been deleted.", 404);
    if (status === "ALREADY_EXISTS") throw new DataError("That item already exists.", 409);
    if (status === "FAILED_PRECONDITION" && /index/i.test(out?.error?.message || "")) throw new DataError("Happy Home's database needs an index for that search.", 500);
    throw new DataError("Happy Home's database had a problem just now. Please try again.", res.status);
  }
  /** One document as {id, ...fields}, or null if it doesn't exist. */
  async get(path) {
    try {
      const d = await this._req("GET", `${this.cfg.firestoreBase}/${this.name(path)}`);
      return { id: path[path.length - 1], ...fromFields(d.fields) };
    } catch (e) {
      if (e instanceof DataError && e.status === 404) return null;
      throw e;
    }
  }
  /** Every document in a collection, as [{id, ...fields}]. */
  async list(path, max = 5000) {
    const out = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({ pageSize: "300" }); if (pageToken) q.set("pageToken", pageToken);
      const d = await this._req("GET", `${this.cfg.firestoreBase}/${this.name(path)}?${q}`);
      for (const doc of d?.documents || []) out.push({ id: doc.name.split("/").pop(), ...fromFields(doc.fields) });
      pageToken = d?.nextPageToken || "";
    } while (pageToken && out.length < max);
    return out;
  }
  /** Documents in parent/collectionId where field is between from and to (inclusive). */
  async range(parentPath, collectionId, field, from, to) {
    const filters = [];
    if (from) filters.push({ fieldFilter: { field: { fieldPath: field }, op: "GREATER_THAN_OR_EQUAL", value: toValue(from) } });
    if (to) filters.push({ fieldFilter: { field: { fieldPath: field }, op: "LESS_THAN_OR_EQUAL", value: toValue(to) } });
    const structuredQuery = { from: [{ collectionId: safeId(collectionId) }] };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
    const rows = await this._req("POST", `${this.cfg.firestoreBase}/${this.name(parentPath)}:runQuery`, { structuredQuery });
    return (rows || []).filter(r => r.document).map(r => ({ id: r.document.name.split("/").pop(), ...fromFields(r.document.fields) }));
  }
  /** Apply several writes in one go (all or nothing). */
  async commit(writes) {
    if (!writes.length) return;
    for (let i = 0; i < writes.length; i += 400) {
      await this._req("POST", `${this.cfg.firestoreBase}/${this.root}:commit`, { writes: writes.slice(i, i + 400) });
    }
  }
  // Write builders for commit()
  set(path, data) { return { update: { name: this.name(path), fields: toFields(data) } }; }
  create(path, data) { return { update: { name: this.name(path), fields: toFields(data) }, currentDocument: { exists: false } }; }
  patch(path, fields) {
    return { update: { name: this.name(path), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields).filter(k => fields[k] !== undefined).map(k => /^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : "`" + k.replace(/[`\\]/g, "\\$&") + "`") }, currentDocument: { exists: true } };
  }
  remove(path) { return { delete: this.name(path) }; }
}
