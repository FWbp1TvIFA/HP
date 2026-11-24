// MCP over Streamable HTTP, stateless: each POST carries JSON-RPC and gets a plain JSON reply.
import { openFamily, UserError } from "./family.js";
import { DataError, SignInExpiredError } from "./firebase.js";
import { toolDefinitions, SERVER_INSTRUCTIONS } from "./tools.js";

export const SERVER_VERSION = "1.0.0";
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST = "2025-06-18";

class RpcError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function handleMcp(request, env, cfg, session, json) {
  if (request.method !== "POST") return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed. Send JSON-RPC with POST." } }), { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } });
  const len = +(request.headers.get("content-length") || 0);
  if (len > 1_000_000) return json(413, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } });
  let body;
  try { const raw = await request.text(); if (raw.length > 1_000_000) throw new Error("big"); body = JSON.parse(raw); }
  catch { return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const batch = Array.isArray(body);
  const msgs = batch ? body : [body];
  if (batch && (!msgs.length || msgs.length > 50)) return json(400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });

  let familyPromise = null;
  const family = () => (familyPromise ??= openFamily(cfg, env, session));
  const responses = [];
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") { responses.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }); continue; }
    if (typeof msg.method !== "string") continue;           // a reply from the client; nothing to do
    if (!("id" in msg)) continue;                           // notification (initialized, cancelled, ...)
    try { responses.push({ jsonrpc: "2.0", id: msg.id, result: await dispatch(msg, family) }); }
    catch (e) {
      if (e instanceof RpcError) responses.push({ jsonrpc: "2.0", id: msg.id, error: { code: e.code, message: e.message } });
      else throw e;                                          // SignInExpiredError and real bugs go up
    }
  }
  if (!responses.length) return new Response(null, { status: 202 });
  return json(200, batch ? responses : responses[0]);
}

async function dispatch(msg, family) {
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};
  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        protocolVersion: SUPPORTED.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "happy-home", title: "Happy Home", version: SERVER_VERSION },
        instructions: SERVER_INSTRUCTIONS,
      };
    }
    case "ping": return {};
    case "tools/list": {
      let f = null;
      try { f = await family(); } catch (e) { if (e instanceof SignInExpiredError) throw e; }
      return { tools: toolDefinitions(f).map(({ run, ...d }) => d) };
    }
    case "tools/call": {
      const name = params.name;
      const args = params.arguments === undefined || params.arguments === null ? {} : params.arguments;
      if (typeof args !== "object" || Array.isArray(args)) throw new RpcError(-32602, "arguments must be an object");
      const def = toolDefinitions(null).find(t => t.name === name);
      if (!def) throw new RpcError(-32602, `Unknown tool: ${String(name).slice(0, 60)}`);
      try {
        const f = await family();
        const text = await def.run(f, args);
        return { content: [{ type: "text", text }] };
      } catch (e) {
        if (e instanceof UserError || e instanceof DataError) return { content: [{ type: "text", text: e.message }], isError: true };
        if (e instanceof SignInExpiredError) throw e;
        console.error("[happy-home] tool failed:", name, e && e.name, e && e.message);
        return { content: [{ type: "text", text: "Something went wrong in the Happy Home connector. Nothing may have been saved; please try again." }], isError: true };
      }
    }
    case "resources/list": return { resources: [] };
    case "resources/templates/list": return { resourceTemplates: [] };
    case "prompts/list": return { prompts: [] };
    case "logging/setLevel": return {};
    default: throw new RpcError(-32601, `Method not found: ${String(msg.method).slice(0, 60)}`);
  }
}
