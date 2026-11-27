/* Happy Home service worker: makes the app open instantly and work offline. */
const CACHE = "happyhome-v41";
const KEEP = "hh-keep-sounds-1"; // the piano recordings: they never change, so they stay across app updates
const PCODE = "hh-piano-code-1"; // the piano's code when it comes from its own home: kept across app updates, refreshed whenever online
// The piano's own home: the app learns its address only after sign-in, so here it is known only by its shape.
const pianoUrl = u => /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/.test(u.origin) && u.pathname.indexOf("/piano/") === 0;
const FILES = ["./", "index.html", "app.css", "theme.css", "happy.css", "happy.js", "cute.js", "confetti.js", "push.js", "fonts/fredoka-latin.woff2", "fonts/nunito-latin.woff2", "app.js", "store.js", "codes.js", "fb.js", "qr.js", "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
// Each file is fetched fresh from the web (never from the phone's short-term copy), so a new version never saves an older file.
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())); });
const PIANO = ["C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6", "A3", "Fs3"];
// The piano recordings most songs use, fetched from the piano's home once the app says where that is.
const getSounds = base => caches.open(KEEP).then(c => Promise.all(PIANO.map(n => (base || "") + "sounds/piano/" + n + ".mp3").map(u => c.match(u).then(hit => hit || fetch(u, { mode: "cors" }).then(r => { if (r && r.ok) return c.put(u, r); })).catch(() => {}))));
// Recordings that used to come from the app's own address are not used any more: let them go.
const dropOld = () => caches.open(KEEP).then(c => c.keys().then(ks => Promise.all(ks.filter(r => new URL(r.url).origin === location.origin).map(r => c.delete(r)))));
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== KEEP && k !== PCODE).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(dropOld).catch(() => {})); });
// Once the piano has loaded from its home, the app says where that is, and its usual recordings are saved for offline use.
self.addEventListener("message", e => {
  const d = e.data; if (!d || d.type !== "hh-piano" || typeof d.base !== "string") return;
  try { const u = new URL(d.base); if (pianoUrl(u) && u.pathname === "/piano/" && !u.search && !u.hash) e.waitUntil(getSounds(u.href)); } catch (err) { /* not a piano address */ }
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const piano = pianoUrl(url);
  if (e.request.method !== "GET" || (url.origin !== location.origin && !piano)) return; // Firebase traffic (except the piano) goes straight to the network
  if (url.pathname.indexOf("/sounds/") >= 0) { // piano recordings: saved copy first (they never change), else fetch once and keep
    e.respondWith(caches.open(KEEP).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Network first so updates show up, cache as fallback for offline.
  // If the network is down or very slow (over 4 seconds), open from the saved copy straight away.
  const fromCache = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || (piano ? null : caches.match("index.html")));
  // The app's own files are checked with the web every time (a quick "has it changed?"), so a phone never mixes an old file with a new one.
  const ask = url.origin === location.origin ? fetch(e.request, { cache: "no-cache" }).catch(() => fetch(e.request)) : fetch(e.request);
  const net = ask.then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(piano ? PCODE : CACHE).then(c => c.put(e.request, copy)); } return r; });
  e.respondWith(new Promise(resolve => {
    let done = false; const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => fromCache().then(r => r ? finish(r) : null), 4000);
    net.then(r => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); fromCache().then(r => finish(r || Response.error())); });
  }));
});
/* ---- Happy Home: phone notifications (sw-push.js). Paste this whole block into sw.js as it is. ----
   It only adds three listeners and keeps its names to itself, so it cannot clash with the rest of sw.js. */
(() => {
  const ICON = "icons/icon-192.png";
  const scope = () => self.registration.scope;
  const text = (v, max) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");
  // Only ever open pages of this app: anything else (another site, another path, javascript:) becomes the app's front page.
  const inScope = (url) => {
    try {
      const abs = new URL(String(url || ""), scope());
      const base = new URL(scope());
      return abs.origin === base.origin && abs.pathname.startsWith(base.pathname) ? abs.href : base.href;
    } catch (e) { return scope(); }
  };

  self.addEventListener("push", (event) => {
    // iPhone takes the subscription away when a push arrives and nothing is shown, so EVERY path below shows something.
    let data = null, raw = "";
    try { data = event.data ? event.data.json() : null; } catch (e) { try { raw = event.data ? event.data.text() : ""; } catch (e2) { raw = ""; } }
    const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    const n = isObj(data) ? (isObj(data.notification) ? data.notification : data) : {};
    const title = text(n.title, 120) || "Happy Home";
    const body = text(n.body, 400) || text(typeof data === "string" || typeof data === "number" ? data : raw, 400) || (text(n.title, 1) ? "" : "You have a reminder.");
    const tag = text(n.tag, 64);
    const options = { body, icon: ICON, badge: ICON, data: { url: inScope(n.navigate || n.url || (isObj(n.data) ? n.data.url : "")) } };
    if (tag) { options.tag = tag; options.renotify = true; }
    if (n.silent === true) options.silent = true;
    event.waitUntil(
      self.registration.showNotification(title, options)
        .catch(() => self.registration.showNotification("Happy Home", { body: "You have a reminder.", icon: ICON }))
    );
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = inScope(event.notification.data && event.notification.data.url);
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const mine = windows.filter((c) => typeof c.url === "string" && c.url.startsWith(scope()));
      const client = mine.find((c) => c.focused) || mine.find((c) => c.visibilityState === "visible") || mine[0];
      if (!client) { await self.clients.openWindow(url); return; }
      let shown = client;
      try { shown = (await client.focus()) || client; } catch (e) { /* focusing is not always allowed */ }
      // Take the window to the page. A change of #section only does not reload the app (it sees a normal hashchange).
      if (shown.url !== url && shown.navigate) {
        try { shown = (await shown.navigate(url)) || shown; } catch (e) { /* not our window to steer: the message below still tells it */ }
      }
      // Tell the app as well, so it can react even when the address did not change.
      try { shown.postMessage({ type: "hh-open", url }); } catch (e) { /* window went away */ }
    })().catch(() => self.clients.openWindow(url).catch(() => {})));
  });

  self.addEventListener("pushsubscriptionchange", (event) => {
    // The browser replaced or dropped the subscription: make a new one with the same key and tell the app to save it.
    event.waitUntil((async () => {
      try {
        if (!event.newSubscription) {
          const old = event.oldSubscription && event.oldSubscription.options;
          const current = await self.registration.pushManager.getSubscription();
          if (!current && old && old.applicationServerKey) {
            await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: old.applicationServerKey });
          }
        }
      } catch (e) { /* the app will offer to turn notifications on again */ }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) { try { c.postMessage({ type: "hh-push-changed" }); } catch (e) { /* ignore */ } }
    })());
  });
})();
/* ---- end of sw-push.js ---- */
