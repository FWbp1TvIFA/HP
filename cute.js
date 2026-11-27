/* Happy Home: cute icons that are always alive.
   "Remake all the icons cuter (every single one)", "And keys", "And logos", "And moving random all the time",
   "No single gestures", "Like 100+ types of movement", "Way of dancing or something" (27 Nov 2026).
   1. HHCUTE: every icon in the app redrawn as a round, filled little character (most with a face). app.js takes its
      icons from here, and the bottom bar's icons are swapped in when the page opens.
   2. The dance floor: every so often a random icon on the screen (or the page's logo) does a random move from a
      library of 120+ moves and dances, never the same move twice in a row, and eyes blink now and then. Only the
      drawing inside a button moves, never the button, so a tap always lands where the button is. Nothing moves when
      the phone asks for less motion, while the app is hidden, or on the piano while music plays.
   All drawings are original. */
(function () {
  "use strict";
  const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="cute"';
  const F = 'style="fill:var(--cf,color-mix(in srgb,var(--surface,#fff) 92%,transparent))"';              // a sticker-white body (dark in dark mode)
  const eyes = (x1, x2, y, r) => { r = (r || 1.05) * 1.2; return `<g class="ce"><ellipse cx="${x1}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="currentColor" stroke="none"/><ellipse cx="${x2}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="currentColor" stroke="none"/><circle cx="${x1 - r * .32}" cy="${y - r * .42}" r="${r * .4}" fill="#fff" stroke="none"/><circle cx="${x2 - r * .32}" cy="${y - r * .42}" r="${r * .4}" fill="#fff" stroke="none"/></g>`; };
  const blush = (x1, x2, y) => `<g fill="#FF7EB0" stroke="none" opacity=".8"><ellipse cx="${x1}" cy="${y}" rx="1.45" ry=".85"/><ellipse cx="${x2}" cy="${y}" rx="1.45" ry=".85"/></g>`;
  const smile = (x, y, w) => `<path d="M${x - (w || 1.3)} ${y} q${w || 1.3} ${(w || 1.3) * .9} ${(w || 1.3) * 2} 0" stroke-width="1.3"/>`;
  const face = (cx, cy, s) => { s = s || 1; return eyes(cx - 2.4 * s, cx + 2.4 * s, cy, 1.05 * Math.min(1, s)) + blush(cx - 3.9 * s, cx + 3.9 * s, cy + 1.7 * s) + smile(cx, cy + 1.6 * s, 1.2 * s); };
  const svg = (body, extra) => `<svg ${S}${extra ? " " + extra : ""}>${body}</svg>`;

  const I = {
    home: svg(`<path d="M4 11 12 4.2 20 11v7.6a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 18.6z" ${F}/><path d="M16.2 6.2V4h2v3.9" ${F}/>${face(12, 14.4, .9)}`),
    piano: svg(`<rect x="3" y="4" width="18" height="16.5" rx="3.6" ${F}/><path d="M3.4 13.4h17.2"/><path d="M8 13.6v3.4M12 13.6v3.4M16 13.6v3.4" stroke-width="2.4"/>${face(12, 8.4, .85)}`),
    happy: svg(`<path d="M12 20.6C6.3 16.8 3 13.6 3 9.8 3 7.1 5 5 7.6 5c1.9 0 3.4 1 4.4 2.6C13 6 14.5 5 16.4 5 19 5 21 7.1 21 9.8c0 3.8-3.3 7-9 10.8z" ${F}/>${face(12, 11.2, .9)}`),
    cal: svg(`<rect x="3" y="5" width="18" height="16" rx="3.4" ${F}/><path d="M3.3 9.6h17.4M8 3v4M16 3v4"/>${face(12, 14.6, .9)}`),
    more: svg(`<g ${F}><circle cx="7.4" cy="7.4" r="4"/><circle cx="16.6" cy="7.4" r="4"/><circle cx="7.4" cy="16.6" r="4"/><circle cx="16.6" cy="16.6" r="4"/></g><g class="ce" fill="currentColor" stroke="none"><circle cx="6.1" cy="7.2" r=".75"/><circle cx="8.7" cy="7.2" r=".75"/><circle cx="15.3" cy="7.2" r=".75"/><circle cx="17.9" cy="7.2" r=".75"/><circle cx="6.1" cy="16.4" r=".75"/><circle cx="8.7" cy="16.4" r=".75"/><circle cx="15.3" cy="16.4" r=".75"/><circle cx="17.9" cy="16.4" r=".75"/></g>`),
    plus: svg(`<path d="M12 4.5v15M4.5 12h15" stroke-width="3.2"/><path d="M19.2 3.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="currentColor" stroke-width="1"/>`),
    lists: svg(`<rect x="4.5" y="4" width="15" height="17" rx="3" ${F}/><path d="M9 4V2.8h6V4" ${F}/><path d="m7.4 15.6 1.2 1.2 2.2-2.4M13 16h3.6" stroke-width="1.6"/>${eyes(9.6, 14.4, 9, .95)}${blush(7.6, 16.4, 10.8)}${smile(12, 10.6, 1)}`),
    x: svg(`<path d="M17.5 6.5 6.5 17.5M6.5 6.5l11 11" stroke-width="2.6"/>`),
    tick: svg(`<path d="m5 12.4 4.6 4.6L19 7.4" stroke-width="3"/>`),
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" class="cute"><path d="m15 18-6-6 6-6"/></svg>',
    search: svg(`<circle cx="10.6" cy="10.6" r="6.6" ${F}/><path d="m20 20-4.4-4.4" stroke-width="2.6"/>${eyes(8.6, 12.6, 10, .85)}${smile(10.6, 11.8, .9)}`),
    note: svg(`<path d="M14.4 3H6.6A2.6 2.6 0 0 0 4 5.6v12.8A2.6 2.6 0 0 0 6.6 21h10.8a2.6 2.6 0 0 0 2.6-2.6V8.6z" ${F}/><path d="M14.4 3v5.6H20"/>${face(12, 14.2, .85)}`),
    calc: svg(`<rect x="5" y="2.5" width="14" height="19" rx="3" ${F}/><rect x="7.6" y="5" width="8.8" height="5.4" rx="1.4" style="fill:var(--surface,#fff)"/>${eyes(10.2, 13.8, 7.4, .7)}${smile(12, 8.4, .8)}<g fill="currentColor" stroke="none"><circle cx="9" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="9" cy="17.6" r="1"/><circle cx="12" cy="17.6" r="1"/><circle cx="15" cy="17.6" r="1"/></g>`),
    pin: svg(`<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" ${F}/>${face(12, 9.6, .8)}`),
    gear: svg(`<path d="M12 2.6l1.5 2.2 2.6-.6.6 2.6 2.3 1.4-1.1 2.4 1.1 2.4-2.3 1.4-.6 2.6-2.6-.6L12 21.4l-1.5-2.2-2.6.6-.6-2.6-2.3-1.4 1.1-2.4-1.1-2.4 2.3-1.4.6-2.6 2.6.6z" ${F}/>${face(12, 11.4, .75)}`),
    wallet: svg(`<rect x="3" y="6" width="18" height="14.5" rx="3.2" ${F}/><path d="M6 6l9-3 1.6 3"/><path d="M21 11h-3.6a2.2 2.2 0 0 0 0 4.4H21" style="fill:var(--surface,#fff)"/>${eyes(7.6, 12, 12.4, .95)}${blush(6, 13.6, 14.2)}${smile(9.8, 14, 1)}`),
    mood: svg(`<circle cx="12" cy="12" r="9" ${F}/><path d="M7.8 10.2q1.3-1.6 2.6 0M13.6 10.2q1.3-1.6 2.6 0" stroke-width="1.6"/>${blush(7.4, 16.6, 13.4)}<path d="M8.8 14.2q3.2 3.6 6.4 0" fill="currentColor" stroke-width="1.4"/>`),
    swim: svg(`<path d="M3.5 11.5c2.4-4.2 8.6-5 12.4-1.4l3.6-2.6v8.6l-3.6-2.6c-3.8 3.6-10 2.8-12.4-2z" ${F}/><g class="ce"><circle cx="7.4" cy="11.4" r=".95" fill="currentColor" stroke="none"/><circle cx="7.05" cy="11" r=".38" fill="#fff" stroke="none"/></g><path d="M9.4 13.4q.9.7 1.8 0" stroke-width="1.2"/><path d="M2 20.4c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 2-1.4 4-1.4"/><circle cx="18.6" cy="4.2" r="1.1"/><circle cx="21" cy="2.6" r=".7"/>`),
    meal: svg(`<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" ${F}/><path d="M14 3.2 18.4 9M17 2.6l3.2 6.2" stroke-width="1.5"/><path d="M8 6.2q-1-1.4 0-2.6M11 6.2q-1-1.4 0-2.6" stroke-width="1.4"/>${face(12, 14.2, .8)}`),
    cake: svg(`<path d="M4 21v-8.4A2.6 2.6 0 0 1 6.6 10h10.8a2.6 2.6 0 0 1 2.6 2.6V21z" ${F}/><path d="M2.4 21h19.2M4.2 13.6c1.6 1.1 3.2 1.1 4.6 0s3-1.1 4.4 0 3.2 1.1 4.6 0"/><path d="M12 10V6.8"/><path d="M12 3.2c1 .9 1.1 1.9 0 2.6-1.1-.7-1-1.7 0-2.6z" fill="#FFB43A" stroke="#FF7A3A" stroke-width="1"/>${eyes(9.6, 14.4, 17, .9)}${smile(12, 18.4, .9)}`),
    bill: svg(`<path d="M6 2.6h12v18.8l-3-2-3 2-3-2-3 2z" ${F}/><path d="M9 6.4h6" stroke-width="1.5"/>${face(12, 11.6, .8)}`),
    mic: svg(`<rect x="8" y="2.6" width="8" height="12.4" rx="4" ${F}/><path d="M5 11.4a7 7 0 0 0 14 0M12 18.4v3M9 21.4h6"/>${eyes(10.4, 13.6, 8.2, .8)}${smile(12, 9.8, .8)}`),
    spark: svg(`<path d="M11 2.8l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" ${F}/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" stroke-width="1"/>${eyes(9.8, 12.2, 10, .6)}`),
    money: svg(`<rect x="2.4" y="6" width="19.2" height="13" rx="3" ${F}/><circle cx="12" cy="12.5" r="4.1" style="fill:var(--surface,#fff)"/>${eyes(10.5, 13.5, 11.8, .75)}${smile(12, 13.4, .8)}<circle cx="5.6" cy="9.4" r=".9" fill="currentColor" stroke="none"/><circle cx="18.4" cy="15.6" r=".9" fill="currentColor" stroke="none"/>`),
    sun: svg(`<path d="M12 1.8v2.4M12 19.8v2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7" class="cr"/><circle cx="12" cy="12" r="5.6" fill="#FFD23A"/>${face(12, 11.6, .75)}`),
    bell: svg(`<path d="M6 9.4a6 6 0 1 1 12 0c0 6.4 3 7.6 3 7.6H3s3-1.2 3-7.6" ${F}/><path d="M10 20.2a2 2 0 0 0 4 0"/><circle cx="12" cy="2.6" r="1" fill="currentColor"/>${face(12, 11.6, .8)}`)
  };
  I.calendar = I.cal;
  window.HHCUTE = I;

  // the bottom bar's own icons (they are written in index.html)
  const TABS = { home: "home", piano: "piano", happy: "happy", calendar: "cal", more: "more", lists: "lists" };
  function cuteTabs() {
    document.querySelectorAll("nav.tabs .tab[data-tab]").forEach(b => {
      if (b.id === "tabSlot") return;                                    // the weekly shortcut draws its own icon
      const k = TABS[b.dataset.tab], old = b.querySelector("svg"); if (!k || !old || old.classList.contains("cute")) return;
      old.insertAdjacentHTML("beforebegin", I[k]); old.remove();
    });
    const fab = document.getElementById("fab"), o = fab && fab.querySelector("svg"); if (o && !o.classList.contains("cute")) { o.insertAdjacentHTML("beforebegin", I.plus); o.remove(); }
    const sb = document.getElementById("btnSearch"), so = sb && sb.querySelector("svg"); if (so && !so.classList.contains("cute")) { so.insertAdjacentHTML("beforebegin", I.search); so.remove(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cuteTabs); else cuteTabs();

  /* ---------- 120+ moves ----------
     Each base move is a list of transforms (evenly spaced unless given an offset). Every base comes in a gentle, a big,
     a quick and a slow version (and some in a mirrored one), so there are well over 100 different moves. */
  const R = (d) => `rotate(${d}deg)`, T = (x, y) => `translate(${x}px,${y}px)`, Sc = (x, y) => `scale(${x},${y == null ? x : y})`;
  const BASE = {
    wiggle: a => [R(0), R(-12 * a), R(12 * a), R(-8 * a), R(8 * a), R(0)],
    bounce: a => [T(0, 0), T(0, -6 * a) + Sc(1.05, .95), T(0, 0) + Sc(1.12, .86), T(0, -2 * a), T(0, 0)],
    hop: a => [T(0, 0) + Sc(1.15, .82), T(0, -9 * a) + Sc(.9, 1.12), T(0, 0) + Sc(1.12, .88), T(0, 0)],
    doublehop: a => [T(0, 0), T(0, -7 * a), T(0, 0) + Sc(1.1, .9), T(0, -5 * a), T(0, 0) + Sc(1.08, .92), T(0, 0)],
    spin: a => [R(0), R(360 * Math.sign(a))],
    flip: a => [`perspective(80px) rotateY(0deg)`, `perspective(80px) rotateY(${180 * a}deg)`, `perspective(80px) rotateY(${360 * a}deg)`],
    tumble: a => [`perspective(80px) rotateX(0deg)`, `perspective(80px) rotateX(${360 * a}deg)`],
    jelly: a => [Sc(1, 1), Sc(1 + .25 * a, 1 - .25 * a), Sc(1 - .2 * a, 1 + .2 * a), Sc(1 + .12 * a, 1 - .12 * a), Sc(1 - .05 * a, 1 + .05 * a), Sc(1, 1)],
    heartbeat: a => [Sc(1), Sc(1 + .22 * a), Sc(1), Sc(1 + .16 * a), Sc(1)],
    tada: a => [Sc(1), Sc(.9) + R(-3 * a), Sc(1.12) + R(4 * a), Sc(1.12) + R(-4 * a), Sc(1.12) + R(4 * a), Sc(1.12) + R(-4 * a), Sc(1)],
    rubber: a => [Sc(1, 1), Sc(1 + .3 * a, 1 - .3 * a), Sc(1 - .25 * a, 1 + .25 * a), Sc(1 + .15 * a, 1 - .15 * a), Sc(1, 1)],
    shake: a => [T(0, 0), T(-3 * a, 0), T(3 * a, 0), T(-3 * a, 0), T(3 * a, 0), T(0, 0)],
    nod: a => [R(0) + T(0, 0), R(6 * a) + T(0, 2 * a), R(0), R(6 * a) + T(0, 2 * a), R(0)],
    sway: a => [R(0), R(-10 * a), R(10 * a), R(0)],
    float: a => [T(0, 0), T(0, -4 * a), T(0, 1 * a), T(0, -3 * a), T(0, 0)],
    peek: a => [T(0, 0), T(0, 5 * a) + Sc(1, .7), T(0, -6 * a) + Sc(1, 1.12), T(0, 0)],
    twist: a => [R(0) + Sc(1), R(20 * a) + Sc(.8, 1.1), R(-20 * a) + Sc(1.1, .9), R(0) + Sc(1)],
    moonwalk: a => [T(0, 0), T(4 * a, 0) + R(-6 * a), T(-4 * a, 0) + R(-6 * a), T(4 * a, 0) + R(-6 * a), T(0, 0)],
    chacha: a => [T(0, 0), T(-4 * a, 0) + R(-8 * a), T(0, -2 * a), T(4 * a, 0) + R(8 * a), T(0, -2 * a), T(-4 * a, 0) + R(-8 * a), T(0, 0)],
    twirl: a => [R(0) + Sc(1), R(180 * a) + Sc(1.2), R(360 * a) + Sc(1)],
    shimmy: a => [T(0, 0), T(-2 * a, 0) + R(-4 * a), T(2 * a, 0) + R(4 * a), T(-2 * a, 0) + R(-4 * a), T(2 * a, 0) + R(4 * a), T(-2 * a, 0) + R(-4 * a), T(2 * a, 0) + R(4 * a), T(0, 0)],
    disco: a => [R(0) + Sc(1), R(-15 * a) + Sc(1.12), R(15 * a) + Sc(.95), R(-15 * a) + Sc(1.12), R(15 * a) + Sc(.95), R(0) + Sc(1)],
    robot: a => [R(0), R(-10 * a), R(-10 * a), R(10 * a), R(10 * a), R(0)],
    wave: a => [R(0), R(14 * a), R(-6 * a), R(14 * a), R(-6 * a), R(0)],
    squish: a => [Sc(1, 1), Sc(1 + .2 * a, 1 - .3 * a), Sc(1, 1)],
    stretch: a => [Sc(1, 1), Sc(1 - .15 * a, 1 + .25 * a), Sc(1, 1)],
    pop: a => [Sc(1), Sc(.82), Sc(1 + .3 * a), Sc(1)],
    headbang: a => [R(0), R(12 * a), R(0), R(12 * a), R(0), R(12 * a), R(0)],
    hula: a => [T(0, 0), T(3 * a, -2 * a), T(0, -4 * a), T(-3 * a, -2 * a), T(0, 0), T(3 * a, -2 * a), T(0, -4 * a), T(-3 * a, -2 * a), T(0, 0)],
    zigzag: a => [T(0, 0), T(-3 * a, -3 * a), T(3 * a, -5 * a), T(-3 * a, -3 * a), T(0, 0)],
    tiptoe: a => [T(0, 0), T(0, -2 * a), T(0, 0), T(0, -2 * a), T(0, 0), T(0, -2 * a), T(0, 0)],
    lean: a => [R(0), R(-12 * a), R(-12 * a), R(12 * a), R(12 * a), R(0)],
    boogie: a => [`skewX(0deg)`, `skewX(${-12 * a}deg)`, `skewX(${12 * a}deg)`, `skewX(${-12 * a}deg)`, `skewX(${12 * a}deg)`, `skewX(0deg)`],
    macarena: a => [R(0) + T(0, 0), R(-8 * a) + T(-2 * a, 0), R(8 * a) + T(2 * a, 0), T(0, -4 * a) + Sc(1.1), R(-8 * a) + T(-2 * a, 0), R(8 * a) + T(2 * a, 0), R(360 * a) + Sc(1), R(360 * a)],
    breakdance: a => [`perspective(80px) rotateY(0deg) rotate(0deg)`, `perspective(80px) rotateY(${180 * a}deg) rotate(${90 * a}deg)`, `perspective(80px) rotateY(${360 * a}deg) rotate(${360 * a}deg)`],
    yoyo: a => [T(0, 0), T(0, 7 * a) + Sc(.9, 1.1), T(0, -8 * a) + Sc(1.1, .9), T(0, 0)],
    sneeze: a => [Sc(1), Sc(1.1, .85), Sc(1.12, .82), T(0, 0) + Sc(.85, 1.2) + R(-10 * a), Sc(1)],
    pendulum: a => [R(0), R(18 * a), R(-14 * a), R(10 * a), R(-6 * a), R(2 * a), R(0)],
    shiver: a => [T(0, 0), T(-1 * a, 0), T(1 * a, 0), T(-1 * a, 0), T(1 * a, 0), T(-1 * a, 0), T(1 * a, 0), T(-1 * a, 0), T(1 * a, 0), T(0, 0)],
    swoosh: a => [T(0, 0), T(-6 * a, 0) + R(-10 * a), T(6 * a, 0) + R(10 * a), T(0, 0)],
    salsa: a => [T(0, 0), T(-3 * a, 0) + R(-6 * a), T(-3 * a, -2 * a), T(0, 0), T(3 * a, 0) + R(6 * a), T(3 * a, -2 * a), T(0, 0)],
    sprinkler: a => [R(0), R(-15 * a), R(-15 * a), R(-5 * a), R(5 * a), R(15 * a), R(15 * a), R(0)],
    floss: a => [T(0, 0) + R(0), T(-3 * a, 0) + R(6 * a), T(3 * a, 0) + R(-6 * a), T(-3 * a, 0) + R(6 * a), T(3 * a, 0) + R(-6 * a), T(0, 0) + R(0)],
    jump360: a => [T(0, 0) + R(0), T(0, -8 * a) + R(180 * Math.sign(a)), T(0, 0) + R(360 * Math.sign(a))],
    bow: a => [R(0) + T(0, 0), R(0) + T(0, 3 * a) + Sc(1, .85), R(0) + T(0, 0)],
    clap: a => [Sc(1, 1), Sc(.86, 1), Sc(1, 1), Sc(.86, 1), Sc(1, 1)]
  };
  const KINDS = [["", 1, 1], ["big", 1.6, 1.15], ["quick", .8, .6], ["slow", .9, 1.8], ["mirror", -1, 1]];
  const MOVES = [];
  Object.keys(BASE).forEach(k => KINDS.forEach(([v, a, sp]) => { if (v === "mirror" && /^(heartbeat|pop|jelly|rubber|squish|stretch|float|bounce|hop|doublehop|tiptoe|yoyo|bow|clap|peek|shiver)$/.test(k)) return; MOVES.push({ name: k + (v ? "-" + v : ""), k, a, sp }); }));
  window.HHMOVES = MOVES;                                                // for the tests: how many moves there are

  const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  const last = new WeakMap();
  function play(el, opt) {
    if (!el || !el.animate) return null;
    const pick = () => MOVES[Math.floor(Math.random() * MOVES.length)];
    let m = pick(); const was = last.get(el); let n = 0; while (was && (m.k === was) && n++ < 6) m = pick();
    last.set(el, m.k);
    const frames = BASE[m.k](m.a).map(t => ({ transform: t }));
    const dur = Math.round((500 + frames.length * 110) * m.sp);
    try { return el.animate(frames, Object.assign({ duration: dur, easing: "ease-in-out" }, opt || {})); } catch (_) { return null; }
  }
  function blink(svgEl) {
    const e = svgEl && svgEl.querySelectorAll && svgEl.querySelectorAll(".ce"); if (!e || !e.length) return;
    e.forEach(g => { try { g.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.1)" }, { transform: "scaleY(1)" }], { duration: 220, easing: "ease-in-out" }); } catch (_) { } });
  }
  window.HHDance = { play, blink, moves: MOVES };

  // what can dance: icons inside buttons and tiles, the page logo, and the Happy page's pictures
  const SEL = "nav.tabs .tab>svg, nav.tabs .tab>.tabchar, #fab>svg, .tile>svg, .tile>.tilechar, header.top .iconbtn>svg, .hp-card .hp-art>svg, .hp-person .dot, .auth .logo, .back>svg";
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const busy = () => document.hidden || calm() || (document.documentElement.classList.contains("pn-focus")) || (location.hash === "#piano" && window.HHPiano && HHPiano._debug && (() => { try { return HHPiano._debug().run; } catch (_) { return false; } })());
  let tick = 0;
  function step() {
    clearTimeout(tick);
    tick = setTimeout(step, 450 + Math.random() * 900);
    if (busy()) return;
    const all = [...document.querySelectorAll(SEL)].filter(visible);
    if (!all.length) return;
    const n = Math.random() < .25 ? 2 : 1;                                 // now and then two at once
    for (let i = 0; i < n; i++) {
      const el = all[Math.floor(Math.random() * all.length)];
      if (el.getAnimations && el.getAnimations().some(a => a.playState === "running" && a.id === "hhd")) continue;
      const a = play(el); if (a) a.id = "hhd";
      if (Math.random() < .5) blink(el);
    }
    // the page logo (the picture in the top left) dances too
    if (Math.random() < .18) { const h = document.querySelector("header.top"); if (h && h.animate && visible(h)) { const m = MOVES[Math.floor(Math.random() * MOVES.length)]; try { h.animate(BASE[m.k](m.a * .8).map(t => ({ transform: t + " rotate(-6deg)" })), { duration: Math.round(900 * m.sp), easing: "ease-in-out", pseudoElement: "::before" }); } catch (_) { } } }
  }
  // eyes blink by themselves now and then, everywhere
  setInterval(() => { if (busy()) return; const s = [...document.querySelectorAll("svg.cute")].filter(visible); for (let i = 0; i < Math.min(3, s.length); i++) blink(s[Math.floor(Math.random() * s.length)]); }, 2300);
  step();
})();
