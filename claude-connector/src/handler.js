// One entry point for every request: route by path.
import { firebaseSettings, SignInExpiredError, forgetIdToken } from "./firebase.js";
import { secretOk } from "./crypto.js";
import { protectedResourceMetadata, authorizationServerMetadata, register, authorize, token, bearerSession } from "./oauth.js";
import { handleMcp, SERVER_VERSION } from "./mcp.js";
import { homePage, messagePage } from "./pages.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};
const withCors = res => { for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v); return res; };
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export function publicBase(request, env) {
  if (env.HH_PUBLIC_URL) return String(env.HH_PUBLIC_URL).replace(/\/+$/, "");
  const u = new URL(request.url);
  return u.origin;
}

export async function handle(request, env = {}) {
  try { return await route(request, env); }
  catch (e) {
    console.error("[happy-home] unexpected error:", e && e.name, e && e.message);
    return json(500, { error: "server_error", error_description: "Something went wrong in the Happy Home connector." });
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  let path = url.pathname;
  const forwarded = url.searchParams.get("__hh_path");     // set by the rewrite in vercel.json
  if (forwarded !== null && (path === "/api" || path.startsWith("/api/index"))) path = "/" + forwarded.replace(/^\/+/, "");
  path = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  const base = publicBase(request, env);
  const ready = secretOk(env.HH_SECRET);
  const cfg = firebaseSettings(env);
  const method = request.method;

  if (method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    const suffix = path.slice("/.well-known/oauth-protected-resource".length);
    return withCors(json(200, protectedResourceMetadata(base, suffix ? base + suffix : base), { "Cache-Control": "public, max-age=300" }));
  }
  if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) {
    return withCors(json(200, authorizationServerMetadata(base), { "Cache-Control": "public, max-age=300" }));
  }
  if (path === "/health") return withCors(json(200, { ok: true, ready, version: SERVER_VERSION }));
  if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });

  if (path === "/" && (method === "GET" || method === "HEAD")) {
    const nonce = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString("base64");
    return new Response(homePage({ base, ready, appUrl: cfg.appUrl, nonce }), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
      "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  }

  const notReady = () => json(503, { error: "temporarily_unavailable", error_description: "The Happy Home connector isn't set up yet: add the HH_SECRET setting in Vercel and redeploy." });

  if (path === "/register") { if (!ready) return withCors(notReady()); return withCors(method === "POST" ? await register(request, env) : json(405, { error: "invalid_request" }, { Allow: "POST" })); }
  if (path === "/authorize") {
    if (!ready) return new Response(messagePage("Almost ready", "The Happy Home connector isn't set up yet. Add the HH_SECRET setting in Vercel, redeploy, then try again."), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    return authorize(request, env, cfg, base);
  }
  if (path === "/token") { if (!ready) return withCors(notReady()); return withCors(await token(request, env, cfg, base)); }

  if (path === "/mcp" || path === "/sse" || (path === "/" && method === "POST")) {
    const resourcePath = path === "/" ? "" : path;
    const challenge = err => `Bearer realm="Happy Home", resource_metadata="${base}/.well-known/oauth-protected-resource${resourcePath}", scope="family"${err ? `, error="${err}", error_description="Please sign in to Happy Home again"` : ""}`;
    if (!ready) return withCors(notReady());
    if (method === "POST" || method === "GET") {
      const session = await bearerSession(request, env);
      const hasAuth = !!request.headers.get("authorization");
      if (!session) return withCors(json(401, { error: hasAuth ? "invalid_token" : "unauthorized", error_description: "Sign in to Happy Home to use this connector." }, { "WWW-Authenticate": challenge(hasAuth ? "invalid_token" : "") }));
      try { return withCors(await handleMcp(request, env, cfg, session, json)); }
      catch (e) {
        if (e instanceof SignInExpiredError) { forgetIdToken(session.rt); return withCors(json(401, { error: "invalid_token" }, { "WWW-Authenticate": challenge("invalid_token") })); }
        throw e;
      }
    }
    return withCors(json(405, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" } }, { Allow: "GET, POST" }));
  }

  return withCors(json(404, { error: "not_found" }));
}
