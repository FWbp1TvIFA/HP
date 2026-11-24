// Fast tests with no network: dates, sealed tokens, return-address rules, two-step sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTime, nextDue, addOneMonthLikeApp, countdownNext, isISODate } from "../src/dates.js";
import { seal, unseal, pkceMatches, sha256base64url } from "../src/crypto.js";
import { redirectAllowed } from "../src/oauth.js";
import { handle } from "../src/handler.js";
import { toValue, fromValue } from "../src/firebase.js";

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
