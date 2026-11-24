// Date helpers. Dates are plain "YYYY-MM-DD" strings in the family's own time zone,
// exactly like the Happy Home app stores them. Maths is done at noon UTC so that
// adding days never trips over daylight saving.

export const DEFAULT_TZ = "Australia/Brisbane";

export function todayIn(tz = DEFAULT_TZ, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const asDate = s => new Date(s + "T12:00:00Z");
const iso = d => d.toISOString().slice(0, 10);

export function isISODate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = asDate(s);
  return !isNaN(d) && iso(d) === s;
}

export function addDays(s, n) { const d = asDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

// Same as the app's rollRepeat for "monthly": JavaScript month overflow (31 Jan -> 3 Mar).
export function addOneMonthLikeApp(s) { const d = asDate(s); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d); }

// Same as the app's nextDue() for bills: month-based steps keep the day, clamped to month end.
export function nextDue(s, every) {
  if (every === "week") return addDays(s, 7);
  if (every === "fortnight") return addDays(s, 14);
  const d = asDate(s), day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (every === "quarter" ? 3 : every === "year" ? 12 : 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

// Next time a countdown comes round (the app's cdNext).
export function countdownNext(c, today) {
  if (!c.yearly || !isISODate(c.date)) return c.date;
  const y = +today.slice(0, 4);
  let d = y + c.date.slice(4);
  if (d < today) d = (y + 1) + c.date.slice(4);
  return d;
}

export function daysBetween(a, b) { return Math.round((asDate(b) - asDate(a)) / 86400000); }

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Accepts YYYY-MM-DD, "today", "tomorrow", "yesterday", a weekday name (the coming one,
// today included; "next friday" skips today) or Australian D/M/YYYY.
export function parseDate(input, today) {
  if (input === undefined || input === null || input === "") return null;
  const s = String(input).trim().toLowerCase();
  if (isISODate(s)) return s;
  if (s === "today") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (s === "yesterday") return addDays(today, -1);
  const wd = s.match(/^(next\s+|this\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/);
  if (wd) {
    const target = WEEKDAYS.findIndex(w => w.startsWith(wd[2].slice(0, 3)));
    const cur = asDate(today).getUTCDay();
    let diff = (target - cur + 7) % 7;            // "friday": the coming one, today counts
    if (wd[1] && wd[1].startsWith("next") && diff === 0) diff = 7; // "next friday" never means today
    return addDays(today, diff);
  }
  const dm = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (dm) {
    const y = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    const out = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    if (isISODate(out)) return out;
  }
  throw new UserInputError(`"${String(input).slice(0, 40)}" isn't a date I understand. Use YYYY-MM-DD, for example ${today}.`);
}

// Accepts "15:30", "3pm", "3:30 pm", "9 am", "noon", "midday". Returns "HH:MM" or "".
export function parseTime(input) {
  if (input === undefined || input === null) return "";
  const s = String(input).trim().toLowerCase().replace(/\./g, "");
  if (!s || s === "none" || s === "all day") return "";
  if (s === "noon" || s === "midday") return "12:00";
  if (s === "midnight") return "00:00";
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${m[1].padStart(2, "0")}:${m[2]}`;
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && (!m[2] || +m[2] < 60)) {
    let h = +m[1] % 12; if (m[3] === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
  }
  throw new UserInputError(`"${String(input).slice(0, 40)}" isn't a time I understand. Use 24-hour HH:MM, for example 15:30.`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function niceDate(s, today) {
  if (!isISODate(s)) return s ? String(s) : "no date";
  const d = asDate(s), diff = today ? daysBetween(today, s) : null;
  const base = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${today && s.slice(0, 4) !== today.slice(0, 4) ? " " + s.slice(0, 4) : ""}`;
  if (diff === 0) return `today (${base})`;
  if (diff === 1) return `tomorrow (${base})`;
  if (diff === -1) return `yesterday (${base})`;
  return base;
}

export function longDate(s) {
  const d = asDate(s);
  const full = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${full[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function niceTime(t) {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return "";
  let h = +t.slice(0, 2); const m = t.slice(3), ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m === "00" ? `${h} ${ap}` : `${h}:${m} ${ap}`;
}

export class UserInputError extends Error {}
