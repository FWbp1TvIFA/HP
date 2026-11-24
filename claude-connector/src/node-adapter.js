// Turns a Node (req, res) pair into a web Request and back, so the same handler runs on
// Vercel's Node.js functions and in the local test server.
const MAX_BODY = 2_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    // If the platform already read the body for us, use that copy.
    if (req.readableEnded || req.complete) {
      const b = req.rawBody ?? req.body;
      if (b === undefined || b === null) return resolve(Buffer.alloc(0));
      if (Buffer.isBuffer(b)) return resolve(b);
      if (typeof b === "string") return resolve(Buffer.from(b));
      return resolve(Buffer.from(typeof b === "object" && req.headers["content-type"]?.includes("x-www-form-urlencoded") ? new URLSearchParams(b).toString() : JSON.stringify(b)));
    }
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function nodeHandler(handle, env = process.env) {
  return async function (req, res) {
    try {
      const proto = String(req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http")).split(",")[0].trim();
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
      const method = req.method || "GET";
      let body;
      if (method !== "GET" && method !== "HEAD") {
        try { body = await readBody(req); }
        catch { res.statusCode = 413; res.end("Request too large"); return; }
      }
      const request = new Request(`${proto}://${host}${req.url || "/"}`, { method, headers, body });
      const response = await handle(request, env);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(method === "HEAD" ? undefined : buf);
    } catch (e) {
      console.error("[happy-home] adapter error:", e && e.message);
      if (!res.headersSent) { res.statusCode = 500; res.end("Server error"); }
    }
  };
}
