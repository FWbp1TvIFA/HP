// End-to-end test against the Firebase emulators, using the official MCP TypeScript client
// the same way Claude does: discovery, client registration, sign-in page, PKCE, tokens, tools.
//   firebase emulators:start --only auth,firestore   (with the app's firestore.rules)
//   cd test && npm install && node --test e2e.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handle } from "../src/handler.js";
import { nodeHandler } from "../src/node-adapter.js";
import { todayIn, addDays } from "../src/dates.js";

const EMU = process.env.HH_EMULATOR_HOST || "127.0.0.1";
const PROJECT = "happy-family-791f1";
const AUTH = `http://${EMU}:9099/identitytoolkit.googleapis.com/v1`;
const FS = `http://${EMU}:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const env = { HH_SECRET: "e2eKq7vT2mX9pL4wR8nB3cF6hJ1sD5gZ0yA", HH_EMULATOR_HOST: EMU, HH_TZ: "Australia/Brisbane" };
const TODAY = todayIn("Australia/Brisbane");
let server, base;
const users = {};

const j = async (url, init = {}) => { const r = await fetch(url, init); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b, headers: r.headers }; };
const toV = v => v === null ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === "string" ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toV(x)])) } };
const fromV = v => "nullValue" in v ? null : "booleanValue" in v ? v.booleanValue : "integerValue" in v ? { int: Number(v.integerValue) } : "doubleValue" in v ? { dbl: v.doubleValue } : "stringValue" in v ? v.stringValue : "arrayValue" in v ? (v.arrayValue.values || []).map(fromV) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromV(x)])) : v;
const plain = x => x && typeof x === "object" ? ("int" in x && Object.keys(x).length === 1 ? x.int : "dbl" in x && Object.keys(x).length === 1 ? x.dbl : Array.isArray(x) ? x.map(plain) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]))) : x;

async function signUp(email) {
  const r = await j(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { uid: r.body.localId, token: r.body.idToken, email };
}
async function put(user, path, data) {
  const r = await j(`${FS}/${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toV(v)])) }) });
  assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`);
}
async function patchMask(user, path, data) {
  const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + k).join("&");
  const r = await j(`${FS}/${path}?${mask}`, { method: "PATCH", headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toV(v)])) }) });
  assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`);
}
// Raw read that keeps the integer/double distinction ({int}/{dbl}) so we can check types.
async function rawDocs(path) {
  const r = await j(`${FS}/${path}?pageSize=300`, { headers: { Authorization: "Bearer owner" } });
  return (r.body.documents || []).map(d => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromV(v)])) }));
}
const docs = async path => (await rawDocs(path)).map(plain);

// Drive the sign-in page like a person in a browser would.
async function signInAt(authUrl, email, password = "password123", code) {
  const page = await fetch(authUrl, { redirect: "manual" });
  const htmlText = await page.text();
  assert.equal(page.status, 200, htmlText.slice(0, 300));
  const req = htmlText.match(/name="req" value="([^"]+)"/)[1];
  let res = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ req, step: "password", email, password }) });
  return { res, req };
}

class Provider {
  constructor(redirect) { this._redirect = redirect; }
  get redirectUrl() { return this._redirect; }
  get clientMetadata() { return { redirect_uris: [this._redirect], client_name: "E2E test", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }; }
  clientInformation() { return this.client; } saveClientInformation(c) { this.client = c; }
  tokens() { return this._tokens; } saveTokens(t) { this._tokens = t; }
  redirectToAuthorization(u) { this.authUrl = u; }
  saveCodeVerifier(v) { this.verifier = v; } codeVerifier() { return this.verifier; }
}

async function connectAs(user) {
  const provider = new Provider("http://localhost:3999/callback");
  const url = new URL(`${base}/mcp`);
  let transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await assert.rejects(client.connect(transport), /Unauthorized|auth/i);
  assert.ok(provider.authUrl, "client was sent to the sign-in page");
  const { res } = await signInAt(provider.authUrl.toString(), user.email);
  assert.equal(res.status, 302, await res.clone().text());
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "http://localhost:3999/callback");
  assert.ok(loc.searchParams.get("code"));
  await transport.finishAuth(loc.searchParams.get("code"));
  transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
  const client2 = new Client({ name: "e2e", version: "1.0.0" });
  await client2.connect(transport);
  return { client: client2, provider };
}
const call = async (c, name, args = {}) => { const r = await c.callTool({ name, arguments: args }); return { text: r.content.map(x => x.text).join("\n"), isError: !!r.isError }; };

before(async () => {
  await fetch(`http://${EMU}:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${EMU}:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  users.old = await signUp("old@example.com");
  users.akiyo = await signUp("akiyo@example.com");
  users.outsider = await signUp("outsider@example.com");
  users.lonely = await signUp("lonely@example.com");
  // Same shapes as the app's Store.createFamily / joinFamily / claimPerson.
  await put(users.old, "families/FAMILY01", { people: [{ id: 1, name: "Old", uid: users.old.uid }, { id: 2, name: "Akiyo", uid: null }, { id: 3, name: "Jugo", uid: null }], currency: "$", categories: ["Groceries", "Bills", "Transport", "School", "Eating out", "Health", "Fun", "Other"], budgets: { Groceries: 800, "Eating out": 100 }, members: [users.old.uid], owner: users.old.uid, createdAt: Date.now() });
  await put(users.old, `users/${users.old.uid}`, { familyId: "FAMILY01" });
  await patchMask(users.akiyo, "families/FAMILY01", { members: [users.old.uid, users.akiyo.uid] });
  await put(users.akiyo, `users/${users.akiyo.uid}`, { familyId: "FAMILY01" });
  await patchMask(users.akiyo, "families/FAMILY01", { people: [{ id: 1, name: "Old", uid: users.old.uid }, { id: 2, name: "Akiyo", uid: users.akiyo.uid }, { id: 3, name: "Jugo", uid: null }] });
  await put(users.outsider, "families/OTHERFAM", { people: [{ id: 1, name: "Stranger", uid: users.outsider.uid }], currency: "$", categories: ["Other"], budgets: {}, members: [users.outsider.uid], owner: users.outsider.uid, createdAt: Date.now() });
  await put(users.outsider, `users/${users.outsider.uid}`, { familyId: "OTHERFAM" });
  // Things already in the app
  await put(users.old, "families/FAMILY01/shopping/milk1", { name: "Milk", qty: "", done: false, who: 1, aisle: "Dairy & eggs", createdAt: Date.now(), by: 1 });
  await put(users.old, "families/FAMILY01/events/swim1", { title: "Swimming", who: 3, date: addDays(TODAY, -14), time: "16:00", place: "Pool", repeat: "weekly", days: [2, 4], until: "", skip: [], createdAt: Date.now(), by: 1 });
  await put(users.old, "families/FAMILY01/tasks/bins1", { title: "Put bins out", who: 1, due: TODAY, time: "", repeat: "weekly", points: 2, done: false, createdAt: Date.now(), by: 1 });
  await put(users.old, "families/FAMILY01/bills/power1", { name: "Electricity", amount: 250.5, every: "quarter", next: TODAY, cat: "Bills", who: 1, auto: false, createdAt: Date.now(), by: 1 });
  await put(users.old, "families/FAMILY01/wallet/card1", { kind: "Loyalty card", name: "Secret card", num: "123", shared: true });
  await put(users.outsider, "families/OTHERFAM/tasks/secret", { title: "Outsider's private task", who: 1, due: TODAY, done: false });
  server = http.createServer(nodeHandler(handle, env));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server && server.close());

test("discovery metadata and 401 challenge", async () => {
  const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) });
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /resource_metadata="http:\/\/localhost:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
  const prm = await j(`${base}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(prm.body.resource, `${base}/mcp`);
  const asm = await j(`${base}/.well-known/oauth-authorization-server`);
  assert.equal(asm.body.registration_endpoint, `${base}/register`);
  assert.deepEqual(asm.body.code_challenge_methods_supported, ["S256"]);
});

let old;
test("official MCP client signs in through the Happy Home page and lists tools", async () => {
  old = await connectAs(users.old);
  const { tools } = await old.client.listTools();
  assert.deepEqual(tools.map(t => t.name), ["get_overview", "find_items", "money_summary", "add_items", "update_items", "mark_done", "delete_items"]);
  const add = tools.find(t => t.name === "add_items");
  assert.match(add.description, /Jugo, Akiyo, Old/);   // the family's own names, in the app's order
  assert.equal(tools.find(t => t.name === "delete_items").annotations.destructiveHint, true);
  assert.equal(tools.find(t => t.name === "get_overview").annotations.readOnlyHint, true);
});

test("overview shows existing things, never wallet cards", async () => {
  const { text, isError } = await call(old.client, "get_overview", { days: 7 });
  assert.equal(isError, false, text);
  assert.match(text, /Signed in as Old/);
  assert.match(text, /Put bins out/);
  assert.match(text, /Swimming/);
  assert.match(text, /Electricity/);
  assert.match(text, /Milk/);
  assert.doesNotMatch(text, /Secret card|Outsider/);
});

let added = {};
test("add_items writes exactly what the app writes", async () => {
  const { text, isError } = await call(old.client, "add_items", {
    tasks: [{ title: "Mow the lawn", who: "Jugo", due: addDays(TODAY, 2), time: "10am", repeat: "weekly", stars: 5 }],
    events: [{ title: "Parent teacher night", date: addDays(TODAY, 3), time: "18:30", place: "School hall" }, { title: "Piano", who: "jugo", weekly_on_days: ["Mon"], time: "17:00" }],
    homework: [{ subject: "Maths", title: "Fractions sheet" }],
    shopping: [{ name: "Eggs", qty: "12" }, { name: "milk" }, { name: "Bread 2" }],
    money: [{ amount: 87.4, note: "Woolworths", date: TODAY }, { amount: 12, category: "eating out", note: "Sushi" }, { amount: 3000, type: "income" }],
    notes: [{ title: "Wifi", text: "Password is on the router" }],
    bills: [{ name: "Netflix", amount: 18.99, every: "month", next_due: addDays(TODAY, 5), paid_automatically: true }],
    meals: [{ date: addDays(TODAY, 1), title: "Spaghetti bolognese", ingredients: ["Mince", "Pasta", "Tomatoes"], cook: "Akiyo" }],
    add_meal_ingredients_to_shopping: true,
    countdowns: [{ title: "Jugo's birthday", date: "2015-03-03", kind: "birthday" }],
    board: [{ text: "Home late tonight, dinner in the fridge" }],
  });
  assert.equal(isError, false, text);
  assert.match(text, /Milk is already on the list/);
  const tasks = await rawDocs("families/FAMILY01/tasks");
  const mow = tasks.find(t => t.title === "Mow the lawn");
  assert.deepEqual(plain({ ...mow, id: undefined, createdAt: undefined }), { id: undefined, createdAt: undefined, title: "Mow the lawn", who: 3, due: addDays(TODAY, 2), time: "10:00", repeat: "weekly", points: 5, done: false, by: 1 });
  assert.ok("int" in mow.createdAt && "int" in mow.who && "int" in mow.points, "numbers stored as integers like the JS SDK");
  added.mow = mow.id;
  const ev = await docs("families/FAMILY01/events");
  const ptn = ev.find(e => e.title === "Parent teacher night");
  assert.equal(ptn.who, 0); assert.equal(ptn.repeat, "none"); assert.deepEqual(ptn.days, []); assert.deepEqual(ptn.skip, []); assert.equal(ptn.until, "");
  const piano = ev.find(e => e.title === "Piano");
  assert.equal(piano.repeat, "weekly"); assert.deepEqual(piano.days, [1]); assert.equal(piano.who, 3);
  assert.equal(new Date(piano.date + "T12:00:00Z").getUTCDay(), 1, "first day moved to a Monday");
  added.piano = piano.id;
  const hw = (await docs("families/FAMILY01/homework"))[0];
  assert.equal(hw.who, 3, "homework defaults to the child like the app's kidId()"); assert.equal(hw.due, addDays(TODAY, 1)); assert.equal(hw.subject, "Maths");
  added.hw = hw.id;
  const shop = await docs("families/FAMILY01/shopping");
  assert.deepEqual(shop.map(s => s.name).sort(), ["Bread", "Eggs", "Milk", "Mince", "Pasta", "Tomatoes"]);
  assert.equal(shop.find(s => s.name === "Bread").qty, "2");
  assert.equal(shop.find(s => s.name === "Eggs").aisle, undefined, "aisle left for the app to fill");
  const freq = await docs("families/FAMILY01/shopFreq");
  assert.ok(freq.find(x => x.id === "eggs" && x.count === 1 && x.name === "Eggs"));
  const tx = await rawDocs("families/FAMILY01/tx");
  const woolies = tx.find(t => t.note === "Woolworths");
  assert.equal(plain(woolies).cat, "Groceries"); assert.equal(plain(woolies).type, "out"); assert.ok("dbl" in woolies.amount && woolies.amount.dbl === 87.4);
  assert.ok("int" in tx.find(t => plain(t).type === "in").amount, "3000 stored as integer like the app");
  assert.equal(plain(tx.find(t => t.note === "Sushi")).cat, "Eating out");
  assert.equal(plain(tx.find(t => plain(t).type === "in")).cat, "Salary");
  const meal = (await docs("families/FAMILY01/meals"))[0];
  assert.equal(meal.id, addDays(TODAY, 1)); assert.equal(meal.cook, 2); assert.deepEqual(meal.ingredients, ["Mince", "Pasta", "Tomatoes"]);
  const bill = (await docs("families/FAMILY01/bills")).find(b => b.name === "Netflix");
  assert.equal(bill.auto, true); assert.equal(bill.cat, "Bills"); assert.equal(bill.every, "month");
  const cd = (await docs("families/FAMILY01/countdowns"))[0];
  assert.equal(cd.yearly, true); assert.equal(cd.kind, "birthday");
  const post = (await docs("families/FAMILY01/board"))[0];
  assert.deepEqual({ ...post, id: 0, at: 0, createdAt: 0 }, { id: 0, text: "Home late tonight, dinner in the fridge", who: 1, at: 0, ack: {}, createdAt: 0, by: 1 });
  assert.equal(post.at, post.createdAt);
  const ov = await call(old.client, "get_overview", {});
  assert.match(ov.text, /Family board[\s\S]*Home late tonight/);
  const note = (await docs("families/FAMILY01/notes"))[0];
  assert.equal(note.body, "Password is on the router"); assert.equal(note.pinned, false); assert.equal(note.who, 1);
});

test("bad input adds nothing and explains why", async () => {
  const before = (await docs("families/FAMILY01/tasks")).length;
  const { text, isError } = await call(old.client, "add_items", { tasks: [{ title: "OK one" }, { title: "Bad", who: "Grandma" }], money: [{ amount: -5 }] });
  assert.equal(isError, true);
  assert.match(text, /Nothing was added/); assert.match(text, /Grandma/); assert.match(text, /above 0/);
  assert.equal((await docs("families/FAMILY01/tasks")).length, before);
  // Too much for one save (meal ingredients going on the shopping list) is refused whole, never half saved.
  const meals = Array.from({ length: 30 }, (_, i) => ({ date: addDays(TODAY, 40 + i), title: `Meal ${i}`, ingredients: Array.from({ length: 8 }, (_, k) => `Thing ${i}-${k}`) }));
  const big = await call(old.client, "add_items", { money: [{ amount: 12, note: "Receipt" }], meals, add_meal_ingredients_to_shopping: true });
  assert.equal(big.isError, true); assert.match(big.text, /too much to save in one go/);
  assert.equal((await docs("families/FAMILY01/meals")).filter(m => /^Meal \d/.test(m.title)).length, 0);
});

test("find_items, weekly occurrences and money summary", async () => {
  let r = await call(old.client, "find_items", { type: "events", from: TODAY, to: addDays(TODAY, 13) });
  assert.equal(r.isError, false, r.text);
  const swims = r.text.split("\n").filter(l => /Swimming/.test(l)).length;
  assert.ok(swims >= 3 && swims <= 4, r.text);
  r = await call(old.client, "find_items", { type: "shopping" });
  assert.match(r.text, /6 items on the shopping list/);
  r = await call(old.client, "find_items", { type: "notes", search: "wifi" });
  assert.match(r.text, /router/);
  r = await call(old.client, "money_summary", {});
  assert.match(r.text, /Groceries: \$87\.40 of \$800\.00 budget/);
  assert.match(r.text, /income \$3,000\.00/);
});

test("mark_done: stars, repeating task, shopping, homework and bill payment", async () => {
  let r = await call(old.client, "mark_done", { type: "tasks", ids: ["bins1"] });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /★2 stars for Old/); assert.match(r.text, /Next one added/);
  const tasks = await docs("families/FAMILY01/tasks");
  assert.equal(tasks.find(t => t.id === "bins1").done, true); assert.equal(tasks.find(t => t.id === "bins1").rolled, true);
  const next = tasks.find(t => t.title === "Put bins out" && t.id !== "bins1");
  assert.equal(next.due, addDays(TODAY, 7)); assert.equal(next.points, 2); assert.equal(next.done, false);
  const stars = await docs("families/FAMILY01/stars");
  assert.deepEqual(stars.find(s => s.id === `t-bins1-${TODAY}`), { id: `t-bins1-${TODAY}`, who: 1, pts: 2, date: TODAY, title: "Put bins out", task: "bins1" });
  r = await call(old.client, "mark_done", { type: "tasks", ids: ["bins1"], done: false });
  assert.equal(r.isError, false, r.text);
  assert.equal((await docs("families/FAMILY01/stars")).length, 0, "unticking takes the stars back");
  assert.equal((await docs("families/FAMILY01/tasks")).filter(t => t.title === "Put bins out").length, 2, "no second roll");
  r = await call(old.client, "mark_done", { type: "shopping", ids: ["milk1"] });
  assert.match(r.text, /Got: ✓ Milk/);
  r = await call(old.client, "mark_done", { type: "homework", ids: [added.hw] });
  assert.equal((await docs("families/FAMILY01/homework"))[0].done, true);
  r = await call(old.client, "mark_done", { type: "bills", ids: ["power1"] });
  assert.equal(r.isError, false, r.text);
  const pay = (await docs("families/FAMILY01/tx")).find(t => t.id === `bill-power1-${TODAY}`);
  assert.deepEqual({ ...pay, createdAt: 0 }, { id: `bill-power1-${TODAY}`, type: "out", amount: 250.5, cat: "Bills", who: 1, date: TODAY, note: "Electricity", createdAt: 0, by: 1 });
  const bill = (await docs("families/FAMILY01/bills")).find(b => b.id === "power1");
  assert.equal(bill.lastPaid, TODAY); assert.ok(bill.next > TODAY);
  // Paying the same bill again today (for example a retry) doesn't record a second payment.
  r = await call(old.client, "mark_done", { type: "bills", ids: ["power1"] });
  assert.match(r.text, /already marked paid today/);
  assert.equal((await docs("families/FAMILY01/tx")).filter(t => t.id.startsWith("bill-power1-")).length, 1);
  assert.equal((await docs("families/FAMILY01/bills")).find(b => b.id === "power1").next, bill.next);
});

test("update_items and delete_items (with skip one day of a weekly activity)", async () => {
  let r = await call(old.client, "update_items", { updates: [{ type: "tasks", id: added.mow, changes: { who: "Akiyo", stars: 3 } }, { type: "events", id: added.piano, changes: { weekly_on_days: ["Mon", "Wed"], until: addDays(TODAY, 60) } }] });
  assert.equal(r.isError, false, r.text);
  const mow = (await docs("families/FAMILY01/tasks")).find(t => t.id === added.mow);
  assert.equal(mow.who, 2); assert.equal(mow.points, 3); assert.equal(mow.title, "Mow the lawn");
  const piano = (await docs("families/FAMILY01/events")).find(e => e.id === added.piano);
  assert.deepEqual(piano.days, [1, 3]); assert.equal(piano.until, addDays(TODAY, 60));
  // Renaming a shopping item clears its aisle, so the app files it under the new name's aisle.
  r = await call(old.client, "update_items", { updates: [{ type: "shopping", id: "milk1", changes: { name: "bread rolls" } }] });
  assert.equal(r.isError, false, r.text);
  const rolls = (await docs("families/FAMILY01/shopping")).find(x => x.id === "milk1");
  assert.equal(rolls.name, "Bread rolls"); assert.equal(rolls.aisle, "");
  // Only an end date: the range starts at the beginning of that month.
  r = await call(old.client, "find_items", { type: "money", to: addDays(TODAY, -40) });
  assert.match(r.text, new RegExp(`from \\w{3} 1 `));
  r = await call(old.client, "update_items", { updates: [{ type: "tasks", id: added.mow, changes: { done: true } }] });
  assert.equal(r.isError, true); assert.match(r.text, /mark_done/);
  r = await call(old.client, "delete_items", { type: "events", ids: ["swim1"], only_this_date: addDays(TODAY, 7) });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual((await docs("families/FAMILY01/events")).find(e => e.id === "swim1").skip, [addDays(TODAY, 7)]);
  r = await call(old.client, "delete_items", { type: "tasks", ids: [added.mow] });
  assert.match(r.text, /Deleted/);
  assert.equal((await docs("families/FAMILY01/tasks")).some(t => t.id === added.mow), false);
  r = await call(old.client, "delete_items", { type: "tasks", ids: ["../../users/x"] });
  assert.equal(r.isError, true, "path tricks are refused");
});

test("another family can't see or touch this family", async () => {
  const other = await connectAs(users.outsider);
  let r = await call(other.client, "get_overview", {});
  assert.doesNotMatch(r.text, /Put bins out|Milk|Old/);
  assert.match(r.text, /Outsider's private task/);
  r = await call(other.client, "delete_items", { type: "shopping", ids: ["milk1"] });
  assert.equal(r.isError, true);
  assert.ok((await docs("families/FAMILY01/shopping")).some(s => s.id === "milk1"), "still there");
});

test("someone with no family is told to join first", async () => {
  const provider = new Provider("http://localhost:3999/callback");
  const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider });
  await assert.rejects(new Client({ name: "x", version: "1" }).connect(t));
  const { res } = await signInAt(provider.authUrl.toString(), users.lonely.email);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Join your family first/);
});

test("wrong password shows a friendly message on the page", async () => {
  const provider = new Provider("http://localhost:3999/callback");
  const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider });
  await assert.rejects(new Client({ name: "x", version: "1" }).connect(t));
  const { res } = await signInAt(provider.authUrl.toString(), users.old.email, "wrong-password");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /don&#39;t match a Happy Home account/);
});

test("claude.ai flow by hand: registration, return address checks, PKCE, refresh", async () => {
  const cb = "https://claude.ai/api/mcp/auth_callback";
  const bad = await j(`${base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) });
  assert.equal(bad.status, 400); assert.equal(bad.body.error, "invalid_redirect_uri");
  const reg = await j(`${base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [cb], client_name: "Claude", token_endpoint_auth_method: "none" }) });
  assert.equal(reg.status, 201);
  const cid = reg.body.client_id;
  const verifier = "v".repeat(20) + "erifier-0123456789abcdefghijk";
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  // A different return address than registered is refused without redirecting.
  const evil = await fetch(`${base}/authorize?` + new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: "https://evil.example/cb", state: "s", code_challenge: challenge, code_challenge_method: "S256" }), { redirect: "manual" });
  assert.equal(evil.status, 400);
  const noPkce = await fetch(`${base}/authorize?` + new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, state: "s" }), { redirect: "manual" });
  assert.equal(noPkce.status, 302); assert.match(noPkce.headers.get("location"), /error=invalid_request/);
  const authUrl = `${base}/authorize?` + new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, state: "st-123", code_challenge: challenge, code_challenge_method: "S256", scope: "family", resource: `${base}/mcp` });
  const pageRes = await fetch(authUrl);
  const page = await pageRes.text();
  assert.match(page, /Claude \(claude\.ai\) wants to use your family/);
  assert.match(pageRes.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const { res } = await signInAt(authUrl, users.akiyo.email);
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, cb); assert.equal(loc.searchParams.get("state"), "st-123"); assert.equal(loc.searchParams.get("iss"), base);
  const code = loc.searchParams.get("code");
  const tok = (p) => j(`${base}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(p) });
  let t = await tok({ grant_type: "authorization_code", code, code_verifier: "x".repeat(43), redirect_uri: cb, client_id: cid });
  assert.equal(t.status, 400); assert.equal(t.body.error, "invalid_grant");
  t = await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: "http://localhost/other", client_id: cid });
  assert.equal(t.body.error, "invalid_grant");
  t = await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: cb, client_id: cid });
  assert.equal(t.status, 200, JSON.stringify(t.body)); assert.equal(t.body.token_type, "Bearer"); assert.ok(t.body.refresh_token);
  assert.equal((await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: cb, client_id: cid })).body.error, "invalid_grant", "a sign-in code works once");
  assert.equal((await tok({ grant_type: "refresh_token", refresh_token: t.body.access_token })).body.error, "invalid_grant", "access token can't be used as refresh token");
  const r2 = await tok({ grant_type: "refresh_token", refresh_token: t.body.refresh_token });
  assert.equal(r2.status, 200); assert.ok(r2.body.access_token);
  // Use the token directly: Akiyo is person 2.
  const mcp = await j(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${r2.body.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "add_items", arguments: { notes: [{ text: "From Akiyo" }] } } }) });
  assert.equal(mcp.status, 200); assert.equal(mcp.body.result.isError, undefined, JSON.stringify(mcp.body));
  const n = (await docs("families/FAMILY01/notes")).find(x => x.body === "From Akiyo");
  assert.equal(n.by, 2); assert.equal(n.who, 2);
  // Tampered token is refused with a fresh challenge.
  const forged = r2.body.access_token.slice(0, -3) + "abc";
  const f401 = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${forged}`, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(f401.status, 401); assert.match(f401.headers.get("www-authenticate"), /invalid_token/);
  // Notifications get 202, unknown methods an error, GET a 405.
  const note = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${r2.body.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  assert.equal(note.status, 202);
  const unk = await j(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${r2.body.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "nope" }) });
  assert.equal(unk.body.error.code, -32601);
  const get = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${r2.body.access_token}` } });
  assert.equal(get.status, 405);
});

test("when the Happy Home sign-in is ended (account disabled), Claude is asked to sign in again", async () => {
  const fresh = await connectAs(users.akiyo);
  const ok = await call(fresh.client, "get_overview", {});
  assert.equal(ok.isError, false);
  await j(`http://${EMU}:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ localId: users.akiyo.uid, disableUser: true }) });
  const t = await j(`${base}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: fresh.provider.tokens().refresh_token }) });
  assert.equal(t.body.error, "invalid_grant");
});
