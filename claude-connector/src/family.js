// Who is signed in, which family they belong to, and helpers that match the app's
// own rules (people, categories, money format).
import { Firestore, idTokenFor } from "./firebase.js";
import { todayIn, DEFAULT_TZ } from "./dates.js";

/** A problem with what was asked; the message is shown to Claude so it can fix the request. */
export class UserError extends Error {}

const familyIdCache = new Map(); // uid -> {fid, until}

export async function openFamily(cfg, env, session) {
  const tok = await idTokenFor(cfg, session.rt);
  const uid = tok.uid || session.uid;
  const fs = new Firestore(cfg, tok.idToken);
  let fid = null;
  const hit = familyIdCache.get(uid);
  if (hit && hit.until > Date.now()) fid = hit.fid;
  else {
    const user = await fs.get(["users", uid]);
    fid = user && typeof user.familyId === "string" ? user.familyId : null;
    if (fid) familyIdCache.set(uid, { fid, until: Date.now() + 60000 });
  }
  if (!fid) throw new UserError("This Happy Home account isn't part of a family yet. Open the Happy Home app, create or join the family with the family code, then try again.");
  const settings = await fs.get(["families", fid]);
  if (!settings) { familyIdCache.delete(uid); throw new UserError("Couldn't open your family in Happy Home. Open the app once to check you're still in the family, then try again."); }
  return new Family({ cfg, fs, uid, fid, settings, tz: env.HH_TZ || DEFAULT_TZ });
}

export class Family {
  constructor({ cfg, fs, uid, fid, settings, tz }) {
    Object.assign(this, { cfg, fs, uid, fid, settings, tz });
    this.today = todayIn(tz);
    this.peopleRaw = Array.isArray(settings.people) ? settings.people.filter(p => p && typeof p.id === "number") : [];
    const mine = this.peopleRaw.find(p => p.uid === uid);
    this.myPersonId = mine ? mine.id : 0;        // what the app stores in "by"
    this.meId = this.myPersonId || 1;            // the app's default "who"
    this.currency = settings.currency || "$";
    this.categories = Array.isArray(settings.categories) && settings.categories.length ? settings.categories.map(String) : ["Other"];
    this.budgets = settings.budgets && typeof settings.budgets === "object" ? settings.budgets : {};
  }
  col(name) { return ["families", this.fid, name]; }
  doc(name, id) { return ["families", this.fid, name, id]; }

  /** People in the app's display order (settings.order, else newest first). */
  get people() {
    const ord = this.settings.order;
    if (Array.isArray(ord) && ord.length) { const pos = id => { const i = ord.indexOf(id); return i < 0 ? 99 : i; }; return [...this.peopleRaw].sort((a, b) => pos(a.id) - pos(b.id)); }
    return [...this.peopleRaw].reverse();
  }
  get kidId() { const r = this.peopleRaw; return (r[2] || r[r.length - 1])?.id || this.meId; }
  name(id) { if (+id === 0) return "Family"; return this.peopleRaw.find(p => p.id === +id)?.name || "Someone"; }
  get myName() { return this.myPersonId ? this.name(this.myPersonId) : null; }
  namesList() { return this.people.map(p => p.name + (p.id === this.myPersonId ? " (you)" : "")).join(", "); }

  /** Turn "Akiyo", "me", "family", 2 ... into a person id. */
  who(input, { allowFamily = false, fallback } = {}) {
    if (input === undefined || input === null || String(input).trim() === "") return fallback;
    const raw = String(input).trim();
    const s = raw.toLowerCase().replace(/[’']s$/, "");
    if (/^\d+$/.test(s)) {
      const n = +s;
      if (n === 0 && allowFamily) return 0;
      if (this.peopleRaw.some(p => p.id === n)) return n;
    }
    if (["family", "everyone", "all", "whole family", "the family", "us", "all of us", "both", "nobody in particular"].includes(s)) {
      if (allowFamily) return 0;
      throw new UserError(`This needs one person, not the whole family. Choose one of: ${this.namesList()}.`);
    }
    if (["me", "i", "myself", "mine", "my"].includes(s)) return this.meId;
    const people = this.peopleRaw;
    const exact = people.filter(p => String(p.name).toLowerCase() === s);
    if (exact.length === 1) return exact[0].id;
    const starts = people.filter(p => String(p.name).toLowerCase().startsWith(s) || s.startsWith(String(p.name).toLowerCase() + " "));
    if (starts.length === 1) return starts[0].id;
    const word = people.filter(p => s.split(/\s+/).includes(String(p.name).toLowerCase()));
    if (word.length === 1) return word[0].id;
    throw new UserError(`I don't know who "${raw.slice(0, 40)}" is in Happy Home. The family is: ${this.namesList()}${allowFamily ? ', or "Family" for everyone' : ""}.`);
  }

  money(n) {
    const v = Math.abs(+n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-" : "") + this.currency + v;
  }

  /** Match a spending category the way the app does (exact name, then keywords, then Other). */
  category(input, note, { income = false } = {}) {
    const cats = income ? [...this.categories, "Salary"] : this.categories;
    const s = String(input || "").trim().toLowerCase();
    if (s) { const hit = cats.find(c => c.toLowerCase() === s); if (hit) return hit; }
    if (income && !s) return "Salary";
    const text = `${input || ""} ${note || ""}`;
    for (const [c, re] of Object.entries(CAT_WORDS)) if (re.test(text) && this.categories.includes(c)) return c;
    if (income) return this.categories.includes("Other") ? "Other" : "Salary";
    return this.categories.includes("Other") ? "Other" : this.categories[0];
  }
}

// The app's own keyword list (app.js CAT_WORDS) so receipts land in the same category.
const CAT_WORDS = {
  Groceries: /grocer|woolies|woolworths|coles|aldi|iga|supermarket|market|food shop/i,
  Transport: /petrol|fuel|uber|taxi|bus|train|parking|toll|opal|go card|car|rego|servo/i,
  Bills: /electric|power|gas bill|water|internet|phone|rent|insurance|bill|netflix|spotify|subscription/i,
  School: /school|uniform|book|excursion|tuition|fees|stationery/i,
  "Eating out": /lunch|dinner|breakfast|cafe|coffee|restaurant|takeaway|pizza|mcdonald|kfc|sushi|pho|maccas|bubble tea/i,
  Health: /doctor|dentist|chemist|pharmacy|medicine|physio|gp|optometrist/i,
  Fun: /movie|cinema|game|toy|gift|present|holiday|concert|netflix|zoo|park/i,
};
