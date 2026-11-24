// Checks our Web Push crypto against an independent implementation (the `web-push` npm package and its `http_ece`).
// The package is NOT part of the app: install it in a scratch folder and point HH_SCRATCH at it:
//     mkdir -p /some/scratch && cd /some/scratch && npm init -y && npm install web-push
//     HH_SCRATCH=/some/scratch node --test notify/tests/crypto-independent.test.mjs
// Without it the tests are skipped.
import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { b64u, buildPayload, encrypt, readAgenda, topicFor, unpackSecret, vapidHeader, vapidKey } from "../send.mjs";
import { checkVapid, decryptPush, makePhone, makeSecret } from "./helpers.mjs";

const scratch = process.env.HH_SCRATCH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../_scratch/webpush");
const have = existsSync(path.join(scratch, "node_modules/web-push/package.json"));
let webpush = null, ece = null, jws = null;
if (have) {
  const req = createRequire(path.join(scratch, "package.json"));
  ece = req("http_ece"); jws = req("jws");
  webpush = await import(pathToFileURL(req.resolve("web-push")).href);
  webpush = webpush.default && webpush.default.generateRequestDetails ? webpush.default : webpush;
}
const opt = { skip: have ? false : "web-push is not installed in " + scratch };

test("http_ece (receiver side) decrypts what send.mjs encrypts", opt, () => {
  for (const text of ["", "x", JSON.stringify({ web_push: 8030, notification: { title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre \u1f3ca" } }), "z".repeat(2800)]) {
    const phone = makePhone("https://fcm.googleapis.com/fcm/send/x", 1);
    const body = encrypt(text, phone.ecdh.getPublicKey(), phone.authBuf);
    const plain = ece.decrypt(body, { version: "aes128gcm", privateKey: phone.ecdh, authSecret: phone.authBuf });
    assert.equal(plain.toString("utf8"), text);
    // http_ece refuses it with the wrong auth secret or a flipped bit
    assert.throws(() => ece.decrypt(body, { version: "aes128gcm", privateKey: phone.ecdh, authSecret: randomBytes(16) }));
    const broken = Buffer.from(body); broken[broken.length - 20] ^= 1;
    assert.throws(() => ece.decrypt(broken, { version: "aes128gcm", privateKey: phone.ecdh, authSecret: phone.authBuf }));
  }
});

test("a real sender payload survives the round trip through http_ece", opt, () => {
  const [item] = readAgenda({ tz: "Australia/Brisbane", items: [{ id: "ev-abc-2026-11-25-30", when: "2026-11-25T15:30", who: [3, 1], title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", tag: "ev-abc-2026-11-25", url: "#calendar" }] }).items;
  const payload = buildPayload(item, "https://some-family.github.io/happy-home/");
  const phone = makePhone("https://web.push.apple.com/x", 3);
  const plain = ece.decrypt(encrypt(payload, phone.ecdh.getPublicKey(), phone.authBuf), { version: "aes128gcm", privateKey: phone.ecdh, authSecret: phone.authBuf });
  assert.deepEqual(JSON.parse(plain.toString()), { web_push: 8030, notification: { title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", navigate: "https://some-family.github.io/happy-home/#calendar", silent: false, tag: "ev-abc-2026-11-25" }, hh: { id: "ev-abc-2026-11-25-30" } });
});

test("our test receiver reads what web-push encrypts (so the receiver used in the other tests is right too)", opt, () => {
  const phone = makePhone("https://fcm.googleapis.com/fcm/send/x", 1);
  const out = webpush.encrypt(phone.doc.p256dh, phone.doc.auth, "hello from web-push \u00e9", "aes128gcm");
  const mine = decryptPush(out.cipherText, phone);
  assert.equal(mine.text, "hello from web-push \u00e9");
  // same framing as ours: salt 16 | rs 4096 | idlen 65 | sender key, and the same length for the same text
  const ours = encrypt("hello from web-push \u00e9", phone.ecdh.getPublicKey(), phone.authBuf);
  const d = decryptPush(ours, phone);
  assert.deepEqual([d.header.rs, d.header.idlen, ours.length], [mine.header.rs, mine.header.idlen, out.cipherText.length]);
});

test("RFC 8291 appendix A: http_ece opens the RFC's message and ours is identical to it", opt, () => {
  const expected = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
  const ua = createECDH("prime256v1"); ua.setPrivateKey(Buffer.from("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94", "base64url"));
  const auth = Buffer.from("BTBZMqHH6r4Tts7J_aSIgg", "base64url");
  assert.equal(b64u(ua.getPublicKey()), "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
  assert.equal(ece.decrypt(Buffer.from(expected, "base64url"), { version: "aes128gcm", privateKey: ua, authSecret: auth }).toString(), "When I grow up, I want to be a watermelon");
  const ours = encrypt("When I grow up, I want to be a watermelon", ua.getPublicKey(), auth, { salt: Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url"), privateKey: Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url") });
  assert.equal(b64u(ours), expected);
});

test("VAPID: our JWT verifies with crypto.verify and with the jws library; shape equals web-push's", opt, () => {
  const { parts, secret } = makeSecret();
  const sec = unpackSecret(secret);
  const aud = "https://fcm.googleapis.com", sub = "https://some-family.github.io/happy-home/";
  const now = Date.now();
  const mine = vapidHeader({ aud, sub, key: vapidKey(sec.d, sec.x), x: sec.x, nowMs: now });
  const theirs = webpush.getVapidHeaders(aud, sub, parts.x, parts.d, "aes128gcm").Authorization;
  const shape = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{86}), k=([A-Za-z0-9_-]{87})$/;
  const m = shape.exec(mine), t = shape.exec(theirs);
  assert.ok(m, "ours has the vapid t=, k= shape"); assert.ok(t, "web-push's has the same shape");
  assert.equal(m[4], t[4], "same k (the public key)"); assert.equal(m[4], parts.x);
  const dec = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
  assert.deepEqual(dec(m[1]), dec(t[1]), "identical JWT header"); assert.deepEqual(dec(m[1]), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(Object.keys(dec(m[2])).sort(), Object.keys(dec(t[2])).sort(), "same claim names");
  assert.equal(dec(m[2]).aud, dec(t[2]).aud); assert.equal(dec(m[2]).sub, dec(t[2]).sub);
  assert.ok(Math.abs(dec(m[2]).exp - dec(t[2]).exp) <= 5, "same 12-hour expiry as web-push's default");
  assert.ok(dec(m[2]).exp - now / 1000 <= 24 * 3600);
  // signature: node's crypto.verify (raw r|s form) ...
  const pub = Buffer.from(parts.x, "base64url");
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
  assert.equal(Buffer.from(m[3], "base64url").length, 64);
  assert.equal(verify("sha256", Buffer.from(m[1] + "." + m[2]), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url")), true);
  // ... and an independent JWT library
  const pem = key.export({ type: "spki", format: "pem" });
  assert.equal(jws.verify(`${m[1]}.${m[2]}.${m[3]}`, "ES256", pem), true);
  assert.equal(jws.verify(`${m[1]}.${m[2]}.${m[3]}`, "ES256", makeOtherPem()), false, "another key does not verify it");
  // our checker accepts web-push's header as well (it is what the other tests rely on)
  checkVapid(theirs, parts.x, { aud });
  checkVapid(mine, parts.x, { aud, nowMs: now });
});
function makeOtherPem() { const o = unpackSecret(makeSecret().secret); return createPublicKey(vapidKey(o.d, o.x)).export({ type: "spki", format: "pem" }); }

test("request headers: same set and values as web-push would send", opt, () => {
  const { parts } = makeSecret();
  const phone = makePhone("https://fcm.googleapis.com/fcm/send/abc", 1);
  const [item] = readAgenda({ items: [{ id: "a", when: "2026-11-25T15:30", title: "T", tag: "ev-abc-2026-11-25" }] }).items;
  const topic = topicFor(item);
  const d = webpush.generateRequestDetails({ endpoint: phone.doc.endpoint, keys: { p256dh: phone.doc.p256dh, auth: phone.doc.auth } }, "payload", {
    vapidDetails: { subject: "https://some-family.github.io/happy-home/", publicKey: parts.x, privateKey: parts.d }, TTL: 3600, urgency: "high", topic, contentEncoding: "aes128gcm",
  });
  assert.equal(d.method, "POST"); assert.equal(d.endpoint, phone.doc.endpoint);
  const theirs = Object.fromEntries(Object.entries(d.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  // what send.mjs sets (content-length is added by fetch)
  const ours = { ttl: "3600", urgency: "high", topic, "content-encoding": "aes128gcm", "content-type": "application/octet-stream", authorization: "vapid t=..., k=..." };
  assert.deepEqual(Object.keys(theirs).filter((k) => k !== "content-length").sort(), Object.keys(ours).sort());
  for (const k of ["ttl", "urgency", "topic", "content-encoding", "content-type"]) assert.equal(theirs[k], ours[k], k);
  assert.match(theirs.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  assert.equal(decryptPush(d.body, phone).text, "payload");
});
