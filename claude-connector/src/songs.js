// The family's own piano songs (families/{fid}/songs/{id}: {title, notes, bpm, beats, yt}).
// parseSong is a copy of the app's own reader in piano.js ("2. Song text"), so a song Claude saves is
// read by the piano page exactly as checked here. Keep the two in step if the app's note format changes.

var LETTERS = "CDEFGAB";
var LET_SEMI = [0, 2, 4, 5, 7, 9, 11];
var TOKEN = /^([Dd][Oo]|[Rr][Ee]|[Mm][Ii]|[Ff][Aa]|[Ss][Oo][Ll]?|[Ll][Aa]|[Tt][Ii]|[Ss][Ii]|[A-Ga-g]|_|[Rr])([#♯b♭]?)([',]*)(\d?)([',]*)([-\/.]*)$/;
var SOLMAP = { "do": 0, re: 1, mi: 2, fa: 3, sol: 4, so: 4, la: 5, ti: 6, si: 6 };

/** "C C G G | A A G-" -> {notes:[{midi|null,beats}], bars:[...], errors:[text]}. Never throws. */
export function parseSong(text) {
  var out = { notes: [], bars: [], errors: [] };
  try {
    var bad = 0, range = 0;
    var src = String(text == null ? "" : text).slice(0, 20000).replace(/[‘’`´′]/g, "'").replace(/[–—−]/g, "-").replace(/\|+/g, " | ");
    var toks = src.split(/\s+/).filter(Boolean), names = toks.filter(function (t) { return t !== "|"; });
    if (names.length > 3 && names.slice(0, -1).every(function (t) { return /^[^,]+,$/.test(t); }) && !/,$/.test(names[names.length - 1]))
      toks = toks.map(function (t) { return t.replace(/,$/, ""); });
    var add = function (m) {
      var name = m[1].toLowerCase(), marks = m[3] + m[5], len = m[6], beats = 1, i;
      for (i = 0; i < len.length; i++) if (len[i] === "-") beats += 1;
      for (i = 0; i < len.length; i++) if (len[i] === "/") beats /= 2;
      var dots = len.split(".").length - 1; if (dots) beats *= dots > 1 ? 1.75 : 1.5;
      if (name === "_" || name === "r") { out.notes.push({ midi: null, beats: beats }); return; }
      var li = name.length > 1 ? SOLMAP[name] : LETTERS.indexOf(name.toUpperCase());
      var oct = m[4] ? +m[4] : 4; for (i = 0; i < marks.length; i++) oct += marks[i] === "'" ? 1 : -1;
      var acc = /[#♯]/.test(m[2]) ? 1 : m[2] ? -1 : 0, midi = (oct + 1) * 12 + LET_SEMI[li] + acc;
      if (midi < 21 || midi > 108) { if (!range++) out.errors.push('"' + m[0].slice(0, 12) + '" is too ' + (midi < 21 ? "low" : "high") + " for a piano."); return; }
      var n = { midi: midi, beats: beats }; if (acc < 0) n.flat = true; out.notes.push(n);
    };
    toks.forEach(function (tk) {
      if (out.notes.length >= 600) return;
      if (tk === "|") { if (out.notes.length && out.bars[out.bars.length - 1] !== out.notes.length) out.bars.push(out.notes.length); return; }
      if (/^-+$/.test(tk)) {
        var last = out.notes[out.notes.length - 1];
        if (last) last.beats += tk.length; else if (!bad++) out.errors.push('A "-" makes the note before it longer, so it needs a note first.');
        return;
      }
      var m = TOKEN.exec(tk);
      if (m) { add(m); return; }
      if (/^[A-Ga-g_]{2,}$/.test(tk)) { tk.split("").forEach(function (ch) { add(TOKEN.exec(ch)); }); return; }
      if (bad++ < 4) out.errors.push('I do not understand "' + tk.slice(0, 14) + '".');
    });
    if (bad > 4) out.errors.push("…and " + (bad - 4) + " more bits I could not read.");
    if (out.notes.length >= 600) out.errors.push("That is a very long song. I kept the first 600 notes.");
    if (out.bars[out.bars.length - 1] === out.notes.length) out.bars.pop();
    if (out.notes.length && out.bars[0] !== 0) out.bars.unshift(0);
  } catch (e) { out.errors.push("Sorry, I could not read these notes."); }
  return out;
}

/** Only real https YouTube links, as the app's safeYt(): anything else is stored as "". */
export function safeYt(u) {
  try {
    if (typeof u !== "string" || !u || u.length > 300) return "";
    var url = new URL(u.trim());
    return url.protocol === "https:" && /^((www|m|music)\.)?youtube\.com$|^youtu\.be$|^www\.youtube-nocookie\.com$/.test(url.hostname) ? url.href : "";
  } catch (e) { return ""; }
}

/** How many notes (not rests) a song's text has, as the app counts them. */
export const noteCount = notes => parseSong(notes).notes.filter(n => n.midi != null).length;
