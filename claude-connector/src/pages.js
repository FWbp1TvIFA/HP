// The few web pages people see: the home page with the connector address, and the
// Happy Home sign-in that Claude opens when someone taps Connect.
import { ICON } from "./icon.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{--bg:#F2F5F3;--surface:#fff;--sunk:#E6ECE8;--line:#D5DED9;--fg:#16302A;--muted:#5B6F68;--accent:#1F5C4A;--accent-soft:#D7EAE2;--on-accent:#fff;--bad:#B3412F;--good:#2E7D4F}
@media (prefers-color-scheme:dark){:root{--bg:#0F1A17;--surface:#16241F;--sunk:#1D2E28;--line:#2A3F37;--fg:#E6F0EB;--muted:#93A9A0;--accent:#6CC3A0;--accent-soft:#1F3A30;--on-accent:#0B1A15;--bad:#F08A76;--good:#6CC38D;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.wrap{max-width:480px;margin:0 auto;padding:28px 16px 48px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.brand img{width:52px;height:52px;border-radius:13px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.brand b{display:block;font-size:20px;letter-spacing:-.01em}
.brand span{color:var(--muted);font-size:14px}
h1{font-size:26px;line-height:1.2;letter-spacing:-.02em;margin:6px 0 10px}
h2{font-size:17px;margin:0 0 8px}
p{margin:0 0 12px}
.card{background:var(--surface);border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.muted{color:var(--muted);font-size:14px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
input{width:100%;font:inherit;font-size:17px;padding:13px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--fg)}
input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
.code{letter-spacing:.3em;font-size:24px;text-align:center;font-variant-numeric:tabular-nums}
button,.btn{display:block;width:100%;font:inherit;font-weight:650;font-size:17px;padding:14px;border-radius:12px;border:0;cursor:pointer;text-align:center;text-decoration:none;margin-top:16px}
.primary{background:var(--accent);color:var(--on-accent)}
.ghost{background:transparent;color:var(--muted);margin-top:6px;font-weight:500}
.err{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:15px;margin:10px 0 0}
.ok{color:var(--good);font-weight:600}
ul{padding-left:20px;margin:6px 0 0}
li{margin:4px 0}
.addr{display:flex;gap:8px;align-items:stretch;margin-top:8px}
.addr code{flex:1;min-width:0;overflow-wrap:anywhere;background:var(--sunk);border-radius:10px;padding:12px;font:15px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.addr button{width:auto;margin:0;padding:0 16px;font-size:15px}
.who{background:var(--accent-soft);border-radius:12px;padding:12px 14px;margin:12px 0 4px;font-size:15px}
ol{padding-left:22px;margin:6px 0 0}
.foot{margin-top:22px;text-align:center;font-size:13px;color:var(--muted)}
`;

export function page(title, body, { nonce, script } = {}) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><link rel="icon" href="${ICON}"><style>${CSS}</style></head>
<body><main class="wrap"><div class="brand"><img src="${ICON}" alt=""><div><b>Happy Home</b><span>for Claude</span></div></div>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

export function signInPage({ req, clientLabel, email = "", error = "" }) {
  return page("Connect Claude to Happy Home", `
<h1>Connect Claude to Happy Home</h1>
<div class="who">${esc(clientLabel)} wants to use your family's Happy Home.</div>
<div class="card">
<form method="post" action="/authorize" autocomplete="on">
${hidden("req", req)}${hidden("step", "password")}
<label for="email">Happy Home email</label>
<input id="email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(email)}" ${email ? "" : "autofocus"}>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required ${email ? "autofocus" : ""}>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<button class="primary" type="submit">Sign in and connect</button>
</form>
<form method="post" action="/authorize">${hidden("req", req)}${hidden("step", "cancel")}<button class="ghost" type="submit">Cancel</button></form>
</div>
<div class="card muted">
<h2 style="color:var(--fg)">What Claude can do</h2>
<ul><li>See and add tasks, calendar, homework, shopping, spending, notes, bills, dinners and birthdays.</li>
<li>Tick things off, change them, and delete them when you ask.</li>
<li>It acts as you, so it can only reach your own family. It doesn't use wallet cards, moods or locations.</li>
<li>Your password goes straight to Happy Home's sign-in and is never stored. To stop it, remove the connector in Claude or change your password.</li></ul>
</div>`);
}

export function codePage({ req, mfa, error = "" }) {
  return page("Two-step sign-in", `
<h1>Enter your 6-digit code</h1>
<p class="muted">Open your authenticator app and type the current code for Happy Home.</p>
<div class="card">
<form method="post" action="/authorize">
${hidden("req", req)}${hidden("mfa", mfa)}${hidden("step", "code")}
<label for="code">Code</label>
<input id="code" class="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" maxlength="8" required autofocus>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<button class="primary" type="submit">Connect</button>
</form>
<form method="post" action="/authorize">${hidden("req", req)}${hidden("step", "cancel")}<button class="ghost" type="submit">Cancel</button></form>
</div>`);
}

export function messagePage(title, message, extra = "") {
  return page(title, `<h1>${esc(title)}</h1><div class="card"><p>${esc(message)}</p>${extra}</div>`);
}

export function homePage({ base, ready, appUrl, nonce }) {
  const mcp = `${base}/mcp`;
  const status = ready
    ? `<p class="ok">✓ Ready to connect</p>`
    : `<p class="err">Setup isn't finished: this server needs its secret key. In Vercel open this project, Settings, Environment Variables, add <b>HH_SECRET</b> with the long random text from your setup guide, then Deployments, ⋯, Redeploy.</p>`;
  return page("Happy Home for Claude", `
<h1>Use Happy Home from Claude</h1>
<p>Ask Claude by typing, talking or sending a photo, and it adds to your family's Happy Home: “add milk and eggs to shopping”, “what's on this week?”, or a photo of a receipt or school newsletter.</p>
<div class="card">${status}
<h2>Connector address</h2>
<div class="addr"><code id="addr">${esc(mcp)}</code><button class="primary" type="button" id="copy">Copy</button></div>
</div>
<div class="card">
<h2>Add it to Claude (once)</h2>
<ol><li>In Claude open <b>Settings</b>, then <b>Connectors</b>.</li>
<li>Tap <b>Add custom connector</b>. Name: <b>Happy Home</b>. URL: the address above.</li>
<li>Tap <b>Add</b>, then <b>Connect</b>, and sign in with your Happy Home email and password.</li></ol>
<p class="muted" style="margin-top:10px">Each person in the family who uses Claude adds it and signs in with their own Happy Home account.</p>
</div>
<p class="foot"><a href="${esc(appUrl)}" style="color:inherit">Open Happy Home</a></p>`, {
    nonce,
    script: `document.getElementById("copy").onclick=async e=>{try{await navigator.clipboard.writeText(document.getElementById("addr").textContent);e.target.textContent="Copied"}catch(_){const r=document.createRange();r.selectNodeContents(document.getElementById("addr"));const s=getSelection();s.removeAllRanges();s.addRange(r)}}`,
  });
}
