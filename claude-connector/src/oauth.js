// OAuth 2.1 for Claude's "Add custom connector": discovery metadata, client registration,
// the Happy Home sign-in page, and the token endpoint. Nothing is stored on the server;
// every code and token is a sealed (encrypted, expiring) blob — see crypto.js.
import { seal, unseal, pkceMatches } from "./crypto.js";
import { signInWithPassword, finishTotpSignIn, refreshIdToken, Firestore, SignInError, SignInExpiredError, DataError } from "./firebase.js";
import { signInPage, codePage, messagePage } from "./pages.js";

export const ACCESS_TTL = 24 * 3600;            // access tokens last a day...
export const REFRESH_TTL = 180 * 24 * 3600;     // ...and Claude renews them with a refresh token (rolling 180 days)
const CODE_TTL = 300, REQ_TTL = 1800, MFA_TTL = 600, CLIENT_TTL = 10 * 365 * 24 * 3600;
export const SCOPE = "family";
const SCOPES = [SCOPE, "offline_access"];
// Claude's published client identity (Client ID Metadata Document). Its only return
// address is https://claude.ai/api/mcp/auth_callback (and loopback for Claude Code),
// which redirectAllowed() already enforces.
const CLAUDE_CIMD = /^https:\/\/claude\.ai\/oauth\/[A-Za-z0-9_\-\/]{1,120}$/;

/** Where Claude may send people back to after sign-in. Anything else is refused. */
export function redirectAllowed(uri, env = {}) {
  let u; try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  const extra = String(env.HH_EXTRA_REDIRECTS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (extra.includes(uri)) return true;
  if (u.protocol === "https:" && !u.port && (u.hostname === "claude.ai" || u.hostname === "claude.com") && u.pathname === "/api/mcp/auth_callback") return true;
  // Apps on the person's own computer (Claude Code, Claude Desktop, MCP Inspector) use loopback addresses.
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) return true;
  return false;
}

function clientLabel(uri) {
  try {
    const u = new URL(uri);
    if (u.hostname === "claude.ai" || u.hostname === "claude.com") return `Claude (${u.hostname})`;
    if (u.protocol === "http:") return "An app on this computer (such as Claude Code)";
    return u.hostname;
  } catch { return "An app"; }
}

export function protectedResourceMetadata(base, resource) {
  return { resource, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: SCOPES, resource_name: "Happy Home", resource_documentation: base + "/" };
}

export function authorizationServerMetadata(base) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    client_id_metadata_document_supported: true,
    scopes_supported: SCOPES,
    service_documentation: `${base}/`,
  };
}

const jsonRes = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...extra } });
const oauthError = (error, description, status = 400) => jsonRes(status, { error, error_description: description });

async function readParams(request, limit = 32768) {
  const len = +(request.headers.get("content-length") || 0);
  if (len > limit) return null;
  const raw = await request.text();
  if (raw.length > limit) return null;
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) { try { const o = JSON.parse(raw); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

/* ---------------- Dynamic Client Registration (RFC 7591) ---------------- */
export async function register(request, env) {
  const body = await readParams(request, 65536);
  if (!body) return oauthError("invalid_client_metadata", "Send the client details as JSON.");
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || uris.some(u => typeof u !== "string" || u.length > 500)) return oauthError("invalid_redirect_uri", "redirect_uris must be a list of addresses.");
  const bad = uris.filter(u => !redirectAllowed(u, env));
  if (bad.length) return oauthError("invalid_redirect_uri", `This connector only works with Claude. Not allowed: ${bad.join(", ")}`);
  const method = ["client_secret_post", "client_secret_basic"].includes(body.token_endpoint_auth_method) ? body.token_endpoint_auth_method : "none";
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "";
  const client_id = await seal(env.HH_SECRET, "client", { r: uris, n: name }, CLIENT_TTL);
  const out = {
    client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name || undefined, redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: method, scope: SCOPE,
  };
  // Security rests on PKCE and the fixed list of return addresses; a secret is handed out only
  // because some clients insist on one. It is not needed to use the connector.
  if (method !== "none") { out.client_secret = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(24))).toString("base64url"); out.client_secret_expires_at = 0; }
  return jsonRes(201, out);
}

async function clientRedirects(env, clientId) {
  if (clientId.startsWith("hhc_")) { const c = await unseal(env.HH_SECRET, "client", clientId); return c ? { known: true, uris: c.r } : null; }
  if (CLAUDE_CIMD.test(clientId)) return { known: false, uris: null }; // Claude's published identity: rely on the return-address list
  return null;
}

const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const html = (body, status = 200) => new Response(body, { status, headers: htmlHeaders });
const back = (uri, params) => { const u = new URL(uri); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v); return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); };
const startAgain = "Go back to Claude and tap Connect again.";

/* ---------------- /authorize ---------------- */
export async function authorize(request, env, cfg) {
  if (request.method === "GET" || request.method === "HEAD") {
    const p = new URL(request.url).searchParams;
    const clientId = p.get("client_id") || "", redirectUri = p.get("redirect_uri") || "", state = p.get("state") || "";
    if (!clientId || !redirectUri) return html(messagePage("Something's missing", `This sign-in link is incomplete. ${startAgain}`), 400);
    if (!redirectAllowed(redirectUri, env)) return html(messagePage("Not allowed", `This Happy Home connector only signs in for Claude, so it won't send your sign-in to ${redirectUri.slice(0, 120)}.`), 400);
    const client = await clientRedirects(env, clientId);
    if (!client) return html(messagePage("Please reconnect", `Claude's registration with Happy Home isn't valid. In Claude, remove the Happy Home connector and add it again, leaving the sign-in options as they are (don't enter your own OAuth client).`), 400);
    if (client.known && !client.uris.includes(redirectUri)) return html(messagePage("Not allowed", "That return address wasn't registered by this app."), 400);
    if (state.length > 1000) return back(redirectUri, { error: "invalid_request", error_description: "state too long" });
    if (p.get("response_type") !== "code") return back(redirectUri, { error: "unsupported_response_type", state });
    const challenge = p.get("code_challenge") || "";
    if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return back(redirectUri, { error: "invalid_request", error_description: "PKCE with S256 is required", state });
    const req = await seal(env.HH_SECRET, "req", { c: clientId, r: redirectUri, s: state, k: challenge }, REQ_TTL);
    return html(signInPage({ req, clientLabel: clientLabel(redirectUri) }));
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });

  const form = await readParams(request, 32768);
  const q = form && await unseal(env.HH_SECRET, "req", form.req);
  if (!q || !redirectAllowed(q.r, env)) return html(messagePage("This page has expired", `For your safety the sign-in page only lasts 30 minutes. ${startAgain}`), 400);
  const label = clientLabel(q.r);

  if (form.step === "cancel") return back(q.r, { error: "access_denied", error_description: "The person cancelled", state: q.s });

  let signed;
  if (form.step === "code") {
    const m = await unseal(env.HH_SECRET, "mfa", form.mfa);
    if (!m) return html(signInPage({ req: form.req, clientLabel: label, error: "That took too long. Please sign in again." }));
    const code = String(form.code || "").replace(/\D/g, "");
    if (code.length !== 6) return html(codePage({ req: form.req, mfa: form.mfa, error: "The code is 6 digits." }));
    try { signed = await finishTotpSignIn(cfg, m.p, m.e, code); }
    catch (e) {
      if (e instanceof SignInError) {
        if (/PENDING|EXPIRED/.test(e.code || "")) return html(signInPage({ req: form.req, clientLabel: label, error: e.message }));
        return html(codePage({ req: form.req, mfa: form.mfa, error: e.message }));
      }
      if (e instanceof DataError) return html(codePage({ req: form.req, mfa: form.mfa, error: e.message }));
      throw e;
    }
  } else {
    const email = String(form.email || "").trim().slice(0, 200), password = String(form.password || "").slice(0, 500);
    if (!email || !password) return html(signInPage({ req: form.req, clientLabel: label, email, error: "Please type your email and password." }));
    try { signed = await signInWithPassword(cfg, email, password); }
    catch (e) {
      if (e instanceof SignInError || e instanceof DataError) return html(signInPage({ req: form.req, clientLabel: label, email, error: e.message }));
      throw e;
    }
    if (signed.mfa) {
      const factor = signed.mfa.factors.find(x => x.type === "totp");
      if (!factor) return html(messagePage("Two-step sign-in", "Your account uses a kind of two-step sign-in this connector can't do yet (only authenticator app codes work here)."));
      const mfa = await seal(env.HH_SECRET, "mfa", { p: signed.mfa.pending, e: factor.id }, MFA_TTL);
      return html(codePage({ req: form.req, mfa }));
    }
  }

  // Signed in. Make sure they belong to a family, so Claude has something to work with.
  try {
    const user = await new Firestore(cfg, signed.idToken).get(["users", signed.uid]);
    if (!user || !user.familyId) return html(messagePage("Join your family first", `You're signed in, but this account isn't in a Happy Home family yet. Open the Happy Home app, create or join your family with the family code, then ${startAgain.charAt(0).toLowerCase() + startAgain.slice(1)}`, `<a class="btn primary" href="${cfg.appUrl.replace(/"/g, "")}">Open Happy Home</a>`));
  } catch (e) {
    if (e instanceof DataError || e instanceof SignInExpiredError) return html(signInPage({ req: form.req, clientLabel: label, error: "Signed in, but couldn't open your family just now. Please try again." }));
    throw e;
  }
  const code = await seal(env.HH_SECRET, "code", { u: signed.uid, t: signed.refreshToken, k: q.k, r: q.r, c: q.c }, CODE_TTL);
  return back(q.r, { code, state: q.s });
}

/* ---------------- /token ---------------- */
export async function token(request, env, cfg) {
  if (request.method !== "POST") return oauthError("invalid_request", "Use POST.", 405);
  const p = await readParams(request);
  if (!p) return oauthError("invalid_request", "Couldn't read the request.");
  let uid, firebaseRefresh;
  if (p.grant_type === "authorization_code") {
    const c = await unseal(env.HH_SECRET, "code", p.code);
    if (!c) return oauthError("invalid_grant", "The sign-in code is wrong or has expired.");
    if (!(await pkceMatches(p.code_verifier, c.k))) return oauthError("invalid_grant", "PKCE check failed.");
    if (p.redirect_uri && p.redirect_uri !== c.r) return oauthError("invalid_grant", "redirect_uri doesn't match.");
    if (p.client_id && p.client_id !== c.c) return oauthError("invalid_grant", "client_id doesn't match.");
    uid = c.u; firebaseRefresh = c.t;
  } else if (p.grant_type === "refresh_token") {
    const r = await unseal(env.HH_SECRET, "refresh", p.refresh_token);
    if (!r) return oauthError("invalid_grant", "The refresh token is wrong or has expired. Please connect again.");
    uid = r.u; firebaseRefresh = r.t;
  } else {
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }
  // Check the Happy Home sign-in is still good (password not changed, account not removed).
  try {
    const fresh = await refreshIdToken(cfg, firebaseRefresh);
    if (fresh.uid && fresh.uid !== uid) return oauthError("invalid_grant", "Sign-in mismatch.");
    firebaseRefresh = fresh.refreshToken || firebaseRefresh;
  } catch (e) {
    if (e instanceof SignInExpiredError) return oauthError("invalid_grant", "The Happy Home sign-in has ended (for example the password was changed). Please connect again.");
    if (e instanceof DataError) return oauthError("temporarily_unavailable", e.message, 503);
    throw e;
  }
  return jsonRes(200, {
    access_token: await seal(env.HH_SECRET, "access", { u: uid, t: firebaseRefresh }, ACCESS_TTL),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: await seal(env.HH_SECRET, "refresh", { u: uid, t: firebaseRefresh }, REFRESH_TTL),
    scope: SCOPE,
  });
}

/** Reads the Bearer token on an MCP request. Returns {uid, rt} or null. */
export async function bearerSession(request, env) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)\s*$/i);
  if (!m) return null;
  const t = await unseal(env.HH_SECRET, "access", m[1]);
  return t ? { uid: t.u, rt: t.t } : null;
}
