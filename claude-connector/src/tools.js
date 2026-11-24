// The tools Claude can use. Every write mirrors what the Happy Home app itself writes,
// so things added from Claude look and behave exactly like things added in the app.
import { UserError } from "./family.js";
import { parseDate, parseTime, niceDate, niceTime, longDate, addDays, addOneMonthLikeApp, nextDue, countdownNext, daysBetween, isISODate, UserInputError } from "./dates.js";
import { newId } from "./crypto.js";
import { safeId, MAX_WRITES } from "./firebase.js";
import { parseSong, safeYt, noteCount } from "./songs.js";

/* ---------------- shared bits ---------------- */
export const TYPE_COLLECTION = { tasks: "tasks", events: "events", homework: "homework", shopping: "shopping", money: "tx", notes: "notes", bills: "bills", meals: "meals", countdowns: "countdowns", board: "board", alarms: "alarms", songs: "songs" };
const TYPE_LIST = Object.keys(TYPE_COLLECTION);
const DAYN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const EVERY = ["week", "fortnight", "month", "quarter", "year"];
const REPEAT = ["none", "daily", "weekly", "monthly"];
const KINDS = ["birthday", "anniversary", "trip", "other"];
const STAR_CHOICES = [0, 1, 2, 3, 5, 10];
// The app's reminder choices, in minutes before the time (-1 = no reminder).
const LEADS = [-1, 0, 5, 10, 15, 30, 60, 120, 1440];
const leadText = n => +n < 0 ? "no reminder" : +n === 0 ? "reminder at the time" : +n === 1440 ? "reminder 1 day before" : +n >= 60 ? `reminder ${+n / 60} hour${+n === 60 ? "" : "s"} before` : `reminder ${+n} min before`;
/** undefined = not given; null = the family's usual reminder; otherwise one of the app's choices. */
const remindArg = v => {
  if (v === undefined) return undefined;
  if (v === null || v === "" || (typeof v === "string" && /^(usual|default|normal)$/i.test(v.trim()))) return null;
  if (v === false || (typeof v === "string" && /^(none|no|off|never)$/i.test(v.trim()))) return -1;
  const n = typeof v === "number" ? v : /^-?\d+$/.test(String(v).trim()) ? +String(v).trim() : NaN;
  if (!LEADS.includes(n)) throw new UserError(`remind_minutes_before must be one of ${LEADS.join(", ")} (-1 means no reminder), or left out for the usual reminder.`);
  return n;
};

const wrap = fn => { try { return fn(); } catch (e) { if (e instanceof UserInputError) throw new UserError(e.message); throw e; } };
const text = (v, max, label) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" && typeof v !== "number") throw new UserError(`${label || "Text"} must be text.`);
  const s = String(v).trim();
  if (s.length > max) throw new UserError(`${label || "Text"} is too long (${s.length} characters, the most is ${max}).`);
  return s;
};
const need = (v, label) => { if (!v) throw new UserError(`${label} is missing.`); return v; };
const dateArg = (v, f, fallback, label = "Date") => wrap(() => { const d = parseDate(v, f.today); if (d === null) return fallback; return d; });
const timeArg = v => wrap(() => parseTime(v));
const amountArg = (v, label = "Amount") => {
  // "12,50" could be twelve fifty or one thousand two hundred and fifty: don't guess with money.
  if (typeof v === "string" && /,\d{1,2}$/.test(v.replace(/[^\d,.\-]/g, ""))) throw new UserError(`${label} "${v.trim().slice(0, 40)}" is unclear. Send it as a number such as 12.50.`);
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : +v;
  if (!isFinite(n) || n <= 0) throw new UserError(`${label} must be a number above 0.`);
  if (n > 10000000) throw new UserError(`${label} looks too big.`);
  return Math.round(n * 100) / 100;
};
const isRep = e => e.repeat === "weekly" && Array.isArray(e.days) && e.days.length > 0;
const dow = d => new Date(d + "T12:00:00Z").getUTCDay();
const occursOn = (e, d) => isRep(e) ? (d >= e.date && (!e.until || d <= e.until) && e.days.includes(dow(d)) && !(e.skip || []).includes(d)) : e.date === d;
const daysText = days => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(i => DAYN[i]).join(", ");
const byDateTime = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "99").localeCompare(b.time || "99");
const normName = n => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const ids = (v, label = "ids") => {
  const arr = Array.isArray(v) ? v : (v === undefined || v === null || v === "" ? [] : [v]);
  if (!arr.length) throw new UserError(`Give the ${label} of the items (find them with find_items or get_overview).`);
  if (arr.length > 100) throw new UserError("That's too many at once; do at most 100.");
  return [...new Set(arr.map(x => { try { return safeId(x); } catch { throw new UserError(`"${String(x).slice(0, 40)}" isn't an item id. Ids look like "k3j9x2m1abcd"; find them with find_items.`); } }))];
};
const typeArg = (v, allowed = TYPE_LIST) => {
  const s = String(v || "").toLowerCase().trim();
  const alias = { task: "tasks", event: "events", calendar: "events", spending: "money", tx: "money", transactions: "money", note: "notes", bill: "bills", meal: "meals", dinner: "meals", countdown: "countdowns", alarm: "alarms", song: "songs", "piano songs": "songs", "piano song": "songs", music: "songs", shop: "shopping", message: "board", messages: "board", "family board": "board" }[s] || s;
  if (!allowed.includes(alias)) throw new UserError(`Type must be one of: ${allowed.join(", ")}.`);
  return alias;
};
function weekdays(v) {
  if (v === undefined || v === null) return null;
  const arr = Array.isArray(v) ? v : String(v).split(/\s*(?:,|and|&|\s)\s*/);
  const out = [];
  for (const raw of arr) {
    if (raw === "" || raw === null || raw === undefined) continue;
    if (Number.isInteger(raw) && raw >= 0 && raw <= 6) { out.push(raw); continue; }
    const k = typeof raw === "number" ? "" : String(raw).trim().toLowerCase().slice(0, 3);
    if (!(k in DAY_INDEX)) throw new UserError(`"${String(raw).slice(0, 40)}" isn't a day of the week. Use Mon, Tue, Wed, Thu, Fri, Sat or Sun.`);
    out.push(DAY_INDEX[k]);
  }
  return [...new Set(out)].sort();
}

/** A song's notes, checked with the app's own note reader: every bit must be understood. */
function songNotes(v) {
  const notes = need(text(v, 20000, "Notes"), "notes");
  const p = parseSong(notes);
  // The page keeps 600 and warns from 600 on (rests count too), so 599 is the most it takes cleanly.
  if (p.notes.length >= 600) throw new UserError("that song is too long for the piano page: it takes at most 599 notes and rests in all (each rest counts). Split it into two songs, such as Part 1 and Part 2.");
  if (p.errors.length) throw new UserError(`the piano page can't read these notes: ${p.errors.join(" ")} ${NOTES_HELP}`);
  if (!p.notes.some(n => n.midi != null)) throw new UserError(`there are no notes in that. ${NOTES_HELP}`);
  return notes;
}
const bpmArg = v => { const n = Math.round(+v); if (!(n >= 30 && n <= 240)) throw new UserError("bpm (speed, counts a minute) must be from 30 to 240."); return n; };
const beatsArg = v => { if (+v !== 3 && +v !== 4) throw new UserError("beats_in_a_bar must be 3 or 4."); return +v; };
const ytArg = v => { const s = text(v, 300, "YouTube link"); if (!s) return ""; const y = safeYt(s); if (!y) throw new UserError("youtube_link must be an https link to youtube.com or youtu.be (or leave it out)."); return y; };
const NOTES_HELP = 'Write letter notes with spaces, like "C C G G | A A G-".';

/* ---------------- how things are shown back to Claude ---------------- */
function show(f, type, x, opts = {}) {
  const id = ` [id: ${x.id}]`;
  switch (type) {
    case "tasks": return `${x.done ? "✓ " : ""}${x.title} (${f.name(x.who)})${x.due ? ", due " + niceDate(x.due, f.today) : ", any time"}${x.time ? " at " + niceTime(x.time) : ""}${x.repeat && x.repeat !== "none" ? ", repeats " + x.repeat : ""}${+x.points > 0 ? `, ★${+x.points} stars` : ""}${rem(x)}${id}`;
    case "events":
      if (isRep(x) && !opts.occurrence) return `Every ${daysText(x.days)}${x.time ? " at " + niceTime(x.time) : ""}: ${x.title}${x.place ? " at " + x.place : ""} (${f.name(x.who)}), from ${niceDate(x.date, f.today)}${x.until ? " until " + niceDate(x.until, f.today) : ""}${x.skip?.length ? `, skipping ${x.skip.length} date(s)` : ""}${rem(x)}${id}`;
      return `${niceDate(x.date, f.today)}${x.time ? " " + niceTime(x.time) : ""}: ${x.title}${x.place ? " at " + x.place : ""} (${f.name(x.who)})${isRep(x) ? ", weekly activity" : ""}${rem(x)}${id}`;
    case "homework": return `${x.done ? "✓ " : ""}${x.subject || "Homework"}: ${x.title} (${f.name(x.who)})${x.due ? ", due " + niceDate(x.due, f.today) : ""}${x.time ? " at " + niceTime(x.time) : ""}${!x.done && x.due && x.due < f.today ? " (overdue)" : ""}${rem(x)}${id}`;
    case "alarms": { const weekly = Array.isArray(x.days) && x.days.length > 0;
      return `⏰ ${x.time ? niceTime(x.time) : "no time"} ${x.title || "Alarm"}, ${weekly ? "every " + daysText(x.days) : x.date ? niceDate(x.date, f.today) : "once"} (${+x.who ? f.name(x.who) : "everyone"})${x.on === false ? ", switched off" : ""}${id}`; }
    case "shopping": return `${x.done ? "✓ " : ""}${x.name}${x.qty ? " (" + x.qty + ")" : ""}${id}`;
    case "songs": { const notes = typeof x.notes === "string" ? x.notes : "", n = noteCount(notes);
      return `🎵 ${String(x.title ?? "").trim() || "Our song"}: ${n} note${n === 1 ? "" : "s"}, ${+x.beats === 3 ? 3 : 4} counts a bar, speed ${Math.min(240, Math.max(30, Math.round(+x.bpm) || 90))}${safeYt(x.yt) ? ", with a YouTube lesson" : ""}${opts.full && notes ? (notes.length <= 6000 || opts.only ? `. Notes: ${notes}` : `. Notes (only the first 6000 of ${notes.length} characters, so don't rewrite this song's notes from this; look it up on its own to see them all): ${notes.slice(0, 6000)}…`) : ""}${id}`; }
    case "money": return `${niceDate(x.date, f.today)}: ${x.type === "in" ? "+" : "-"}${f.money(x.amount)} ${x.cat || ""}${x.note ? " — " + x.note : ""} (${f.name(x.who)})${id}`;
    case "notes": {
      const body = String(x.body || "");
      const cut = opts.full ? body.slice(0, 4000) + (body.length > 4000 ? "…" : "") : body.slice(0, 160).replace(/\s+/g, " ") + (body.length > 160 ? "…" : "");
      return `${x.pinned ? "📌 " : ""}${x.title || "(no title)"}${cut ? ": " + cut : ""}${id}`;
    }
    case "bills": return `${x.name}: ${f.money(x.amount)} every ${x.every || "month"}, next due ${niceDate(x.next, f.today)}${x.next && x.next < f.today ? " (overdue)" : ""}${x.auto ? ", paid automatically" : ""} (${f.name(x.who)}, ${x.cat || "Bills"})${id}`;
    case "board": { const ack = Object.keys(x.ack || {}).filter(k => x.ack[k]).map(k => f.name(k)); return `"${x.text}" — ${f.name(x.who)}, ${agoText(x.at || x.createdAt)}${ack.length ? ", 👍 " + ack.join(", ") : ""}${id}`; }
    case "meals": return `${niceDate(x.date || x.id, f.today)}: ${x.title}${x.cook ? " (cook: " + f.name(x.cook) + ")" : ""}${x.ingredients?.length ? " — needs " + x.ingredients.join(", ") : ""}${id}`;
    case "countdowns": { const nd = countdownNext(x, f.today); const n = isISODate(nd) ? daysBetween(f.today, nd) : null;
      return `${x.title}: ${niceDate(nd, f.today)}${n !== null ? (n >= 0 ? ` (in ${n} day${n === 1 ? "" : "s"})` : " (past)") : ""}${x.yearly ? ", every year" : ""}${x.yearly && x.kind === "birthday" && +String(x.date).slice(0, 4) > 1900 && n >= 0 ? `, turns ${+nd.slice(0, 4) - +x.date.slice(0, 4)}` : ""}${id}`; }
  }
  return JSON.stringify(x);
}
const rem = x => x.remind === undefined || x.remind === null || !x.time ? "" : ", " + leadText(x.remind);
function agoText(ms) {
  const m = Math.round((Date.now() - (+ms || 0)) / 60000);
  if (!(+ms > 0)) return "some time ago";
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return `${d} day${d === 1 ? "" : "s"} ago`;
}
const bullets = (arr, more = 0) => arr.map(s => "• " + s).join("\n") + (more > 0 ? `\n• …and ${more} more` : "");
function cap(list, n) { return { shown: list.slice(0, n), more: Math.max(0, list.length - n) }; }

function expandEvents(events, from, to) {
  const out = [];
  for (const e of events) {
    if (!isRep(e)) { if (e.date >= from && e.date <= to) out.push(e); continue; }
    let d = e.date > from ? e.date : from;
    for (let i = 0; i < 400 && d <= to; i++, d = addDays(d, 1)) if (occursOn(e, d)) out.push({ ...e, date: d, start: e.date });
  }
  return out.sort(byDateTime);
}

/* ---------------- tool: get_overview ---------------- */
async function getOverview(f, args) {
  const days = Math.min(31, Math.max(1, Math.round(+args.days || 7)));
  const end = addDays(f.today, days - 1), month = f.today.slice(0, 7);
  const famPath = ["families", f.fid];
  const [tasks, events, homework, shopping, bills, meals, countdowns, tx, board, alarms] = await Promise.all([
    f.fs.list(f.col("tasks")), f.fs.list(f.col("events")), f.fs.list(f.col("homework")), f.fs.list(f.col("shopping")),
    f.fs.list(f.col("bills")), f.fs.range(famPath, "meals", "date", f.today, end), f.fs.list(f.col("countdowns")),
    f.fs.range(famPath, "tx", "date", month + "-01", month + "-31"), f.fs.list(f.col("board")), f.fs.list(f.col("alarms")),
  ]);
  const out = [];
  out.push(`Happy Home — today is ${longDate(f.today)} (${f.tz} time).`);
  out.push(`Signed in as ${f.myName || "a family member who hasn't picked their name in the app yet"}. Family: ${f.namesList()}. Money is in ${f.currency} (${f.settings.currency === "$" || !f.settings.currency ? "Australian dollars" : f.currency}). Spending categories: ${f.categories.join(", ")}.`);
  const sec = (title, lines, more) => { if (lines.length) out.push(`\n${title}\n${bullets(lines, more)}`); };
  const posts = board.filter(b => Date.now() - (+(b.at || b.createdAt) || 0) < 7 * 864e5).sort((a, b) => (+(b.at || b.createdAt) || 0) - (+(a.at || a.createdAt) || 0)).slice(0, 10);
  sec("Family board (last 7 days)", posts.map(b => show(f, "board", b)));
  const openTasks = tasks.filter(t => !t.done);
  sec("Overdue tasks", openTasks.filter(t => t.due && t.due < f.today).sort((a, b) => a.due.localeCompare(b.due)).map(t => show(f, "tasks", t)));
  const soon = openTasks.filter(t => t.due && t.due >= f.today && t.due <= end).sort((a, b) => (a.due + (a.time || "99")).localeCompare(b.due + (b.time || "99")));
  sec(days === 1 ? "Tasks today" : `Tasks, next ${days} days`, soon.map(t => show(f, "tasks", t)));
  sec("Tasks with no date", openTasks.filter(t => !t.due).map(t => show(f, "tasks", t)));
  const occ = expandEvents(events, f.today, end);
  const c1 = cap(occ, 60);
  sec(days === 1 ? "Calendar today" : `Calendar, next ${days} days`, c1.shown.map(e => show(f, "events", e, { occurrence: true })), c1.more);
  sec("Homework to do", homework.filter(h => !h.done && (!h.due || h.due <= end)).sort((a, b) => (a.due || "").localeCompare(b.due || "")).map(h => show(f, "homework", h)));
  const ringing = alarms.filter(a => a.on !== false && ((Array.isArray(a.days) && a.days.length) || !a.date || a.date >= f.today)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  sec("Alarms switched on", ringing.map(a => show(f, "alarms", a)));
  const dinners = meals.filter(m => m.date >= f.today && m.date <= end).sort(byDateTime);
  sec("Dinner plan", dinners.map(m => show(f, "meals", m)));
  const billsDue = bills.filter(b => b.next && b.next <= end).sort((a, b) => a.next.localeCompare(b.next));
  sec("Bills due", billsDue.map(b => show(f, "bills", b)));
  const cds = countdowns.map(c => ({ c, nd: countdownNext(c, f.today) })).filter(({ nd }) => isISODate(nd) && nd >= f.today && daysBetween(f.today, nd) <= 60).sort((a, b) => a.nd.localeCompare(b.nd));
  sec("Coming up (next 60 days)", cds.map(({ c }) => show(f, "countdowns", c)));
  const list = shopping.filter(s => !s.done).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const c2 = cap(list, 60);
  out.push(list.length ? `\nShopping list (${list.length} item${list.length === 1 ? "" : "s"})\n${bullets(c2.shown.map(s => show(f, "shopping", s)), c2.more)}` : "\nShopping list: empty.");
  const spent = tx.filter(t => t.type !== "in").reduce((a, t) => a + (+t.amount || 0), 0);
  const income = tx.filter(t => t.type === "in").reduce((a, t) => a + (+t.amount || 0), 0);
  const budgetTotal = Object.values(f.budgets).reduce((a, b) => a + (+b || 0), 0);
  const over = f.categories.filter(c => +f.budgets[c] > 0 && tx.filter(t => t.type !== "in" && t.cat === c).reduce((a, t) => a + (+t.amount || 0), 0) > +f.budgets[c]);
  out.push(`\nMoney this month: spent ${f.money(spent)}${budgetTotal ? ` of a ${f.money(budgetTotal)} budget` : ""}, income ${f.money(income)}.${over.length ? " Over budget: " + over.join(", ") + "." : ""} (Use money_summary for detail.)`);
  return out.join("\n");
}

/* ---------------- tool: find_items ---------------- */
async function findItems(f, args) {
  const type = typeArg(args.type);
  const search = text(args.search, 200, "Search").toLowerCase();
  const who = args.who !== undefined && args.who !== null && args.who !== "" ? f.who(args.who, { allowFamily: true }) : null;
  const from = dateArg(args.from, f, null), to = dateArg(args.to, f, null);
  if (from && to && to < from) throw new UserError("'to' is before 'from'.");
  const limit = Math.min(200, Math.max(1, Math.round(+args.limit || 50)));
  const includeDone = args.include_done === true;
  const col = TYPE_COLLECTION[type];
  const famPath = ["families", f.fid];
  let rows, label = type;
  const matches = (x, fields) => !search || fields.some(k => String(x[k] ?? "").toLowerCase().includes(search));
  const whoOk = x => who === null || +x.who === who || (type === "meals" && +x.cook === who);

  if (type === "money") {
    const monthEnd = d => addDays(addOneMonthLikeApp(d.slice(0, 8) + "01"), -1);
    const a = from || (to ? to.slice(0, 8) + "01" : f.today.slice(0, 8) + "01"), b = to || (from ? addDays(from, 92) : monthEnd(f.today));
    if (daysBetween(a, b) > 800) throw new UserError("Pick a shorter date range (at most about two years).");
    rows = (await f.fs.range(famPath, "tx", "date", a, b)).filter(x => matches(x, ["note", "cat"]) && whoOk(x)).sort(byDateTime).reverse();
    label = `money from ${niceDate(a, f.today)} to ${niceDate(b, f.today)}`;
    const total = rows.reduce((s, x) => s + (x.type === "in" ? 0 : +x.amount || 0), 0), inc = rows.reduce((s, x) => s + (x.type === "in" ? +x.amount || 0 : 0), 0);
    const c = cap(rows, limit);
    return rows.length ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"} for ${label} (spent ${f.money(total)}, income ${f.money(inc)}):\n${bullets(c.shown.map(x => show(f, type, x)), c.more)}` : `Nothing found for ${label}.`;
  }
  if (type === "events") {
    const all = (await f.fs.list(f.col("events"))).filter(x => matches(x, ["title", "place"]) && whoOk(x));
    if (from || to) {
      const a = from || f.today, b = to || addDays(a, 30);
      if (daysBetween(a, b) > 366) throw new UserError("Pick a shorter date range (at most a year).");
      rows = expandEvents(all, a, b);
      const c = cap(rows, limit);
      return rows.length ? `${rows.length} calendar entr${rows.length === 1 ? "y" : "ies"} from ${niceDate(a, f.today)} to ${niceDate(b, f.today)}:\n${bullets(c.shown.map(x => show(f, type, x, { occurrence: true })), c.more)}` : `Nothing on the calendar from ${niceDate(a, f.today)} to ${niceDate(b, f.today)}${search ? ` matching "${search}"` : ""}.`;
    }
    const weekly = all.filter(e => isRep(e) && (!e.until || e.until >= f.today)).sort(byDateTime);
    const oneOff = all.filter(e => !isRep(e) && (includeDone || e.date >= f.today)).sort(byDateTime);
    const c = cap(oneOff, limit);
    const parts = [];
    if (weekly.length) parts.push(`Weekly activities:\n${bullets(weekly.map(x => show(f, type, x)))}`);
    if (oneOff.length) parts.push(`${includeDone ? "Events" : "Upcoming events"}:\n${bullets(c.shown.map(x => show(f, type, x)), c.more)}`);
    return parts.length ? parts.join("\n\n") : `No ${includeDone ? "" : "upcoming "}events${search ? ` matching "${search}"` : ""}.`;
  }
  if (type === "board") {
    rows = (await f.fs.list(f.col("board"))).filter(x => matches(x, ["text"]) && whoOk(x)).sort((a, b) => (+(b.at || b.createdAt) || 0) - (+(a.at || a.createdAt) || 0));
    const c = cap(rows, limit);
    return rows.length ? `${rows.length} family board post${rows.length === 1 ? "" : "s"}, newest first:\n${bullets(c.shown.map(x => show(f, type, x)), c.more)}` : "The family board is empty.";
  }
  rows = await f.fs.list(f.col(col));
  const field = { tasks: "due", homework: "due", bills: "next", meals: "date", countdowns: "date", shopping: null, notes: null, alarms: null, songs: null }[type];
  const searchFields = { tasks: ["title"], homework: ["title", "subject"], shopping: ["name", "qty"], notes: ["title", "body"], bills: ["name", "cat"], meals: ["title", "ingredients"], countdowns: ["title", "kind"], alarms: ["title"], songs: ["title"] }[type];
  rows = rows.filter(x => matches(x, searchFields) && (type === "songs" || whoOk(x)));
  if (["tasks", "homework", "shopping"].includes(type) && !includeDone) rows = rows.filter(x => !x.done);
  if (type === "meals" && !from && !to) rows = rows.filter(x => (x.date || x.id) >= f.today);
  if (field && (from || to)) rows = rows.filter(x => { const v = type === "countdowns" ? countdownNext(x, f.today) : x[field]; return v && (!from || v >= from) && (!to || v <= to); });
  if (type === "notes") rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
  else if (type === "countdowns") rows.sort((a, b) => String(countdownNext(a, f.today)).localeCompare(String(countdownNext(b, f.today))));
  else if (type === "shopping") rows.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
  else if (type === "alarms") rows.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  else if (type === "songs") rows.sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));
  else if (field) rows.sort((a, b) => String(a[field] || "9999").localeCompare(String(b[field] || "9999")) || (a.time || "99").localeCompare(b.time || "99"));
  const c = cap(rows, limit);
  const full = (type === "notes" || type === "songs") && c.shown.length <= 5, only = c.shown.length === 1;   // whole notes only for a few; otherwise previews keep the reply small
  const what = { tasks: includeDone ? "tasks" : "open tasks", homework: includeDone ? "homework items" : "homework items still to do", shopping: includeDone ? "shopping items" : "items on the shopping list", notes: "notes", bills: "bills", meals: "planned dinners", countdowns: "countdowns", alarms: "alarms", songs: "piano songs (the family's own)" }[type];
  return rows.length ? `${rows.length} ${what}${search ? ` matching "${search}"` : ""}:\n${bullets(c.shown.map(x => show(f, type, x, { full, only })), c.more)}` : `No ${what}${search ? ` matching "${search}"` : ""}.`;
}

/* ---------------- tool: money_summary ---------------- */
async function moneySummary(f, args) {
  let month = text(args.month, 7, "Month") || f.today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || +month.slice(5) < 1 || +month.slice(5) > 12) throw new UserError("Month must look like 2026-11.");
  const famPath = ["families", f.fid];
  const prev = (() => { const [y, m] = month.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const [tx, before, bills] = await Promise.all([
    f.fs.range(famPath, "tx", "date", month + "-01", month + "-31"),
    f.fs.range(famPath, "tx", "date", prev + "-01", prev + "-31"),
    f.fs.list(f.col("bills")),
  ]);
  const out = tx.filter(t => t.type !== "in"), inc = tx.filter(t => t.type === "in");
  const sum = a => a.reduce((s, t) => s + (+t.amount || 0), 0);
  const spent = sum(out), income = sum(inc), prevSpent = sum(before.filter(t => t.type !== "in"));
  const lines = [`Money for ${month}${month === f.today.slice(0, 7) ? " (this month, so far)" : ""}: spent ${f.money(spent)}, income ${f.money(income)}, ${income - spent >= 0 ? "left over" : "short"} ${f.money(Math.abs(income - spent))}. Last month's spending was ${f.money(prevSpent)}.`];
  const cats = [...new Set([...f.categories, ...out.map(t => t.cat || "Other")])];
  const rows = cats.map(c => { const s = sum(out.filter(t => (t.cat || "Other") === c)), b = +f.budgets[c] || 0; return { c, s, b }; }).filter(r => r.s > 0 || r.b > 0);
  if (rows.length) lines.push("\nBy category:\n" + bullets(rows.map(r => `${r.c}: ${f.money(r.s)}${r.b ? ` of ${f.money(r.b)} budget — ${r.s > r.b ? "OVER by " + f.money(r.s - r.b) : f.money(r.b - r.s) + " left"}` : ""}`)));
  const big = [...out].sort((a, b) => (+b.amount || 0) - (+a.amount || 0)).slice(0, 5);
  if (big.length) lines.push("\nBiggest spending:\n" + bullets(big.map(t => show(f, "money", t))));
  if (inc.length) lines.push("\nIncome:\n" + bullets(inc.slice(0, 10).map(t => show(f, "money", t))));
  const billsLeft = bills.filter(b => b.next && b.next.slice(0, 7) === month && b.next >= f.today);
  if (billsLeft.length) lines.push(`\nBills still to come this month (${f.money(sum(billsLeft))}):\n` + bullets(billsLeft.map(b => show(f, "bills", b))));
  return lines.join("\n");
}

/* ---------------- tool: add_items ---------------- */
async function addItems(f, args) {
  const now = Date.now(), by = f.myPersonId;
  const writes = [], done = [], problems = [];
  const each = (key, fn) => {
    const arr = args[key];
    if (arr === undefined || arr === null) return;
    if (!Array.isArray(arr)) { problems.push(`${key} must be a list.`); return; }
    arr.forEach((item, i) => { try { if (!item || typeof item !== "object") throw new UserError("must be an object"); fn(item); } catch (e) { if (e instanceof UserError) problems.push(`${key} #${i + 1}: ${e.message}`); else throw e; } });
  };
  const total = TYPE_LIST.reduce((n, k) => n + (Array.isArray(args[k]) ? args[k].length : 0), 0);
  // Count meal ingredients the same way they are read further down (commas or new lines, 60 a meal at most).
  const ingParts = m => (Array.isArray(m?.ingredients) ? m.ingredients : String(m?.ingredients || "").split(/[,\n]/)).slice(0, 200).filter(x => x !== undefined && x !== null && String(x).trim());
  const ingredientCount = args.add_meal_ingredients_to_shopping === true && Array.isArray(args.meals) ? args.meals.reduce((n, m) => n + Math.min(60, ingParts(m).length), 0) : 0;
  if (ingredientCount > 300) throw new UserError("That's too many meal ingredients to put on the shopping list in one go. Nothing was added. Please add the meals in smaller groups.");
  if (!total) throw new UserError("Nothing to add. Put the things to add in tasks, events, homework, shopping, money, notes, bills, meals, countdowns, alarms, songs or board.");
  if (total > 200) throw new UserError("That's a lot at once; add at most 200 things per call.");

  each("tasks", t => {
    const title = need(text(t.title, 300, "Title"), "Title");
    const repeat = t.repeat ? String(t.repeat).toLowerCase() : "none";
    if (!REPEAT.includes(repeat)) throw new UserError(`repeat must be one of ${REPEAT.join(", ")}.`);
    const points = t.stars === undefined || t.stars === null ? 0 : +t.stars;
    if (!STAR_CHOICES.includes(points)) throw new UserError(`stars must be one of ${STAR_CHOICES.join(", ")}.`);
    const rec = { title, who: f.who(t.who, { fallback: f.meId }), due: dateArg(t.due, f, f.today), time: timeArg(t.time), repeat, points, ...remindField(t), done: false, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("tasks", id), rec)); done.push("Task: " + show(f, "tasks", { ...rec, id }));
  });
  each("events", e => {
    const title = need(text(e.title, 300, "Title"), "Title");
    const days = weekdays(e.weekly_on_days);
    let date = dateArg(e.date, f, days?.length ? f.today : undefined);
    if (!date) throw new UserError("date is missing (YYYY-MM-DD).");
    const base = { title, who: f.who(e.who, { allowFamily: true, fallback: 0 }), time: timeArg(e.time), place: text(e.place, 300, "Place"), ...remindField(e) };
    let rec;
    if (days && days.length) {
      for (let i = 0; i < 7 && !days.includes(dow(date)); i++) date = addDays(date, 1);
      const until = dateArg(e.until, f, "");
      if (until && until < date) throw new UserError("until is before the first day.");
      rec = { ...base, date, repeat: "weekly", days, until, skip: [], createdAt: now, by };
    } else rec = { ...base, date, repeat: "none", days: [], until: "", skip: [], createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("events", id), rec)); done.push((isRep(rec) ? "Weekly activity: " : "Event: ") + show(f, "events", { ...rec, id }));
  });
  each("homework", h => {
    const title = need(text(h.title, 300, "Title"), "Title");
    const rec = { subject: text(h.subject, 60, "Subject") || "Homework", title, who: f.who(h.who, { fallback: f.kidId }), due: dateArg(h.due, f, addDays(f.today, 1)), time: timeArg(h.time), ...remindField(h), done: false, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("homework", id), rec)); done.push("Homework: " + show(f, "homework", { ...rec, id }));
  });

  // Shopping and meal ingredients need the current list to avoid doubling up.
  const wantsShopping = (Array.isArray(args.shopping) && args.shopping.length) || (args.add_meal_ingredients_to_shopping && Array.isArray(args.meals) && args.meals.length);
  let openList = [], freq = new Map();
  if (wantsShopping) {
    const [list, fr] = await Promise.all([f.fs.list(f.col("shopping")), f.fs.list(f.col("shopFreq"))]);
    openList = list.filter(s => !s.done); fr.forEach(x => freq.set(x.id, x));
  }
  const addShop = (rawName, rawQty, note) => {
    let name = text(rawName, 120, "Item name"), qty = text(rawQty, 40, "Quantity");
    if (!name) throw new UserError("item name is missing.");
    if (!qty) { // same quantity parsing as the app ("milk 2", "2 x milk", "500g mince")
      const m = name.match(/^(.*?)\s+(?:x\s*)?(\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|packs|bunch|dozen)?)$/i) || name.match(/^(\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|packs|bunch|dozen|x)?)\s+(.*)$/i);
      if (m) { if (/^\d/.test(m[1])) { qty = m[1].replace(/\s*x$/i, ""); name = m[2]; } else { name = m[1]; qty = m[2]; } }
    }
    name = capFirst(name.trim());
    const dupe = openList.find(s => normName(s.name) === normName(name));
    if (dupe) {
      if (qty && qty !== dupe.qty) { writes.push(f.fs.patch(f.doc("shopping", dupe.id), { qty })); dupe.qty = qty; done.push(`Shopping: ${name} was already on the list; quantity changed to ${qty} [id: ${dupe.id}]`); }
      else done.push(`Shopping: ${name} is already on the list [id: ${dupe.id}]`);
      return;
    }
    const rec = { name, qty, done: false, who: f.meId, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("shopping", id), rec)); openList.push({ ...rec, id });
    const key = normName(name).replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "item";
    const prevF = freq.get(key); const fr = { name, count: (prevF?.count || 0) + 1, last: now }; freq.set(key, { id: key, ...fr });
    writes.push(f.fs.set(f.doc("shopFreq", key), fr));
    done.push(`Shopping${note ? " (" + note + ")" : ""}: ${show(f, "shopping", { ...rec, id })}`);
  };
  each("shopping", s => addShop(s.name, s.qty));

  each("money", m => {
    const amount = amountArg(m.amount);
    const kind = String(m.type || "spent").toLowerCase();
    const income = ["income", "in", "earned", "received"].includes(kind);
    if (!income && !["spent", "out", "spending", "expense"].includes(kind)) throw new UserError('type must be "spent" or "income".');
    const note = text(m.note, 300, "Note");
    const rec = { type: income ? "in" : "out", amount, cat: f.category(m.category, note, { income }), who: f.who(m.who, { fallback: f.meId }), date: dateArg(m.date, f, f.today), note, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("tx", id), rec)); done.push((income ? "Income: " : "Spending: ") + show(f, "money", { ...rec, id }));
  });
  each("notes", n => {
    const title = text(n.title, 200, "Title"), body = text(n.text, 20000, "Note text");
    if (!title && !body) throw new UserError("a note needs a title or some text.");
    const rec = { title, body, who: f.meId, updated: now, pinned: n.pinned === true, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("notes", id), rec)); done.push("Note: " + show(f, "notes", { ...rec, id }));
  });
  each("bills", b => {
    const name = need(text(b.name, 120, "Name"), "Name");
    const amount = b.amount === 0 || b.amount === "0" ? 0 : amountArg(b.amount);
    const every = b.every ? String(b.every).toLowerCase() : "month";
    if (!EVERY.includes(every)) throw new UserError(`every must be one of ${EVERY.join(", ")}.`);
    const catIn = text(b.category, 60, "Category");
    const cat = catIn ? f.category(catIn, name) : (f.categories.includes("Bills") ? "Bills" : f.category("", name));
    const rec = { name, amount, every, next: dateArg(b.next_due, f, f.today), cat, who: f.who(b.who, { fallback: f.meId }), auto: b.paid_automatically === true, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("bills", id), rec)); done.push("Bill: " + show(f, "bills", { ...rec, id }));
  });
  const mealDates = new Set();
  each("meals", m => {
    const title = need(text(m.title, 200, "Dinner"), "title (what's for dinner)");
    const date = dateArg(m.date, f, f.today);
    if (mealDates.has(date)) throw new UserError(`two dinners for ${date}; one per night.`);
    mealDates.add(date);
    const ing = (Array.isArray(m.ingredients) ? m.ingredients : String(m.ingredients || "").split(/[,\n]/)).slice(0, 200).map(x => text(x, 120, "Ingredient")).filter(Boolean).slice(0, 60);
    const rec = { title, ingredients: ing, cook: m.cook === undefined || m.cook === null || m.cook === "" ? 0 : f.who(m.cook, { allowFamily: true, fallback: 0 }), date, updated: now };
    writes.push(f.fs.set(f.doc("meals", date), rec)); done.push("Dinner: " + show(f, "meals", { ...rec, id: date }));
    if (args.add_meal_ingredients_to_shopping === true) for (const x of ing) addShop(x, "", "for " + title);
  });
  each("countdowns", c => {
    const title = need(text(c.title, 200, "Title"), "Title");
    const kind = c.kind ? String(c.kind).toLowerCase() : "other";
    if (!KINDS.includes(kind)) throw new UserError(`kind must be one of ${KINDS.join(", ")}.`);
    const date = dateArg(c.date, f, null); if (!date) throw new UserError("date is missing.");
    const yearly = typeof c.every_year === "boolean" ? c.every_year : (kind === "birthday" || kind === "anniversary");
    const rec = { title, date, kind, yearly, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("countdowns", id), rec)); done.push("Countdown: " + show(f, "countdowns", { ...rec, id }));
  });

  each("alarms", a => {
    const rec = { ...alarmFields(f, { title: text(a.title, 120, "Title") || "Alarm", time: need(timeArg(a.time), "time (HH:MM)"), who: f.who(a.who, { allowFamily: true, fallback: f.meId }), days: weekdays(a.weekly_on_days) || [], date: dateArg(a.date, f, f.today) }), on: true, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("alarms", id), rec)); done.push("Alarm: " + show(f, "alarms", { ...rec, id }));
  });
  each("songs", g => {
    const rec = { title: need(text(g.title, 80, "Title"), "title"), notes: songNotes(g.notes), bpm: g.bpm === undefined || g.bpm === null ? 90 : bpmArg(g.bpm), beats: g.beats_in_a_bar === undefined || g.beats_in_a_bar === null ? 4 : beatsArg(g.beats_in_a_bar), yt: ytArg(g.youtube_link), createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("songs", id), rec)); done.push("Piano song: " + show(f, "songs", { ...rec, id }));
  });
  each("board", m => {
    const msg = need(text(m.text, 500, "Message"), "text");
    const rec = { text: msg, who: f.meId, at: now, ack: {}, createdAt: now, by };
    const id = newId(); writes.push(f.fs.create(f.doc("board", id), rec)); done.push("Family board: " + show(f, "board", { ...rec, id }));
  });

  if (problems.length) throw new UserError(`Nothing was added, because:\n${bullets(problems)}\nFix these and try again.`);
  if (writes.length > MAX_WRITES) throw new UserError(`That's too much to save in one go (${writes.length} changes, mostly from meal ingredients going on the shopping list). Nothing was added. Please add it in two or three smaller calls.`);
  await f.fs.commit(writes);
  return `Added to Happy Home (it shows in the app straight away):\n${bullets(done)}`;
}

// A reminder is only stored when one was asked for; without it the app uses the family's usual setting.
function remindField(x) { const r = remindArg(x.remind_minutes_before); return r === undefined || r === null ? {} : { remind: r }; }
/** An alarm the way the app saves it: weekly on set days (no date), or once on a date. A time that has
 *  already passed today moves to tomorrow, like the app. */
function alarmFields(f, { title, time, who, days, date }) {
  if (days.length) return { title, time, who, days, date: "" };
  if (!date) date = f.today;
  if (date < f.today) throw new UserError("that date has already passed.");
  if (date === f.today && time <= f.nowTime) date = addDays(f.today, 1);
  return { title, time, who, days: [], date };
}

/* ---------------- tool: update_items ---------------- */
const CHANGE_FIELDS = {
  tasks: ["title", "who", "due", "time", "repeat", "stars", "remind_minutes_before"],
  events: ["title", "who", "date", "time", "place", "weekly_on_days", "until", "remind_minutes_before"],
  homework: ["title", "subject", "who", "due", "time", "remind_minutes_before"],
  alarms: ["title", "time", "who", "weekly_on_days", "date", "on"],
  songs: ["title", "notes", "bpm", "beats_in_a_bar", "youtube_link"],
  shopping: ["name", "qty"],
  money: ["amount", "type", "category", "date", "who", "note"],
  notes: ["title", "text", "pinned"],
  bills: ["name", "amount", "every", "next_due", "category", "who", "paid_automatically"],
  meals: ["title", "ingredients", "cook"],
  countdowns: ["title", "date", "kind", "every_year"],
  board: ["text"],
};
async function updateItems(f, args) {
  const list = Array.isArray(args.updates) ? args.updates : [];
  if (!list.length) throw new UserError("Nothing to change. Give updates: [{type, id, changes}].");
  if (list.length > 100) throw new UserError("Change at most 100 things at once.");
  const prepared = list.map((u, i) => {
    try {
      const type = typeArg(u.type), id = ids(u.id, "id")[0];
      if (type === "meals" && !isISODate(id)) throw new UserError("a dinner's id is its date, like 2026-11-24.");
      const ch = u.changes && typeof u.changes === "object" ? u.changes : null;
      if (!ch || !Object.keys(ch).length) throw new UserError("changes is empty.");
      const bad = Object.keys(ch).filter(k => !CHANGE_FIELDS[type].includes(k));
      if (bad.length) throw new UserError(`can't change ${bad.join(", ")} on ${type}. You can change: ${CHANGE_FIELDS[type].join(", ")}.${bad.includes("done") ? " To tick something off, use mark_done." : ""}`);
      return { type, id, ch, i };
    } catch (e) { if (e instanceof UserError) throw new UserError(`Update #${i + 1}: ${e.message} Nothing was changed.`); throw e; }
  });
  const docs = await Promise.all(prepared.map(p => f.fs.get(f.doc(TYPE_COLLECTION[p.type], p.id))));
  const writes = [], done = [];
  prepared.forEach((p, k) => {
    const cur = docs[k];
    try {
      if (!cur) throw new UserError(`there's no ${p.type} item with id ${p.id}. Use find_items to get the right id.`);
      const c = p.ch, fields = {};
      const has = key => Object.prototype.hasOwnProperty.call(c, key);
      if (has("title")) fields.title = p.type === "notes" ? text(c.title, 200, "Title") : need(text(c.title, p.type === "songs" ? 80 : 300, "Title"), "Title");
      if (has("who")) fields.who = f.who(c.who, { allowFamily: p.type === "events" || p.type === "alarms", fallback: cur.who });
      if (has("time")) fields.time = timeArg(c.time);
      if (has("remind_minutes_before")) fields.remind = remindArg(c.remind_minutes_before) ?? null;   // null = the usual reminder
      switch (p.type) {
        case "tasks":
          if (has("due")) fields.due = dateArg(c.due, f, "");
          if (has("repeat")) { const r = String(c.repeat || "none").toLowerCase(); if (!REPEAT.includes(r)) throw new UserError(`repeat must be one of ${REPEAT.join(", ")}.`); fields.repeat = r; }
          if (has("stars")) { const n = +c.stars || 0; if (!STAR_CHOICES.includes(n)) throw new UserError(`stars must be one of ${STAR_CHOICES.join(", ")}.`); fields.points = n; }
          break;
        case "events": {
          if (has("date")) fields.date = need(dateArg(c.date, f, null), "date");
          if (has("place")) fields.place = text(c.place, 300, "Place");
          if (has("weekly_on_days")) { const d = weekdays(c.weekly_on_days) || []; if (d.length) { fields.repeat = "weekly"; fields.days = d; if (!Array.isArray(cur.skip)) fields.skip = []; } else { fields.repeat = "none"; fields.days = []; fields.until = ""; } }
          if (has("until")) fields.until = dateArg(c.until, f, "");
          break; }
        case "homework":
          if (has("subject")) fields.subject = text(c.subject, 60, "Subject") || "Homework";
          if (has("due")) fields.due = dateArg(c.due, f, "");
          break;
        case "alarms": {
          if (has("on")) { if (typeof c.on !== "boolean") throw new UserError("on must be true or false."); fields.on = c.on; }
          if (has("time") || has("weekly_on_days") || has("date")) {
            const days = has("weekly_on_days") ? (weekdays(c.weekly_on_days) || []) : (has("date") ? [] : Array.isArray(cur.days) ? cur.days : []);
            const date = has("date") ? need(dateArg(c.date, f, null), "date") : (cur.date && cur.date >= f.today ? cur.date : f.today);
            const a = alarmFields(f, { title: "", time: need(has("time") ? fields.time : cur.time, "time (HH:MM)"), who: 0, days, date });
            fields.time = a.time; fields.days = a.days; fields.date = a.date;
            if (!has("on")) fields.on = true;   // saving a new time in the app switches the alarm back on
          }
          break; }
        case "shopping":
          if (has("name")) { fields.name = capFirst(need(text(c.name, 120, "Name"), "Name")); fields.aisle = ""; }  // the app works the aisle out again from the new name
          if (has("qty")) fields.qty = text(c.qty, 40, "Quantity");
          break;
        case "money": {
          if (has("amount")) fields.amount = amountArg(c.amount);
          let income = cur.type === "in";
          if (has("type")) { const k = String(c.type).toLowerCase(); income = ["income", "in"].includes(k); if (!income && !["spent", "out"].includes(k)) throw new UserError('type must be "spent" or "income".'); fields.type = income ? "in" : "out"; }
          if (has("note")) fields.note = text(c.note, 300, "Note");
          if (has("category") || has("type")) fields.cat = f.category(has("category") ? c.category : cur.cat, fields.note ?? cur.note, { income });
          if (has("date")) fields.date = need(dateArg(c.date, f, null), "date");
          break; }
        case "notes":
          if (has("text")) fields.body = text(c.text, 20000, "Note text");
          if (has("pinned")) fields.pinned = c.pinned === true;
          fields.updated = Date.now();
          break;
        case "bills":
          if (has("name")) fields.name = need(text(c.name, 120, "Name"), "Name");
          if (has("amount")) fields.amount = c.amount === 0 ? 0 : amountArg(c.amount);
          if (has("every")) { const e = String(c.every).toLowerCase(); if (!EVERY.includes(e)) throw new UserError(`every must be one of ${EVERY.join(", ")}.`); fields.every = e; }
          if (has("next_due")) fields.next = need(dateArg(c.next_due, f, null), "next_due");
          if (has("category")) fields.cat = f.category(c.category, cur.name);
          if (has("paid_automatically")) fields.auto = c.paid_automatically === true;
          break;
        case "meals":
          if (has("ingredients")) fields.ingredients = (Array.isArray(c.ingredients) ? c.ingredients : String(c.ingredients || "").split(/[,\n]/)).map(x => text(x, 120, "Ingredient")).filter(Boolean).slice(0, 60);
          if (has("cook")) fields.cook = f.who(c.cook, { allowFamily: true, fallback: 0 });
          fields.updated = Date.now();
          break;
        case "board":
          if (has("text")) fields.text = need(text(c.text, 500, "Message"), "text");
          break;
        case "songs":
          if (has("notes")) fields.notes = songNotes(c.notes);
          if (has("bpm")) fields.bpm = bpmArg(c.bpm);
          if (has("beats_in_a_bar")) fields.beats = beatsArg(c.beats_in_a_bar);
          if (has("youtube_link")) fields.yt = ytArg(c.youtube_link);
          break;
        case "countdowns":
          if (has("date")) fields.date = need(dateArg(c.date, f, null), "date");
          if (has("kind")) { const k = String(c.kind).toLowerCase(); if (!KINDS.includes(k)) throw new UserError(`kind must be one of ${KINDS.join(", ")}.`); fields.kind = k; }
          if (has("every_year")) fields.yearly = c.every_year === true;
          break;
      }
      writes.push(f.fs.patch(f.doc(TYPE_COLLECTION[p.type], p.id), fields));
      done.push(show(f, p.type, { ...cur, ...fields, id: p.id }));
    } catch (e) { if (e instanceof UserError) throw new UserError(`Update #${p.i + 1}: ${e.message} Nothing was changed.`); throw e; }
  });
  await f.fs.commit(writes);
  return `Updated in Happy Home:\n${bullets(done)}`;
}

/* ---------------- tool: mark_done ---------------- */
async function markDone(f, args) {
  const type = typeArg(args.type, ["tasks", "homework", "shopping", "bills"]);
  const list = ids(args.ids);
  const doneFlag = args.done !== false;
  if (type === "bills" && !doneFlag) throw new UserError("A bill payment can't be un-done here. Find the payment with find_items type money and delete it, then change the bill's next_due with update_items.");
  const docs = await Promise.all(list.map(id => f.fs.get(f.doc(TYPE_COLLECTION[type], id))));
  const missing = list.filter((id, i) => !docs[i]);
  if (missing.length) throw new UserError(`No ${type} item with id ${missing.join(", ")}. Nothing was changed. Use find_items to get the right ids.`);
  const now = Date.now(), writes = [], out = [];
  docs.forEach(x => {
    const path = f.doc(TYPE_COLLECTION[type], x.id);
    if (type === "bills") {
      // A payment saved today always leaves the next date in the future. If someone has since moved it back
      // (to undo a wrong payment), let them pay again.
      if (x.lastPaid === f.today && x.next && x.next > f.today) { out.push(`${x.name} was already marked paid today, so nothing was added. Next one due ${niceDate(x.next, f.today)}.`); return; }
      const due = x.next || f.today, every = EVERY.includes(x.every) ? x.every : "month";
      writes.push(f.fs.set(f.doc("tx", `bill-${x.id}-${due}`), { type: "out", amount: +x.amount || 0, cat: x.cat || "Bills", who: x.who || f.meId, date: f.today, note: x.name, createdAt: now, by: f.meId }));
      let n = nextDue(due, every); while (n <= f.today) n = nextDue(n, every);
      writes.push(f.fs.patch(path, { next: n, lastPaid: f.today }));
      out.push(`Paid ${x.name} (${f.money(+x.amount || 0)}), recorded as spending today. Next one due ${niceDate(n, f.today)}.`);
      return;
    }
    if (!!x.done === doneFlag) { out.push(`${show(f, type, x)} was already ${doneFlag ? "done" : "not done"}.`); return; }
    const fields = { done: doneFlag, doneAt: doneFlag ? now : null };   // the app's Live feed shows who finished what, and when
    if (type === "tasks") {
      const starId = `t-${x.id}-${x.due || ""}`;
      if (doneFlag && +x.points > 0) writes.push(f.fs.set(f.doc("stars", starId), { who: x.who, pts: +x.points, date: f.today, title: x.title, task: x.id }));
      if (!doneFlag && +x.points > 0) writes.push(f.fs.remove(f.doc("stars", starId)));
      if (doneFlag && x.repeat && x.repeat !== "none" && !x.rolled) {
        fields.rolled = true;
        if (x.due) {
          const step = x.repeat === "daily" ? 1 : x.repeat === "weekly" ? 7 : 0;
          const next = s => step ? addDays(s, step) : addOneMonthLikeApp(s);
          let d = next(x.due); while (d < f.today) d = next(d);
          const rec = { title: x.title, who: x.who, due: d, time: x.time || "", repeat: x.repeat, points: +x.points || 0, done: false, createdAt: now, by: f.myPersonId };
          const nid = newId(); writes.push(f.fs.create(f.doc("tasks", nid), rec));
          out.push(`Next one added: ${show(f, "tasks", { ...rec, id: nid })}`);
        }
      }
    }
    writes.push(f.fs.patch(path, fields));
    out.unshift(`${doneFlag ? (type === "shopping" ? "Got" : "Done") : "Not done any more"}: ${show(f, type, { ...x, done: doneFlag })}${doneFlag && type === "tasks" && +x.points > 0 ? ` — ★${+x.points} stars for ${f.name(x.who)}` : ""}`);
  });
  await f.fs.commit(writes);
  return bullets(out);
}

/* ---------------- tool: delete_items ---------------- */
async function deleteItems(f, args) {
  const type = typeArg(args.type);
  const list = ids(args.ids);
  if (type === "meals" && list.some(x => !isISODate(x))) throw new UserError("A dinner's id is its date, like 2026-11-24.");
  const skipDate = args.only_this_date !== undefined && args.only_this_date !== null && args.only_this_date !== "" ? dateArg(args.only_this_date, f, null) : null;
  const docs = await Promise.all(list.map(id => f.fs.get(f.doc(TYPE_COLLECTION[type], id))));
  const missing = list.filter((id, i) => !docs[i]);
  if (missing.length) throw new UserError(`No ${type} item with id ${missing.join(", ")}. Nothing was deleted.`);
  const writes = [], out = [];
  docs.forEach(x => {
    const path = f.doc(TYPE_COLLECTION[type], x.id);
    if (skipDate && type === "alarms" && Array.isArray(x.days) && x.days.length) throw new UserError(`${show(f, "alarms", x)} rings every week, and an alarm can't skip just one day. To stop it for now, use update_items with on: false. Nothing was deleted.`);
    if (skipDate && type === "events" && isRep(x)) {
      writes.push(f.fs.patch(path, { skip: [...new Set([...(x.skip || []), skipDate])] }));
      out.push(`Skipped just ${niceDate(skipDate, f.today)} for ${show(f, "events", x)}`);
      return;
    }
    writes.push(f.fs.remove(path));
    out.push(show(f, type, x));
  });
  await f.fs.commit(writes);
  return `Deleted from Happy Home:\n${bullets(out)}`;
}

/* ---------------- tool definitions (descriptions use the family's own names) ---------------- */
export function toolDefinitions(f) {
  const names = f ? f.namesList({ you: false }) : "a family member's name";
  const me = f && f.myName ? `. Defaults to the signed-in person (${f.myName})` : ". Defaults to the signed-in person";
  const who = extra => ({ type: "string", description: `Who it's for: ${names}${extra || ""}.` });
  const cats = f ? f.categories.join(", ") : "the family's categories";
  // No "today is" here: the tool list can be kept for days, and get_overview gives today's date.
  const date = d => ({ type: "string", description: `${d} as YYYY-MM-DD. Words like "tomorrow" or "friday" also work.` });
  const time = { type: "string", description: "Time as 24-hour HH:MM, e.g. 15:30. Leave out for no time." };
  const remind = { type: "integer", enum: LEADS, description: "Only when the person asks for a particular reminder: minutes before the time (0 = at the time, 60 = an hour, 1440 = a day; -1 = no reminder). Needs a time. Leave out for the family's usual reminder." };
  const type = (list = TYPE_LIST) => ({ type: "string", enum: list, description: "What kind of item." });
  const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  return [
    {
      name: "get_overview", title: "What's on",
      description: "See what's happening in the family's Happy Home: today's date, who's in the family, Family board messages, overdue and upcoming tasks, calendar (including weekly activities), homework, dinner plan, bills due, birthdays and countdowns coming up, the shopping list, and this month's spending. Call this first when you need context, names or today's date.",
      inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 31, description: "How many days ahead to look, starting today. Default 7." } }, additionalProperties: false },
      annotations: { title: "What's on", ...ro }, run: getOverview,
    },
    {
      name: "find_items", title: "Find items",
      description: "Look things up in Happy Home and get their ids (needed to change, tick off or delete them). Types: tasks, events (calendar), homework, shopping, money (spending and income), notes, bills, meals (dinner plan), countdowns, board (Family board messages), alarms, songs (the family's own piano songs, with their notes). For events, give from/to to see every occurrence in that window; without dates you get upcoming events and weekly activities. For money, the default range is this month.",
      inputSchema: {
        type: "object", required: ["type"], additionalProperties: false,
        properties: {
          type: type(), search: { type: "string", description: "Words to look for in titles, names, notes or categories." },
          who: { type: "string", description: `Only items for this person: ${names}, or Family.` },
          from: date("Start date"), to: date("End date"),
          include_done: { type: "boolean", description: "Also show ticked-off tasks, homework and bought shopping (and past events). Default false." },
          limit: { type: "integer", minimum: 1, maximum: 200, description: "Most items to list. Default 50." },
        },
      },
      annotations: { title: "Find items", ...ro }, run: findItems,
    },
    {
      name: "money_summary", title: "Money summary",
      description: "Spending and income for a month: totals, each category against its budget, biggest spends, and bills still to come. Compares with last month.",
      inputSchema: { type: "object", additionalProperties: false, properties: { month: { type: "string", description: "Month as YYYY-MM. Default this month." } } },
      annotations: { title: "Money summary", ...ro }, run: moneySummary,
    },
    {
      name: "add_items",
      title: "Add to Happy Home",
      description: `Add one or many things to Happy Home in a single call: tasks, calendar events or weekly activities, homework, shopping items, spending or income, notes, bills, dinners, countdowns (birthdays, trips), alarms, piano songs and Family board messages. Great for photos: read a receipt into money, a school newsletter or invitation into events and homework, a recipe into meals plus shopping, a handwritten list into shopping. Only include details the person said or that are visible; ask if something important (like a date or amount) is unclear. Everyone in the family sees new items in the app straight away. Family: ${names}.`,
      inputSchema: {
        type: "object", additionalProperties: false,
        properties: {
          tasks: { type: "array", description: "Jobs and chores.", items: { type: "object", required: ["title"], additionalProperties: false, properties: {
            title: { type: "string" }, who: who(me), due: date("Due date, default today"), time, remind_minutes_before: remind,
            repeat: { type: "string", enum: REPEAT, description: "Repeat after it's ticked off. Default none." },
            stars: { type: "integer", enum: STAR_CHOICES, description: "Chore stars earned when done (0, 1, 2, 3, 5 or 10). Default 0." } } } },
          events: { type: "array", description: "Calendar entries. For something every week (like swimming every Tuesday and Thursday) give weekly_on_days instead of adding many copies.", items: { type: "object", required: ["title"], additionalProperties: false, properties: {
            title: { type: "string" }, date: date("Date (for weekly activities, the first day; default today)"), time, place: { type: "string" },
            who: who(", or Family (the default) for everyone"),
            weekly_on_days: { type: "array", items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }, description: "Makes it a weekly activity on these days." },
            until: date("Last day of a weekly activity (optional)"), remind_minutes_before: remind } } },
          homework: { type: "array", items: { type: "object", required: ["title"], additionalProperties: false, properties: {
            title: { type: "string", description: "What to do, e.g. 'Spelling list 12'." }, subject: { type: "string", description: "e.g. Maths, English, Science, HASS, Japanese. Default Homework." },
            who: who(f ? `. Defaults to ${f.name(f.kidId)}` : ""), due: date("Due date, default tomorrow"), time, remind_minutes_before: remind } } },
          shopping: { type: "array", description: "Items for the shared shopping list. Items already on the list are not doubled.", items: { type: "object", required: ["name"], additionalProperties: false, properties: {
            name: { type: "string", description: "e.g. Milk" }, qty: { type: "string", description: "Optional amount, e.g. 2, 1kg, 2 packs." } } } },
          money: { type: "array", description: "Spending (default) or income, e.g. from a receipt. One entry per receipt unless asked to split.", items: { type: "object", required: ["amount"], additionalProperties: false, properties: {
            amount: { type: "number", description: "Total in dollars, e.g. 87.40." }, type: { type: "string", enum: ["spent", "income"], description: "Default spent." },
            category: { type: "string", description: `One of: ${cats}${f ? ", or Salary for income" : ""}. If left out it's guessed from the note like the app does.` },
            date: date("Date, default today"), who: who(me), note: { type: "string", description: "Shop or what it was for, e.g. 'Woolworths' or 'School excursion'." } } } },
          notes: { type: "array", items: { type: "object", additionalProperties: false, properties: {
            title: { type: "string" }, text: { type: "string", description: "The note itself." }, pinned: { type: "boolean", description: "Pin to the top." } } } },
          bills: { type: "array", description: "Regular bills and subscriptions.", items: { type: "object", required: ["name", "amount"], additionalProperties: false, properties: {
            name: { type: "string", description: "e.g. Electricity, Netflix, Rent" }, amount: { type: "number" },
            every: { type: "string", enum: EVERY, description: "How often. Default month." }, next_due: date("Next due date, default today"),
            category: { type: "string", description: `Default Bills. One of: ${cats}.` }, who: who(" (who pays)" + me),
            paid_automatically: { type: "boolean", description: "Direct debit: the app records it by itself on the due date." } } } },
          meals: { type: "array", description: "Dinner plan, one per date. Replaces any dinner already planned that night.", items: { type: "object", required: ["title", "date"], additionalProperties: false, properties: {
            date: date("Night"), title: { type: "string", description: "What's for dinner." }, ingredients: { type: "array", items: { type: "string" } },
            cook: { type: "string", description: `Who's cooking: ${names}.` } } } },
          add_meal_ingredients_to_shopping: { type: "boolean", description: "Also put the meals' ingredients on the shopping list. Default false." },
          alarms: { type: "array", description: "Alarms in the Happy Home app, once or on set days every week (wake-up, leave for school, medicine). They ring on the family's phones only while the app is open, so say that, and for something that must not be missed suggest the phone's own alarm as well.", items: { type: "object", required: ["time"], additionalProperties: false, properties: {
            title: { type: "string", description: "What it's for, e.g. 'Leave for swimming'. Default Alarm." }, time: { type: "string", description: "Time as 24-hour HH:MM, e.g. 06:45." },
            weekly_on_days: { type: "array", items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }, description: "Ring every week on these days. Leave out for a one-time alarm." },
            date: date("For a one-time alarm: the day (default today, or tomorrow if that time has passed)"),
            who: who(", or Family for everyone" + me) } } },
          songs: { type: "array", description: "The family's own songs for the Piano page (they show under Our songs, with sheet music, coloured keys and a play-along). Use it when someone asks for a song to learn or practise. Only write a melody you know well, in an easy key for a child unless asked; say it was written from memory, so they can check it by ear.", items: { type: "object", required: ["title", "notes"], additionalProperties: false, properties: {
            title: { type: "string", description: "Song name, up to 80 characters." },
            notes: { type: "string", description: "The melody as letter notes with spaces: C D E F G A B (or Do Re Mi). # or b after the letter for a black key (F#, Bb). Octave number after it: no number is octave 4 (middle C is C4), C5 is the C above; ' also means one octave up and , one down. Length: a plain note is 1 count, C- is 2 counts, C-- is 3, C/ is half a count, C// a quarter, a dot after it makes it half as long again (C. is 1 and a half). Rest: _ (or R, R-, _/). Bar line: |. Example: C C G G | A A G- | F F E E | D D C-. At most 599 notes and rests (split a longer song into parts)." },
            bpm: { type: "integer", minimum: 30, maximum: 240, description: "Speed in counts a minute. Default 90." },
            beats_in_a_bar: { type: "integer", enum: [3, 4], description: "Counts in a bar: 4 (default) or 3 for a waltz." },
            youtube_link: { type: "string", description: "Optional https YouTube link to a lesson or performance of the song." } } } },
          board: { type: "array", description: "Short messages for the whole family on the Family board on the app's Today screen, e.g. 'Home late tonight, dinner in the fridge'. Posted as the signed-in person.", items: { type: "object", required: ["text"], additionalProperties: false, properties: {
            text: { type: "string", description: "The message (up to 500 characters)." } } } },
          countdowns: { type: "array", description: "Birthdays, anniversaries, trips and other days to count down to.", items: { type: "object", required: ["title", "date"], additionalProperties: false, properties: {
            title: { type: "string", description: "e.g. Jugo's birthday" }, date: date("Date (for birthdays, the birth date if known)"),
            kind: { type: "string", enum: KINDS }, every_year: { type: "boolean", description: "Default true for birthdays and anniversaries." } } } },
        },
      },
      annotations: { title: "Add to Happy Home", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, run: addItems,
    },
    {
      name: "update_items", title: "Change items",
      description: "Change existing items (find their ids first with find_items or get_overview). Fields you can change — tasks: title, who, due, time, repeat, stars, remind_minutes_before; events: title, who, date, time, place, weekly_on_days (empty list = one-off), until, remind_minutes_before; homework: title, subject, who, due, time, remind_minutes_before; alarms: title, time, who, weekly_on_days, date, on (false switches it off); shopping: name, qty; money: amount, type, category, date, who, note; notes: title, text, pinned; bills: name, amount, every, next_due, category, who, paid_automatically; meals (id is the date): title, ingredients, cook; countdowns: title, date, kind, every_year; songs: title, notes, bpm, beats_in_a_bar, youtube_link; board: text. To tick things off use mark_done.",
      inputSchema: {
        type: "object", required: ["updates"], additionalProperties: false,
        properties: { updates: { type: "array", items: { type: "object", required: ["type", "id", "changes"], additionalProperties: false, properties: {
          type: type(), id: { type: "string" },
          changes: { type: "object", description: "Only the fields to change, using the same names and formats as add_items (dates YYYY-MM-DD, times HH:MM, who as a name)." } } } } },
      },
      annotations: { title: "Change items", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }, run: updateItems,
    },
    {
      name: "mark_done", title: "Tick off",
      description: "Tick off tasks or homework, mark shopping items as bought, or mark bills as paid (records the payment as spending and moves the bill to its next due date). Ticking a task with stars gives the stars; ticking a repeating task adds the next one, like the app. Use done:false to untick. Get ids from find_items or get_overview.",
      inputSchema: { type: "object", required: ["type", "ids"], additionalProperties: false, properties: {
        type: type(["tasks", "homework", "shopping", "bills"]), ids: { type: "array", items: { type: "string" } },
        done: { type: "boolean", description: "true to tick off (default), false to untick." } } },
      annotations: { title: "Tick off", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, run: markDone,
    },
    {
      name: "delete_items", title: "Delete items",
      description: "Permanently delete items from Happy Home for the whole family. Only use when the person clearly asked to delete those exact items; say what you will delete first if there's any doubt. For a weekly activity, give only_this_date to skip one day instead of deleting every week.",
      inputSchema: { type: "object", required: ["type", "ids"], additionalProperties: false, properties: {
        type: type(), ids: { type: "array", items: { type: "string" } },
        only_this_date: date("For weekly calendar activities only (not alarms): skip just this day") } },
      annotations: { title: "Delete items", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }, run: deleteItems,
    },
  ];
}

export const SERVER_INSTRUCTIONS = `Happy Home is this family's shared organiser app (tasks and chores with stars, calendar and weekly activities, homework, shopping list, spending and budgets, notes, bills, dinner plan, birthdays and countdowns, alarms, the family's own piano songs). Everything you add appears for the whole family in the app straight away.
- Call get_overview first when you need today's date, the family's names, or what's already planned. Dates are YYYY-MM-DD in the family's time zone (Australia/Brisbane); money is in the family's currency (Australian dollars).
- When the person shares a photo (receipt, school newsletter, invitation, timetable, recipe, handwritten list), pull out the details and save them with one add_items call, then say briefly what you added. Don't invent dates, times or amounts that aren't shown or said; ask when unsure.
- People can be named the way the family says them: their name in the app (for example Dad, Mum), an earlier name, or mum, mom, dad, daddy. Each item is for one person (or Family where that is offered), so for "Mum and Dad" ask which one, or use Family.
- To change, tick off or delete something, get its id from find_items or get_overview first. Only delete when asked.`;
