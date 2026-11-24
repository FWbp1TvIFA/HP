/* Happy Home: phone notifications helper. Plain script, no dependencies, defines window.HHPush.
   It makes no network calls of its own and stores nothing: the app saves what these functions return.
   Safe to load anywhere: in a browser without the features it answers "unsupported" instead of throwing. */
(function (root) {
  "use strict";
  var nav = root.navigator || {};
  var ICON = "icons/icon-192.png";

  // ---- base64url <-> bytes
  function toB64u(bytes) {
    if (!bytes) return "";
    var a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), s = "";
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64u(str) {
    var s = String(str || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function fail(code, message) { var e = new Error(message || code); e.code = code; e.hhPush = true; return e; }
  function timeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { resolve(null); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // ---- what kind of device is this
  function isIOS() {
    var ua = nav.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1); // iPadOS says it is a Mac
  }
  function isStandalone() {
    try { return nav.standalone === true || (!!root.matchMedia && root.matchMedia("(display-mode: standalone)").matches); } catch (e) { return false; }
  }
  function device() {
    var ua = nav.userAgent || "";
    if (/iPhone|iPod/.test(ua)) return "iPhone";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1)) return "iPad";
    if (/Android/.test(ua)) return "Android phone";
    if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows PC";
    return "Computer";
  }

  function support() {
    if (root.isSecureContext === false) return { ok: false, why: "insecure" };
    // iPhone and iPad only offer push to an app opened from its Home Screen icon (iOS 16.4 and later).
    if (isIOS() && !isStandalone()) return { ok: false, why: "ios-needs-home-screen" };
    if (!("serviceWorker" in nav)) return { ok: false, why: "no-service-worker" };
    if (!("PushManager" in root) || !("Notification" in root)) return { ok: false, why: "no-push" };
    return { ok: true };
  }
  function permission() {
    try { return "Notification" in root && typeof root.Notification.permission === "string" ? root.Notification.permission : "unsupported"; } catch (e) { return "unsupported"; }
  }

  // ---- the subscription
  function ready() {
    // navigator.serviceWorker.ready never settles when the app has not registered sw.js, so do not wait for ever.
    if (!("serviceWorker" in nav)) return Promise.resolve(null);
    return timeout(nav.serviceWorker.ready, 8000);
  }
  function endpointId(endpoint) {
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(endpoint))).then(function (buf) {
      var a = new Uint8Array(buf), hex = "";
      for (var i = 0; i < 10; i++) hex += (a[i] < 16 ? "0" : "") + a[i].toString(16);
      return hex; // 20 hex characters
    });
  }
  function describe(sub) {
    if (!sub || !sub.endpoint) return Promise.resolve(null);
    var key = "";
    try { key = sub.options && sub.options.applicationServerKey ? toB64u(sub.options.applicationServerKey) : ""; } catch (e) { key = ""; }
    return endpointId(sub.endpoint).then(function (id) {
      return { id: id, endpoint: sub.endpoint, p256dh: toB64u(sub.getKey("p256dh")), auth: toB64u(sub.getKey("auth")), key: key };
    });
  }
  function current() {
    if (!support().ok) return Promise.resolve(null);
    return ready().then(function (reg) { return reg && reg.pushManager ? reg.pushManager.getSubscription() : null; }).then(describe).catch(function () { return null; });
  }

  function askPermission() {
    // Must run inside the tap: iPhone and Safari refuse the question otherwise. Handles the old callback form as well.
    return new Promise(function (resolve) {
      var done = false, finish = function (r) { if (!done) { done = true; resolve(r || permission()); } };
      try {
        var p = root.Notification.requestPermission(finish);
        if (p && typeof p.then === "function") p.then(finish, function () { finish("denied"); });
      } catch (e) { finish(permission()); }
    });
  }
  function enable(pub) {
    var s = support();
    if (!s.ok) return Promise.reject(fail("unsupported", s.why));
    var keyBytes;
    try { keyBytes = fromB64u(pub); } catch (e) { keyBytes = null; }
    if (!keyBytes || keyBytes.length !== 65 || keyBytes[0] !== 4) return Promise.reject(fail("failed", "bad-key"));
    var wanted = toB64u(keyBytes);
    var perm = permission();
    if (perm === "denied") return Promise.reject(fail("denied"));
    var asked = perm === "granted" ? Promise.resolve("granted") : askPermission(); // called before any waiting, so it is still "in the tap"
    return asked.then(function (p) {
      if (p !== "granted") throw fail("denied");
      return ready();
    }).then(function (reg) {
      if (!reg || !reg.pushManager) throw fail("unsupported", "no-service-worker");
      var subscribe = function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes }); };
      return reg.pushManager.getSubscription().then(function (old) {
        if (!old) return subscribe();
        var oldKey = "";
        try { oldKey = old.options && old.options.applicationServerKey ? toB64u(old.options.applicationServerKey) : ""; } catch (e) { oldKey = ""; }
        if (oldKey === wanted) return old;
        if (oldKey) return old.unsubscribe().then(subscribe); // made with another key: start again
        // The browser does not say which key the old one used: subscribing again fails if it differs.
        return subscribe().catch(function () { return old.unsubscribe().then(subscribe); });
      });
    }).then(describe).then(function (d) {
      if (!d || !d.p256dh || !d.auth) throw fail("failed", "no-keys");
      return d;
    }).catch(function (e) {
      if (e && e.hhPush === true) throw e; // one of ours (a DOMException has a numeric .code of its own)
      if (e && e.name === "NotAllowedError") throw fail("denied");
      if (e && e.name === "NotSupportedError") throw fail("unsupported", "no-push");
      throw fail("failed", e && e.name ? e.name : "failed");
    });
  }
  function disable() {
    if (!("serviceWorker" in nav)) return Promise.resolve(null);
    return ready().then(function (reg) { return reg && reg.pushManager ? reg.pushManager.getSubscription() : null; }).then(function (sub) {
      if (!sub) return null;
      return endpointId(sub.endpoint).then(function (id) { return sub.unsubscribe().then(function () { return id; }); });
    }).catch(function () { return null; });
  }

  // ---- the keys and the one code the parent pastes into GitHub
  function makeKeys() {
    var subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return Promise.reject(fail("unsupported", "no-crypto"));
    return subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]).then(function (pair) {
      return Promise.all([subtle.exportKey("jwk", pair.privateKey), subtle.exportKey("raw", pair.publicKey)]);
    }).then(function (out) {
      // d: the 32-byte private number; x: the 65-byte uncompressed public point (0x04 | X | Y). Both base64url, no padding.
      return { d: toB64u(fromB64u(out[0].d)), x: toB64u(out[1]) };
    });
  }
  function packSecret(o) {
    var json = JSON.stringify({ e: String(o.e), p: String(o.p), f: String(o.f), d: String(o.d), x: String(o.x) });
    return "hh1." + toB64u(new TextEncoder().encode(json));
  }
  function unpackSecret(str) {
    try {
      var s = String(str || "").trim();
      if (s.slice(0, 4) !== "hh1.") return null;
      var o = JSON.parse(new TextDecoder().decode(fromB64u(s.slice(4))));
      return o && typeof o === "object" ? { e: o.e, p: o.p, f: o.f, d: o.d, x: o.x } : null;
    } catch (e) { return null; }
  }

  // ---- a notification right now (alarms while the app is open)
  function showLocal(title, body, tag, url) {
    if (permission() !== "granted" || !("serviceWorker" in nav)) return Promise.resolve(false);
    return ready().then(function (reg) {
      if (!reg || !reg.showNotification) return false;
      var opts = { body: String(body || ""), icon: ICON, badge: ICON, data: { url: String(url || "") } };
      if (tag) { opts.tag = String(tag); opts.renotify = true; }
      return reg.showNotification(String(title || "Happy Home"), opts).then(function () { return true; });
    }).catch(function () { return false; });
  }

  root.HHPush = {
    support: support, permission: permission, current: current, enable: enable, disable: disable,
    makeKeys: makeKeys, packSecret: packSecret, unpackSecret: unpackSecret, showLocal: showLocal, device: device
  };
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);
