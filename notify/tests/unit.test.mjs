// Unit tests for notify/send.mjs. Run:  node --test notify/tests/unit.test.mjs
// No network and no dependencies (the Playwright part lives in browser.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import {
  SafeError, appUrl, b64u, buildPayload, checkEndpoint, cleanText, encrypt, extraHosts, fsBody, fsDecode, fsDoc, fsEncode,
  makeScrubber, packSecret, pagesUrl, plan, readAgenda, readConfig, readState, readSubs, run, sentKey, stateDoc, topicFor,
  unpackSecret, vapidHeader, vapidKey, wallToInstant, wants, LATE_MS,
} from "../send.mjs";
import { checkVapid, decryptPush, makePhone, makeSecret, makeWorld, virtualTime } from "./helpers.mjs";

const iso = (ms) => new Date(ms).toISOString();
// wall-clock text in Brisbane (UTC+10, no daylight saving) for an instant
const bne = (ms) => new Date(ms + 10 * 3600_000).toISOString().slice(0, ms % 60_000 ? 19 : 16);

// ------------------------------------------------------------------ secret
test("secret: pack and unpack round trip", () => {
  const { parts, secret } = makeSecret({ e: "notifier+x@example.com", p: "p\u00e4ss \"w\u00f6rd\" \u1f511", f: "Fam-1_code" });
  assert.match(secret, /^hh1\.[A-Za-z0-9_-]+$/);
  const back = unpackSecret(secret);
  assert.equal(back.e, parts.e); assert.equal(back.p, parts.p); assert.equal(back.f, parts.f);
  assert.equal(b64u(back.d), parts.d); assert.equal(b64u(back.x), parts.x);
  assert.equal(back.d.length, 32); assert.equal(back.x.length, 65);
  // pasted with spaces, quotes and a line break around it
  assert.equal(unpackSecret(`  "${secret.slice(0, 30)}\n${secret.slice(30)}"\n`).p, parts.p);
});

test("secret: broken ones are refused with a message that reveals nothing", () => {
  const { parts, secret } = makeSecret();
  const other = makeSecret().parts;
  const bad = [
    "", "   ", "hello", "hh1.", "hh1.!!!", "hh2." + secret.slice(4), secret.slice(0, 40),
    "hh1." + b64u(Buffer.from("[1,2]")), "hh1." + b64u(Buffer.from("null")),
    packSecret({ ...parts, e: "" }), packSecret({ ...parts, p: 5 }), packSecret({ ...parts, f: "a/b" }), packSecret({ ...parts, f: ".." }),
    packSecret({ ...parts, d: "AAAA" }), packSecret({ ...parts, x: parts.d }), packSecret({ ...parts, x: other.x }), // keys of two different pairs
    packSecret({ ...parts, d: b64u(Buffer.alloc(32)) }), "hh1." + "A".repeat(5000),
  ];
  for (const s of bad) {
    assert.throws(() => unpackSecret(s), (e) => {
      assert.ok(e instanceof SafeError, "SafeError for " + s.slice(0, 12));
      for (const v of [parts.p, parts.d, parts.f, parts.e]) assert.ok(!e.message.includes(v));
      return true;
    });
  }
  assert.throws(() => unpackSecret(undefined), SafeError);
});

// ------------------------------------------------------------------ config
test("firebase-config.js: apiKey and projectId are found in the usual spellings", () => {
  assert.deepEqual(readConfig('window.HH_FIREBASE_CONFIG={apiKey:"demo-key",authDomain:"demo-happyhome.firebaseapp.com",projectId:"demo-happyhome",appId:"demo"};'), { apiKey: "demo-key", projectId: "demo-happyhome" });
  assert.deepEqual(readConfig("window.HH_FIREBASE_CONFIG = {\n  apiKey: 'AIzaSyA-b_c',\n  \"projectId\" : \"my-proj-1\",\n};"), { apiKey: "AIzaSyA-b_c", projectId: "my-proj-1" });
  assert.deepEqual(readConfig("window.HH_FIREBASE_CONFIG = null;"), { apiKey: "", projectId: "" });
  assert.deepEqual(readConfig(null), { apiKey: "", projectId: "" });
});

// ------------------------------------------------------------------ time
test("wall time to instant: fixed zones, daylight saving, gaps, overlaps, bad input", () => {
  assert.equal(iso(wallToInstant("2026-11-25T15:30", "Australia/Brisbane")), "2026-11-25T05:30:00.000Z");
  assert.equal(iso(wallToInstant("2026-11-25T00:05", "Australia/Brisbane")), "2026-11-24T14:05:00.000Z");
  assert.equal(iso(wallToInstant("2026-11-25T15:30:45", "UTC")), "2026-11-25T15:30:45.000Z");
  assert.equal(iso(wallToInstant("2026-11-25T15:30", "Asia/Kolkata")), "2026-11-25T10:00:00.000Z"); // +05:30
  assert.equal(iso(wallToInstant("2026-11-25T15:30", "Asia/Kathmandu")), "2026-11-25T09:45:00.000Z"); // +05:45
  // Sydney: UTC+11 in summer, UTC+10 in winter
  assert.equal(iso(wallToInstant("2026-01-15T09:00", "Australia/Sydney")), "2026-01-14T22:00:00.000Z");
  assert.equal(iso(wallToInstant("2026-07-15T09:00", "Australia/Sydney")), "2026-07-14T23:00:00.000Z");
  // clocks go forward 02:00 -> 03:00 on 4 Oct 2026: 02:30 never happens, it becomes 03:30 summer time
  assert.equal(iso(wallToInstant("2026-10-04T01:59", "Australia/Sydney")), "2026-10-03T15:59:00.000Z");
  assert.equal(iso(wallToInstant("2026-10-04T02:30", "Australia/Sydney")), "2026-10-03T16:30:00.000Z");
  assert.equal(iso(wallToInstant("2026-10-04T03:00", "Australia/Sydney")), "2026-10-03T16:00:00.000Z");
  assert.equal(iso(wallToInstant("2026-10-04T12:00", "Australia/Sydney")), "2026-10-04T01:00:00.000Z");
  // clocks go back 03:00 -> 02:00 on 5 Apr 2026: 02:30 happens twice, we mean the first one
  assert.equal(iso(wallToInstant("2026-04-05T02:30", "Australia/Sydney")), "2026-04-04T15:30:00.000Z");
  assert.equal(iso(wallToInstant("2026-04-05T03:00", "Australia/Sydney")), "2026-04-04T17:00:00.000Z");
  // New York: EDT (-4) in July, EST (-5) in December, and the March jump
  assert.equal(iso(wallToInstant("2026-07-04T08:00", "America/New_York")), "2026-07-04T12:00:00.000Z");
  assert.equal(iso(wallToInstant("2026-12-04T08:00", "America/New_York")), "2026-12-04T13:00:00.000Z");
  assert.equal(iso(wallToInstant("2026-03-08T02:30", "America/New_York")), "2026-03-08T07:30:00.000Z");
  // unknown or hostile zone names fall back to Brisbane
  for (const tz of ["Mars/Olympus", "", null, 42, {}, "A".repeat(500), "../../etc/passwd"]) {
    assert.equal(iso(wallToInstant("2026-11-25T15:30", tz)), "2026-11-25T05:30:00.000Z");
  }
  for (const bad of ["", "tomorrow", "2026-13-01T10:00", "2026-02-30T10:00", "2026-11-25T24:00", "2026-11-25T10:60", "2026-11-25", "1999-01-01T00:00", 1764000000000, null, {}, ["2026-11-25T10:00"], "2026-11-25T10:00" + " ".repeat(100)]) {
    assert.equal(wallToInstant(bad, "Australia/Brisbane"), null, String(bad));
  }
});

// ------------------------------------------------------------------ Firestore values
test("Firestore typed values: decode, encode, round trip, hostile keys", () => {
  const doc = { name: "projects/p/databases/(default)/documents/families/f/notify/agenda", fields: {
    v: { integerValue: "1" }, tz: { stringValue: "Australia/Brisbane" }, updated: { doubleValue: 1764000000000.5 }, ok: { booleanValue: true }, none: { nullValue: null },
    at: { timestampValue: "2026-11-25T05:30:00Z" },
    items: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: "a" }, who: { arrayValue: { values: [{ integerValue: "3" }, { doubleValue: 1 }] } } } } }, { arrayValue: {} }, { mapValue: {} }] } },
    __proto__: { mapValue: { fields: { polluted: { booleanValue: true } } } },
  } };
  const o = fsDoc(doc);
  assert.equal(o.v, 1); assert.equal(o.tz, "Australia/Brisbane"); assert.equal(o.updated, 1764000000000.5); assert.equal(o.ok, true); assert.equal(o.none, null);
  assert.equal(o.at, Date.parse("2026-11-25T05:30:00Z"));
  assert.deepEqual(JSON.parse(JSON.stringify(o.items)), [{ id: "a", who: [3, 1] }, [], {}]);
  assert.equal({}.polluted, undefined, "no prototype pollution");
  const hostile = fsDoc(JSON.parse('{"fields":{"__proto__":{"mapValue":{"fields":{"polluted":{"booleanValue":true}}}},"constructor":{"stringValue":"x"}}}'));
  assert.equal({}.polluted, undefined); assert.equal(Object.getPrototypeOf(hostile), null); assert.equal(hostile.constructor, "x");
  assert.equal(fsDecode({ integerValue: "abc" }), null); assert.equal(fsDecode("x"), null); assert.equal(fsDecode({ weird: 1 }), null);
  let deep = { stringValue: "bottom" }; for (let i = 0; i < 100; i++) deep = { arrayValue: { values: [deep] } };
  assert.doesNotThrow(() => fsDecode(deep));

  assert.deepEqual(fsEncode(5), { integerValue: "5" }); assert.deepEqual(fsEncode(1.5), { doubleValue: 1.5 });
  assert.deepEqual(fsEncode("x"), { stringValue: "x" }); assert.deepEqual(fsEncode(false), { booleanValue: false });
  assert.deepEqual(fsEncode(null), { nullValue: null }); assert.deepEqual(fsEncode(NaN), { nullValue: null });
  assert.deepEqual(JSON.parse(JSON.stringify(fsEncode([1, "a", { b: true }]))), { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }, { mapValue: { fields: { b: { booleanValue: true } } } }] } });
  const state = { v: 1, lastRun: 1764000000000, lastError: "", sent: new Map([["ev-1", 5], ["__bad__", 6], ["", 7]]) };
  const body = JSON.parse(JSON.stringify(fsBody(state)));
  assert.deepEqual(Object.keys(body.fields.sent.mapValue.fields), ["ev-1"], "names Firestore refuses are left out");
  assert.deepEqual(JSON.parse(JSON.stringify(fsDoc(body))), { v: 1, lastRun: 1764000000000, lastError: "", sent: { "ev-1": 5 } });
});

// ------------------------------------------------------------------ agenda + plan
const NOW = Date.parse("2026-11-25T05:30:00Z"); // 15:30 in Brisbane
const item = (id, offsetMs, extra = {}) => ({ id, when: bne(NOW + offsetMs), who: [], title: "T " + id, body: "B", tag: "tag-" + id, url: "#calendar", ...extra });

test("due / skip / sent logic with a fake clock", () => {
  const agenda = readAgenda({ v: 1, tz: "Australia/Brisbane", items: [
    item("now", 0), item("in1", 60_000), item("in2", 120_000), item("past10", -600_000), item("past179", -179 * 60_000),
    item("past181", -181 * 60_000), item("yesterday", -86400_000), item("done", -60_000), item("later", 3600_000),
  ] });
  assert.equal(agenda.items.length, 9);
  const sent = new Map([["done", NOW - 50_000]]);
  const p = plan(agenda.items, sent, NOW);
  assert.deepEqual(p.due.map((i) => i.id), ["past179", "past10", "now", "in1"], "due = up to 3 h late ... 60 s ahead, oldest first");
  assert.deepEqual(p.late.map((i) => i.id).sort(), ["past181", "yesterday"], "more than 3 h late is never sent");
  assert.equal(p.next, NOW + 120_000, "next = earliest item still to come");
  // exactly on the edges
  assert.equal(plan(readAgenda({ items: [item("e", 60_000)] }).items, new Map(), NOW).due.length, 1);
  assert.equal(plan(readAgenda({ items: [item("e", 61_000)] }).items, new Map(), NOW).due.length, 0, "61 s ahead is not due yet");
  assert.equal(plan(readAgenda({ items: [item("e", -LATE_MS)] }).items, new Map(), NOW).due.length, 1, "exactly 3 h late still goes");
  // while the run stays alive it uses a short lead instead of 60 s
  assert.deepEqual(plan(agenda.items, sent, NOW, 3000).due.map((i) => i.id), ["past179", "past10", "now"]);
  // the clock moves on: what was sent is not due again, the next one becomes due
  for (const i of [...p.due, ...p.late]) sent.set(i.key, NOW);
  const p2 = plan(agenda.items, sent, NOW + 70_000);
  assert.deepEqual(p2.due.map((i) => i.id), ["in2"]); assert.deepEqual(p2.late, []); assert.equal(p2.next, NOW + 3600_000);
  // sent may also be a plain object (as decoded from Firestore)
  assert.deepEqual(plan(agenda.items, Object.fromEntries(sent), NOW + 70_000).due.map((i) => i.id), ["in2"]);
});

test("agenda: untrusted fields are tamed", () => {
  const a = readAgenda({ v: 1, tz: "Not/AZone", items: [
    item("ok", 0, { who: [3, 1] }),
    item("ok", 0, { title: "duplicate id" }),
    null, 7, "text", [], { when: 5 }, { id: "nowhen" }, { id: "badwhen", when: "soon" },
    { when: bne(NOW), title: "no id" },
    item("__proto__", 0), item("__name__", 0), item("x".repeat(5000), 0), item(12345, 0),
    item("who0", 0, { who: [0] }), item("whoNum", 0, { who: 3 }), item("whoStr", 0, { who: ["2", "x", null, {}] }), item("whoBad", 0, { who: { a: 1 } }), item("whoNull", 0, { who: null }),
    item("big", 0, { title: "T".repeat(100_000), body: "B".repeat(100_000), tag: "g".repeat(9999), url: "javascript:alert(1)" }),
    item("ctl", 0, { title: "line1\nline2\u0000\u202e evil \ud800", body: 42, url: "https://evil.example/#x" }),
    item("urls", 0, { url: "#lists/shopping?x=1" }),
  ] });
  assert.equal(a.tz, "Australia/Brisbane");
  assert.equal(a.bad, 7, "seven unreadable entries counted");
  const by = Object.fromEntries(a.items.map((i) => [i.id.slice(0, 20), i]));
  assert.equal(a.items.filter((i) => i.id === "ok").length, 1, "duplicate ids collapse");
  assert.deepEqual([...by.ok.who].sort(), [1, 3]); assert.equal(by.ok.everyone, false);
  assert.ok(a.items.every((i) => i.key === sentKey(i.key) && i.key.length <= 150 && !/^__.*__$/.test(i.key)), "every key is storable in Firestore");
  assert.ok(a.items.some((i) => /^h-[0-9a-f]{32}$/.test(i.key)), "odd ids are replaced by a hash");
  assert.equal(by["12345"].key, "12345");
  assert.equal(by.who0.everyone, true); assert.deepEqual([...by.whoNum.who], [3]); assert.deepEqual([...by.whoStr.who], [2]);
  assert.equal(by.whoBad.everyone, false); assert.equal(by.whoBad.who.size, 0); assert.equal(by.whoNull.everyone, true);
  assert.equal(Array.from(by.big.title).length, 80); assert.equal(Array.from(by.big.body).length, 180); assert.ok(by.big.tag.length <= 64); assert.equal(by.big.url, "");
  assert.equal(by.ctl.title, "line1 line2 evil \ufffd"); assert.equal(by.ctl.body, "42"); assert.equal(by.ctl.url, "");
  assert.equal(by.urls.url, "#lists/shopping?x=1");
  // not an agenda at all
  for (const junk of [null, undefined, 5, "x", [], { items: "nope" }, { items: { a: 1 } }]) assert.deepEqual(readAgenda(junk).items, []);
  assert.equal(readAgenda({ v: 2, items: [item("a", 0)] }).bad, -1, "unknown version is not guessed at");
  const many = readAgenda({ items: Array.from({ length: 5000 }, (_, i) => item("n" + i, 0)) });
  assert.equal(many.items.length, 400); assert.equal(many.more, 4600);
});

test("state: read defensively, old ids dropped after 3 days, size capped", () => {
  const st = readState({ lastRun: "5", lastOk: -1, sentCount: 7, lastSent: {}, sent: { a: NOW - 1000, old: NOW - 4 * 86400_000, future: NOW + 9e9, bad: "x", __x__: 5 } }, NOW);
  assert.equal(st.lastRun, 5); assert.equal(st.lastOk, 0); assert.equal(st.sentCount, 7); assert.equal(st.lastSent, 0);
  assert.deepEqual([...st.sent.keys()].sort(), ["a", "future", "old"]); assert.equal(st.sent.get("future"), NOW);
  const doc = stateDoc(st, NOW);
  assert.deepEqual([...doc.sent.keys()].sort(), ["a", "future"]); assert.equal(doc.v, 1);
  for (let i = 0; i < 5000; i++) st.sent.set("k" + i, NOW - i);
  assert.equal(stateDoc(st, NOW).sent.size, 3000);
  assert.ok(st.sent.has("k0") && !st.sent.has("k4999"), "the newest are kept");
  for (const junk of [null, 5, "x", [], { sent: [1, 2] }, { sent: "x" }]) assert.equal(readState(junk, NOW).sent.size, 0);
});

// ------------------------------------------------------------------ endpoints
test("endpoints: only real push services over https; no internal addresses", () => {
  const ok = ["https://fcm.googleapis.com/fcm/send/abc:def", "https://updates.push.services.mozilla.com/wpush/v2/gAAA", "https://web.push.apple.com/QGk", "https://wns2-sg2p.notify.windows.com/w/?token=AwY", "https://jmt17.google.com/fcm/send/x"];
  for (const e of ok) assert.equal(checkEndpoint(e).ok, true, e);
  const bad = [
    "http://fcm.googleapis.com/fcm/send/abc", "https://169.254.169.254/latest/meta-data", "http://169.254.169.254/latest/meta-data/", "https://127.0.0.1/x", "http://127.0.0.1:8080/x", "http://localhost/x",
    "https://[::1]/x", "https://[fd00::1]/x", "https://2130706433/x", "https://0x7f000001/x", "https://017700000001/x", "https://localhost/x", "https://metadata.google.internal/x", "https://intranet/x",
    "https://evil.example.com/push", "https://fcm.googleapis.com.evil.example/x", "https://evilfcm.googleapis.com/x", "https://push.apple.com.evil.example/x", "https://notpush.apple.com/x",
    "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com@evil.example/x", "https://evil.example\\@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://fcm.googleapis.com\u3002evil.example/x",
    "https://fcm.googleapis.com/x\nHost: evil", "https://fcm.googleapis.com/ x", "file:///etc/passwd", "javascript:alert(1)", "ftp://fcm.googleapis.com/x", "//fcm.googleapis.com/x", "fcm.googleapis.com/x",
    "", "https://", null, undefined, 5, {}, ["https://fcm.googleapis.com/x"], "https://fcm.googleapis.com/" + "a".repeat(3000),
  ];
  for (const e of bad) { const r = checkEndpoint(e); assert.equal(r.ok, false, String(e).slice(0, 60)); assert.match(r.host, /^[a-z0-9.-]*$/); }
  // the test flag only adds plain-http loopback, nothing else
  assert.equal(checkEndpoint("http://127.0.0.1:8112/push/a", { allowHttp: true }).ok, true);
  assert.equal(checkEndpoint("http://localhost:8112/push/a", { allowHttp: true }).ok, true);
  for (const e of ["http://169.254.169.254/x", "http://10.0.0.1/x", "http://127.0.0.2/x", "http://evil.example/x", "https://evil.example/x", "https://127.0.0.1/x", "http://localhost.evil.example/x"]) assert.equal(checkEndpoint(e, { allowHttp: true }).ok, false, e);
  // the owner can allow one more push service by name
  assert.deepEqual(extraHosts("push.example.net, .p.example.org  1.2.3 bad_host https://x/ localhost"), ["push.example.net", ".p.example.org", "1.2.3"]);
  assert.equal(checkEndpoint("https://push.example.net/x", { extra: extraHosts("push.example.net") }).ok, true);
  assert.equal(checkEndpoint("https://1.2.3.4/x", { extra: extraHosts("1.2.3.4") }).ok, false, "an IP literal is refused even when listed");
});

test("subscriptions: bad keys ignored, duplicates merged, who matching", () => {
  const a = makePhone("https://fcm.googleapis.com/fcm/send/a", 3), b = makePhone("https://web.push.apple.com/b", 1);
  const docs = [
    { id: "a", data: a.doc }, { id: "a2", data: { ...a.doc } }, { id: "b", data: { ...b.doc, who: "1" } },
    { id: "k1", data: { ...a.doc, endpoint: "https://fcm.googleapis.com/fcm/send/k1", p256dh: "AAAA" } },
    { id: "k2", data: { ...a.doc, endpoint: "https://fcm.googleapis.com/fcm/send/k2", auth: b64u(randomBytes(15)) } },
    { id: "k3", data: { ...a.doc, endpoint: "https://fcm.googleapis.com/fcm/send/k3", p256dh: b64u(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])) } }, // not on the curve
    { id: "k4", data: { ...a.doc, endpoint: "https://fcm.googleapis.com/fcm/send/k4", p256dh: 12, auth: null } },
    { id: "e1", data: { ...a.doc, endpoint: "http://169.254.169.254/latest" } }, { id: "n", data: null }, { id: "w", data: { ...makePhone("https://fcm.googleapis.com/fcm/send/w", "x").doc } },
    { id: "std", data: { ...makePhone("https://fcm.googleapis.com/fcm/send/std", 2).doc } },
  ];
  docs[10].data.p256dh = Buffer.from(docs[10].data.p256dh, "base64url").toString("base64"); // classic base64 with + / = is accepted too
  const { subs, ignored } = readSubs(docs);
  assert.deepEqual(subs.map((s) => s.ids.join("+")), ["a+a2", "b", "w", "std"]);
  assert.equal(ignored.length, 6);
  assert.deepEqual(ignored.map((g) => g.why), ["bad keys", "bad keys", "bad keys", "bad keys", "not https", "empty"]);
  const ag = readAgenda({ items: [item("j", 0, { who: [3] }), item("all", 0, { who: [] }), item("dad", 0, { who: [1, 9] })] }).items;
  const got = (it) => subs.filter((s) => wants(s, it)).map((s) => s.ids[0]);
  assert.deepEqual(got(ag[0]), ["a"]); assert.deepEqual(got(ag[1]), ["a", "b", "w", "std"]); assert.deepEqual(got(ag[2]), ["b"]);
});

// ------------------------------------------------------------------ payload
test("payload: declarative web push shape, capped sizes", () => {
  const [it] = readAgenda({ items: [item("ev-abc-2026-11-25-30", 0, { title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", tag: "ev-abc-2026-11-25" })] }).items;
  const p = JSON.parse(buildPayload(it, "https://some-family.github.io/happy-home/").toString());
  assert.deepEqual(p, { web_push: 8030, notification: { title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", navigate: "https://some-family.github.io/happy-home/#calendar", silent: false, tag: "ev-abc-2026-11-25" }, hh: { id: "ev-abc-2026-11-25-30" } });
  const [big] = readAgenda({ items: [item("\u1f600".repeat(150), 0, { title: "\u1f600".repeat(500), body: "\"\\".repeat(5000), tag: "\u1f600".repeat(64) })] }).items;
  const buf = buildPayload(big, "https://some-family.github.io/happy-home/");
  assert.ok(buf.length <= 2800, "payload " + buf.length + " bytes");
  const bp = JSON.parse(buf.toString());
  assert.ok(Array.from(bp.notification.title).length <= 80 && Array.from(bp.notification.body).length <= 180);
  const [empty] = readAgenda({ items: [{ when: bne(NOW) }] }).items;
  const ep = JSON.parse(buildPayload(empty, "").toString());
  assert.equal(ep.notification.title, "Happy Home"); assert.ok(ep.notification.body.length > 0); assert.equal(ep.notification.navigate, "https://github.com/");
  assert.match(topicFor(it), /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(topicFor(it), topicFor({ ...it, id: "other", title: "x" }), "same tag, same topic");
  assert.notEqual(topicFor(it), topicFor({ ...it, tag: "ev-zzz" }));
  assert.equal(pagesUrl("Some-Family/happy-home"), "https://some-family.github.io/happy-home/");
  assert.equal(pagesUrl("octo/octo.github.io"), "https://octo.github.io/");
  for (const bad of ["", "nope", "a/b/c", "a b/c", "../x", "a/..", undefined]) assert.equal(pagesUrl(bad), "");
  assert.equal(appUrl({ HH_APP_URL: "https://family.example.com/app?x=1#y", GITHUB_REPOSITORY: "a/b" }), "https://family.example.com/app/");
  assert.equal(appUrl({ HH_APP_URL: "http://insecure.example/", GITHUB_REPOSITORY: "a/b" }), "https://a.github.io/b/");
  assert.equal(cleanText("  a\tb\r\nc  ", 10), "a b c"); assert.equal(cleanText({}, 10), ""); assert.equal(cleanText("abcdef", 4), "abc\u2026");
});

// ------------------------------------------------------------------ crypto
test("RFC 8291 appendix A test vector is reproduced byte for byte", () => {
  const plaintext = "When I grow up, I want to be a watermelon";
  const asPrivate = Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url");
  const uaPublic = Buffer.from("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "base64url");
  const auth = Buffer.from("BTBZMqHH6r4Tts7J_aSIgg", "base64url");
  const salt = Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url");
  const out = encrypt(plaintext, uaPublic, auth, { salt, privateKey: asPrivate });
  assert.equal(b64u(out), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  // and the RFC's receiver key opens it
  const ua = createECDH("prime256v1"); ua.setPrivateKey(Buffer.from("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94", "base64url"));
  assert.equal(decryptPush(out, { ecdh: ua, authBuf: auth }).text, plaintext);
});

test("encryption: header layout, fresh keys and salt every time, receiver can read it", () => {
  const phone = makePhone("https://fcm.googleapis.com/fcm/send/a", 1);
  const p256dh = Buffer.from(phone.doc.p256dh, "base64url");
  const a = encrypt("hello \u00e9\u1f600", p256dh, phone.authBuf), b = encrypt("hello \u00e9\u1f600", p256dh, phone.authBuf);
  const da = decryptPush(a, phone), db = decryptPush(b, phone);
  assert.equal(da.text, "hello \u00e9\u1f600"); assert.equal(db.text, da.text);
  assert.equal(da.header.rs, 4096); assert.equal(da.header.idlen, 65); assert.equal(da.header.senderPub[0], 4); assert.equal(da.header.salt.length, 16);
  assert.equal(a.length, 16 + 4 + 1 + 65 + Buffer.byteLength("hello \u00e9\u1f600") + 1 + 16);
  assert.ok(!da.header.salt.equals(db.header.salt)); assert.ok(!da.header.senderPub.equals(db.header.senderPub));
  const other = makePhone("https://fcm.googleapis.com/fcm/send/b", 1);
  assert.throws(() => decryptPush(a, other), "another phone cannot read it");
  assert.throws(() => decryptPush(a, { ecdh: phone.ecdh, authBuf: randomBytes(16) }), "nor without the auth secret");
  assert.throws(() => encrypt(Buffer.alloc(5000), p256dh, phone.authBuf), SafeError);
  assert.equal(decryptPush(encrypt("", p256dh, phone.authBuf), phone).text, "");
});

test("VAPID header: ES256 JWT with raw 64-byte signature, right claims", () => {
  const { parts, secret } = makeSecret();
  const sec = unpackSecret(secret);
  const now = Date.now();
  const h = vapidHeader({ aud: "https://fcm.googleapis.com", sub: "https://some-family.github.io/happy-home/", key: vapidKey(sec.d, sec.x), x: sec.x, nowMs: now });
  const { header, claims } = checkVapid(h, parts.x, { aud: "https://fcm.googleapis.com", nowMs: now });
  assert.deepEqual(header, { typ: "JWT", alg: "ES256" });
  assert.deepEqual(Object.keys(claims).sort(), ["aud", "exp", "sub"]);
  assert.equal(claims.exp, Math.floor(now / 1000) + 12 * 3600); assert.equal(claims.sub, "https://some-family.github.io/happy-home/");
  // a tampered token no longer verifies
  assert.throws(() => checkVapid(h.replace(/t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-])/, (m, a, c) => `t=${a}.${c === "e" ? "f" : "e"}`), parts.x));
  assert.throws(() => checkVapid(h, makeSecret().parts.x));
});

// ------------------------------------------------------------------ whole runs with a pretend Firebase and push service
const TITLES = ["Swimming in 30 minutes", "Take the bins out", "Piano practice now", "Pay the power bill", "Much later thing"];
function basicWorld(over = {}) {
  const { parts } = makeSecret();
  const dad = makePhone("https://fcm.googleapis.com/fcm/send/DADTOKEN-aaaaaaaaaaaaaaaa:APA91secretpath", 1);
  const kiddo = makePhone("https://web.push.apple.com/KIDDOTOKEN-bbbbbbbbbbbbbbbbbbbbbbbb", 3);
  const world = makeWorld({ parts, subs: { dadphone0000000000aa: dad.doc, kiddophone000000000bb: kiddo.doc }, agenda: null, ...over });
  return { parts, dad, kiddo, world };
}
const SECRET_BITS = (w) => [w.parts.p, w.parts.e, w.parts.f, w.parts.d, packSecret(w.parts), packSecret(w.parts).slice(4), w.world.token, "refresh-SECRET", "DADTOKEN", "KIDDOTOKEN", "APA91secretpath", w.dad.doc.p256dh, w.dad.doc.auth, w.kiddo.doc.auth, ...TITLES, "Aquatic centre"];

test("a run: right people, saved state, nothing twice, no secrets in the log or the state", async () => {
  const w = basicWorld(); const { world } = w;
  world.agenda = { v: 1, tz: "Australia/Brisbane", day: "2026-11-25", updated: NOW, items: [
    item("ev-swim", 0, { who: [3, 1], title: TITLES[0], body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", tag: "ev-swim-2026-11-25" }),
    item("task-bins", -120_000, { who: [1], title: TITLES[1] }),
    item("piano", 50_000, { who: [3], title: TITLES[2] }),
    item("bill", 30_000, { who: [], title: TITLES[3] }),
    item("later", 3 * 3600_000, { title: TITLES[4] }),
    item("stale", -5 * 3600_000, { title: "old" }),
  ] };
  const lines = [];
  const sum = await run({ env: world.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "0" }), fetchFn: world.fetchFn, print: (l) => lines.push(l) });
  assert.equal(sum.ok, true, lines.join("\n")); assert.equal(sum.pushed, 6); assert.equal(sum.failed, 0);
  const got = world.pushes.map((p) => { const phone = p.host === "fcm.googleapis.com" ? w.dad : w.kiddo; return { to: phone === w.dad ? "dad" : "kiddo", msg: JSON.parse(decryptPush(p.body, phone).text), p }; });
  const list = (who) => got.filter((g) => g.to === who).map((g) => g.msg.hh.id).sort();
  assert.deepEqual(list("dad"), ["bill", "ev-swim", "task-bins"]); assert.deepEqual(list("kiddo"), ["bill", "ev-swim", "piano"]);
  const swim = got.find((g) => g.msg.hh.id === "ev-swim" && g.to === "kiddo");
  assert.deepEqual(swim.msg, { web_push: 8030, notification: { title: TITLES[0], body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", navigate: "https://some-family.github.io/happy-home/#calendar", silent: false, tag: "ev-swim-2026-11-25" }, hh: { id: "ev-swim" } });
  for (const g of got) {
    const h = g.p.headers;
    assert.equal(h.ttl, "3600"); assert.equal(h.urgency, "high"); assert.equal(h["content-encoding"], "aes128gcm"); assert.equal(h["content-type"], "application/octet-stream");
    assert.match(h.topic, /^[A-Za-z0-9_-]{1,32}$/); assert.equal(g.p.redirect, "manual");
    const { claims } = checkVapid(h.authorization, w.parts.x, { aud: g.to === "dad" ? "https://fcm.googleapis.com" : "https://web.push.apple.com" });
    assert.equal(claims.sub, "https://some-family.github.io/happy-home/");
  }
  // state
  const st = world.state;
  assert.equal(st.v, 1); assert.equal(st.lastError, ""); assert.equal(st.sentCount, 6);
  assert.ok(st.lastRun >= NOW && st.lastRun < NOW + 5000); assert.equal(st.lastOk, st.lastRun); assert.ok(st.lastSent >= NOW);
  assert.deepEqual(Object.keys(st.sent).sort(), ["bill", "ev-swim", "piano", "stale", "task-bins"], "sent + too-late are recorded, the later one is not");
  // every call to Firebase and to the push services refuses redirects
  assert.ok(world.calls.every((c) => c.redirect === "manual"));
  // second run a minute later: nothing goes out again
  const before = world.pushes.length;
  const sum2 = await run({ env: world.env({ HH_NOW: String(NOW + 60_000), HH_RUN_SECONDS: "0" }), fetchFn: world.fetchFn, print: (l) => lines.push(l) });
  assert.equal(world.pushes.length, before); assert.equal(sum2.pushed, 0); assert.equal(world.state.sentCount, 6);
  // logs: only "notify: ..." single lines, and none of the secret material
  assert.ok(lines.length >= 4);
  const everything = lines.join("\n") + "\n" + JSON.stringify(world.state);
  for (const l of lines) { assert.match(l, /^notify: [^\r\n]*$/); assert.ok(!l.includes("::"), "no workflow command syntax"); }
  for (const s of SECRET_BITS(w)) assert.ok(!everything.includes(s), "leaked: " + s.slice(0, 12));
  assert.ok(!/https?:\/\//.test(lines.join("\n")), "no URLs in the log");
});

test("a run that stays on: sends each reminder at its time, then stops as soon as nothing else is close", async () => {
  const w = basicWorld(); const { world } = w;
  world.agenda = { v: 1, tz: "Australia/Brisbane", items: [item("a", 0), item("b", 200_000), item("c", 7200_000)] };
  const t = virtualTime(); const times = {};
  const orig = world.fetchFn;
  const fetchFn = async (url, init) => { t.now += 5; const r = await orig(url, init); return r; };
  const sum = await run({ env: world.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "540" }), fetchFn, print: () => {}, clock: t.clock, sleep: t.sleep });
  const start = t.now - t.slept.reduce((x, y) => x + y, 0) - world.calls.length * 5;
  for (const p of world.pushes) { const phone = p.host === "fcm.googleapis.com" ? w.dad : w.kiddo; const id = JSON.parse(decryptPush(p.body, phone).text).hh.id; times[id] = times[id] || world.calls.findIndex((c) => c.url === p.url); }
  assert.deepEqual(Object.keys(world.state.sent).sort(), ["a", "b"]); assert.equal(sum.pushed, 4);
  const bAt = world.state.sent.b - NOW;
  assert.ok(bAt >= 196_000 && bAt <= 201_000, "b went out within a few seconds of its time, at +" + bAt + " ms");
  assert.ok(t.now - start < 215_000, "the run ended right after b, not at the 540 s limit");
  assert.ok(Math.max(...t.slept) <= 60_000, "it looks at the agenda at least once a minute while waiting");
  assert.ok(sum.passes >= 4);
});

test("a run that stays on: picks up changes made while waiting, covers the gap before the next run, never overruns", async () => {
  const w = basicWorld(); const { world } = w;
  // d is 30 s after the run length: sent at the last look (so the 10-minute schedule leaves no hole). e is too far: left for the next run.
  world.agenda = { v: 1, tz: "Australia/Brisbane", items: [item("gone", 300_000), item("d", 570_000), item("e", 660_000)] };
  const t = virtualTime(); const t0 = t.now;
  const orig = world.fetchFn; let reads = 0;
  const fetchFn = async (url, init) => {
    if (String(url).endsWith("/notify/agenda") && ++reads === 3) world.agenda = { v: 1, tz: "Australia/Brisbane", items: [item("added", 150_000), item("d", 570_000), item("e", 660_000)] }; // family deletes one, adds one
    return orig(url, init);
  };
  const sum = await run({ env: world.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "540" }), fetchFn, print: () => {}, clock: t.clock, sleep: t.sleep });
  assert.deepEqual(Object.keys(world.state.sent).sort(), ["added", "d"]);
  const addedAt = world.state.sent.added - NOW, dAt = world.state.sent.d - NOW;
  assert.ok(addedAt >= 146_000 && addedAt <= 151_000, "added at +" + addedAt);
  assert.ok(dAt >= 520_000 && dAt <= 530_000, "d went with the last look, at +" + dAt);
  assert.ok(t.now - t0 <= 540_000, "never longer than the run length");
  assert.equal(sum.ok, true);
});

test("push failures: 410 and 404 remove the subscription, 500 is retried once and noted by host only, redirects are not followed", async () => {
  const w = basicWorld(); const { world } = w;
  const mum = makePhone("https://updates.push.services.mozilla.com/wpush/v2/MUMTOKEN-cccccccccccc", 2);
  const tab = makePhone("https://wns2-sg2p.notify.windows.com/w/?token=TABTOKEN", 2);
  const red = makePhone("https://jmt17.google.com/fcm/send/REDIRECTTOKEN", 2);
  Object.assign(world.subs, { mumphone: mum.doc, tablet: tab.doc, redirector: red.doc, "odd id with?chars#x": { ...makePhone("https://fcm.googleapis.com/fcm/send/ODD", 2).doc } });
  world.agenda = { v: 1, tz: "Australia/Brisbane", items: [item("one", 0, { title: TITLES[0] }), item("two", -1000, { title: TITLES[1] })] };
  const tries = {};
  const w2 = makeWorld({ parts: w.parts, agenda: world.agenda, subs: world.subs, pushStatus: (u) => {
    tries[u.hostname] = (tries[u.hostname] || 0) + 1;
    if (u.hostname === "fcm.googleapis.com") return u.pathname.endsWith("ODD") ? 404 : 410;
    if (u.hostname === "web.push.apple.com") return 500;
    if (u.hostname === "wns2-sg2p.notify.windows.com") return tries[u.hostname] === 1 ? 503 : 201;
    if (u.hostname === "jmt17.google.com") return 302;
    return 201;
  } });
  const lines = []; const t = virtualTime();
  const sum = await run({ env: w2.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "30" }), fetchFn: w2.fetchFn, print: (l) => lines.push(l), clock: t.clock, sleep: t.sleep });
  assert.deepEqual(w2.deleted.sort(), ["dadphone0000000000aa", "odd id with?chars#x"], "dead subscriptions are deleted (odd ids are escaped properly)");
  assert.equal(tries["fcm.googleapis.com"], 2, "a dead subscription is not tried again for the second item");
  assert.equal(tries["web.push.apple.com"], 4, "500: each of the two items is tried twice");
  assert.equal(tries["wns2-sg2p.notify.windows.com"], 3, "503 then 201: one retry, then fine");
  assert.equal(tries["jmt17.google.com"], 2, "a redirect is a plain failure, never followed, not retried");
  assert.ok(!w2.calls.some((c) => c.url.includes("169.254")), "nothing was sent to the redirect target");
  assert.equal(sum.removed, 2); assert.equal(sum.ok, false);
  const st = w2.state;
  assert.match(st.lastError, /web\.push\.apple\.com status 500/); assert.match(st.lastError, /jmt17\.google\.com status 302/);
  assert.equal(st.lastOk, 0, "lastOk is not set when something failed"); assert.ok(st.lastRun > 0); assert.equal(st.sentCount, 4);
  assert.deepEqual(Object.keys(st.sent).sort(), ["one", "two"], "items are recorded once an attempt was made");
  const everything = lines.join("\n") + JSON.stringify(st);
  for (const s of [...SECRET_BITS(w), "MUMTOKEN", "TABTOKEN", "REDIRECTTOKEN", "ODD"]) assert.ok(!everything.includes(s), "leaked: " + s.slice(0, 12));
});

test("hostile data: internal addresses are never called, junk never crashes the run", async () => {
  const w = basicWorld(); const { world } = w;
  const good = makePhone("https://fcm.googleapis.com/fcm/send/GOODTOKEN", 1);
  const evil = ["http://169.254.169.254/latest/meta-data/", "https://169.254.169.254/x", "http://127.0.0.1:8080/v1/projects", "http://localhost:9099/", "https://[::1]/", "https://evil.example/push", "https://fcm.googleapis.com.evil.example/x",
    "https://user:pw@fcm.googleapis.com/x", "file:///etc/passwd", "https://metadata.google.internal/computeMetadata/v1/", "gopher://10.0.0.1/"];
  const subs = { good: good.doc };
  evil.forEach((endpoint, i) => { subs["evil" + i] = { ...makePhone("https://x.invalid/", 1).doc, endpoint }; });
  Object.assign(subs, { junk1: { who: {}, endpoint: 5, p256dh: [], auth: {} }, junk2: {}, junk3: { endpoint: "https://fcm.googleapis.com/fcm/send/J", p256dh: "!!", auth: "??" } });
  const agenda = { v: 1, tz: { evil: true }, items: [
    item("real", 0, { who: [1], title: TITLES[0] }),
    item("__proto__", 0, { who: [1] }), item("constructor", 0, { who: [1] }), item("toString", 0, { who: [1] }),
    item("::error::injected", 0, { who: [1], title: "::add-mask::x\n::set-output name=a::b", tag: "\n::warning::t" }),
    { id: { $ne: 1 }, when: bne(NOW), who: [1], title: { toString: "x" }, body: ["a"], tag: 5, url: { href: "x" } },
    null, 1, "x", [[]], { when: [] }, { when: "2026-99-99T99:99" },
  ] };
  const w2 = makeWorld({ parts: w.parts, agenda, subs, state: { v: "x", lastRun: "yesterday", sent: { real0: "x", __proto__: 5 }, sentCount: { a: 1 } } });
  const lines = [];
  const sum = await run({ env: w2.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "0" }), fetchFn: w2.fetchFn, print: (l) => lines.push(l) });
  assert.ok(sum.signedIn);
  assert.ok(w2.pushes.length >= 5 && w2.pushes.every((p) => p.host === "fcm.googleapis.com" && p.url.endsWith("GOODTOKEN")), "only the one real subscription was contacted");
  const hosts = new Set(w2.calls.map((c) => new URL(c.url).hostname));
  assert.deepEqual([...hosts].sort(), ["auth.test", "fcm.googleapis.com", "fire.test"]);
  assert.equal({}.polluted, undefined);
  assert.ok(w2.state && w2.state.v === 1 && w2.state.lastRun >= NOW, "state was still saved");
  assert.match(w2.state.lastError, /a subscription was ignored/); assert.equal(w2.state.lastOk, 0);
  for (const l of lines) { assert.match(l, /^notify: [^\r\n]*$/); assert.ok(!l.includes("::"), "workflow commands cannot be injected: " + l); }
  assert.ok(!lines.join("\n").includes("evil.example"), "names of refused hosts stay out of the public log");
  const msgs = w2.pushes.map((p) => JSON.parse(decryptPush(p.body, good).text));
  assert.ok(msgs.every((m) => typeof m.notification.title === "string" && !/[\n\r]/.test(m.notification.title + (m.notification.tag || ""))));
});

test("things that go wrong end quietly: bad sign-in, chatty errors, Firestore down, state cannot be saved", async () => {
  // wrong password; the pretend server even echoes the password back in its error, and it must not reach the log
  const w = basicWorld(); const lines = [];
  w.world.agenda = { v: 1, items: [item("a", 0, { title: TITLES[0] })] };
  const badEnv = { ...w.world.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "0" }), HH_NOTIFIER: packSecret({ ...w.parts, p: "WrongPassword-12345" }) };
  let sum = await run({ env: badEnv, fetchFn: w.world.fetchFn, print: (l) => lines.push(l) });
  assert.equal(sum.signedIn, false); assert.equal(w.world.pushes.length, 0);
  assert.match(lines.join("\n"), /sign-in: status 400 INVALID_PASSWORD/); assert.match(lines.join("\n"), /make a new code in the app/);
  assert.ok(!lines.join("\n").includes("WrongPassword-12345"));

  // fetch itself throws with the full URL (family id inside) in its message
  const lines2 = [];
  const boom = async (url) => { if (String(url).includes("fire.test")) { const e = new TypeError("fetch failed for " + url); e.cause = { code: "ECONNREFUSED", message: String(url) }; throw e; } return w.world.fetchFn(url, { method: "POST", body: JSON.stringify({ email: w.parts.e, password: w.parts.p }) }); };
  sum = await run({ env: w.world.env({ HH_RUN_SECONDS: "0" }), fetchFn: boom, print: (l) => lines2.push(l), sleep: async () => {} });
  assert.equal(sum.ok, false); assert.match(lines2.join("\n"), /stopped: read state: network error ECONNREFUSED/);
  for (const s of SECRET_BITS(w)) assert.ok(!lines2.join("\n").includes(s), "leaked " + s.slice(0, 10));

  // the state cannot be saved: stop after the first group instead of sending more that might repeat
  const w3 = basicWorld(); const lines3 = [];
  w3.world.agenda = { v: 1, items: Array.from({ length: 60 }, (_, i) => item("i" + i, -i * 1000)) };
  const w3b = makeWorld({ parts: w3.parts, agenda: w3.world.agenda, subs: w3.world.subs, onCall: (u, init) => (init.method === "PATCH" ? new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }) : null) });
  sum = await run({ env: w3b.env({ HH_NOW: String(NOW), HH_RUN_SECONDS: "60" }), fetchFn: w3b.fetchFn, print: (l) => lines3.push(l), sleep: async () => {} });
  assert.ok(w3b.pushes.length > 0 && w3b.pushes.length <= 24, "only the first group (" + w3b.pushes.length + " pushes) went out");
  assert.match(lines3.join("\n"), /stopped: save state: status 429 RESOURCE_EXHAUSTED/);

  // no secret, junk secret, missing config, agenda missing, notifier removed from the family (403)
  const say = async (env, fetchFn = async () => { throw new Error("no network expected"); }, configText = null) => { const out = []; const s = await run({ env, fetchFn, print: (l) => out.push(l), configText }); return { out: out.join("\n"), s }; };
  assert.match((await say({})).out, /not set up yet/);
  assert.match((await say({ HH_NOTIFIER: "hh1.garbage" })).out, /could not be read/);
  assert.match((await say({ HH_NOTIFIER: packSecret(w.parts) }, undefined, "window.HH_FIREBASE_CONFIG = null;")).out, /not connected to Firebase/);
  const w4 = basicWorld();
  const r4 = await say(w4.world.env({ HH_RUN_SECONDS: "0" }), w4.world.fetchFn);
  assert.match(r4.out, /agenda: 0 reminders/); assert.match(r4.out, /finished, all good/); assert.equal(w4.world.state.lastError, "");
  const w5 = basicWorld();
  const w5b = makeWorld({ parts: w5.parts, agenda: null, onCall: (u) => (u.hostname === "fire.test" ? new Response('{"error":{"status":"PERMISSION_DENIED","message":"Missing or insufficient permissions."}}', { status: 403 }) : null) });
  assert.match((await say(w5b.env({ HH_RUN_SECONDS: "0" }), w5b.fetchFn)).out, /status 403 PERMISSION_DENIED\. The notifier is not a member/);
  // config read from the file text when the env overrides are absent
  const w6 = basicWorld(); const env6 = w6.world.env({ HH_RUN_SECONDS: "0" }); delete env6.HH_API_KEY; delete env6.HH_PROJECT_ID;
  assert.match((await say(env6, w6.world.fetchFn, 'window.HH_FIREBASE_CONFIG={apiKey:"demo-key",projectId:"demo-happyhome"};')).out, /finished, all good/);
});

test("the scrubber removes secrets, tokens and addresses from any text", () => {
  const s = makeScrubber(); s.add("hunter2-password", "FAMILYCODE", "abc");
  const out = s.scrub("failed for hunter2-password in FAMILYCODE at https://fcm.googleapis.com/fcm/send/TOKEN123?x=1 with eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl and hh1.eyJlIjoiYSJ9abc\n::error::x abc");
  assert.equal(out, "failed for *** in *** at fcm.googleapis.com with *** and *** ::error::x abc");
  assert.ok(s.scrub("x".repeat(1000)).length <= 300);
});
