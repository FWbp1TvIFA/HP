/* Happy Home service worker: makes the app open instantly and work offline. */
const CACHE = "happyhome-v18";
const KEEP = "hh-keep-sounds-1"; // the piano recordings: they never change, so they stay across app updates
const FILES = ["./", "index.html", "app.css", "theme.css", "piano.css", "piano.js", "confetti.js", "fonts/fredoka-latin.woff2", "fonts/nunito-latin.woff2", "app.js", "store.js", "codes.js", "fb.js", "qr.js", "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
const PIANO = ["C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6", "A3", "Fs3"].map(n => "sounds/piano/" + n + ".mp3");
// After an update: clear old copies, then quietly fetch the piano recordings most songs use, so the piano sounds real even before it is first opened.
const getSounds = () => caches.open(KEEP).then(c => Promise.all(PIANO.map(u => c.match(u).then(hit => hit || fetch(u).then(r => { if (r && r.ok) return c.put(u, r); })).catch(() => {}))));
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== KEEP).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(getSounds).catch(() => {})); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Firebase traffic goes straight to the network
  if (url.pathname.indexOf("/sounds/") >= 0) { // piano recordings: saved copy first (they never change), else fetch once and keep
    e.respondWith(caches.open(KEEP).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Network first so updates show up, cache as fallback for offline.
  // If the network is down or very slow (over 4 seconds), open from the saved copy straight away.
  const fromCache = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"));
  const net = fetch(e.request).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; });
  e.respondWith(new Promise(resolve => {
    let done = false; const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => fromCache().then(r => r ? finish(r) : null), 4000);
    net.then(r => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); fromCache().then(r => finish(r || Response.error())); });
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = String((e.notification.data && e.notification.data.url) || "#home");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ("focus" in c) { c.postMessage({ type: "hh-open", url }); return c.focus(); } }
    return self.clients.openWindow("./" + (url.charAt(0) === "#" ? url : "#home"));
  }));
});
