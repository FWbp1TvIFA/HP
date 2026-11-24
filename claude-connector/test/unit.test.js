// Fast tests with no network: dates, sealed tokens, return-address rules, two-step sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTime, nextDue, addOneMonthLikeApp, countdownNext, isISODate } from "../src/dates.js";
import { seal, unseal, pkceMatches, sha256base64url } from "../src/crypto.js";
import { redirectAllowed } from "../src/oauth.js";
import { handle } from "../src/handler.js";
import { toValue, fromValue } from "../src/firebase.js";
import { Family, namesOf, ALLOWED_COLLECTIONS } from "../src/family.js";
import { TYPE_COLLECTION } from "../src/tools.js";
import { nowTimeIn } from "../src/dates.js";

const T = "2026-11-24"; // a Tuesday
const KEY = "Kq7vT2mX9pL4wR8nB3cF6hJ1sD5gZ0yAe"; // a random-looking HH_SECRET for tests

test("dates like the app", () => {
  assert.equal(parseDate("tomorrow", T), "2026-11-25");
  assert.equal(parseDate("friday", T), "2026-11-27");
  assert.equal(parseDate("tuesday", T), T);
  assert.equal(parseDate("next tuesday", T), "2026-12-01");
  assert.equal(parseDate("3/12/2026", T), "2026-12-03");
  assert.throws(() => parseDate("31/02/2026", T));
  assert.equal(parseTime("3pm"), "15:00"); assert.equal(parseTime("12am"), "00:00"); assert.equal(parseTime("12:15 pm"), "12:15"); assert.equal(parseTime(""), "");
  assert.throws(() => parseTime("25:00"));
  assert.equal(nextDue("2026-01-31", "month"), "2026-02-28");
  assert.equal(nextDue("2026-11-30", "quarter"), "2027-02-28");
  assert.equal(nextDue("2026-11-24", "fortnight"), "2026-12-08");
  assert.equal(addOneMonthLikeApp("2026-01-31"), "2026-03-03");
  assert.equal(countdownNext({ date: "2015-03-03", yearly: true }, T), "2027-03-03");
  assert.equal(countdownNext({ date: "2015-12-25", yearly: true }, T), "2026-12-25");
  assert.ok(isISODate("2028-02-29")); assert.ok(!isISODate("2027-02-29"));
});

test("sealed tokens can't be forged, swapped or reused after expiry", async () => {
  const s = "k".repeat(40);
  const t = await seal(s, "access", { u: "a", t: "rt" }, 60);
  assert.deepEqual((await unseal(s, "access", t)).u, "a");
  assert.equal(await unseal(s, "refresh", t), null);
  assert.equal(await unseal("j".repeat(40), "access", t), null);
  assert.equal(await unseal(s, "access", "hht_" + t.slice(4).split("").reverse().join("")), null);
  assert.equal(await unseal(s, "code", await seal(s, "code", {}, -1)), null);
  // Each token has exactly one spelling, so a used sign-in code can't be sent again with padding or stray characters.
  for (const extra of ["=", "==", ".", "!", " ", "\n", "%"]) assert.equal(await unseal(s, "access", t + extra), null, JSON.stringify(extra));
  assert.equal(await unseal(s, "access", t.slice(0, 20) + "." + t.slice(20)), null);
  const v = "abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDEFG";
  assert.ok(await pkceMatches(v, await sha256base64url(v)));
  assert.ok(!(await pkceMatches("short", await sha256base64url("short"))));
});

test("only Claude's return addresses are allowed", () => {
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("https://claude.com/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://localhost:6274/oauth/callback"));
  assert.ok(redirectAllowed("http://127.0.0.1:33418/callback"));
  for (const bad of ["https://claude.ai.evil.com/api/mcp/auth_callback", "https://evil.com/api/mcp/auth_callback", "http://claude.ai/api/mcp/auth_callback", "https://claude.ai/other", "https://claude.ai:444/api/mcp/auth_callback", "https://user@claude.ai/api/mcp/auth_callback", "javascript:alert(1)", "https://claude.ai/api/mcp/auth_callback#x"])
    assert.ok(!redirectAllowed(bad), bad);
  assert.ok(redirectAllowed("https://example.org/cb", { HH_EXTRA_REDIRECTS: "https://example.org/cb" }));
});

test("numbers are stored the way the Firebase web SDK stores them", () => {
  assert.deepEqual(toValue(3), { integerValue: "3" });
  assert.deepEqual(toValue(87.4), { doubleValue: 87.4 });
  assert.deepEqual(toValue([1, "a"]), { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] } });
  assert.equal(fromValue({ integerValue: "1732400000000" }), 1732400000000);
  // A 29 February birthday falls on 1 March in other years, as the app shows it.
  assert.equal(countdownNext({ date: "2016-02-29", yearly: true }, "2027-02-20"), "2027-03-01");
  assert.equal(countdownNext({ date: "2016-02-29", yearly: true }, "2028-02-20"), "2028-02-29");
});

test("two-step sign-in: code page, then finalize with the authenticator code", async () => {
  const env = { HH_SECRET: KEY };
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    const ok = b => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url).includes("accounts:signInWithPassword")) return ok({ mfaPendingCredential: "PENDING", mfaInfo: [{ mfaEnrollmentId: "ENR1", displayName: "Authenticator app", totpInfo: {} }] });
    if (String(url).includes("mfaSignIn:finalize")) {
      const b = JSON.parse(init.body);
      if (b.totpVerificationInfo.verificationCode !== "123456") return new Response(JSON.stringify({ error: { message: "INVALID_TOTP_VERIFICATION_CODE" } }), { status: 400 });
      const payload = Buffer.from(JSON.stringify({ user_id: "UID1" })).toString("base64url");
      return ok({ idToken: `h.${payload}.s`, refreshToken: "RT1" });
    }
    if (String(url).includes("/documents/users/UID1")) return ok({ name: "x/users/UID1", fields: { familyId: { stringValue: "FAM" } } });
    return new Response("{}", { status: 404 });
  };
  try {
    const base = "https://hh.example";
    const ch = await sha256base64url("v".repeat(50));
    const q = new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", redirect_uri: "https://claude.ai/api/mcp/auth_callback", state: "S", code_challenge: ch, code_challenge_method: "S256" });
    const page = await (await handle(new Request(`${base}/authorize?${q}`), env)).text();
    const req = page.match(/name="req" value="([^"]+)"/)[1];
    const post = body => handle(new Request(`${base}/authorize`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) }), env);
    const codePage = await (await post({ req, step: "password", email: "a@b.c", password: "pw" })).text();
    assert.match(codePage, /Enter your 6-digit code/);
    const mfa = codePage.match(/name="mfa" value="([^"]+)"/)[1];
    const wrong = await (await post({ req, mfa, step: "code", code: "111111" })).text();
    assert.match(wrong, /That code didn&#39;t work/);
    const res = await post({ req, mfa, step: "code", code: "123 456" });
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.get("location"));
    assert.equal(loc.searchParams.get("state"), "S");
    assert.equal(loc.searchParams.get("iss"), base);
    const fin = calls.filter(c => c.url.includes("mfaSignIn:finalize")).pop();
    assert.deepEqual(JSON.parse(fin.body), { mfaPendingCredential: "PENDING", mfaEnrollmentId: "ENR1", totpVerificationInfo: { verificationCode: "123456" } });
  } finally { globalThis.fetch = realFetch; }
});

test("only Claude's published client identity is accepted as a URL client id", async () => {
  const env = { HH_SECRET: KEY };
  const ch = await sha256base64url("v".repeat(50));
  const q = id => new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", state: "S", code_challenge: ch, code_challenge_method: "S256" });
  assert.equal((await handle(new Request(`https://hh.example/authorize?${q("https://claude.ai/oauth/mcp-oauth-client-metadata")}`), env)).status, 200);
  assert.equal((await handle(new Request(`https://hh.example/authorize?${q("https://evil.example/client.json")}`), env)).status, 400);
  assert.equal((await handle(new Request(`https://hh.example/authorize?${q("my-own-client")}`), env)).status, 400);
  // Claude's published identity only ever returns to Claude, never to a local address.
  const local = new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", redirect_uri: "http://127.0.0.1:8080/cb", state: "S", code_challenge: ch, code_challenge_method: "S256" });
  assert.equal((await handle(new Request(`https://hh.example/authorize?${local}`), env)).status, 400);
  // Claude Code's own published identity returns to localhost:<port>/callback, and only there.
  const cc = uri => new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/claude-code-client-metadata", redirect_uri: uri, state: "S", code_challenge: ch, code_challenge_method: "S256" });
  assert.equal((await handle(new Request(`https://hh.example/authorize?${cc("http://localhost:54321/callback")}`), env)).status, 200);
  assert.equal((await handle(new Request(`https://hh.example/authorize?${cc("http://127.0.0.1:54321/callback")}`), env)).status, 200);
  assert.equal((await handle(new Request(`https://hh.example/authorize?${cc("http://localhost:54321/other")}`), env)).status, 400);
  assert.equal((await handle(new Request(`https://hh.example/authorize?${cc("https://claude.ai/api/mcp/auth_callback")}`), env)).status, 400);
  const asm = await (await handle(new Request("https://hh.example/.well-known/oauth-authorization-server"), env)).json();
  assert.equal(asm.authorization_response_iss_parameter_supported, true);
  assert.equal(asm.client_id_metadata_document_supported, true);
  assert.ok(asm.token_endpoint_auth_methods_supported.includes("none"));
  assert.ok(asm.scopes_supported.includes("offline_access"));
});

test("tokens are only issued for this server's own address (RFC 8707)", async () => {
  const env = { HH_SECRET: KEY };
  const ch = await sha256base64url("v".repeat(50));
  const q = resource => new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", redirect_uri: "https://claude.ai/api/mcp/auth_callback", state: "S", code_challenge: ch, code_challenge_method: "S256", ...(resource ? { resource } : {}) });
  for (const ok of ["https://hh.example/mcp", "https://hh.example/mcp/", "https://hh.example", "https://hh.example/sse", ""]) {
    assert.equal((await handle(new Request(`https://hh.example/authorize?${q(ok)}`), env)).status, 200, ok);
  }
  const evil = await handle(new Request(`https://hh.example/authorize?${q("https://evil.example/mcp")}`), env);
  assert.equal(evil.status, 302);
  const loc = new URL(evil.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://claude.ai/api/mcp/auth_callback");
  assert.equal(loc.searchParams.get("error"), "invalid_target");
  const tok = await handle(new Request("https://hh.example/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x", resource: "https://evil.example/mcp" }) }), env);
  assert.equal((await tok.json()).error, "invalid_target");
  // With a custom address set later, people who connected at the old address can still renew.
  const moved = await handle(new Request("https://hh.example/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x", resource: "https://hh.example/mcp" }) }), { ...env, HH_PUBLIC_URL: "https://home.example.com" });
  assert.equal((await moved.json()).error, "invalid_grant");
  // An error before sign-in for a local app is shown as a page, not sent to a local address.
  const reg = await (await handle(new Request("https://hh.example/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:9999/cb"] }) }), env)).json();
  const bad = new URLSearchParams({ response_type: "token", client_id: reg.client_id, redirect_uri: "http://127.0.0.1:9999/cb", code_challenge: ch, code_challenge_method: "S256" });
  assert.equal((await handle(new Request(`https://hh.example/authorize?${bad}`), env)).status, 400);
});

test("a weak or placeholder HH_SECRET is not accepted", async () => {
  for (const weak of ["happyhomehappyhomehappyhomehappy", "x".repeat(64), "paste-your-long-random-secret-here-please", "dev-secret-dev-secret-dev-secret-00"]) {
    assert.equal((await handle(new Request("https://hh.example/health"), { HH_SECRET: weak })).status, 200);
    assert.equal((await (await handle(new Request("https://hh.example/health"), { HH_SECRET: weak })).json()).ready, false, weak);
  }
  assert.equal((await (await handle(new Request("https://hh.example/health"), { HH_SECRET: KEY })).json()).ready, true);
  // Real random keys are accepted: short hex with few different characters, and base64 that happens to spell a word.
  for (const good of ["2eab9bf1fdab5e2d15f4898ede8f5db5", "kQ3d8Yourf0Lx7Z2pW9bN4cV6mT1sR5hJ8gA0eU2iO4=", "/R+9H2Pr4h6rz7gC+GYiqkVyOURjP2zSQfud69ZHuA0=", "9f1c2a7e-4b3d-4c8a-9e2f-1a2b3c4d5e6f"]) {
    assert.equal((await (await handle(new Request("https://hh.example/health"), { HH_SECRET: good })).json()).ready, true, good);
  }
  assert.equal((await (await handle(new Request("https://hh.example/health"), { HH_SECRET: "your_secret_key_goes_here_123456789" })).json()).ready, false);
});

test("people are found by the name in the app, an earlier name, or mum and dad words", () => {
  const settings = { people: [{ id: 1, name: "Dad", aka: "Nyein Chan", uid: "u1" }, { id: 2, name: "Mum", aka: "Akiyo", uid: "u2" }, { id: 3, name: "Jugo", uid: null }], roleNames: 1 };
  const f = new Family({ cfg: {}, fs: null, uid: "u2", fid: "F", settings, tz: "Australia/Brisbane" });
  for (const [said, id] of [["Mum", 2], ["mom", 2], ["Mummy", 2], ["my mum", 2], ["Akiyo", 2], ["akiyo's", 2], ["Dad", 1], ["daddy", 1], ["papa", 1], ["Nyein", 1], ["nyein chan", 1], ["Jugo", 3], ["jug", 3], ["me", 2], ["3", 3]]) {
    assert.equal(f.who(said), id, said);
  }
  assert.equal(f.who("family", { allowFamily: true }), 0);
  assert.throws(() => f.who("Grandma"), /Jugo, Mum \(you, also called Akiyo\), Dad \(also called Nyein Chan\)/);
  assert.equal(f.name(1), "Dad"); assert.equal(f.myName, "Mum");
  // An earlier name of "Me" (the app's first default) never steals the word "me" from whoever is signed in.
  const g = new Family({ cfg: {}, fs: null, uid: "u2", fid: "F", settings: { people: [{ id: 1, name: "Dad", aka: "Me", uid: "u1" }, { id: 2, name: "Mum", aka: "Akiyo", uid: "u2" }] }, tz: "Australia/Brisbane" });
  assert.equal(g.who("me"), 2); assert.deepEqual(namesOf({ name: "Dad", aka: "Me" }), ["dad", "daddy", "papa"]);
  assert.doesNotMatch(g.namesList(), /also called Me/);
  // Families that keep their own names work as before.
  const h = new Family({ cfg: {}, fs: null, uid: "u1", fid: "F", settings: { people: [{ id: 1, name: "Old", uid: "u1" }, { id: 2, name: "Akiyo" }, { id: 3, name: "Jugo" }] }, tz: "Australia/Brisbane" });
  assert.equal(h.who("Akiyo"), 2); assert.equal(h.namesList(), "Jugo, Akiyo, Old (you)"); assert.throws(() => h.who("mum"));
});

test("people: whole names win, the mum and dad words never guess, two people are refused", () => {
  const fam = (people, uid = "u1") => new Family({ cfg: {}, fs: null, uid, fid: "F", settings: { people }, tz: "Australia/Brisbane" });
  // A child called John still wins over Dad, whose earlier name was John Smith; the same for Sam and Sam Lee.
  const a = fam([{ id: 1, name: "Dad", aka: "John Smith", uid: "u1" }, { id: 2, name: "Mum", aka: "Mary Smith" }, { id: 3, name: "John" }]);
  for (const [said, id] of [["John", 3], ["john's", 3], ["John Smith", 1], ["Dad", 1], ["my dad", 1], ["Mary", 2], ["mummy", 2]]) assert.equal(a.who(said), id, said);
  const b = fam([{ id: 1, name: "John Smith", uid: "u1" }, { id: 2, name: "John" }, { id: 3, name: "Amy" }, { id: 4, name: "Sam Lee" }, { id: 5, name: "Sam" }]);
  for (const [said, id] of [["John", 2], ["john smith", 1], ["Sam", 5], ["sam lee", 4], ["Amy", 3]]) assert.equal(b.who(said), id, said);
  // "My Linh" is a name, not "my" + "Linh".
  const c = fam([{ id: 1, name: "Dad", aka: "Minh", uid: "u1" }, { id: 2, name: "Mum", aka: "Lan" }, { id: 3, name: "My Linh" }, { id: 4, name: "The Kid" }]);
  for (const [said, id] of [["My Linh", 3], ["my linh's", 3], ["The Kid", 4], ["the dad", 1], ["my mum", 2], ["me", 1]]) assert.equal(c.who(said), id, said);
  assert.equal(fam([{ id: 1, name: "Old", uid: "u1" }, { id: 2, name: "My Linh Nguyen" }]).who("My Linh"), 2);
  // With nobody called Mum, "my mom" is a question for the person, never a child called Momoko.
  const d = fam([{ id: 1, name: "Hiroshi", uid: "u1" }, { id: 2, name: "Akiyo" }, { id: 3, name: "Jugo" }, { id: 4, name: "Momoko" }]);
  for (const said of ["my mom", "our mom", "the mom", "mom", "Mum", "dad"]) assert.throws(() => d.who(said), /I don't know who/, said);
  assert.equal(d.who("Momo"), 4);
  // Short starts of real names still work, and the mum and dad words don't get in the way.
  const e = fam([{ id: 1, name: "Dad", uid: "u1" }, { id: 2, name: "Mum" }, { id: 3, name: "Molly" }, { id: 4, name: "Max" }, { id: 5, name: "Patrick" }]);
  for (const [said, id] of [["mo", 3], ["ma", 4], ["pa", 5], ["mu", 2], ["da", 1], ["mom", 2], ["papa", 1]]) assert.equal(e.who(said), id, said);
  const g = fam([{ id: 1, name: "Old", uid: "u1" }, { id: 2, name: "Akiyo" }, { id: 3, name: "Jugo" }]);
  for (const [said, id] of [["J", 3], ["a", 2], ["O", 1]]) assert.equal(g.who(said), id, said);
  const h = fam([{ id: 1, name: "Dad", aka: "Nyein Chan", uid: "u1" }, { id: 2, name: "Mum", aka: "Akiyo" }, { id: 3, name: "Jugo" }]);
  for (const [said, id] of [["D", 1], ["M", 2], ["J", 3], ["Nyein", 1], ["ny", 1]]) assert.equal(h.who(said), id, said);
  assert.throws(() => h.who("N"), /I don't know who/);
  // Happy Home keeps one person on each item, so a list of people is sent back with the choices.
  for (const said of ["Mum and Dad", "Akiyo & Jugo", "Nyein, Akiyo", "my mum + my dad", "Nyein Chan and Akiyo"]) {
    assert.throws(() => h.who(said), /is more than one person[\s\S]*The family is: Jugo, Mum/, said);
    assert.throws(() => h.who(said, { allowFamily: true }), /"Family" for everyone/, said);
  }
  assert.equal(h.who("Mum and mummy"), 2); assert.equal(h.who("mum,"), 2); assert.equal(h.who("Jugo!"), 3); for (const said of ["?", ".", "'s"]) assert.throws(() => fam([{ id: 1, name: "Solo", uid: "u1" }]).who(said), /I don't know who/, said);
  // "me" in a list is the signed-in person, even when Dad's earlier name was the app's first default, "Me".
  assert.throws(() => h.who("Mum and me"), /is more than one person/); assert.throws(() => h.who("me and Jugo"), /is more than one person/);
  assert.equal(h.who("Dad and me"), 1);
  const m = fam([{ id: 1, name: "Dad", aka: "Me", uid: "u1" }, { id: 2, name: "Mum", aka: "Akiyo", uid: "u2" }, { id: 3, name: "Jugo" }], "u2");
  for (const said of ["Mum and me", "me and Mum", "Akiyo and me", "Mum & myself"]) assert.equal(m.who(said), 2, said);
  const n = fam([{ id: 1, name: "Me", uid: "u1" }, { id: 2, name: "Akiyo", uid: "u2" }, { id: 3, name: "Jugo" }], "u2");
  assert.equal(n.who("Akiyo and me"), 2); assert.equal(n.who("me and Akiyo"), 2);
  // A parent saved as Mummy or Daddy (never renamed) is still who "mum" and "dad" mean, but a grandparent called Papa is not.
  const k = fam([{ id: 1, name: "Daddy", uid: "u1" }, { id: 2, name: "Mummy" }, { id: 3, name: "Jugo" }, { id: 4, name: "Momo" }]);
  for (const [said, id] of [["mum", 2], ["my mum", 2], ["mom", 2], ["dad", 1], ["the dad", 1], ["mu", 2], ["Momo", 4]]) assert.equal(k.who(said), id, said);
  for (const [people, said, id] of [[[{ id: 1, name: "Dada", uid: "u1" }, { id: 2, name: "Mumma" }], "mum", 2], [[{ id: 1, name: "Dada", uid: "u1" }, { id: 2, name: "Mumma" }], "dad", 1], [[{ id: 1, name: "Daddy", uid: "u1" }, { id: 2, name: "Mommy" }], "mom", 2]]) assert.equal(fam(people).who(said), id, said);
  const gp = fam([{ id: 1, name: "Old", uid: "u1" }, { id: 2, name: "Akiyo" }, { id: 3, name: "Jugo" }, { id: 4, name: "Papa" }]);
  for (const said of ["dad", "the dad", "daddy"]) assert.throws(() => gp.who(said), /I don't know who/, said);
  assert.equal(gp.who("Papa"), 4);
});

test("only the agreed collections can ever be touched", () => {
  const f = new Family({ cfg: {}, fs: null, uid: "u1", fid: "F", settings: { people: [] }, tz: "Australia/Brisbane" });
  for (const ok of ["tasks", "events", "homework", "shopping", "tx", "notes", "bills", "meals", "countdowns", "board", "alarms", "stars", "shopFreq", "songs"]) assert.deepEqual(f.col(ok), ["families", "F", ok]);
  for (const never of ["wallet", "moods", "moodSessions", "locations", "learn", "profiles", "notify", "pushSubs", "users"]) {
    assert.throws(() => f.col(never), /not one this connector may touch/, never);
    assert.throws(() => f.doc(never, "x"), /not one this connector may touch/, never);
  }
  assert.deepEqual([...ALLOWED_COLLECTIONS].sort(), ["alarms", "bills", "board", "countdowns", "events", "homework", "meals", "notes", "shopFreq", "shopping", "songs", "stars", "tasks", "tx"]);
  // Every type a tool can name maps to an allowed collection.
  for (const c of Object.values(TYPE_COLLECTION)) assert.ok(ALLOWED_COLLECTIONS.includes(c), c);
  assert.match(nowTimeIn("Australia/Brisbane", new Date("2026-11-24T14:05:00Z")), /^00:05$/);
});

test("Vercel entry point is a web fetch handler that keeps the original path", async () => {
  process.env.HH_SECRET = KEY;
  const entry = (await import("../api/index.js")).default;
  assert.equal(typeof entry.fetch, "function");
  const r = await entry.fetch(new Request("https://hh.example/.well-known/oauth-protected-resource/mcp"));
  assert.equal((await r.json()).resource, "https://hh.example/mcp");
  // Vercel's Node layer hands the function an http:// URL; the public address is https.
  const viaVercel = await entry.fetch(new Request("http://hh.example/.well-known/oauth-protected-resource/mcp", { headers: { "x-forwarded-proto": "https" } }));
  assert.deepEqual(await viaVercel.json().then(j => [j.resource, j.authorization_servers[0]]), ["https://hh.example/mcp", "https://hh.example"]);
  process.env.VERCEL = "1";
  const asm = await (await entry.fetch(new Request("http://hh.example/.well-known/oauth-authorization-server"))).json();
  assert.equal(asm.token_endpoint, "https://hh.example/token");
  // "vercel dev" on a computer also sets VERCEL, but serves plain http on localhost: leave that alone.
  process.env.VERCEL_ENV = "development";
  const dev = await (await entry.fetch(new Request("http://localhost:3000/.well-known/oauth-authorization-server"))).json();
  assert.equal(dev.issuer, "http://localhost:3000");
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.HH_SECRET;
});

test("home page and setup-not-finished state", async () => {
  const ready = await handle(new Request("https://hh.example/"), { HH_SECRET: KEY });
  assert.match(await ready.text(), /https:\/\/hh\.example\/mcp/);
  // Opened from a one-off deployment link, the page still shows the lasting production address.
  const fromDeploy = await handle(new Request("https://hh-abc123-old.vercel.app/"), { HH_SECRET: KEY, VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "happy-home.vercel.app" });
  assert.match(await fromDeploy.text(), /<code id="addr">https:\/\/happy-home\.vercel\.app\/mcp<\/code>/);
  const notReady = await (await handle(new Request("https://hh.example/"), {})).text();
  assert.match(notReady, /HH_SECRET/);
  const mcp = await handle(new Request("https://hh.example/mcp", { method: "POST", body: "{}" }), {});
  assert.equal(mcp.status, 503);
  // The Vercel rewrite passes the original path as a query parameter.
  const viaRewrite = await handle(new Request("https://hh.example/api/index?__hh_path=.well-known/oauth-protected-resource/mcp"), {});
  assert.equal((await viaRewrite.json()).resource, "https://hh.example/mcp");
});

test("songs are read exactly as the app's piano page reads them", async () => {
  const { parseSong, safeYt, noteCount } = await import("../src/songs.js");
  assert.equal(noteCount("C C G G | A A G- | F F E E | D D C-"), 14);
  assert.deepEqual(parseSong("C#5- Bb/ _ do'").notes, [{ midi: 73, beats: 2 }, { midi: 70, beats: 0.5, flat: true }, { midi: null, beats: 1 }, { midi: 72, beats: 1 }]);
  assert.deepEqual(parseSong("C9 xyz").errors, ['"C9" is too high for a piano.', 'I do not understand "xyz".']);
  assert.equal(safeYt("https://youtu.be/abc"), "https://youtu.be/abc"); assert.equal(safeYt("http://youtube.com/x"), ""); assert.equal(safeYt("https://evil.example/youtube.com"), "");
  // When the app's own piano.js is next to the connector (this repo), the copy must give the same answer on everything.
  const fs = await import("node:fs"), url = await import("node:url");
  const appFile = url.fileURLToPath(new URL("../../piano.js", import.meta.url));
  if (!fs.existsSync(appFile)) return;
  const sandbox = { document: { addEventListener() {}, documentElement: {}, createElement: () => ({ style: {} }), querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  sandbox.window = sandbox;
  const vm = await import("node:vm"); vm.runInNewContext(fs.readFileSync(appFile, "utf8"), sandbox);
  const app = sandbox.HHPiano.parseSong;
  const bits = ["C", "D", "E", "F", "G", "A", "B", "c", "b", "#", "b", "'", ",", "4", "5", "3", "-", "/", ".", "_", "R", "|", " ", " ", " ", "do", "re", "sol", "x", "♯", "♭", "—", "’"];
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5000; i++) {
    let s = ""; for (let j = Math.floor(rnd() * 30); j > 0; j--) s += bits[Math.floor(rnd() * bits.length)];
    assert.deepEqual(JSON.parse(JSON.stringify(parseSong(s))), JSON.parse(JSON.stringify(app(s))), JSON.stringify(s));
  }
});
