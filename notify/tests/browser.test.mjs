// push.js and sw-push.js in a real Chromium (Playwright), served from a tiny static server on localhost.
//     node --test notify/tests/browser.test.mjs        (HH_TEST_PORT picks the port, default 8113; HH_KIT the kit folder)
// What this cannot do: deliver a real push. There is no route from here to Apple's, Google's or Mozilla's push
// services, so pushes are injected with the DevTools command ServiceWorker.deliverPushMessage instead.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPayload, readAgenda, unpackSecret, vapidHeader, vapidKey } from "../send.mjs";
import { checkVapid } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const KIT = process.env.HH_KIT || path.resolve(ROOT, "../..");
const REAL = path.join(KIT, "local");
const PORT = Number(process.env.HH_TEST_PORT || 8113);
const ORIGIN = `http://localhost:${PORT}`;
let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { chromium = null; }
const opt = { skip: chromium ? false : "playwright is not installed" };
const optReal = { skip: !chromium ? "playwright is not installed" : existsSync(path.join(REAL, "sw.js")) ? false : "the app's own files are not at " + REAL };

const PAGE = `<!doctype html><meta charset="utf-8"><title>push test</title><script src="push.js"></script>
<script>window.__msgs = []; if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", (e) => window.__msgs.push(e.data));</script><p>push test page</p>`;
const TEST_SW = `self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));\n`;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

let server, browser;
before(async () => {
  if (!chromium) return;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, ORIGIN); let p = decodeURIComponent(url.pathname);
    const send = (body, type) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    try {
      if (p === "/app/" || p === "/app/index.html" || p === "/app/other.html" || p === "/real/test.html") return send(PAGE, "text/html");
      if (p === "/app/push.js" || p === "/real/push.js") return send(readFileSync(path.join(ROOT, "push.js")), "text/javascript");
      if (p === "/app/sw.js") return send(TEST_SW + readFileSync(path.join(ROOT, "sw-push.js"), "utf8"), "text/javascript");
      if (p === "/real/sw.js") return send(readFileSync(path.join(REAL, "sw.js"), "utf8") + "\n" + readFileSync(path.join(ROOT, "sw-push.js"), "utf8"), "text/javascript"); // the app's sw.js with the snippet pasted in
      if (p.startsWith("/app/icons/")) p = "/real" + p.slice(4);
      if (p.startsWith("/real/")) {
        let f = path.join(REAL, p.slice(6) || "index.html"); if (p.endsWith("/")) f = path.join(REAL, "index.html");
        if (f.startsWith(REAL) && existsSync(f)) return send(readFileSync(f), types[path.extname(f)] || "application/octet-stream");
      }
    } catch { /* fall through */ }
    res.writeHead(404); res.end("not found");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PORT, "127.0.0.1", resolve); });
  // The full Chromium build ("new headless") honours a granted notification permission; the small headless shell
  // always answers "denied". Prefer the full build, fall back to the shell (the notification tests then skip).
  browser = await chromium.launch({ channel: "chromium" }).catch(() => chromium.launch());
  const ctx = await browser.newContext(); await ctx.grantPermissions(["notifications"], { origin: ORIGIN });
  const page = await ctx.newPage(); await page.goto(`${ORIGIN}/app/`);
  canNotify = (await page.evaluate(() => Notification.permission)) === "granted";
  await ctx.close();
});
let canNotify = false;
const needNotify = (t) => { if (!canNotify) t.skip("this Chromium build refuses the notification permission in headless mode"); return !canNotify; };
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(ctxOpts = {}, { url = `${ORIGIN}/app/`, init = null, sw = "sw.js", grant = true } = {}) {
  const ctx = await browser.newContext({ locale: "en-AU", timezoneId: "Australia/Brisbane", ...ctxOpts });
  if (grant) await ctx.grantPermissions(["notifications"], { origin: ORIGIN });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  if (sw) await page.evaluate(async (file) => { await navigator.serviceWorker.register(file); await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })); }, sw);
  return { ctx, page, errors };
}
const notes = (page) => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data, icon: n.icon, renotify: n.renotify, silent: n.silent })));
async function waitFor(fn, what, ms = 5000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out waiting for " + what); await new Promise((r) => setTimeout(r, 100)); } }
/** Inject a push into the page's service worker the way the browser's push client would. */
const cdpFor = new WeakMap();
async function deliver(ctx, page, data, scope = `${ORIGIN}/app/`) {
  let c = cdpFor.get(page);
  if (!c) {
    c = { cdp: await ctx.newCDPSession(page), regs: [] };
    c.cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => c.regs.push(...e.registrations));
    await c.cdp.send("ServiceWorker.enable");
    cdpFor.set(page, c);
  }
  const reg = await waitFor(() => c.regs.find((r) => r.scopeURL === scope && !r.isDeleted), "service worker registration id");
  await c.cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId: reg.registrationId, data });
}

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
};

test("support(), permission() and device() for different devices", opt, async (t) => {
  if (needNotify(t)) return;
  const ask = async (ctxOpts, o) => { const { ctx, page, errors } = await open(ctxOpts, { sw: null, ...o }); const r = await page.evaluate(() => ({ support: HHPush.support(), permission: HHPush.permission(), device: HHPush.device() })); await ctx.close(); assert.deepEqual(errors, []); return r; };
  assert.deepEqual(await ask({}), { support: { ok: true }, permission: "granted", device: "Computer" });
  assert.deepEqual((await ask({}, { grant: false })).permission === "granted", false);
  assert.deepEqual(await ask({ userAgent: UA.iphone }), { support: { ok: false, why: "ios-needs-home-screen" }, permission: "granted", device: "iPhone" });
  assert.deepEqual((await ask({ userAgent: UA.iphone }, { init: "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });" })).support, { ok: true }, "opened from the Home Screen icon");
  assert.deepEqual((await ask({ userAgent: UA.iphone }, { init: "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }); delete window.PushManager;" })).support, { ok: false, why: "no-push" }, "Home Screen app on an iOS too old for push");
  const ipad = await ask({ userAgent: UA.ipadOld }); assert.equal(ipad.device, "iPad"); assert.equal(ipad.support.why, "ios-needs-home-screen");
  const ipadOS = await ask({ userAgent: UA.mac }, { init: "Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });" });
  assert.equal(ipadOS.device, "iPad", "iPadOS calls itself a Mac but has a touch screen"); assert.equal(ipadOS.support.why, "ios-needs-home-screen");
  assert.deepEqual(await ask({ userAgent: UA.mac }), { support: { ok: true }, permission: "granted", device: "Mac" });
  assert.equal((await ask({ userAgent: UA.android })).device, "Android phone");
  assert.equal((await ask({ userAgent: UA.windows })).device, "Windows PC");
  assert.equal((await ask({ userAgent: UA.linux })).device, "Computer");
});

test("browsers without the features: 'unsupported' answers, never an exception", opt, async () => {
  const probe = () => Promise.all([
    HHPush.current(), HHPush.showLocal("t", "b", "tag", "#x"), HHPush.disable(),
    HHPush.enable("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4").then(() => "resolved", (e) => e.code),
  ]).then(([current, shown, disabled, enable]) => ({ support: HHPush.support(), permission: HHPush.permission(), current, shown, disabled, enable, device: HHPush.device() }));
  let o = await open({}, { sw: null, init: "delete Navigator.prototype.serviceWorker; delete window.PushManager; delete window.Notification;" });
  assert.deepEqual(await o.page.evaluate(probe), { support: { ok: false, why: "no-service-worker" }, permission: "unsupported", current: null, shown: false, disabled: null, enable: "unsupported", device: "Computer" });
  assert.deepEqual(o.errors, []); await o.ctx.close();
  o = await open({}, { sw: null, init: "delete window.PushManager;" });
  const r = await o.page.evaluate(probe);
  assert.deepEqual(r.support, { ok: false, why: "no-push" }); assert.equal(r.enable, "unsupported"); assert.equal(r.current, null); await o.ctx.close();
  // a plain http page that is not localhost is not a "secure context": everything is switched off there
  o = await open({}, { sw: null, url: "about:blank" });
  await o.page.route("http://hh.test/**", (route) => route.fulfill(route.request().url().endsWith("push.js") ? { contentType: "text/javascript", body: readFileSync(path.join(ROOT, "push.js"), "utf8") } : { contentType: "text/html", body: PAGE }));
  await o.page.goto("http://hh.test/app/");
  const ins = await o.page.evaluate(() => Promise.all([HHPush.current(), HHPush.showLocal("t", "b"), HHPush.makeKeys().then(() => "made", (e) => e.code), HHPush.enable("x").then(() => "ok", (e) => e.code)]).then((a) => ({ support: HHPush.support(), rest: a })));
  assert.deepEqual(ins, { support: { ok: false, why: "insecure" }, rest: [null, false, "unsupported", "unsupported"] });
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test("makeKeys + packSecret in the browser: Node unpacks the code, signs with the key, the browser verifies the signature", opt, async () => {
  const { ctx, page, errors } = await open({}, { sw: null });
  const made = await page.evaluate(async () => {
    const a = await HHPush.makeKeys(), b = await HHPush.makeKeys();
    const parts = { e: "notifier-1@happyhome.invalid", p: "p\u00e4ss \"w\u00f6rd\" \u1f511 123", f: "FAM-code_1", d: a.d, x: a.x };
    const secret = HHPush.packSecret(parts);
    return { a, b, parts, secret, back: HHPush.unpackSecret(secret), junk: [HHPush.unpackSecret("nope"), HHPush.unpackSecret("hh1.%%%"), HHPush.unpackSecret(null)] };
  });
  assert.match(made.a.d, /^[A-Za-z0-9_-]{43}$/); assert.match(made.a.x, /^B[A-Za-z0-9_-]{86}$/);
  assert.equal(Buffer.from(made.a.d, "base64url").length, 32); assert.equal(Buffer.from(made.a.x, "base64url").length, 65); assert.equal(Buffer.from(made.a.x, "base64url")[0], 4);
  assert.notEqual(made.a.d, made.b.d, "a new pair every time");
  assert.match(made.secret, /^hh1\.[A-Za-z0-9_-]+$/); assert.deepEqual(made.back, made.parts); assert.deepEqual(made.junk, [null, null, null]);
  // Node side: unpackSecret also proves d and x belong together
  const sec = unpackSecret(made.secret);
  assert.equal(sec.e, made.parts.e); assert.equal(sec.p, made.parts.p); assert.equal(sec.f, made.parts.f);
  const header = vapidHeader({ aud: "https://fcm.googleapis.com", sub: "https://some-family.github.io/happy-home/", key: vapidKey(sec.d, sec.x), x: sec.x, nowMs: Date.now() });
  checkVapid(header, made.a.x, { aud: "https://fcm.googleapis.com" }); // verifies in Node
  // ... and in the browser, with WebCrypto and only the public key
  const jwt = /t=([^,]+),/.exec(header)[1];
  const verdict = await page.evaluate(async ({ jwt, x }) => {
    const un = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const [h, c, s] = jwt.split(".");
    const key = await crypto.subtle.importKey("raw", un(x), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const check = (text) => crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, un(s), new TextEncoder().encode(text));
    return { good: await check(h + "." + c), tampered: await check(h + "." + c + "x") };
  }, { jwt, x: made.a.x });
  assert.deepEqual(verdict, { good: true, tampered: false });
  assert.deepEqual(errors, []); await ctx.close();
});

test("showLocal: shows a notification through the service worker; false without permission", opt, async (t) => {
  if (needNotify(t)) return;
  const { ctx, page, errors } = await open();
  assert.equal(await page.evaluate(() => HHPush.showLocal("Alarm", "Piano practice", "alarm-1", "#home")), true);
  const list = await notes(page);
  assert.equal(list.length, 1);
  assert.deepEqual({ ...list[0], icon: list[0].icon.replace(ORIGIN, "") }, { title: "Alarm", body: "Piano practice", tag: "alarm-1", data: { url: "#home" }, icon: "/app/icons/icon-192.png", renotify: true, silent: list[0].silent });
  assert.equal(await page.evaluate(() => HHPush.showLocal("No tag", "", "", "")), true);
  assert.equal((await notes(page)).length, 2);
  assert.equal(await page.evaluate(() => HHPush.current()), null, "no subscription yet");
  assert.equal(await page.evaluate(() => HHPush.disable()), null);
  assert.deepEqual(errors, []); await ctx.close();
  const denied = await open({}, { grant: false });
  assert.notEqual(await denied.page.evaluate(() => HHPush.permission()), "granted");
  assert.equal(await denied.page.evaluate(() => HHPush.showLocal("Alarm", "x", "t", "#home")), false);
  await denied.ctx.close();
});

test("push event: every push shows a notification, whatever the data looks like", opt, async (t) => {
  if (needNotify(t)) return;
  const { ctx, page, errors } = await open();
  const [item] = readAgenda({ items: [{ id: "ev-abc-2026-11-25-30", when: "2026-11-25T15:30", who: [3], title: "Swimming in 30 minutes", body: "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre", tag: "ev-abc-2026-11-25", url: "#calendar" }] }).items;
  // exactly what send.mjs would send (after decryption by the browser)
  await deliver(ctx, page, buildPayload(item, `${ORIGIN}/app/`).toString());
  let list = await waitFor(async () => { const l = await notes(page); return l.length === 1 ? l : null; }, "the notification");
  assert.equal(list[0].title, "Swimming in 30 minutes"); assert.equal(list[0].body, "4:00 pm \u00b7 Kiddo \u00b7 Aquatic centre"); assert.equal(list[0].tag, "ev-abc-2026-11-25");
  assert.deepEqual(list[0].data, { url: `${ORIGIN}/app/#calendar` }); assert.equal(list[0].icon, `${ORIGIN}/app/icons/icon-192.png`); assert.equal(list[0].renotify, true);
  // the same tag again replaces it instead of piling up
  await deliver(ctx, page, buildPayload({ ...item, title: "Swimming in 10 minutes" }, `${ORIGIN}/app/`).toString());
  list = await waitFor(async () => { const l = await notes(page); return l.length === 1 && l[0].title === "Swimming in 10 minutes" ? l : null; }, "the replacement");
  // a link to somewhere else is not kept: it becomes the app's front page
  const cases = [
    [JSON.stringify({ notification: { title: "Elsewhere", body: "b", navigate: "https://evil.example/phish", tag: "c1" } }), { title: "Elsewhere", url: `${ORIGIN}/app/` }],
    [JSON.stringify({ notification: { title: "Sibling", navigate: `${ORIGIN}/application/x`, tag: "c2" } }), { title: "Sibling", url: `${ORIGIN}/app/` }],
    [JSON.stringify({ notification: { title: "Script", navigate: "javascript:alert(1)", tag: "c3" } }), { title: "Script", url: `${ORIGIN}/app/` }],
    [JSON.stringify({ title: "Flat shape", body: "no notification wrapper", url: "#lists", tag: "c4" }), { title: "Flat shape", url: `${ORIGIN}/app/#lists` }],
    ["just some text, not JSON", { title: "Happy Home", body: "just some text, not JSON" }],
    ["{broken json", { title: "Happy Home", body: "{broken json" }],
    [JSON.stringify([1, 2, 3]), { title: "Happy Home" }],
    [JSON.stringify({ notification: { title: { a: 1 }, body: ["x"], tag: {}, navigate: 5 } }), { title: "Happy Home" }],
    ["null", { title: "Happy Home" }],
    ["12345", { title: "Happy Home", body: "12345" }],
    ["", { title: "Happy Home" }],
  ];
  let count = 1;
  for (const [data, want] of cases) {
    await deliver(ctx, page, data);
    count++;
    list = await waitFor(async () => { const l = await notes(page); return l.length === count ? l : null; }, "notification number " + count + " for " + data.slice(0, 30)).catch(async (e) => { throw new Error(e.message + "; showing " + JSON.stringify((await notes(page)).map((x) => [x.title, x.body, x.tag]))); });
    const n = list.find((x) => x.title === want.title && (want.body === undefined || x.body === want.body) && (want.url === undefined || (x.data && x.data.url === want.url)));
    assert.ok(n, "shown for " + data.slice(0, 40) + ": " + JSON.stringify(list.map((x) => [x.title, x.body, x.data])));
  }
  assert.ok(list.every((n) => n.data && typeof n.data.url === "string" && n.data.url.startsWith(`${ORIGIN}/app/`)), "every stored link stays inside the app");
  assert.deepEqual(errors, []); await ctx.close();
});

test("tapping a notification: the open app window is told where to go; links outside the app are not followed", opt, async (t) => {
  if (needNotify(t)) return;
  const { ctx, page } = await open();
  const [sw] = ctx.serviceWorkers();
  assert.ok(sw, "service worker is visible to the test");
  const tap = (tag) => sw.evaluate(async (t) => {
    const [n] = await self.registration.getNotifications({ tag: t });
    if (!n) return "no notification";
    const e = new NotificationEvent("notificationclick", { notification: n });
    let waited = Promise.resolve(); e.waitUntil = (p) => { waited = p; };
    self.dispatchEvent(e); await waited.catch(() => {});
    return "tapped";
  }, tag);
  await page.evaluate(() => { window.__marker = "still here"; window.__hash = 0; addEventListener("hashchange", () => window.__hash++); return HHPush.showLocal("Swimming", "soon", "tap-1", "#calendar"); });
  assert.equal(await tap("tap-1"), "tapped");
  const msg = await waitFor(() => page.evaluate(() => window.__msgs.find((m) => m && m.type === "hh-open")), "the hh-open message");
  assert.deepEqual(msg, { type: "hh-open", url: `${ORIGIN}/app/#calendar` });
  assert.deepEqual(await page.evaluate(() => ({ hash: location.hash, marker: window.__marker, changes: window.__hash })), { hash: "#calendar", marker: "still here", changes: 1 }, "the app went to #calendar without being reloaded");
  assert.equal((await notes(page)).filter((n) => n.tag === "tap-1").length, 0, "the notification was closed");
  // a notification whose link points elsewhere: the app only ever hears about its own front page
  await page.evaluate(async () => { window.__msgs.length = 0; const reg = await navigator.serviceWorker.ready; await reg.showNotification("Evil", { tag: "tap-2", data: { url: "https://evil.example/phish" } }); await reg.showNotification("No data", { tag: "tap-3" }); });
  await tap("tap-2"); await tap("tap-3");
  const msgs = await waitFor(() => page.evaluate(() => (window.__msgs.length >= 2 ? window.__msgs : null)), "two messages");
  assert.deepEqual(msgs, [{ type: "hh-open", url: `${ORIGIN}/app/` }, { type: "hh-open", url: `${ORIGIN}/app/` }]);
  assert.ok((await page.evaluate(() => location.href)).startsWith(`${ORIGIN}/app/`), "the window never left the app");
  // the window is on another page of the app: it is navigated there
  await page.goto(`${ORIGIN}/app/other.html`);
  await page.evaluate(() => HHPush.showLocal("Bills", "due", "tap-4", "#bills"));
  await tap("tap-4");
  await page.waitForURL(`${ORIGIN}/app/#bills`, { timeout: 5000 });
  await ctx.close();
});

test("pushsubscriptionchange: open windows are told to save the new subscription", opt, async () => {
  const { ctx, page } = await open();
  const [sw] = ctx.serviceWorkers();
  const how = await sw.evaluate(async () => {
    const e = new Event("pushsubscriptionchange");
    let waited = Promise.resolve(); e.waitUntil = (p) => { waited = p; };
    self.dispatchEvent(e); await waited;
    return typeof PushSubscriptionChangeEvent === "undefined" ? "plain Event (this browser has no PushSubscriptionChangeEvent)" : "PushSubscriptionChangeEvent exists";
  });
  const msg = await waitFor(() => page.evaluate(() => window.__msgs.find((m) => m && m.type === "hh-push-changed")), "the hh-push-changed message");
  assert.deepEqual(msg, { type: "hh-push-changed" });
  console.log("# pushsubscriptionchange dispatched as: " + how);
  await ctx.close();
});

test("enable(): bad key and refused permission are reported by code; a real subscription needs a push service", opt, async (t) => {
  if (needNotify(t)) return;
  const pub = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
  const { ctx, page } = await open();
  assert.equal(await page.evaluate(() => HHPush.enable("not-a-key").then(() => "ok", (e) => e.code)), "failed");
  const real = await page.evaluate((k) => HHPush.enable(k).then((s) => ({ ok: true, keys: Object.keys(s).sort(), id: s.id, key: s.key, host: new URL(s.endpoint).host, p: s.p256dh.length, a: s.auth.length }), (e) => ({ ok: false, code: e.code, message: e.message })), pub);
  if (real.ok) {
    assert.deepEqual(real.keys, ["auth", "endpoint", "id", "key", "p256dh"]); assert.match(real.id, /^[0-9a-f]{20}$/); assert.equal(real.key, pub); assert.equal(real.p, 87); assert.equal(real.a, 22);
    const cur = await page.evaluate(() => HHPush.current()); assert.equal(cur.id, real.id);
    assert.equal(await page.evaluate(() => HHPush.disable()), real.id); assert.equal(await page.evaluate(() => HHPush.current()), null);
    console.log("# enable() made a real subscription at " + real.host);
  } else {
    assert.equal(real.code, "failed", JSON.stringify(real));
    console.log("# enable() could not subscribe here (" + real.message + "): no push service is reachable from this machine, so subscribe/current/disable with a live subscription are NOT exercised");
  }
  await ctx.close();
  const denied = await open({}, { grant: false });
  const code = await denied.page.evaluate((k) => HHPush.enable(k).then(() => "ok", (e) => e.code), pub);
  assert.equal(code, "denied", "permission not given (headless Chromium answers the question with no)");
  await denied.ctx.close();
});

test("the snippet pasted into the app's real sw.js: it installs, caches the app and still handles a push", optReal, async (t) => {
  if (needNotify(t)) return;
  const { ctx, page, errors } = await open({}, { url: `${ORIGIN}/real/test.html`, sw: "sw.js" });
  const info = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { state: reg.active && reg.active.state, scope: reg.scope, caches: await caches.keys() }; });
  assert.equal(info.scope, `${ORIGIN}/real/`); assert.ok(["activated", "activating"].includes(info.state)); assert.ok(info.caches.some((c) => c.startsWith("happyhome-")), "the app's own cache was filled (install finished)");
  await deliver(ctx, page, JSON.stringify({ web_push: 8030, notification: { title: "Real sw", body: "works", navigate: `${ORIGIN}/real/#home`, tag: "r1", silent: false }, hh: { id: "x" } }), `${ORIGIN}/real/`);
  const list = await waitFor(async () => { const l = await notes(page); return l.length === 1 ? l : null; }, "the notification");
  assert.equal(list[0].title, "Real sw"); assert.deepEqual(list[0].data, { url: `${ORIGIN}/real/#home` });
  assert.deepEqual(errors, []); await ctx.close();
});

test("enable / current / disable logic with a stand-in PushManager (no push service needed)", opt, async (t) => {
  if (needNotify(t)) return;
  // The browser's own PushManager cannot reach a push service here, so the page gets a stand-in that behaves like one.
  const init = `(() => {
    const log = (window.__pm = { subscribes: 0, unsubscribes: 0, hideKey: false, n: 0 });
    let current = null;
    const fake = {
      getSubscription: async () => current,
      subscribe: async (o) => {
        if (!o || o.userVisibleOnly !== true) throw new DOMException("userVisibleOnly must be true", "NotAllowedError");
        const key = new Uint8Array(o.applicationServerKey);
        if (current && String(current.__key) !== String(key)) throw new DOMException("A subscription with a different applicationServerKey already exists", "InvalidStateError");
        if (current) return current;
        log.subscribes++; log.n++;
        const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/fake-" + log.n, __key: key, options: { userVisibleOnly: true, get applicationServerKey() { return log.hideKey ? null : key.buffer; } },
          getKey: (name) => (name === "p256dh" ? new Uint8Array(65).fill(4).buffer : new Uint8Array(16).fill(7).buffer),
          unsubscribe: async () => { log.unsubscribes++; if (current === sub) current = null; return true; } };
        current = sub; return sub;
      },
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", { get: () => fake });
  })();`;
  const { ctx, page, errors } = await open({}, { init });
  const k1 = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", k2 = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
  const counts = () => page.evaluate(() => ({ s: window.__pm.subscribes, u: window.__pm.unsubscribes }));
  assert.equal(await page.evaluate(() => HHPush.current()), null);
  const a = await page.evaluate((k) => HHPush.enable(k), k1);
  const { createHash } = await import("node:crypto");
  assert.deepEqual(a, { id: createHash("sha256").update("https://fcm.googleapis.com/fcm/send/fake-1").digest("hex").slice(0, 20), endpoint: "https://fcm.googleapis.com/fcm/send/fake-1", p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url"), key: k1 });
  assert.deepEqual(await page.evaluate(() => HHPush.current()), a, "current() describes the same subscription");
  assert.deepEqual(await page.evaluate((k) => HHPush.enable(k), k1), a, "same key again: the existing subscription is kept");
  assert.deepEqual(await counts(), { s: 1, u: 0 });
  const b = await page.evaluate((k) => HHPush.enable(k), k2);
  assert.equal(b.endpoint, "https://fcm.googleapis.com/fcm/send/fake-2"); assert.equal(b.key, k2); assert.notEqual(b.id, a.id);
  assert.deepEqual(await counts(), { s: 2, u: 1 }, "different key: unsubscribed, then subscribed again");
  // a browser that does not reveal the old key: subscribing fails, so it starts again
  await page.evaluate(() => { window.__pm.hideKey = true; });
  const c = await page.evaluate((k) => HHPush.enable(k), k1);
  assert.equal(c.endpoint, "https://fcm.googleapis.com/fcm/send/fake-3"); assert.equal(c.key, "");
  assert.deepEqual(await counts(), { s: 3, u: 2 });
  assert.equal(await page.evaluate(() => HHPush.disable()), c.id, "disable() answers with the id that was removed");
  assert.equal(await page.evaluate(() => HHPush.current()), null); assert.equal(await page.evaluate(() => HHPush.disable()), null);
  assert.deepEqual(errors, []); await ctx.close();
});
