// Test helpers: a pretend phone (subscription keys + a receiver-side decryptor written separately from send.mjs),
// a VAPID header checker, and a fake Firebase + push world for running the sender in-process.
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from "node:crypto";
import { b64u, fsBody, fsDoc, packSecret } from "../send.mjs";

const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

/** A pretend phone: ECDH key pair + auth secret, in the shape the app stores in pushSubs. */
export function makePhone(endpoint, who) {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, authBuf: auth, doc: { who, endpoint, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth), ua: "Test", created: 1, seen: 1 } };
}

/** Receiver side of RFC 8291 / aes128gcm, written from the RFC (not shared with send.mjs). Returns { text, header }. */
export function decryptPush(body, phone) {
  const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20];
  const senderPub = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen);
  const shared = phone.ecdh.computeSecret(senderPub);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), phone.ecdh.getPublicKey(), senderPub, Buffer.from([1])]);
  const ikm = hmac(hmac(phone.authBuf, shared), info);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error("last record must end with the 0x02 delimiter");
  return { text: plain.subarray(0, end).toString("utf8"), header: { salt, rs, idlen, senderPub }, cipherLength: cipher.length };
}

/** Check "vapid t=<jwt>, k=<key>" completely. Returns { header, claims }. Throws with a reason when anything is off. */
export function checkVapid(value, expectedPubB64u, { aud, nowMs = Date.now() } = {}) {
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(String(value));
  if (!m) throw new Error("Authorization header is not 'vapid t=..., k=...'");
  const [, h, c, s, k] = m;
  if (expectedPubB64u && k !== expectedPubB64u) throw new Error("k is not the VAPID public key");
  const pub = Buffer.from(k, "base64url");
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("k is not an uncompressed P-256 point");
  const sig = Buffer.from(s, "base64url");
  if (sig.length !== 64) throw new Error("signature must be raw r|s (64 bytes), got " + sig.length);
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
  if (!verify("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" }, sig)) throw new Error("signature does not verify");
  const header = JSON.parse(Buffer.from(h, "base64url").toString()), claims = JSON.parse(Buffer.from(c, "base64url").toString());
  if (header.typ !== "JWT" || header.alg !== "ES256") throw new Error("JWT header must be typ JWT, alg ES256");
  if (aud !== undefined && claims.aud !== aud) throw new Error(`aud is ${claims.aud}, expected ${aud}`);
  const left = claims.exp - nowMs / 1000;
  if (!(left > 11.9 * 3600 && left <= 12 * 3600 + 5)) throw new Error("exp must be about 12 hours ahead, is " + left + " s");
  if (!/^(https:\/\/|mailto:)/.test(claims.sub)) throw new Error("sub must be an https: or mailto: URL");
  return { header, claims };
}

/** A fresh VAPID key pair and a packed secret, as the app would make them. */
export function makeSecret(over = {}) {
  const ec = createECDH("prime256v1"); ec.generateKeys();
  const parts = { e: "notifier-abc@happyhome.invalid", p: "Pa55-" + randomBytes(9).toString("base64url"), f: "FAM" + randomBytes(6).toString("hex"), d: b64u(ec.getPrivateKey().length === 32 ? ec.getPrivateKey() : Buffer.concat([Buffer.alloc(32 - ec.getPrivateKey().length), ec.getPrivateKey()])), x: b64u(ec.getPublicKey()), ...over };
  return { parts, secret: packSecret(parts) };
}

/**
 * A pretend Firebase (sign-in + the three documents) and pretend push services, for run() in-process.
 * `world.pushes` collects every push request; `world.calls` every URL asked for; `world.state` the saved state.
 */
export function makeWorld({ parts, agenda, state = null, subs = {}, pushStatus = () => 201, onCall = null }) {
  const world = { pushes: [], calls: [], state, subs: { ...subs }, deleted: [], saves: 0, token: "eyJhbGciOiJub25lIn0.eyJ1aWQiOiJub3RpZmllciJ9.c2lnbmF0dXJl", agenda };
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const root = `/v1/projects/demo-happyhome/databases/(default)/documents/families/${encodeURIComponent(parts.f)}`;
  world.fetchFn = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || "GET";
    world.calls.push({ method, url: String(url), redirect: init.redirect });
    if (onCall) { const r = await onCall(u, init, world); if (r) return r; }
    if (u.hostname === "auth.test") {
      const body = JSON.parse(init.body);
      if (body.email !== parts.e || body.password !== parts.p) return json(400, { error: { code: 400, message: "INVALID_PASSWORD", detail: `password ${body.password} is wrong for ${body.email}` } });
      return json(200, { idToken: world.token, refreshToken: "refresh-SECRET-0123456789", localId: "uidNotifier123" });
    }
    if (u.hostname === "fire.test") {
      if (init.headers.authorization !== "Bearer " + world.token) return json(401, { error: { status: "UNAUTHENTICATED" } });
      const path = decodeURIComponent(u.pathname);
      const rootPlain = decodeURIComponent(root);
      if (path === rootPlain + "/notify/agenda" && method === "GET") return world.agenda ? json(200, { name: "x", ...fsBody(world.agenda) }) : json(404, { error: { status: "NOT_FOUND" } });
      if (path === rootPlain + "/notify/state" && method === "GET") return world.state ? json(200, { name: "x", ...fsBody(world.state) }) : json(404, { error: { status: "NOT_FOUND" } });
      if (path === rootPlain + "/notify/state" && method === "PATCH") { world.state = JSON.parse(JSON.stringify(fsDoc(JSON.parse(init.body)))); world.saves++; return json(200, {}); }
      if (path === rootPlain + "/pushSubs" && method === "GET") return json(200, { documents: Object.entries(world.subs).map(([id, d]) => ({ name: `projects/demo-happyhome/databases/(default)/documents/families/${parts.f}/pushSubs/${id}`, ...fsBody(d) })) });
      if (path.startsWith(rootPlain + "/pushSubs/") && method === "DELETE") { const id = path.split("/").pop(); delete world.subs[id]; world.deleted.push(id); return json(200, {}); }
      return json(404, { error: { status: "NOT_FOUND" } });
    }
    // anything else is a push service
    const status = await pushStatus(u, init, world);
    world.pushes.push({ url: String(url), host: u.hostname, headers: init.headers, body: Buffer.from(init.body), redirect: init.redirect, status });
    return new Response(status === 204 ? null : "x", { status, headers: status >= 300 && status < 400 ? { location: "http://169.254.169.254/latest/meta-data/" } : {} });
  };
  world.env = (extra = {}) => ({ HH_NOTIFIER: packSecret(parts), HH_API_KEY: "demo-key", HH_PROJECT_ID: "demo-happyhome", HH_AUTH_BASE: "https://auth.test", HH_FIRESTORE_BASE: "https://fire.test", GITHUB_REPOSITORY: "Some-Family/happy-home", ...extra });
  return world;
}

/** A clock that only moves when the code sleeps (plus 5 ms per network call), so waiting tests run instantly. */
export function virtualTime(startMs = Date.now()) {
  const t = { now: startMs, slept: [] };
  t.clock = () => t.now;
  t.sleep = async (ms) => { t.slept.push(ms); t.now += ms; };
  return t;
}
