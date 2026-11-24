/* Happy Home service worker: makes the app open instantly and work offline. */
const CACHE = "happyhome-v15";
const FILES = ["./", "index.html", "app.css", "theme.css", "fonts/fredoka-latin.woff2", "fonts/nunito-latin.woff2", "app.js", "store.js", "codes.js", "fb.js", "qr.js", "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Firebase traffic goes straight to the network
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
