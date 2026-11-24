#!/usr/bin/env node
// Happy Home notification sender.
//
// Runs on a schedule (GitHub Actions), signs in to Firebase as the family's "notifier" user, reads the agenda the app
// saved, and sends the reminders that are due as Web Push messages (RFC 8030 / 8188 / 8291 / 8292).
// Node 20+, no npm dependencies: only node: built-ins and the global fetch.
//
// SAFETY RULES for anyone editing this file (the repository and its Action logs are PUBLIC):
//   * never print the secret, the password, tokens, the family id, subscription keys, endpoints, titles or bodies;
//     every line goes through log(), which scrubs known secrets, URLs and control characters as a second net
//   * everything read from Firestore (agenda, state, subscriptions) is untrusted: any family member can write it
//   * push requests only go to https hosts on the push-service allow-list, never follow redirects
//   * always exit 0, so GitHub never emails the owner about a failed run

import { createCipheriv, createECDH, createHash, createHmac, createPrivateKey, randomBytes, sign as cryptoSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// ------------------------------------------------------------------------------------------------ constants
export const DEFAULT_TZ = "Australia/Brisbane";
export const LEAD_MS = 60_000;            // an item is due when its time is within the next 60 s
export const LOOP_LEAD_MS = 3_000;        // while the run stays alive we can wait for the real time instead
export const LATE_MS = 3 * 3600_000;      // more than 3 hours overdue: never send
export const KEEP_SENT_MS = 3 * 86400_000; // remember sent ids for 3 days
const MAX_SENT = 3000;                    // hard cap on remembered ids (keeps the state document small)
const MAX_ITEMS = 400;                    // agenda items looked at per read
const MAX_SUBS = 300;
const MAX_PUSHES = 1500;                  // pushes per run; far above anything a family needs, stops a flood
const PUSH_TIMEOUT_MS = 10_000;
const FIRE_TIMEOUT_MS = 15_000;
const FINAL_MARGIN_MS = 15_000;           // the last look at the agenda happens this long before the run length is up
const POLL_MS = 60_000;                   // while waiting, look at the agenda again at least this often
const DEFAULT_RUN_S = 540;
const MAX_RUN_S = 660;
const TITLE_MAX = 80, BODY_MAX = 180, PAYLOAD_MAX = 2800;
const RECORD_SIZE = 4096;

// Hosts that really are browser push services. An entry starting with "." matches any sub-domain.
export const PUSH_HOSTS = [
  "fcm.googleapis.com", "jmt17.google.com", "android.googleapis.com", // Chrome, Edge on Android, Samsung, Brave, Opera
  ".push.services.mozilla.com",                                        // Firefox
  ".push.apple.com",                                                   // Safari, iPhone and iPad home-screen apps
  ".notify.windows.com",                                               // Edge on Windows
];

// An error whose message was written by this file and is safe to print and to store in notify/state.
export class SafeError extends Error {}

// ------------------------------------------------------------------------------------------------ small helpers
export const b64u = (buf) => Buffer.from(buf).toString("base64url");
export function unb64u(str) {
  if (typeof str !== "string" || str.length > 4096) return null;
  const s = str.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  return Buffer.from(s, "base64url");
}
const sha256 = (data) => createHash("sha256").update(data).digest();
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => { const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : null; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Plain single-line text: no control or direction-override characters, no broken surrogates, at most `max` characters. */
export function cleanText(v, max) {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return "";
  let s = v.slice(0, max * 8 + 64);
  s = typeof s.toWellFormed === "function" ? s.toWellFormed() : s.replace(/[\ud800-\udfff]/g, "\ufffd");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join("").trimEnd() + "\u2026" : s;
}

/** Collects secret strings and removes them (and anything URL- or token-shaped) from text before it is printed or stored. */
export function makeScrubber() {
  const secrets = new Set();
  return {
    add(...vals) { for (const v of vals) if (typeof v === "string" && v.length >= 6) secrets.add(v); },
    scrub(text, max = 300) {
      let s = String(text);
      for (const v of [...secrets].sort((a, b) => b.length - a.length)) s = s.split(v).join("***");
      s = s.replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(\.[A-Za-z0-9_-]*)?/g, "***");           // anything shaped like a JWT
      s = s.replace(/\bhh1\.[A-Za-z0-9_-]{8,}/g, "***");                                               // anything shaped like our secret
      s = s.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s"'<>)]+/gi, (m) => { try { return new URL(m).hostname || "(address)"; } catch { return "(address)"; } });
      s = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();
      return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
    },
  };
}

// ------------------------------------------------------------------------------------------------ the secret
/** "hh1." + base64url(JSON {e,p,f,d,x}). Same format as HHPush.packSecret in push.js. */
export function packSecret({ e, p, f, d, x }) {
  return "hh1." + b64u(Buffer.from(JSON.stringify({ e, p, f, d, x }), "utf8"));
}

/** Decode and validate the secret. Throws SafeError (whose message never contains any part of the secret). */
export function unpackSecret(str) {
  if (typeof str !== "string") throw new SafeError("it is empty");
  let s = str.trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, "");
  if (!s) throw new SafeError("it is empty");
  if (!s.startsWith("hh1.")) throw new SafeError('it does not start with "hh1."');
  if (s.length > 4000) throw new SafeError("it is too long");
  const raw = unb64u(s.slice(4));
  let o = null;
  try { o = JSON.parse(raw.toString("utf8")); } catch { /* handled below */ }
  if (!isObj(o)) throw new SafeError("it is cut off or mistyped");
  const str1 = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
  if (!str1(o.e, 320) || !o.e.includes("@")) throw new SafeError("the sign-in name is missing");
  if (!str1(o.p, 400)) throw new SafeError("the password is missing");
  if (!str1(o.f, 200) || o.f.includes("/") || o.f === "." || o.f === ".." || /^__.*__$/.test(o.f)) throw new SafeError("the family id is missing");
  const d = unb64u(o.d), x = unb64u(o.x);
  if (!d || d.length !== 32) throw new SafeError("the private key is not 32 bytes");
  if (!x || x.length !== 65 || x[0] !== 4) throw new SafeError("the public key is not a 65-byte P-256 point");
  try {
    const ec = createECDH("prime256v1");
    ec.setPrivateKey(d);
    if (!ec.getPublicKey().equals(x)) throw new Error("mismatch");
  } catch { throw new SafeError("the private and public keys do not belong together"); }
  return { e: o.e, p: o.p, f: o.f, d, x };
}

// ------------------------------------------------------------------------------------------------ firebase-config.js
/** Pull apiKey and projectId out of the text of firebase-config.js (it is a browser script, so: regex, never eval). */
export function readConfig(text) {
  const pick = (name) => {
    const m = new RegExp("[\"']?" + name + "[\"']?\\s*:\\s*([\"'`])([^\"'`\\\\\\s]{1,200})\\1").exec(String(text || ""));
    return m ? m[2] : "";
  };
  return { apiKey: pick("apiKey"), projectId: pick("projectId") };
}
const okApiKey = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(s);
const okProject = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(s);

// ------------------------------------------------------------------------------------------------ time zones
const fmtCache = new Map();
function zoneFmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}
/** The zone name if Intl knows it, otherwise Australia/Brisbane. */
export function safeZone(tz) {
  if (typeof tz === "string" && tz.length > 0 && tz.length <= 64) { try { zoneFmt(tz); return tz; } catch { /* unknown zone */ } }
  return DEFAULT_TZ;
}
/** Offset of the zone from UTC at a real instant, in ms (east of Greenwich is positive). */
export function zoneOffsetMs(ms, tz) {
  const p = {};
  for (const part of zoneFmt(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}
/**
 * "2026-11-25T15:30" on the wall clock of `tz` -> real instant in ms, or null when the text is not a real date and time.
 * A time that happens twice (clocks going back) means the first one; a time that never happens (clocks going
 * forward) is moved forward by the size of the jump.
 */
export function wallToInstant(when, tz) {
  if (typeof when !== "string" || when.length > 32) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(when.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(wall).getUTCDate() !== d) return null; // 31 February and friends
  const zone = safeZone(tz);
  const before = zoneOffsetMs(wall - 86400_000, zone), after = zoneOffsetMs(wall + 86400_000, zone);
  const real = [...new Set([wall - before, wall - after])].filter((c) => zoneOffsetMs(c, zone) === wall - c);
  return real.length ? Math.min(...real) : wall - before;
}

// ------------------------------------------------------------------------------------------------ Firestore values
/** Firestore REST typed value -> plain JS. Maps become objects WITHOUT a prototype, so "__proto__" is just a key. */
export function fsDecode(v, depth = 0) {
  if (!isObj(v) || depth > 24) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue === true;
  if ("integerValue" in v) { const n = Number(v.integerValue); return Number.isFinite(n) ? n : null; }
  if ("doubleValue" in v) { const n = Number(v.doubleValue); return Number.isNaN(n) ? null : n; }
  if ("stringValue" in v) return typeof v.stringValue === "string" ? v.stringValue : "";
  if ("timestampValue" in v) { const t = Date.parse(v.timestampValue); return Number.isFinite(t) ? t : null; }
  if ("arrayValue" in v) { const a = isObj(v.arrayValue) && Array.isArray(v.arrayValue.values) ? v.arrayValue.values : []; return a.map((x) => fsDecode(x, depth + 1)); }
  if ("mapValue" in v) return fsFields(isObj(v.mapValue) ? v.mapValue.fields : null, depth + 1);
  if ("bytesValue" in v) return typeof v.bytesValue === "string" ? v.bytesValue : "";
  if ("referenceValue" in v) return typeof v.referenceValue === "string" ? v.referenceValue : "";
  if ("geoPointValue" in v) return isObj(v.geoPointValue) ? { lat: Number(v.geoPointValue.latitude) || 0, lng: Number(v.geoPointValue.longitude) || 0 } : null;
  return null;
}
function fsFields(fields, depth = 0) {
  const out = Object.create(null);
  if (isObj(fields)) for (const k of Object.keys(fields)) out[k] = fsDecode(fields[k], depth);
  return out;
}
/** A Firestore REST document ({ name, fields }) -> plain object (no prototype). */
export const fsDoc = (doc) => fsFields(isObj(doc) ? doc.fields : null);

/** Plain JS -> Firestore REST typed value. */
export function fsEncode(v, depth = 0) {
  if (v === null || v === undefined || depth > 24) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { nullValue: null };
    return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => fsEncode(x, depth + 1)) } };
  if (v instanceof Map) return { mapValue: { fields: fsEncodeFields(v, depth + 1) } };
  if (typeof v === "object") return { mapValue: { fields: fsEncodeFields(Object.entries(v), depth + 1) } };
  return { nullValue: null };
}
function fsEncodeFields(entries, depth = 0) {
  const out = Object.create(null);
  for (const [k, val] of entries) {
    if (typeof k !== "string" || k === "" || /^__.*__$/.test(k)) continue; // Firestore refuses these names
    if (val === undefined) continue;
    out[k] = fsEncode(val, depth);
  }
  return out;
}
export const fsBody = (obj) => ({ fields: fsEncodeFields(obj instanceof Map ? obj : Object.entries(obj)) });

// ------------------------------------------------------------------------------------------------ agenda and plan
/** Key used in state.sent for an item. The id itself when Firestore accepts it as a field name, else a hash of it. */
export function sentKey(id) {
  if (typeof id === "string" && id.length >= 1 && id.length <= 150 && !/[\u0000-\u001f\u007f\ud800-\udfff]/.test(id) && !/^__.*__$/.test(id)) return id;
  return "h-" + sha256(String(id)).toString("hex").slice(0, 32);
}

/**
 * Untrusted agenda document -> { tz, items, bad }. Every item comes out as
 * { id, key, at (ms), everyone, who:Set<number>, title, body, tag, url } with safe, capped values.
 */
export function readAgenda(raw) {
  const out = { tz: DEFAULT_TZ, items: [], bad: 0, more: 0 };
  if (!isObj(raw)) return out;
  if (raw.v !== undefined && raw.v !== null && raw.v !== 1) { out.bad = -1; return out; } // a format we do not know
  out.tz = safeZone(raw.tz);
  const list = Array.isArray(raw.items) ? raw.items : [];
  out.more = Math.max(0, list.length - MAX_ITEMS);
  const seen = new Set();
  for (const it of list.slice(0, MAX_ITEMS)) {
    const at = isObj(it) ? wallToInstant(it.when, out.tz) : null;
    if (at === null) { out.bad++; continue; }
    const title = cleanText(it.title, TITLE_MAX), body = cleanText(it.body, BODY_MAX);
    const tag = cleanText(it.tag, 64);
    let id = typeof it.id === "number" && Number.isFinite(it.id) ? String(it.id) : typeof it.id === "string" ? it.id : "";
    if (!id) id = "h-" + sha256(JSON.stringify([it.when, title, body, tag])).toString("hex").slice(0, 32);
    const key = sentKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    // who: missing or [] means everyone; 0 also means the whole family (as in the app's events). Anything unreadable means nobody.
    let everyone = false; const who = new Set();
    const w = it.who;
    if (w === undefined || w === null) everyone = true;
    else if (Array.isArray(w)) {
      if (w.length === 0) everyone = true;
      for (const p of w.slice(0, 50)) { const n = num(p); if (n === 0) everyone = true; else if (n !== null) who.add(n); }
    } else { const n = num(w); if (n === 0) everyone = true; else if (n !== null) who.add(n); }
    const url = typeof it.url === "string" && /^#[A-Za-z0-9_\-./=&?%:~+,;@!]{0,120}$/.test(it.url) ? it.url : "";
    out.items.push({ id: cleanText(id, 150) || key, key, at, everyone, who, title, body, tag, url });
  }
  return out;
}

/**
 * Decide what to do at `now`: `due` = send now, `late` = too old (record as sent, never send),
 * `next` = time of the earliest item still to come (ms) or null. `sent` is a Map or object of key -> ms.
 */
export function plan(items, sent, now, lead = LEAD_MS) {
  const has = (k) => (sent instanceof Map ? sent.has(k) : Object.prototype.hasOwnProperty.call(sent || {}, k));
  const due = [], late = []; let next = null;
  for (const it of items) {
    if (has(it.key)) continue;
    if (it.at <= now + lead) { if (now - it.at > LATE_MS) late.push(it); else due.push(it); }
    else if (next === null || it.at < next) next = it.at;
  }
  due.sort((a, b) => a.at - b.at);
  return { due, late, next };
}

/** Untrusted state document -> clean in-memory state (sent is a Map of key -> ms). */
export function readState(raw, now) {
  const st = { lastRun: 0, lastOk: 0, lastSent: 0, lastError: "", sentCount: 0, sent: new Map() };
  if (!isObj(raw)) return st;
  for (const k of ["lastRun", "lastOk", "lastSent", "sentCount"]) { const n = num(raw[k]); if (n !== null && n >= 0 && n < 1e15) st[k] = Math.floor(n); }
  if (isObj(raw.sent)) {
    for (const k of Object.keys(raw.sent).slice(0, MAX_SENT * 2)) {
      const t = num(raw.sent[k]);
      if (t === null || k !== sentKey(k)) continue;
      st.sent.set(k, Math.min(t, now)); // a time in the future would never be dropped
    }
  }
  return st;
}
/** Drop sent ids older than 3 days (and the oldest ones beyond the cap), return the document to store. */
export function stateDoc(st, now) {
  for (const [k, t] of st.sent) if (now - t > KEEP_SENT_MS) st.sent.delete(k);
  if (st.sent.size > MAX_SENT) {
    const keep = [...st.sent].sort((a, b) => b[1] - a[1]).slice(0, MAX_SENT);
    st.sent = new Map(keep);
  }
  return { v: 1, lastRun: st.lastRun, lastOk: st.lastOk, lastSent: st.lastSent, lastError: st.lastError, sentCount: st.sentCount, sent: st.sent };
}

// ------------------------------------------------------------------------------------------------ subscriptions
/** Extra allowed push hosts from HH_PUSH_HOSTS ("push.example.com, .example.net"). */
export function extraHosts(text) {
  return String(text || "").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^\.?[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(s)).slice(0, 20);
}
/**
 * Is this endpoint a place we are willing to POST to? Returns { ok, url, host, origin } or { ok:false, why, host }.
 * https only, default port, no user:password@, no IP literals, host must be a known push service.
 * With allowHttp (tests only) http://127.0.0.1 and http://localhost are accepted as well.
 */
export function checkEndpoint(endpoint, { allowHttp = false, extra = [] } = {}) {
  if (typeof endpoint !== "string" || endpoint.length < 12 || endpoint.length > 2048) return { ok: false, why: "no address", host: "" };
  if (/[\u0000-\u0020\u007f-\uffff\\]/.test(endpoint)) return { ok: false, why: "odd characters in address", host: "" };
  let u;
  try { u = new URL(endpoint); } catch { return { ok: false, why: "address not understood", host: "" }; }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const safeHost = /^[a-z0-9.-]{1,80}$/.test(host) ? host : "";
  if (u.username || u.password) return { ok: false, why: "address has a user name", host: safeHost };
  if (allowHttp && u.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) return { ok: true, url: u.href, host, origin: u.origin };
  if (u.protocol !== "https:") return { ok: false, why: "not https", host: safeHost };
  if (u.port !== "") return { ok: false, why: "unusual port", host: safeHost };
  if (host.startsWith("[") || /^[0-9.]+$/.test(host) || /^0x/i.test(host) || !host.includes(".")) return { ok: false, why: "not a push service", host: safeHost };
  const allowed = [...PUSH_HOSTS, ...extra].some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
  if (!allowed) return { ok: false, why: "push host not on the allow-list", host: safeHost };
  return { ok: true, url: u.href, host, origin: u.origin };
}

/** Untrusted pushSubs documents -> usable subscriptions (deduplicated by endpoint) plus the reasons others were ignored. */
export function readSubs(docs, opts = {}) {
  const subs = [], ignored = []; const byUrl = new Map();
  for (const { id, data } of docs.slice(0, MAX_SUBS)) {
    if (!isObj(data)) { ignored.push({ why: "empty", host: "" }); continue; }
    const ep = checkEndpoint(data.endpoint, opts);
    if (!ep.ok) { ignored.push({ why: ep.why, host: ep.host }); continue; }
    const p256dh = unb64u(data.p256dh), auth = unb64u(data.auth);
    if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4 || !auth || auth.length !== 16) { ignored.push({ why: "bad keys", host: ep.host }); continue; }
    try { const ec = createECDH("prime256v1"); ec.generateKeys(); ec.computeSecret(p256dh); } catch { ignored.push({ why: "bad keys", host: ep.host }); continue; }
    const same = byUrl.get(ep.url);
    if (same) { same.ids.push(id); continue; } // the same phone saved twice: one push, both docs go if it is dead
    const sub = { ids: [id], who: num(data.who), url: ep.url, host: ep.host, origin: ep.origin, p256dh, auth };
    byUrl.set(ep.url, sub); subs.push(sub);
  }
  return { subs, ignored };
}
export const wants = (sub, item) => item.everyone || (sub.who !== null && item.who.has(sub.who));

// ------------------------------------------------------------------------------------------------ Web Push
/** https://<owner>.github.io/<repo>/ from GITHUB_REPOSITORY ("owner/repo"), or "" when it cannot be worked out. */
export function pagesUrl(repo) {
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(String(repo || ""));
  if (!m || m[2] === "." || m[2] === "..") return "";
  const owner = m[1].toLowerCase();
  return m[2].toLowerCase() === owner + ".github.io" ? `https://${owner}.github.io/` : `https://${owner}.github.io/${m[2]}/`;
}
/** Where a tap on the notification goes: HH_APP_URL (https only) or the GitHub Pages address of this repository. */
export function appUrl(env) {
  if (typeof env.HH_APP_URL === "string" && env.HH_APP_URL) {
    try { const u = new URL(env.HH_APP_URL); if (u.protocol === "https:" && !u.username && !u.password) { u.hash = ""; u.search = ""; if (!u.pathname.endsWith("/")) u.pathname += "/"; return u.href; } } catch { /* fall through */ }
  }
  return pagesUrl(env.GITHUB_REPOSITORY);
}

/** The JSON a phone receives (Apple Declarative Web Push shape, also read by sw-push.js). Returns a Buffer. */
export function buildPayload(item, base) {
  const make = (title, body) => {
    const n = { title: title || "Happy Home", body, navigate: (base || "https://github.com/") + (item.url || ""), silent: false };
    if (item.tag) n.tag = item.tag;
    return Buffer.from(JSON.stringify({ web_push: 8030, notification: n, hh: { id: item.id } }), "utf8");
  };
  let title = cleanText(item.title, TITLE_MAX), body = cleanText(item.body, BODY_MAX);
  if (!title && !body) body = "You have a reminder.";
  let buf = make(title, body);
  for (let max = BODY_MAX; buf.length > PAYLOAD_MAX && max > 0; max = Math.floor(max / 2)) { body = cleanText(body, max); title = cleanText(title, Math.min(TITLE_MAX, max + 20)); buf = make(title, body); }
  return buf;
}

/** Topic header value: at most 32 URL-safe characters, the same for every reminder with the same tag. */
export const topicFor = (item) => sha256("hh:" + (item.tag || item.id)).toString("base64url").slice(0, 24);

/**
 * RFC 8291 message encryption with the aes128gcm content coding (RFC 8188), single record.
 * `p256dh` (65 bytes) and `auth` (16 bytes) come from the subscription. `opts.salt` / `opts.privateKey` exist only
 * so tests can reproduce the RFC's test vector; real calls leave them out and get fresh random values per message.
 */
export function encrypt(plaintext, p256dh, auth, opts = {}) {
  const plain = Buffer.from(plaintext);
  if (plain.length > RECORD_SIZE - 17) throw new SafeError("message too large");
  const ec = createECDH("prime256v1");
  if (opts.privateKey) ec.setPrivateKey(opts.privateKey); else ec.generateKeys();
  const senderPub = ec.getPublicKey(); // 65 bytes, uncompressed
  const shared = ec.computeSecret(p256dh);
  const salt = opts.salt || randomBytes(16);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), p256dh, senderPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.update(Buffer.from([2])), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0); head.writeUInt32BE(RECORD_SIZE, 16); head[20] = senderPub.length;
  return Buffer.concat([head, senderPub, body]);
}

/** Node key object for the VAPID private key (d: 32 bytes, x: 65-byte public point). */
export function vapidKey(d, x) {
  return createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(x.subarray(1, 33)), y: b64u(x.subarray(33, 65)) } });
}
/** RFC 8292 Authorization header value: "vapid t=<ES256 JWT>, k=<public key>". `nowMs` must be the REAL time. */
export function vapidHeader({ aud, sub, key, x, nowMs }) {
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub })));
  const sig = cryptoSign("sha256", Buffer.from(head + "." + claims), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${b64u(x)}`;
}

// ------------------------------------------------------------------------------------------------ HTTP
function netWhy(e) {
  if (e instanceof SafeError) return e.message;
  if (e && (e.name === "TimeoutError" || e.name === "AbortError")) return "timed out";
  const code = (e && e.cause && e.cause.code) || (e && e.code);
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,30}$/.test(code) ? "network error " + code : "network error";
}
async function readCapped(res, max) {
  if (!res.body) return "";
  const reader = res.body.getReader(); const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch { /* ignore */ } throw new SafeError("the reply was too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
const errCode = (text) => {
  try { const e = JSON.parse(text).error; const m = /^[A-Z][A-Z0-9_]{2,60}/.exec(String((e && (e.status || e.message)) || "")); return m ? " " + m[0] : ""; } catch { return ""; }
};
/** One JSON call to Firebase. Never follows redirects, caps the reply size, throws SafeError with status and code only. */
async function fireCall(fetchFn, what, url, { method = "GET", token, body, max = 4_000_000, okStatuses = [] } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res, text;
  try {
    res = await fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(FIRE_TIMEOUT_MS) });
    text = await readCapped(res, max);
  } catch (e) { throw new SafeError(`${what}: ${netWhy(e)}`); }
  if (okStatuses.includes(res.status)) return null;
  if (res.status < 200 || res.status > 299) throw new SafeError(`${what}: status ${res.status}${errCode(text)}`);
  try { return JSON.parse(text); } catch { throw new SafeError(`${what}: reply not understood`); }
}

// ------------------------------------------------------------------------------------------------ the run
/**
 * One whole run. Everything it needs is passed in, so tests can run it with fake network, clock and sleep.
 * Never throws; returns a small summary. `print` receives finished, scrubbed log lines.
 */
export async function run({ env = {}, fetchFn = globalThis.fetch, print = console.log, clock = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), configText = null } = {}) {
  const scrubber = makeScrubber();
  const log = (msg) => { try { print("notify: " + scrubber.scrub(msg)); } catch { /* a log line must never stop the run */ } };
  const sum = { ok: false, signedIn: false, pushed: 0, failed: 0, removed: 0, passes: 0 };
  let saveFinal = null;
  try {
    // --- 1. the secret
    const rawSecret = typeof env.HH_NOTIFIER === "string" ? env.HH_NOTIFIER : "";
    scrubber.add(rawSecret, rawSecret.trim(), rawSecret.trim().slice(4));
    if (!rawSecret.trim()) { log("phone notifications are not set up yet (no HH_NOTIFIER secret). Nothing to do."); return sum; }
    let sec;
    try { sec = unpackSecret(rawSecret); }
    catch (e) { log(`the HH_NOTIFIER secret could not be read: ${e instanceof SafeError ? e.message : "it is damaged"}. Make a new code in the app (Notifications) and paste it into the repository secret again.`); return sum; }
    scrubber.add(sec.e, sec.p, sec.f, b64u(sec.d), sec.d.toString("base64"), sec.d.toString("hex"), encodeURIComponent(sec.f), encodeURIComponent(sec.p), encodeURIComponent(sec.e));

    // --- 2. settings
    const cfg = readConfig(configText);
    const apiKey = env.HH_API_KEY || cfg.apiKey, project = env.HH_PROJECT_ID || cfg.projectId;
    if (!okApiKey(apiKey) || !okProject(project)) { log("firebase-config.js has no apiKey and projectId (the app is not connected to Firebase). Nothing to do."); return sum; }
    const authBase = String(env.HH_AUTH_BASE || "https://identitytoolkit.googleapis.com").replace(/\/+$/, "");
    const fireBase = String(env.HH_FIRESTORE_BASE || "https://firestore.googleapis.com").replace(/\/+$/, "");
    const allowHttp = env.HH_ALLOW_HTTP === "1";
    const epOpts = { allowHttp, extra: extraHosts(env.HH_PUSH_HOSTS) };
    const base = appUrl(env);
    const vapidSub = pagesUrl(env.GITHUB_REPOSITORY) || "https://github.com/";
    const t0 = clock();
    const fakeNow = num(env.HH_NOW);
    const now = () => (fakeNow !== null ? fakeNow + (clock() - t0) : clock());
    const runS = num(env.HH_RUN_SECONDS);
    const runMs = clamp(runS === null ? DEFAULT_RUN_S : runS, 0, MAX_RUN_S) * 1000;
    const deadline = t0 + runMs;                       // on the real clock
    const finalAt = Math.max(t0, deadline - FINAL_MARGIN_MS);

    // --- 3. sign in
    const signIn = await fireCall(fetchFn, "sign-in", `${authBase}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      { method: "POST", body: { email: sec.e, password: sec.p, returnSecureToken: true }, max: 200_000 })
      .catch((e) => { throw new SafeError(/status 400 (INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_EMAIL|USER_DISABLED)/.test(e.message) ? `${e.message}. The code in HH_NOTIFIER no longer works (wrong password or the notifier was removed): make a new code in the app and update the repository secret` : e.message); });
    const token = signIn && typeof signIn.idToken === "string" ? signIn.idToken : "";
    if (!token) throw new SafeError("sign-in: no token in the reply");
    scrubber.add(token, signIn.refreshToken, signIn.localId);
    sum.signedIn = true;
    log("signed in");

    const docs = `${fireBase}/v1/projects/${project}/databases/(default)/documents/families/${encodeURIComponent(sec.f)}`;
    const getDoc = async (what, path) => { const d = await fireCall(fetchFn, what, `${docs}/${path}`, { token, okStatuses: [404] }); return d ? fsDoc(d) : null; };
    const listSubs = async () => {
      const mask = ["who", "endpoint", "p256dh", "auth"].map((f) => "mask.fieldPaths=" + f).join("&");
      const r = await fireCall(fetchFn, "read subscriptions", `${docs}/pushSubs?pageSize=${MAX_SUBS}&${mask}`, { token, max: 16_000_000 });
      const list = r && Array.isArray(r.documents) ? r.documents : [];
      const out = [];
      for (const d of list) { const id = isObj(d) && typeof d.name === "string" ? d.name.split("/").pop() : ""; if (id) out.push({ id, data: fsDoc(d) }); }
      return out;
    };

    // --- 4. state
    const state = readState(await getDoc("read state", "notify/state"), now());
    const errors = [];
    const note = (msg) => { const s = scrubber.scrub(msg, 120); if (errors.length < 5 && !errors.includes(s)) errors.push(s); };
    const save = async (final) => {
      state.lastRun = now();
      state.lastError = scrubber.scrub(errors.join("; "), 240);
      if (final && errors.length === 0) state.lastOk = state.lastRun;
      const body = fsBody(stateDoc(state, now()));
      try { await fireCall(fetchFn, "save state", `${docs}/notify/state`, { method: "PATCH", token, body }); }
      catch { await sleep(400); await fireCall(fetchFn, "save state", `${docs}/notify/state`, { method: "PATCH", token, body }); }
    };
    saveFinal = async (msg) => { if (msg) note(msg); await save(true); };

    const key = vapidKey(sec.d, sec.x);
    const jwtFor = new Map();
    const authFor = (origin) => { let h = jwtFor.get(origin); if (!h) { h = vapidHeader({ aud: origin, sub: vapidSub, key, x: sec.x, nowMs: clock() }); jwtFor.set(origin, h); } return h; };

    /** One push. Resolves to { ok } | { gone } | { fail: "status 500" }. Never throws, never follows a redirect. */
    const pushOne = async (sub, item) => {
      let body, headers;
      try {
        body = encrypt(buildPayload(item, base), sub.p256dh, sub.auth);
        headers = { authorization: authFor(sub.origin), ttl: "3600", urgency: "high", topic: topicFor(item), "content-encoding": "aes128gcm", "content-type": "application/octet-stream" };
      } catch { return { fail: "could not prepare" }; }
      for (let attempt = 0; ; attempt++) {
        let status = 0, why = "";
        try {
          const left = deadline - clock();
          const res = await fetchFn(sub.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(clamp(left, 2000, PUSH_TIMEOUT_MS)) });
          status = res.status;
          try { if (res.body) await res.body.cancel(); } catch { /* ignore */ }
        } catch (e) { why = netWhy(e); }
        if (status >= 200 && status <= 299) return { ok: true };
        if (status === 404 || status === 410) return { gone: true };
        const again = attempt === 0 && (status === 429 || status >= 500 || /^network error/.test(why)) && deadline - clock() > 4000;
        if (!again) return { fail: status ? "status " + status : why };
        await sleep(1000);
      }
    };

    /** Send every due item to the people it is for, a few items at a time, saving the state after each group. */
    const sendDue = async (due, subs) => {
      for (let i = 0; i < due.length;) {
        if (i > 0 && clock() > deadline - 3000) { note("ran out of time; the rest goes with the next run"); break; }
        if (sum.pushed + sum.failed >= MAX_PUSHES) { note("too many reminders at once; the rest goes with the next run"); break; }
        const jobs = [];
        for (; i < due.length && jobs.length < 24; i++) {
          const item = due[i];
          for (const sub of subs) if (!sub.dead && wants(sub, item)) jobs.push({ sub, item });
          state.sent.set(item.key, now()); // an attempt is about to be made (or there is nobody to send it to)
        }
        let cursor = 0; const fails = new Map();
        const worker = async () => {
          while (cursor < jobs.length) {
            const { sub, item } = jobs[cursor++];
            if (sub.dead) continue;
            const r = await pushOne(sub, item);
            if (r.ok) { sum.pushed++; state.sentCount++; state.lastSent = now(); }
            else if (r.gone) { sub.dead = true; }
            else { sum.failed++; const k = `${sub.host} ${r.fail}`; fails.set(k, (fails.get(k) || 0) + 1); }
          }
        };
        await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
        for (const sub of subs) {
          if (!sub.dead || sub.removed) continue;
          sub.removed = true;
          for (const id of sub.ids) {
            try { await fireCall(fetchFn, "remove subscription", `${docs}/pushSubs/${encodeURIComponent(id)}`, { method: "DELETE", token, okStatuses: [404] }); sum.removed++; }
            catch (e) { note(netWhy(e)); }
          }
        }
        for (const [k, n] of fails) note(`push failed: ${k}${n > 1 ? ` (${n} times)` : ""}`);
        await save(false); // if this cannot be saved we stop here rather than risk sending the same reminders again
      }
    };

    // --- 5. the loop: send what is due, then wait for anything else due before this run is over
    let agenda = null, subDocs = null;
    for (;;) {
      sum.passes++;
      const isFinal = clock() >= finalAt - 250;
      try { agenda = readAgenda(await getDoc("read agenda", "notify/agenda")); }
      catch (e) { if (!agenda) throw e; note(netWhy(e)); }
      if (agenda.bad === -1) { note("the agenda was written by a newer version of the app"); log("the agenda has a format this sender does not know. Update notify/send.mjs."); break; }
      const p = plan(agenda.items, state.sent, now(), isFinal ? LEAD_MS : LOOP_LEAD_MS);
      for (const it of p.late) state.sent.set(it.key, now());
      if (sum.passes === 1 || p.due.length || p.late.length) {
        log(`agenda: ${agenda.items.length} reminders${agenda.bad ? `, ${agenda.bad} unreadable` : ""}${agenda.more ? `, ${agenda.more} beyond the limit` : ""}; ${p.due.length} due now${p.late.length ? `, ${p.late.length} too late to send` : ""}`);
      }
      if (p.due.length) {
        try { subDocs = await listSubs(); } catch (e) { if (!subDocs) throw e; note(netWhy(e)); }
        const { subs, ignored } = readSubs(subDocs, epOpts);
        for (const g of ignored.slice(0, 3)) note(`a subscription was ignored: ${g.why}${g.host ? ` (${g.host})` : ""}`);
        const before = { pushed: sum.pushed, failed: sum.failed, removed: sum.removed };
        await sendDue(p.due, subs);
        log(`${subs.length} subscriptions${ignored.length ? ` (${ignored.length} ignored)` : ""}: pushed ${sum.pushed - before.pushed}, failed ${sum.failed - before.failed}, removed ${sum.removed - before.removed} dead`);
      }
      if (isFinal) break;
      const left = finalAt - clock();                        // real time until the last look
      if (p.next === null || p.next > now() + left + LEAD_MS) break; // nothing else falls inside this run
      const wait = clamp(Math.min(p.next - now() - 1500, POLL_MS, left), 250, POLL_MS);
      if (sum.passes === 1 || wait >= POLL_MS) log(`staying on for the next reminder (about ${Math.max(1, Math.round((p.next - now()) / 1000))} s away)`);
      await sleep(wait);
    }

    // --- 6. finish
    await save(true);
    saveFinal = null;
    sum.ok = errors.length === 0;
    log(errors.length ? `finished with ${errors.length} problem(s): ${errors.join("; ")}` : "finished, all good");
  } catch (e) {
    let msg = e instanceof SafeError ? e.message : "unexpected error" + (e && typeof e.name === "string" && /^[A-Za-z]{1,40}$/.test(e.name) ? ` (${e.name})` : "");
    if (/status 403/.test(msg)) msg += ". The notifier is not a member of this family any more: set notifications up again in the app";
    log(`stopped: ${msg}`);
    if (saveFinal) { try { await saveFinal(msg); } catch { log("the problem could not be recorded in the family's data either"); } }
  }
  return sum;
}

// ------------------------------------------------------------------------------------------------ command line
async function cli() {
  const quit = () => { process.exitCode = 0; process.exit(0); };
  process.on("uncaughtException", () => { try { console.log("notify: stopped: unexpected error"); } catch { /* ignore */ } quit(); });
  process.on("unhandledRejection", () => { try { console.log("notify: stopped: unexpected error"); } catch { /* ignore */ } quit(); });
  const runS = num(process.env.HH_RUN_SECONDS);
  // Last resort: never let the job hit its own timeout (a timed-out job counts as failed and GitHub would email the owner).
  setTimeout(() => { try { console.log("notify: stopped: time limit"); } catch { /* ignore */ } quit(); }, (clamp(runS === null ? DEFAULT_RUN_S : runS, 0, MAX_RUN_S) + 60) * 1000).unref();
  let configText = null;
  try { configText = await readFile(new URL("../firebase-config.js", import.meta.url), "utf8"); } catch { /* run() explains */ }
  try { await run({ env: process.env, configText }); } catch { try { console.log("notify: stopped: unexpected error"); } catch { /* ignore */ } }
  quit();
}

let isMain = false;
try { isMain = !!process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href; } catch { /* imported */ }
if (isMain) cli();
