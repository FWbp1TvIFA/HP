// End-to-end test: the real notify/send.mjs process against the Firebase EMULATOR (real security rules) and a mock
// push server on localhost. Needs the emulator (auth 127.0.0.1:9099, firestore 127.0.0.1:8080, project demo-happyhome).
//     node --test notify/tests/e2e-emulator.test.mjs          (HH_TEST_PORT picks the mock's port, default 8112)
// It never talks to anything but 127.0.0.1.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fsBody, fsDoc, packSecret } from "../send.mjs";
import { checkVapid, decryptPush, makePhone, makeSecret } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEND = path.resolve(here, "../send.mjs");
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com";
const FS = "http://127.0.0.1:8080";
const PROJECT = "demo-happyhome", KEY = "demo-key";
const PORT = Number(process.env.HH_TEST_PORT || 8112);
const DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const stamp = Date.now().toString(36) + randomBytes(3).toString("hex");
const NOW = Date.parse("2026-11-25T05:30:10Z"); // 3:30:10 pm in Brisbane
const bne = (ms) => new Date(ms + 10 * 3600_000).toISOString().slice(0, 16);
const TITLES = { swim: "Swimming in 30 minutes", bins: "Take the bins out", bill: "Power bill due today", later: "Dinner at Nonna's", old: "Morning alarm" };

let up = false;
try { up = (await fetch(FS + "/", { signal: AbortSignal.timeout(3000) })).ok && (await fetch("http://127.0.0.1:9099/", { signal: AbortSignal.timeout(3000) })).ok; } catch { up = false; }
const opt = { skip: up ? false : "the Firebase emulator is not running on 127.0.0.1:8080 / :9099" };

// ---------------------------------------------------------------- little REST helpers (what the app does through the SDK)
async function signUp(email, password) {
  const r = await fetch(`${AUTH}/v1/accounts:signUp?key=${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  return { uid: j.localId, token: j.idToken, email, password };
}
async function fs(method, docPath, token, body, query = "") {
  const r = await fetch(`${DOCS}/${docPath}${query}`, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(fsBody(body)) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json: j, data: r.status === 200 && j && j.fields ? JSON.parse(JSON.stringify(fsDoc(j))) : null };
}

// ---------------------------------------------------------------- mock push service
const received = [];
let server;
function startMock() {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const gone = req.url.includes("/gone-");
      received.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks), at: Date.now() });
      res.writeHead(gone ? 410 : 201, { "content-type": "text/plain" }); res.end(gone ? "subscription expired" : "");
    });
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(PORT, "127.0.0.1", resolve); });
}

// ---------------------------------------------------------------- run the sender as a real process
const outputs = [];
function runSender(extraEnv, { file = SEND, drop = [] } = {}) {
  const env = { PATH: process.env.PATH, HH_API_KEY: KEY, HH_PROJECT_ID: PROJECT, HH_AUTH_BASE: AUTH, HH_FIRESTORE_BASE: FS, HH_RUN_SECONDS: "0", HH_ALLOW_HTTP: "1", GITHUB_REPOSITORY: "Some-Family/happy-home", ...extraEnv };
  for (const k of drop) delete env[k];
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => { outputs.push(out + err); resolve({ code, out, err, ms: Date.now() - started }); });
  });
}

// ---------------------------------------------------------------- the family
const S = {};
before(async () => {
  if (!up) return;
  await startMock();
  S.fid = "HH" + stamp.toUpperCase();
  S.owner = await signUp(`dad-${stamp}@example.com`, "dad-password-1");
  // the app's createFamily: setDoc(families/{fid}, { ..., members: [uid], owner: uid })
  let r = await fs("PATCH", `families/${S.fid}`, S.owner.token, { people: [{ id: 1, name: "Dad", uid: S.owner.uid }, { id: 2, name: "Mum", uid: null }, { id: 3, name: "Kiddo", uid: null }], currency: "$", members: [S.owner.uid], owner: S.owner.uid, createdAt: Date.now() });
  assert.equal(r.status, 200, "family created: " + JSON.stringify(r.json));
  // the app's notification set-up: a notifier user, added to members, VAPID keys, one code for the repository secret
  const keys = makeSecret();
  S.notifier = await signUp(`notifier-${stamp}@happyhome.invalid`, "N-" + randomBytes(12).toString("base64url"));
  S.parts = { e: S.notifier.email, p: S.notifier.password, f: S.fid, d: keys.parts.d, x: keys.parts.x };
  S.secret = packSecret(S.parts);
  r = await fs("PATCH", `families/${S.fid}`, S.owner.token, { members: [S.owner.uid, S.notifier.uid], push: { pub: S.parts.x, uid: S.notifier.uid, at: Date.now() } }, "?updateMask.fieldPaths=members&updateMask.fieldPaths=push");
  assert.equal(r.status, 200, "notifier added: " + JSON.stringify(r.json));
  // two phones
  S.dad = makePhone(`http://127.0.0.1:${PORT}/push/dad-${stamp}-DADSECRETTOKEN`, 1);
  S.kiddo = makePhone(`http://127.0.0.1:${PORT}/push/kiddo-${stamp}-KIDDOSECRETTOKEN`, 3);
  assert.equal((await fs("PATCH", `families/${S.fid}/pushSubs/dadphone${stamp}`, S.owner.token, S.dad.doc)).status, 200);
  assert.equal((await fs("PATCH", `families/${S.fid}/pushSubs/kiddophone${stamp}`, S.owner.token, S.kiddo.doc)).status, 200);
  S.agenda = { v: 1, tz: "Australia/Brisbane", day: "2026-11-25", updated: NOW, items: [
    { id: "ev-swim-2026-11-25-30", when: bne(NOW), who: [3, 1], title: TITLES.swim, body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", tag: "ev-swim-2026-11-25", url: "#calendar" },
    { id: "task-bins-2026-11-25", when: bne(NOW - 60_000), who: [1], title: TITLES.bins, body: "Dad", tag: "task-bins", url: "#home" },
    { id: "bill-power-2026-11-25", when: bne(NOW + 60_000), who: [], title: TITLES.bill, body: "$182.40", tag: "bill-power", url: "#bills" },
    { id: "ev-dinner-2026-11-25-0", when: bne(NOW + 3600_000), who: [], title: TITLES.later, body: "6:30 pm", tag: "ev-dinner", url: "#calendar" },
    { id: "alarm-old", when: bne(NOW - 6 * 3600_000), who: [1], title: TITLES.old, body: "", tag: "alarm-old", url: "#home" },
    { id: "broken", when: "whenever", who: "x" }, "junk", null,
  ] };
  assert.equal((await fs("PATCH", `families/${S.fid}/notify/agenda`, S.owner.token, S.agenda)).status, 200);
});
after(() => { if (server) server.close(); });

const decode = (r) => {
  const phone = r.path.includes("/dad-") ? S.dad : r.path.includes("/kiddo-") ? S.kiddo : S.mum;
  return { to: phone === S.dad ? "dad" : phone === S.kiddo ? "kiddo" : "mum", msg: JSON.parse(decryptPush(r.body, phone).text), r };
};

test("first run: the right phones get correctly encrypted, VAPID-signed pushes", opt, async () => {
  const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(NOW) });
  assert.equal(res.code, 0, res.out + res.err); assert.equal(res.err, "");
  assert.match(res.out, /notify: signed in/); assert.match(res.out, /agenda: 5 reminders, 3 unreadable; 3 due now, 1 too late to send/); assert.match(res.out, /2 subscriptions: pushed 5, failed 0, removed 0 dead/); assert.match(res.out, /finished, all good/);
  assert.equal(received.length, 5);
  const got = received.map(decode);
  const ids = (who) => got.filter((g) => g.to === who).map((g) => g.msg.hh.id).sort();
  assert.deepEqual(ids("dad"), ["bill-power-2026-11-25", "ev-swim-2026-11-25-30", "task-bins-2026-11-25"]);
  assert.deepEqual(ids("kiddo"), ["bill-power-2026-11-25", "ev-swim-2026-11-25-30"], "Kiddo does not get Dad's task");
  const swim = got.find((g) => g.to === "kiddo" && g.msg.hh.id.startsWith("ev-swim"));
  assert.deepEqual(swim.msg, { web_push: 8030, notification: { title: TITLES.swim, body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", navigate: "https://some-family.github.io/happy-home/#calendar", silent: false, tag: "ev-swim-2026-11-25" }, hh: { id: "ev-swim-2026-11-25-30" } });
  for (const g of got) {
    const h = g.r.headers;
    assert.equal(g.r.method, "POST"); assert.equal(h.ttl, "3600"); assert.equal(h.urgency, "high");
    assert.equal(h["content-encoding"], "aes128gcm"); assert.equal(h["content-type"], "application/octet-stream");
    assert.equal(Number(h["content-length"]), g.r.body.length); assert.match(h.topic, /^[A-Za-z0-9_-]{1,32}$/);
    const { claims } = checkVapid(h.authorization, S.parts.x, { aud: `http://127.0.0.1:${PORT}` });
    assert.equal(claims.sub, "https://some-family.github.io/happy-home/");
    const d = decryptPush(g.r.body, g.to === "dad" ? S.dad : S.kiddo);
    assert.equal(d.header.rs, 4096); assert.equal(d.header.idlen, 65);
    assert.ok(g.r.body.length < 3200);
  }
  const topics = got.filter((g) => g.msg.hh.id.startsWith("ev-swim")).map((g) => g.r.headers.topic);
  assert.equal(topics[0], topics[1], "the same reminder has the same Topic on every phone");
  // notify/state was written by the notifier, through the real rules
  const st = (await fs("GET", `families/${S.fid}/notify/state`, S.owner.token)).data;
  assert.equal(st.v, 1); assert.equal(st.lastError, ""); assert.equal(st.sentCount, 5);
  assert.ok(st.lastRun >= NOW && st.lastRun < NOW + 30_000); assert.equal(st.lastOk, st.lastRun); assert.ok(st.lastSent >= NOW && st.lastSent <= st.lastRun);
  assert.deepEqual(Object.keys(st.sent).sort(), ["alarm-old", "bill-power-2026-11-25", "ev-swim-2026-11-25-30", "task-bins-2026-11-25"]);
  for (const s of [S.parts.p, S.parts.d, S.secret, "SECRETTOKEN", S.dad.doc.auth, ...Object.values(TITLES)]) assert.ok(!JSON.stringify(st).includes(s), "state must not contain " + s.slice(0, 8));
});

test("second run: nothing is sent twice", opt, async () => {
  const before = received.length;
  const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(NOW + 45_000) });
  assert.equal(res.code, 0); assert.match(res.out, /0 due now/); assert.match(res.out, /finished, all good/);
  assert.equal(received.length, before);
  const st = (await fs("GET", `families/${S.fid}/notify/state`, S.owner.token)).data;
  assert.equal(st.sentCount, 5); assert.equal(Object.keys(st.sent).length, 4); assert.ok(st.lastRun >= NOW + 45_000);
});

test("a 410 from the push service deletes that subscription document (and only that one)", opt, async () => {
  S.mum = makePhone(`http://127.0.0.1:${PORT}/push/gone-${stamp}-MUMSECRETTOKEN`, 2);
  assert.equal((await fs("PATCH", `families/${S.fid}/pushSubs/mumphone${stamp}`, S.owner.token, S.mum.doc)).status, 200);
  S.agenda.items.push({ id: "note-mum-1", when: bne(NOW + 120_000), who: [2, 1], title: "Pick up Kiddo", body: "3:00 pm", tag: "note-mum", url: "#home" });
  assert.equal((await fs("PATCH", `families/${S.fid}/notify/agenda`, S.owner.token, S.agenda)).status, 200);
  const before = received.length;
  const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(NOW + 120_000) });
  assert.equal(res.code, 0); assert.match(res.out, /3 subscriptions: pushed 1, failed 0, removed 1 dead/);
  const got = received.slice(before).map(decode);
  assert.deepEqual(got.map((g) => g.to).sort(), ["dad", "mum"]); assert.ok(got.every((g) => g.msg.hh.id === "note-mum-1"));
  assert.equal((await fs("GET", `families/${S.fid}/pushSubs/mumphone${stamp}`, S.owner.token)).status, 404, "dead subscription removed");
  assert.equal((await fs("GET", `families/${S.fid}/pushSubs/dadphone${stamp}`, S.owner.token)).status, 200);
  assert.equal((await fs("GET", `families/${S.fid}/pushSubs/kiddophone${stamp}`, S.owner.token)).status, 200);
  const st = (await fs("GET", `families/${S.fid}/notify/state`, S.owner.token)).data;
  assert.equal(st.sentCount, 6); assert.ok("note-mum-1" in st.sent); assert.equal(st.lastError, "", "a dead subscription is housekeeping, not an error");
});

test("security rules: someone outside the family cannot read the agenda, the state or the subscriptions", opt, async () => {
  const stranger = await signUp(`stranger-${stamp}@example.com`, "stranger-pass-1");
  for (const p of ["notify/agenda", "notify/state", `pushSubs/dadphone${stamp}`, "pushSubs"]) {
    assert.equal((await fs("GET", `families/${S.fid}/${p}`, stranger.token)).status, 403, p + " as a stranger");
    assert.ok([401, 403].includes((await fs("GET", `families/${S.fid}/${p}`, null)).status), p + " signed out");
  }
  assert.equal((await fs("PATCH", `families/${S.fid}/notify/state`, stranger.token, { v: 1 })).status, 403);
  // a sender whose code names a family it does not belong to gets nowhere, and still exits 0
  const before = received.length;
  const res = await runSender({ HH_NOTIFIER: packSecret({ ...S.parts, e: stranger.email, p: stranger.password }), HH_NOW: String(NOW + 600_000) });
  assert.equal(res.code, 0); assert.match(res.out, /status 403 PERMISSION_DENIED\. The notifier is not a member of this family/); assert.equal(received.length, before);
});

test("wrong password, no secret, damaged secret: exit 0 with a friendly line", opt, async () => {
  const before = received.length;
  let res = await runSender({ HH_NOTIFIER: packSecret({ ...S.parts, p: "definitely-the-wrong-password" }), HH_NOW: String(NOW + 600_000) });
  assert.equal(res.code, 0); assert.equal(res.err, "");
  assert.match(res.out, /notify: stopped: sign-in: status 400 [A-Z_]+\. The code in HH_NOTIFIER no longer works .* make a new code in the app/);
  assert.ok(!res.out.includes("definitely-the-wrong-password"));
  res = await runSender({ HH_NOTIFIER: "" });
  assert.equal(res.code, 0); assert.match(res.out, /not set up yet/);
  res = await runSender({ HH_NOTIFIER: S.secret.slice(0, 50) });
  assert.equal(res.code, 0); assert.match(res.out, /could not be read/); assert.ok(!res.out.includes(S.secret.slice(4, 50)));
  assert.equal(received.length, before, "nothing was pushed");
});

test("firebase-config.js at the repository root is used when there are no env overrides", opt, async () => {
  const repo = path.resolve(here, "../../_scratch/repo-" + stamp);
  mkdirSync(path.join(repo, "notify"), { recursive: true });
  cpSync(SEND, path.join(repo, "notify/send.mjs"));
  writeFileSync(path.join(repo, "firebase-config.js"), 'window.HH_FIREBASE_CONFIG={apiKey:"demo-key",authDomain:"demo-happyhome.firebaseapp.com",projectId:"demo-happyhome",appId:"demo",emulatorHost:"127.0.0.1"};\n');
  try {
    const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(NOW + 180_000) }, { file: path.join(repo, "notify/send.mjs"), drop: ["HH_API_KEY", "HH_PROJECT_ID"] });
    assert.equal(res.code, 0); assert.match(res.out, /signed in/); assert.match(res.out, /finished, all good/);
    writeFileSync(path.join(repo, "firebase-config.js"), "window.HH_FIREBASE_CONFIG = null;\n");
    const res2 = await runSender({ HH_NOTIFIER: S.secret }, { file: path.join(repo, "notify/send.mjs"), drop: ["HH_API_KEY", "HH_PROJECT_ID"] });
    assert.equal(res2.code, 0); assert.match(res2.out, /not connected to Firebase/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("staying on (real time): a reminder 8 s away arrives on time and the run then ends by itself", opt, async () => {
  const at = Date.parse("2026-11-25T05:45:00Z"); // a whole minute on the fake clock; the run starts 8 s before it
  S.agenda.items.push({ id: "alarm-soon", when: bne(at), who: [3], title: "Piano practice", body: "now", tag: "alarm-soon", url: "#home" });
  assert.equal((await fs("PATCH", `families/${S.fid}/notify/agenda`, S.owner.token, S.agenda)).status, 200);
  const before = received.length; const started = Date.now();
  const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(at - 8000), HH_RUN_SECONDS: "40" });
  assert.equal(res.code, 0); assert.match(res.out, /staying on for the next reminder/);
  const got = received.slice(before);
  assert.equal(got.length, 1); assert.equal(decode(got[0]).to, "kiddo"); assert.equal(decode(got[0]).msg.hh.id, "alarm-soon");
  const delay = got[0].at - started;
  assert.ok(delay >= 4500 && delay <= 9500, "arrived " + delay + " ms after the start (due at 8000, sent at most 3 s early)");
  assert.ok(res.ms < 20_000, "ended after " + res.ms + " ms, long before the 40 s limit");
});

test("hostile subscription documents: nothing is called except the mock, the run still succeeds", opt, async () => {
  const probes = [];
  const trap = http.createServer((req, res) => { probes.push(req.url); res.writeHead(200); res.end(); });
  await new Promise((r) => trap.listen(PORT + 1, "127.0.0.1", r));
  try {
    const evil = [`http://127.0.0.2:${PORT + 1}/internal`, `http://[::1]:${PORT + 1}/internal`, `https://127.0.0.1:${PORT + 1}/internal`, "http://169.254.169.254/latest/meta-data/", `http://127.0.0.1.nip.io:${PORT + 1}/x`, `http://user:pw@127.0.0.1:${PORT + 1}/internal`, "https://evil.example/push", "file:///etc/passwd"];
    for (let i = 0; i < evil.length; i++) assert.equal((await fs("PATCH", `families/${S.fid}/pushSubs/evil${i}${stamp}`, S.owner.token, { ...makePhone("http://x.invalid/", 1).doc, endpoint: evil[i] })).status, 200);
    assert.equal((await fs("PATCH", `families/${S.fid}/pushSubs/junk${stamp}`, S.owner.token, { who: { a: 1 }, endpoint: 12, p256dh: ["x"], auth: null, huge: "x".repeat(200_000) })).status, 200);
    S.agenda.items.push({ id: "after-evil", when: bne(NOW + 20 * 60_000), who: [1], title: "Bedtime", body: "", tag: "bed", url: "#home" });
    assert.equal((await fs("PATCH", `families/${S.fid}/notify/agenda`, S.owner.token, S.agenda)).status, 200);
    const before = received.length;
    const res = await runSender({ HH_NOTIFIER: S.secret, HH_NOW: String(NOW + 20 * 60_000) });
    assert.equal(res.code, 0); assert.match(res.out, /2 subscriptions \(9 ignored\): pushed 1, failed 0/);
    assert.equal(received.length, before + 1); assert.equal(decode(received[received.length - 1]).to, "dad");
    assert.deepEqual(probes, [], "no request reached the trap server");
    assert.ok(!res.out.includes("evil.example") && !res.out.includes("169.254"), "refused hosts are not named in the public log");
    const st = (await fs("GET", `families/${S.fid}/notify/state`, S.owner.token)).data;
    assert.match(st.lastError, /a subscription was ignored/);
    for (let i = 0; i < evil.length; i++) assert.equal((await fs("GET", `families/${S.fid}/pushSubs/evil${i}${stamp}`, S.owner.token)).status, 200, "ignored subscriptions are left alone");
  } finally { trap.close(); }
});

test("nothing secret in any output of any run", opt, async () => {
  const all = outputs.join("\n");
  assert.ok(outputs.length >= 10);
  for (const s of [S.parts.p, S.parts.d, S.parts.f, S.parts.e, S.secret, S.secret.slice(4), "SECRETTOKEN", S.dad.doc.auth, S.dad.doc.p256dh, S.kiddo.doc.auth, S.notifier.uid, S.notifier.token, ...Object.values(TITLES), "Aquatic", "Pick up Kiddo"]) {
    assert.ok(!all.includes(s), "leaked: " + s.slice(0, 10));
  }
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(all), "no token-shaped text"); assert.ok(!/https?:\/\//.test(all), "no URLs");
  for (const line of all.split("\n").filter(Boolean)) assert.match(line, /^notify: /);
});
