/* Happy page: the things that make each person in the family happy, as rows of big picture cards that swipe sideways
   (Likes, Wish list, Goals, Happy moments). Doing one gives its points to whoever did it, with a celebration and the
   card's own cartoon. Points add up to levels, and a streak counts the days in a row with a happy moment.
   Ideas borrowed from open-source habit and reward trackers (points per activity, levels, streaks, a history to look back on).
   Data: "happy" holds the cards {to, row, title, pts, art, note, done, doneAt, doneBy, times, lastAt};
         "cheers" holds every happy moment {to, item, title, row, art, pts, at, by}. Nothing is ever deleted without a tap
         twice and an Undo. Runs inside the app: uses its helpers (S, ST, people, pname, esc, openSheet, toast, render...). */
(function () {
  "use strict";
  const K = window.HHK; if (!K) return;
  const { S, ST, people, peopleRaw, pname, esc, dot, openSheet, closeSheet, sheetHead, toast, render, viewId, meId, iso, addDays, TODAY, ago, nice, party } = K;
  const svgw = s => `<svg viewBox="0 0 100 100" aria-hidden="true">${s}</svg>`;
  // every picture: [name, two background colours, drawing]. Classes inside move only while the picture is "live".
  const ARTS = {
    heart: ["Heart", ["#FF8FB8", "#FF5E8E"], `<g class="hb"><path d="M50 82C26 66 16 52 16 38c0-10 8-18 18-18 7 0 12 4 16 9 4-5 9-9 16-9 10 0 18 8 18 18 0 14-10 28-34 44z" fill="#fff"/><path d="M50 74C32 62 24 51 24 40c0-6 5-11 11-11 6 0 10 4 15 10 5-6 9-10 15-10 6 0 11 5 11 11 0 11-8 22-26 34z" fill="#FF3D7A"/></g><circle class="tw" cx="80" cy="20" r="4" fill="#fff"/><circle class="tw d2" cx="20" cy="78" r="3" fill="#fff"/>`],
    flower: ["Flowers", ["#B6F2C9", "#3DD68C"], `<rect x="48" y="52" width="4" height="36" rx="2" fill="#13804A"/><path d="M50 74c-10-2-16-8-18-16 9 0 16 5 18 16zM50 70c8-1 14-7 16-14-8 0-14 5-16 14z" fill="#13804A"/><g class="spin" style="transform-origin:50px 40px">${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="50" cy="24" rx="9" ry="14" fill="#FF7EB8" transform="rotate(${a} 50 40)"/>`).join("")}</g><circle cx="50" cy="40" r="9" fill="#FFCB2E"/>`],
    gift: ["Present", ["#CDB6FF", "#A47BFF"], `<rect x="20" y="46" width="60" height="38" rx="5" fill="#FF7EB8"/><rect x="45" y="46" width="10" height="38" fill="#FFCB2E"/><g class="lid"><rect x="16" y="34" width="68" height="14" rx="4" fill="#FF5E9E"/><rect x="45" y="34" width="10" height="14" fill="#FFCB2E"/><path d="M50 34c-12-14-26-8-18 0zM50 34c12-14 26-8 18 0z" fill="#FFCB2E"/></g><circle class="tw" cx="82" cy="22" r="3.5" fill="#fff"/><circle class="tw d2" cx="18" cy="24" r="2.5" fill="#fff"/>`],
    cake: ["Cake", ["#FFE7A3", "#FFCB2E"], `<rect x="22" y="58" width="56" height="26" rx="6" fill="#FF9EC6"/><rect x="28" y="44" width="44" height="18" rx="6" fill="#fff"/><path d="M22 66q7 6 14 0t14 0 14 0 14 0" stroke="#fff" stroke-width="4" fill="none"/><rect x="47" y="28" width="6" height="16" rx="2" fill="#56A8FF"/><path class="flk" d="M50 14c5 6 5 11 0 14-5-3-5-8 0-14z" fill="#FF7A1A" style="transform-origin:50px 28px"/>`],
    coffee: ["Coffee", ["#FFD7B0", "#FF9A2E"], `<g class="steam"><path d="M38 30c-4-5 4-8 0-14M50 30c-4-5 4-8 0-14M62 30c-4-5 4-8 0-14" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/></g><path d="M24 38h52v20c0 14-11 24-26 24S24 72 24 58z" fill="#fff"/><path d="M76 44h4a9 9 0 0 1 0 18h-5" stroke="#fff" stroke-width="5" fill="none"/><path d="M30 44h40v12c0 10-8 18-20 18S30 66 30 56z" fill="#8A4B22"/>`],
    book: ["Book", ["#BFE0FF", "#56A8FF"], `<path d="M50 30C40 24 28 24 16 28v48c12-4 24-4 34 2z" fill="#fff"/><path d="M50 30c10-6 22-6 34-2v48c-12-4-24-4-34 2z" fill="#E8F2FF"/><g class="flip" style="transform-origin:50px 50px"><path d="M50 30c8-5 18-5 26-3v44c-8-2-18-2-26 3z" fill="#fff" stroke="#BFD4F2"/></g><path d="M24 38h18M24 46h18M24 54h14" stroke="#9BB7E0" stroke-width="3" stroke-linecap="round"/>`],
    music: ["Music", ["#FFC0DC", "#C78BFF"], `<g class="float"><path d="M36 70V30l34-8v40" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/><ellipse cx="30" cy="70" rx="9" ry="7" fill="#fff"/><ellipse cx="64" cy="62" rx="9" ry="7" fill="#fff"/></g><circle class="tw" cx="82" cy="78" r="3" fill="#fff"/><circle class="tw d2" cx="16" cy="24" r="3" fill="#fff"/>`],
    plane: ["Trip", ["#BDEBFF", "#2CCFD6"], `<path d="M12 72c6-6 16-6 20 0 4-4 12-4 14 2H8c0-1 2-2 4-2z" fill="#fff"/><path d="M60 30c5-4 11-3 13 0 3-2 8-2 9 2H55c0-1 2-2 5-2z" fill="#fff"/><g class="fly"><path d="M22 52l52-14c6-1 8 4 3 7L28 62z" fill="#fff"/><path d="M46 46l-6-14 8-2 12 13zM44 56l2 14 7-2 2-14z" fill="#FF7272"/><path d="M26 54l-8-8 5-2 8 6z" fill="#FF7272"/></g>`],
    hug: ["Hug", ["#FFD0B0", "#FF8FA3"], `<g class="hugl"><circle cx="36" cy="46" r="20" fill="#FFCB2E"/><circle cx="30" cy="42" r="2.6" fill="#1E1A3C"/><circle cx="42" cy="42" r="2.6" fill="#1E1A3C"/><path d="M30 50q6 5 12 0" stroke="#1E1A3C" stroke-width="2.5" fill="none" stroke-linecap="round"/></g><g class="hugr"><circle cx="64" cy="50" r="18" fill="#7DBBFF"/><circle cx="58" cy="46" r="2.4" fill="#1E1A3C"/><circle cx="69" cy="46" r="2.4" fill="#1E1A3C"/><path d="M58 54q5 4 11 0" stroke="#1E1A3C" stroke-width="2.5" fill="none" stroke-linecap="round"/></g><path class="hb" d="M50 30c-5-6-13-2-9 4l9 8 9-8c4-6-4-10-9-4z" fill="#FF3D7A" style="transform-origin:50px 34px"/>`],
    food: ["Dinner", ["#FFE2B8", "#FF9A2E"], `<g class="steam"><path d="M40 28c-4-5 4-8 0-13M52 28c-4-5 4-8 0-13M64 28c-4-5 4-8 0-13" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/></g><ellipse cx="52" cy="62" rx="36" ry="16" fill="#fff"/><ellipse cx="52" cy="58" rx="26" ry="10" fill="#FFB648"/><circle cx="44" cy="56" r="4" fill="#3DD68C"/><circle cx="58" cy="57" r="4" fill="#FF7272"/><path d="M14 40v20M10 40v10q4 4 8 0V40" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`],
    moon: ["Rest", ["#7C7FE0", "#3A2D8F"], `<path class="bob" d="M58 20a30 30 0 1 0 22 46A26 26 0 0 1 58 20z" fill="#FFE27A"/><g class="zz"><text x="66" y="34" font-size="14" font-weight="800" fill="#fff" font-family="sans-serif">z</text><text x="76" y="22" font-size="10" font-weight="800" fill="#fff" font-family="sans-serif">z</text></g><circle class="tw" cx="22" cy="24" r="2.5" fill="#fff"/><circle class="tw d2" cx="30" cy="80" r="2" fill="#fff"/>`],
    sun: ["Sunshine", ["#FFF1A8", "#FFB648"], `<g class="spin" style="transform-origin:50px 50px">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="47" y="10" width="6" height="16" rx="3" fill="#fff" transform="rotate(${a} 50 50)"/>`).join("")}</g><circle cx="50" cy="50" r="20" fill="#FFE14D" stroke="#fff" stroke-width="3"/><circle cx="43" cy="47" r="2.4" fill="#8F5A00"/><circle cx="57" cy="47" r="2.4" fill="#8F5A00"/><path d="M43 55q7 6 14 0" stroke="#8F5A00" stroke-width="2.5" fill="none" stroke-linecap="round"/>`],
    shoe: ["Walk", ["#B8F3F0", "#2CCFD6"], `<g class="bounce"><path d="M16 60c10 0 18-4 24-14l10 4c4 8 14 10 26 12 6 1 8 6 8 10H16z" fill="#fff"/><path d="M16 72h68v6H16z" fill="#FF7272"/><path d="M44 52l4-6M50 55l4-6M56 57l3-6" stroke="#2CCFD6" stroke-width="3" stroke-linecap="round"/></g><path class="dash" d="M10 40h14M14 30h10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`],
    trophy: ["Trophy", ["#FFE7A3", "#FFB000"], `<path d="M32 20h36v16c0 12-8 20-18 20s-18-8-18-20z" fill="#fff"/><path d="M32 26H20c0 12 6 16 14 16M68 26h12c0 12-6 16-14 16" stroke="#fff" stroke-width="5" fill="none"/><rect x="45" y="56" width="10" height="12" fill="#fff"/><rect x="32" y="68" width="36" height="10" rx="3" fill="#fff"/><path class="shine" d="M40 24l6 0-10 26-4 0z" fill="#FFE27A" opacity=".9"/><circle class="tw" cx="80" cy="16" r="3.5" fill="#fff"/>`],
    star: ["Star", ["#D9C8FF", "#8A63FF"], `<path class="spin2" style="transform-origin:50px 52px" d="M50 16l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3z" fill="#FFE14D" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle class="tw" cx="18" cy="20" r="3" fill="#fff"/><circle class="tw d2" cx="84" cy="84" r="3" fill="#fff"/>`],
    balloon: ["Party", ["#FFC2C2", "#FF7272"], `<g class="floaty"><path d="M50 62c-14 0-22-12-22-24a22 22 0 0 1 44 0c0 12-8 24-22 24z" fill="#fff"/><path d="M47 62h6l-3 5z" fill="#fff"/><path d="M50 67c-4 8 4 12 0 22" stroke="#fff" stroke-width="2" fill="none"/><path d="M40 28a12 12 0 0 1 8-8" stroke="#FFC2C2" stroke-width="4" stroke-linecap="round" fill="none"/></g><circle class="tw" cx="18" cy="60" r="3" fill="#FFE14D"/><circle class="tw d2" cx="82" cy="30" r="3" fill="#56A8FF"/>`],
    plant: ["Garden", ["#D4F7B8", "#5BC94A"], `<path d="M30 66h40l-6 20H36z" fill="#FF9A5A"/><rect x="27" y="62" width="46" height="8" rx="3" fill="#FFB27A"/><g class="grow" style="transform-origin:50px 64px"><path d="M50 64V36" stroke="#13804A" stroke-width="4"/><path d="M50 48c-14 0-20-8-20-18 12 0 20 6 20 18zM50 42c12 0 18-8 18-18-12 0-18 6-18 18z" fill="#13804A"/></g>`],
    spa: ["Relax", ["#C9F5EE", "#45C7B6"], `<g class="bubble"><circle cx="30" cy="34" r="6" fill="#fff" opacity=".9"/><circle cx="46" cy="24" r="4" fill="#fff" opacity=".9"/><circle cx="66" cy="30" r="7" fill="#fff" opacity=".9"/></g><path d="M14 56h72c0 16-14 26-36 26S14 72 14 56z" fill="#fff"/><path d="M20 56c4-6 12-6 16 0 4-6 12-6 16 0 4-6 12-6 16 0 4-6 10-6 14 0" fill="#E8FFFB"/>`],
    camera: ["Photo", ["#CFE3FF", "#5C8DFF"], `<rect x="16" y="32" width="68" height="46" rx="10" fill="#fff"/><rect x="36" y="24" width="22" height="12" rx="4" fill="#fff"/><circle cx="50" cy="55" r="15" fill="#5C8DFF"/><circle cx="50" cy="55" r="8" fill="#1E1A3C"/><circle cx="46" cy="51" r="3" fill="#fff"/><circle class="flash" cx="74" cy="40" r="5" fill="#FFE14D"/>`],
    film: ["Movie", ["#FFD1D1", "#E5484D"], `<g class="pop"><circle cx="36" cy="30" r="7" fill="#FFF6D6"/><circle cx="50" cy="24" r="8" fill="#FFF6D6"/><circle cx="64" cy="30" r="7" fill="#FFF6D6"/></g><path d="M28 36h44l-6 48H34z" fill="#fff"/><path d="M36 36l3 48M50 36v48M64 36l-3 48" stroke="#E5484D" stroke-width="5"/>`],
    icecream: ["Treat", ["#FFD6EA", "#FF8FC4"], `<path d="M36 52l14 34 14-34z" fill="#FFCB7A"/><path d="M40 56l14 10M38 64l18-4" stroke="#E0A24E" stroke-width="2"/><g class="wobble" style="transform-origin:50px 52px"><circle cx="40" cy="44" r="12" fill="#fff"/><circle cx="60" cy="44" r="12" fill="#FFE14D"/><circle cx="50" cy="32" r="13" fill="#FF7EB8"/><circle cx="50" cy="18" r="4" fill="#FF3D5A"/></g>`],
    angry: ["Angry face", ["#FF5A5A", "#D10F1F"], `<g class="puff"><path d="M24 26c-4-4 0-10 5-8 1-5 9-5 9 1M62 19c0-6 8-6 9-1 5-2 9 4 5 8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g><g class="shake" style="transform-origin:50px 58px"><circle cx="50" cy="58" r="30" fill="#E0101E" stroke="#8E0610" stroke-width="3"/><path d="M30 46l14 6M70 46l-14 6" stroke="#4A0006" stroke-width="5" stroke-linecap="round"/><circle cx="39" cy="57" r="4" fill="#4A0006"/><circle cx="61" cy="57" r="4" fill="#4A0006"/><path d="M38 76q12-10 24 0" stroke="#4A0006" stroke-width="5" fill="none" stroke-linecap="round"/></g>`],
    grr: ["Grumpy", ["#FF7A7A", "#B80C18"], `<g class="shake" style="transform-origin:50px 52px"><circle cx="50" cy="52" r="32" fill="#F0141F" stroke="#8E0610" stroke-width="3"/><path d="M28 38l16 8M72 38l-16 8" stroke="#4A0006" stroke-width="5" stroke-linecap="round"/><path d="M34 50h10M56 50h10" stroke="#4A0006" stroke-width="5" stroke-linecap="round"/><rect x="34" y="62" width="32" height="12" rx="3" fill="#fff" stroke="#4A0006" stroke-width="3"/><path d="M42 62v12M50 62v12M58 62v12" stroke="#4A0006" stroke-width="2"/></g><path class="tw" d="M82 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFE14D"/>`],
    storm: ["Storm", ["#FF8E8E", "#A80A14"], `<g class="shake" style="transform-origin:50px 40px"><path d="M26 58c-10 0-14-14-4-18 0-12 16-16 22-8 6-12 26-8 26 6 12 0 14 20 0 20z" fill="#D10F1F" stroke="#7A0510" stroke-width="3"/><path d="M38 40l8 4M62 40l-8 4" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M42 52q8-6 16 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g><path class="flash" d="M50 60l-8 16h8l-4 14 14-20h-8l4-10z" fill="#FFE14D"/>`],
    fence: ["Boundary", ["#D8F5C8", "#62C46A"], `<path d="M10 80h80" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${[18, 38, 58, 78].map(x => `<path d="M${x - 7} 84V44l7-9 7 9v40z" fill="#fff" stroke="#3E9A47" stroke-width="2"/>`).join("")}<path d="M8 54h84M8 70h84" stroke="#3E9A47" stroke-width="4"/><path class="hb" d="M50 30c-5-6-13-2-9 4l9 8 9-8c4-6-4-10-9-4z" fill="#FF3D7A" style="transform-origin:50px 34px"/>`],
    door: ["Knock first", ["#FFE0B8", "#E8913A"], `<rect x="28" y="16" width="44" height="72" rx="4" fill="#fff"/><rect x="33" y="21" width="34" height="62" rx="3" fill="#C9702A"/><circle cx="60" cy="54" r="3.5" fill="#FFE14D"/><rect x="38" y="30" width="24" height="12" rx="3" fill="#fff"/><path d="M42 36h16" stroke="#C9702A" stroke-width="3" stroke-linecap="round"/><g class="knock"><path d="M80 44q6 6 0 12M86 40q9 10 0 20" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>`],
    sparkle: ["Clean", ["#D1F6FF", "#56C6FF"], `<path class="tw" d="M50 16l6 22 22 6-22 6-6 22-6-22-22-6 22-6z" fill="#fff"/><path class="tw d2" d="M78 64l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fff"/><path class="tw d3" d="M24 66l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="#fff"/>`],
  };
  const ART_KEYS = Object.keys(ARTS);
  const GUESS = [[/flower|rose|tulip|bouquet/i, "flower"], [/coffee|tea|latte|cuppa/i, "coffee"], [/cake|birthday|bake|cookie|muffin/i, "cake"], [/gift|present|surprise|buy her|buy him|jewel|ring|necklace/i, "gift"], [/book|read|story|study|learn|chinese|school|homework/i, "book"], [/music|song|piano|sing|cello|concert|dance/i, "music"], [/trip|travel|holiday|plane|fly|japan|weekend away|beach/i, "plane"], [/hug|cuddle|kiss|love you|hold hands/i, "hug"], [/dinner|cook|food|breakfast|lunch|meal|pizza|sushi|restaurant/i, "food"], [/sleep|nap|rest|lie in|sleep in|bed/i, "moon"], [/walk|run|steps|exercise|swim|gym|bike|park/i, "shoe"], [/win|trophy|goal|finish|pass|prize|medal/i, "trophy"], [/party|balloon|celebrat|friends/i, "balloon"], [/plant|garden|grow|tree/i, "plant"], [/spa|massage|bath|relax|nails|facial|foot rub/i, "spa"], [/photo|picture|selfie|album/i, "camera"], [/movie|film|cinema|tv|netflix|show/i, "film"], [/ice ?cream|dessert|chocolate|treat|sweet/i, "icecream"], [/clean|tidy|dishes|laundry|wash|vacuum|chores/i, "sparkle"], [/sun|outside|picnic|morning/i, "sun"], [/heart|love|smile|kind/i, "heart"]];
  const guessArt = (t, row) => { if (row === "bound") return /knock|door|room|privacy/i.test(t || "") ? "door" : /quiet|sleep|rest|night|nap/i.test(t || "") ? "moon" : "fence"; if (row === "never") return /forget|late|lie|break|storm/i.test(t || "") ? "storm" : /shout|yell|angry|rude/i.test(t || "") ? "angry" : "grr"; for (const [re, k] of GUESS) if (re.test(t || "")) return k; return "star"; };
  const artOf = k => ARTS[k] ? k : "star";
  /* "Make happiness more cute and good" (27 Nov 2026): most pictures get a little face (x, y, size in the picture) */
  const FACEAT = { heart: [50, 50, 1.1], flower: [50, 37, .7], gift: [50, 68, .95], cake: [50, 73, .85], coffee: [46, 60, .95], food: [50, 66, .95], moon: [44, 50, .8], sun: [50, 50, .95], shoe: [62, 64, .6], trophy: [50, 36, .85], star: [50, 55, .85], balloon: [50, 38, .95], plant: [50, 77, .7], film: [50, 64, .8], icecream: [50, 38, .8], door: [50, 42, .7], sparkle: [50, 45, .6], book: [67, 52, .55], camera: [50, 70, .55] };
  const kawaii = k => { const f = FACEAT[k]; if (!f) return ""; const [x, y, z] = f, e = 3.3 * z;
    return `<g class="hp-face"><g class="ce"><ellipse cx="${x - 7 * z}" cy="${y}" rx="${e}" ry="${e * 1.18}" fill="#1E1A3C"/><ellipse cx="${x + 7 * z}" cy="${y}" rx="${e}" ry="${e * 1.18}" fill="#1E1A3C"/><circle cx="${x - 8 * z}" cy="${y - 1.5 * z}" r="${1.3 * z}" fill="#fff"/><circle cx="${x + 6 * z}" cy="${y - 1.5 * z}" r="${1.3 * z}" fill="#fff"/></g><ellipse cx="${x - 12.5 * z}" cy="${y + 5 * z}" rx="${3.6 * z}" ry="${2.2 * z}" fill="#FF6FA5" opacity=".7"/><ellipse cx="${x + 12.5 * z}" cy="${y + 5 * z}" rx="${3.6 * z}" ry="${2.2 * z}" fill="#FF6FA5" opacity=".7"/><path d="M${x - 3.4 * z} ${y + 4.6 * z}q${3.4 * z} ${3.6 * z} ${6.8 * z} 0" stroke="#1E1A3C" stroke-width="${2.2 * z}" fill="none" stroke-linecap="round"/></g>`; };
  const artHtml = (k, cls) => { k = artOf(k); const a = ARTS[k]; return `<span class="hp-art a-${k} ${cls || ""}" style="--g1:${a[1][0]};--g2:${a[1][1]}">${svgw(a[2] + kawaii(k))}</span>`; };

  const ROWS = {
    like: { name: "Likes", head: n => "Things " + n + " loves", verb: "Did it!", sub: "Each time it's done, points again", pts: 15 },
    wish: { name: "Wish list", head: n => n + "'s wish list", verb: "Wish came true!", sub: "Once it comes true it gets a tick", pts: 50 },
    goal: { name: "Goals", head: n => n + "'s goals", verb: "Goal reached!", sub: "Cheer each goal reached", pts: 40 },
    bound: { name: "Boundaries", head: n => n + "'s boundaries", verb: "Respected it", sub: "Respecting one earns points, crossing one takes them off", pts: 10 },
    never: { name: "Never do", head: n => "Never do · makes " + n + " upset", verb: "Oops, it happened", sub: "Doing one takes points off", pts: 20, minus: true },
  };
  const IDEAS = {
    like: [["Flowers", 15, "flower"], ["Breakfast in bed", 30, "food"], ["A cup of coffee made for", 10, "coffee"], ["A long hug", 5, "hug"], ["Foot rub", 20, "spa"], ["Movie night", 20, "film"], ["A sleep-in", 25, "moon"], ["Dishes done without asking", 15, "sparkle"]],
    wish: [["Weekend away", 100, "plane"], ["Spa day", 80, "spa"], ["A new book", 30, "book"], ["Dinner at a favourite place", 60, "food"], ["A surprise present", 50, "gift"]],
    goal: [["Walk every day this week", 40, "shoe"], ["Read a whole book", 50, "book"], ["Learn a new song", 50, "music"], ["Grow some herbs", 30, "plant"]],
    bound: [["Knock before coming in", 10, "door"], ["Quiet time after 9 pm", 10, "moon"], ["Ask before borrowing things", 10, "fence"], ["Ten minutes to rest after work", 10, "spa"], ["No phones at the dinner table", 10, "fence"]],
    never: [["Forget a special day", 50, "storm"], ["Shout", 30, "angry"], ["Be late without calling", 20, "grr"], ["Phone out at dinner", 10, "grr"], ["Leave dishes in the sink", 10, "angry"]],
  };
  const LEVELS = [[0, "Seedling"], [50, "Sprout"], [120, "Bud"], [220, "Bloom"], [350, "Sunshine"], [520, "Rainbow"], [750, "Shooting star"], [1000, "Moonbeam"], [1300, "Starlight"], [1700, "Comet"], [2200, "Galaxy"], [2800, "Supernova"], [3500, "Legend"], [4300, "Super legend"], [5200, "Happiness hero"]];
  function level(p) {
    let i = 0; while (i + 1 < LEVELS.length && p >= LEVELS[i + 1][0]) i++;
    if (i === LEVELS.length - 1) { const extra = Math.floor((p - LEVELS[i][0]) / 1000); const base = LEVELS[i][0] + extra * 1000; return { n: i + 1 + extra, name: LEVELS[i][1] + (extra ? " " + (extra + 1) : ""), from: base, to: base + 1000 }; }
    return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: LEVELS[i + 1][0] };
  }

  let forId = null;      // whose page is open (null: the default, Mum)
  let delArm = "";       // a delete waiting for its second tap
  const H = () => (S().happy || []), C = () => (S().cheers || []);
  const mumId = () => { const ps = peopleRaw(); const m = ps.find(p => /^(mum|mom|mummy|mommy|mama|mother)$/i.test((p.name || "").trim())); return (m || ps[1] || ps[0] || { id: meId() }).id; };
  const pageFor = () => { const ps = peopleRaw(); if (forId != null && ps.some(p => p.id === forId)) return forId; return mumId(); };
  const order = () => { const m = mumId(); return [m, ...people().map(p => p.id).filter(id => id !== m)]; };
  const dayOf = ts => iso(new Date(ts));
  const pointsBy = by => Math.max(0, C().filter(c => +c.by === +by).reduce((a, c) => a + (+c.pts || 0), 0));
  const pointsTo = to => C().filter(c => +c.to === +to).reduce((a, c) => a + (+c.pts || 0), 0);
  function streak(by) {
    const days = new Set(C().filter(c => +c.by === +by && (+c.pts || 0) > 0).map(c => dayOf(c.at)));
    let d = TODAY(); if (!days.has(d)) d = addDays(d, -1);
    let n = 0; while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  const sortItems = list => [...list].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (+(b.lastAt || b.createdAt) || 0) - (+(a.lastAt || a.createdAt) || 0));
  const ptsTxt = p => ((+p || 0) < 0 ? "−" + Math.abs(+p) : (+p || 0)) + " point" + (Math.abs(+p || 0) === 1 ? "" : "s");
  const badge = (p, never) => never ? `<span class="hp-pts neg">−${Math.abs(+p || 0)}</span>` : `<span class="hp-pts">+${+p || 0}</span>`;

  function card(it) {
    const rep = it.row === "like" || it.row === "never" || it.row === "bound", done = it.done && !rep;
    const tag = done ? (it.row === "wish" ? "Came true" : "Reached") : it.row === "bound" ? (it.times || it.crossed ? "✓" + (+it.times || 0) + " ✗" + (+it.crossed || 0) : "Respect it") : rep && it.times ? (it.row === "never" ? "Happened " : "Done ") + it.times + "×" : it.row === "never" ? "Never!" : "";
    return `<button class="hp-card${done ? " done" : ""}${it.row === "never" ? " never" : ""}" data-act="hpOpen" data-id="${esc(it.id)}">${artHtml(it.art)}${done ? `<span class="hp-tick" aria-hidden="true">✓</span>` : ""}<b>${esc(it.title)}</b><span class="hp-meta">${it.row === "bound" ? `<span class="hp-pts both">±${Math.abs(+it.pts || 0)}</span>` : badge(it.pts, it.row === "never")}${tag ? `<span>${esc(tag)}</span>` : ""}</span></button>`;
  }
  function momentCard(c) {
    return `<button class="hp-card moment" data-act="hpMoment" data-id="${esc(c.id)}">${artHtml(c.art)}<b>${esc(c.title)}</b><span class="hp-meta"><span class="hp-pts">+${+c.pts || 0}</span><span>${esc(pname(c.by))} · ${esc(ago(+c.at || 0))}</span></span></button>`;
  }
  function row(to, key) {
    const r = ROWS[key], n = pname(to), list = sortItems(H().filter(x => +x.to === +to && x.row === key));
    const have = new Set(list.map(x => (x.title || "").toLowerCase()));
    const ideas = list.length < 4 ? IDEAS[key].filter(([t]) => !have.has(ideaTitle(t, to).toLowerCase())).slice(0, 4 - Math.min(list.length, 3)) : [];
    return `<section class="hp-sec"><div class="hp-h"><h2>${esc(r.head(n))}</h2><span class="sub">${list.length ? list.length + " card" + (list.length === 1 ? "" : "s") : r.sub}</span></div>
     <div class="hp-row" data-keepx="${key}-${to}"><button class="hp-card add" data-act="hpAdd" data-k="${key}"><span class="hp-art plus"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 30v40M30 50h40" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg></span><b>Add ${{ like: "a like", wish: "a wish", goal: "a goal", bound: "a boundary", never: "a never-do" }[key]}</b><span class="hp-meta"><span>Choose its points</span></span></button>${list.map(card).join("")}${ideas.map(([t, p, a]) => `<button class="hp-card idea${key === "never" ? " never" : ""}" data-act="hpIdea" data-k="${key}" data-t="${esc(ideaTitle(t, to))}" data-p="${p}" data-a="${a}">${artHtml(a)}<b>${esc(ideaTitle(t, to))}</b><span class="hp-meta">${key === "bound" ? `<span class="hp-pts both">±${p}</span>` : badge(p, key === "never")}<span>Idea · tap to add</span></span></button>`).join("")}</div></section>`;
  }
  const ideaTitle = (t, to) => /made for$/.test(t) ? t + " " + pname(to) : t;
  function moments(to) {
    const list = C().filter(c => +c.to === +to && (+c.pts || 0) > 0).sort((a, b) => (+b.at || 0) - (+a.at || 0)).slice(0, 60);
    return `<section class="hp-sec"><div class="hp-h"><h2>Happy moments</h2><span class="sub">${list.length ? "Newest first" : "Every card that gets done lands here"}</span></div>
     <div class="hp-row" data-keepx="joy-${to}"><button class="hp-card add" data-act="hpLog"><span class="hp-art plus"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 30v40M30 50h40" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg></span><b>Add a happy moment</b><span class="hp-meta"><span>Something that just happened</span></span></button>${list.map(momentCard).join("")}</div></section>`;
  }
  /* the happy buddy beside the title: its face follows today's points for this person; a tap makes it dance and talk */
  const BUDDY_SAY = ["You've got this! 💪", "Small things count the most 💗", "A hug is always a good idea 🤗", "Try a card from the row below ✨", "Every point is a smile 😊", "Let's make today lovely 🌈", "High five! ✋", "Kindness is a superpower 🦸"];
  function buddy(to) {
    const t = TODAY(), pts = C().filter(c => +c.to === +to && dayOf(c.at) === t).reduce((a, c) => a + (+c.pts || 0), 0);
    const mood = pts > 0 ? "yay" : pts < 0 ? "oh" : "ok";
    const mouth = mood === "yay" ? `<path d="M40 60q10 14 20 0z" fill="#E0365F" stroke="#4A1D3A" stroke-width="3" stroke-linejoin="round"/>` : mood === "oh" ? `<path d="M42 64q8-8 16 0" stroke="#4A1D3A" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M72 30c4 6 4 10 0 12-4-2-4-6 0-12z" fill="#7FC8FF"/>` : `<path d="M43 60q7 7 14 0" stroke="#4A1D3A" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    const eyes = mood === "yay" ? `<path d="M30 48q6-8 12 0M58 48q6-8 12 0" stroke="#4A1D3A" stroke-width="3.6" fill="none" stroke-linecap="round"/>` : `<g class="ce"><ellipse cx="36" cy="48" rx="5.4" ry="6.6" fill="#4A1D3A"/><ellipse cx="64" cy="48" rx="5.4" ry="6.6" fill="#4A1D3A"/><circle cx="34" cy="45.5" r="2" fill="#fff"/><circle cx="62" cy="45.5" r="2" fill="#fff"/></g>`;
    return `<button class="hp-buddy ${mood}" data-act="hpBuddy" aria-label="Happy buddy: ${mood === "yay" ? "happy today" : mood === "oh" ? "a bit worried today" : "ready to help"}"><svg viewBox="0 0 100 100" aria-hidden="true" class="hp-bsvg"><path d="M50 88C22 70 10 54 10 38c0-12 9-22 21-22 8 0 14 4 19 11 5-7 11-11 19-11 12 0 21 10 21 22 0 16-12 32-40 50z" fill="#FF8DB5" stroke="#4A1D3A" stroke-width="4" stroke-linejoin="round"/><path d="M22 34c2-7 7-10 12-10" stroke="#FFD0E2" stroke-width="5" fill="none" stroke-linecap="round"/>${eyes}<ellipse cx="26" cy="58" rx="6" ry="3.6" fill="#FF5C93" opacity=".7"/><ellipse cx="74" cy="58" rx="6" ry="3.6" fill="#FF5C93" opacity=".7"/>${mouth}</svg></button>`;
  }
  function buddyTap(b) {
    const svgEl = b.querySelector("svg"); try { window.HHDance && HHDance.play(svgEl, { duration: 1100 }); HHDance.blink(svgEl); } catch (_) { }
    const old = document.querySelector(".hp-say"); if (old) old.remove();
    const say = document.createElement("span"); say.className = "hp-say"; say.setAttribute("role", "status"); say.textContent = BUDDY_SAY[Math.floor(Math.random() * BUDDY_SAY.length)];
    b.parentNode.appendChild(say); setTimeout(() => say.remove(), 2600);
  }
  function hero(to) {
    const me = viewId(), total = pointsTo(to), wk0 = addDays(TODAY(), -6), week = C().filter(c => +c.to === +to && dayOf(c.at) >= wk0);
    const days = [...Array(7)].map((_, i) => { const d = addDays(wk0, i); return { d, v: Math.max(0, week.filter(c => dayOf(c.at) === d).reduce((a, c) => a + (+c.pts || 0), 0)) }; });
    const max = Math.max(10, ...days.map(x => x.v)), byWho = order().map(id => ({ id, v: C().filter(c => +c.to === +to && +c.by === id).reduce((a, c) => a + (+c.pts || 0), 0) })).filter(x => x.v !== 0);
    const mine = pointsBy(me), lv = level(mine), st = streak(me), pct = Math.round(100 * (mine - lv.from) / Math.max(1, lv.to - lv.from));
    return `<section class="hp-hero">
      <div class="hp-who" role="tablist">${order().map(id => `<button class="hp-person${id === +to ? " on" : ""}" role="tab" aria-selected="${id === +to}" data-act="hpWho" data-k="${id}">${dot(id)}<span>${esc(pname(id))}</span></button>`).join("")}</div>
      <div class="hp-titlerow"><h2 class="hp-title">Making ${esc(pname(to))} happy</h2>${buddy(to)}</div>
      <div class="hp-floaty" aria-hidden="true">${["💗", "✨", "💖", "🌸", "💕", "⭐"].map((h, i) => `<i style="--i:${i}">${h}</i>`).join("")}</div>
      <div class="hp-score"><div><b class="num">${total}</b><span>happy points</span></div><div class="hp-week" aria-label="Points each day this week">${days.map(x => `<i style="height:${Math.round(8 + 52 * x.v / max)}%"${x.d === TODAY() ? ' class="today"' : ""} title="${esc(nice(x.d))}: ${x.v}"></i>`).join("")}</div></div>
      ${byWho.length ? `<div class="hp-by">${byWho.map(x => `<span>${dot(x.id)}${esc(pname(x.id))} <b class="num">${x.v}</b></span>`).join("")}</div>` : `<p class="sub hp-tip">Pick a card below, do it, then tap it and press the big button. Everyone who helps gets the points.</p>`}
      <div class="hp-level"><span class="hp-lvn">Lv ${lv.n}</span><div class="grow"><div class="row between"><b>${esc(pname(me))} · ${esc(lv.name)}</b><span class="sub num">${mine} pts${st ? " · 🔥 " + st + " day" + (st === 1 ? "" : "s") : ""}</span></div><div class="hp-bar"><i style="width:${pct}%"></i></div><span class="sub">${lv.to - mine} points to the next level</span></div></div>
    </section>`;
  }
  window.viewHappy = function () {
    const to = pageFor();
    return `<div class="hp-page">${hero(to)}${row(to, "like")}${row(to, "wish")}${row(to, "goal")}${row(to, "bound")}${row(to, "never")}${moments(to)}</div>`;
  };

  /* ---------- sheets ---------- */
  function itemSheet(id) {
    const it = H().find(x => x.id === id); if (!it) return;
    const r = ROWS[it.row] || ROWS.like, never = it.row === "never", bound = it.row === "bound", done = it.done && it.row !== "like" && !never && !bound;
    const last = (it.row === "like" || never) && it.lastAt ? (never ? "Last happened " : "Last done ") + ago(+it.lastAt) + (it.times ? " · " + it.times + " time" + (it.times === 1 ? "" : "s") + " in all" : "") : "";
    openSheet(`${sheetHead(esc(r.name))}<div class="hp-big">${artHtml(it.art, "live big")}</div>
      <h2 class="hp-sheet-t">${esc(it.title)}</h2><p class="sub hp-c">${bound ? "Respecting it: +" + ptsTxt(it.pts) + " · crossing it: −" + ptsTxt(it.pts) + (it.times || it.crossed ? " · respected " + (+it.times || 0) + "×, crossed " + (+it.crossed || 0) + "×" : "") : never ? "Makes " + esc(pname(it.to)) + " upset · takes off " + ptsTxt(it.pts) : "For " + esc(pname(it.to)) + " · " + ptsTxt(it.pts)}${done ? " · " + (it.row === "wish" ? "Came true " : "Reached ") + esc(ago(+it.doneAt || 0)) + (it.doneBy != null ? " with " + esc(pname(it.doneBy)) : "") : ""}</p>
      ${it.note ? `<p class="hp-note">${esc(it.note)}</p>` : ""}${last ? `<p class="sub hp-c">${esc(last)}</p>` : ""}
      ${done ? `<button class="ghost" data-act="hpReopen" data-id="${esc(it.id)}">Make it a ${it.row === "wish" ? "wish" : "goal"} again</button>` : bound ? `<div class="row" style="gap:8px"><button class="primary hp-go grow" data-act="hpDo" data-id="${esc(it.id)}">Respected it +${+it.pts || 0}</button><button class="primary hp-go bad grow" data-act="hpCross" data-id="${esc(it.id)}">Crossed it −${+it.pts || 0}</button></div>` : `<button class="primary hp-go${never ? " bad" : ""}" data-act="hpDo" data-id="${esc(it.id)}">${r.verb} ${never ? "−" : "+"}${+it.pts || 0}</button>`}
      <div class="row" style="gap:8px"><button class="ghost grow" data-act="hpEdit" data-id="${esc(it.id)}">Edit</button><button class="ghost grow hp-del" data-act="hpDel" data-id="${esc(it.id)}">Delete</button></div>`);
  }
  function editSheet(row, id, preset) {
    const it = id ? H().find(x => x.id === id) : null; preset = preset || {};
    const cur = it || { row, title: preset.title || "", pts: preset.pts || ROWS[row].pts, art: preset.art || "", note: "" };
    const to = it ? +it.to : pageFor();
    let pick = cur.art || "", rowK = cur.row || "like";
    openSheet(`${sheetHead(it ? "Edit card" : "New card for " + esc(pname(to)))}<form id="hpForm" class="stack" autocomplete="off">
      <div class="hp-big small" id="hpPrev">${artHtml(pick || guessArt(cur.title, rowK), "live big")}</div>
      <label class="fld"><span>What is it?</span><input id="hpT" maxlength="80" value="${esc(cur.title)}" placeholder="${rowK === "wish" ? "e.g. A weekend at the beach" : rowK === "goal" ? "e.g. Walk 10,000 steps" : rowK === "never" ? "e.g. Leave wet towels on the bed" : rowK === "bound" ? "e.g. Knock before coming in" : "e.g. Fresh flowers"}" enterkeyhint="done"></label>
      <div class="chips hp-rowchips" id="hpRow">${Object.entries(ROWS).map(([k, v]) => `<button type="button" class="chip${k === rowK ? " on" : ""}" data-k="${k}">${v.name}</button>`).join("")}</div>
      <label class="fld"><span id="hpPL">${rowK === "never" ? "Points it takes off" : rowK === "bound" ? "Points it gives or takes off" : "Points for doing it"}</span><div class="chips hp-ptschips">${[5, 10, 15, 20, 30, 50, 80, 100].map(p => `<button type="button" class="chip${+cur.pts === p ? " on" : ""}" data-p="${p}">${p}</button>`).join("")}<input id="hpP" type="number" inputmode="numeric" min="1" max="1000" value="${+cur.pts || 10}" aria-label="Points"></div></label>
      <div class="fld"><span>Picture</span><div class="hp-pics">${ART_KEYS.map(k => `<button type="button" class="${k === pick ? "on" : ""}" data-a="${k}" aria-label="${ARTS[k][0]}">${artHtml(k)}</button>`).join("")}</div></div>
      <label class="fld"><span>Note (optional)</span><input id="hpN" maxlength="140" value="${esc(cur.note || "")}" placeholder="e.g. Pink ones, not red"></label>
      <button class="primary" type="submit">${it ? "Save" : "Add card"}</button></form>`, sh => {
      const f = sh.querySelector("#hpForm"), t = sh.querySelector("#hpT"), p = sh.querySelector("#hpP"), prev = sh.querySelector("#hpPrev");
      const showPrev = () => { prev.innerHTML = artHtml(pick || guessArt(t.value, rowK), "live big"); };
      t.oninput = () => { if (!pick) showPrev(); };
      sh.querySelector("#hpRow").onclick = e => { const b = e.target.closest("[data-k]"); if (!b) return; rowK = b.dataset.k; sh.querySelectorAll("#hpRow button").forEach(x => x.classList.toggle("on", x === b)); sh.querySelector("#hpPL").textContent = rowK === "never" ? "Points it takes off" : rowK === "bound" ? "Points it gives or takes off" : "Points for doing it"; if (!pick) showPrev(); if (!it && !p.dataset.touched) { p.value = ROWS[rowK].pts; sh.querySelectorAll(".hp-ptschips .chip").forEach(c => c.classList.toggle("on", +c.dataset.p === +p.value)); } };
      sh.querySelector(".hp-ptschips").onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; p.value = b.dataset.p; p.dataset.touched = 1; sh.querySelectorAll(".hp-ptschips .chip").forEach(c => c.classList.toggle("on", c === b)); };
      p.oninput = () => { p.dataset.touched = 1; sh.querySelectorAll(".hp-ptschips .chip").forEach(c => c.classList.toggle("on", +c.dataset.p === +p.value)); };
      sh.querySelector(".hp-pics").onclick = e => { const b = e.target.closest("[data-a]"); if (!b) return; pick = b.dataset.a; sh.querySelectorAll(".hp-pics button").forEach(x => x.classList.toggle("on", x === b)); showPrev(); };
      f.onsubmit = e => {
        e.preventDefault(); const title = t.value.trim(); if (!title) { t.focus(); toast("Give it a name first"); return; }
        const pts = Math.max(1, Math.min(1000, Math.round(+p.value || 0) || ROWS[rowK].pts)), art = pick || guessArt(title, rowK), note = sh.querySelector("#hpN").value.trim();
        if (it) { ST.patch("happy", it.id, { title, pts, art, note, row: rowK }); closeSheet(); toast("Saved"); }
        else { ST.add("happy", { to, row: rowK, title, pts, art, note, done: false, times: 0 }); closeSheet(); toast("Added to " + pname(to) + "'s " + ROWS[rowK].name.toLowerCase()); }
      };
      if (!it) setTimeout(() => { try { t.focus(); } catch (_) { } }, 60);
    });
  }
  function momentSheet(id) {
    const c = C().find(x => x.id === id); if (!c) return;
    openSheet(`${sheetHead("Happy moment")}<div class="hp-big">${artHtml(c.art, "live big")}</div><h2 class="hp-sheet-t">${esc(c.title)}</h2>
      <p class="sub hp-c">For ${esc(pname(c.to))} · ${esc(pname(c.by))} ${(+c.pts || 0) < 0 ? "lost" : "got"} ${ptsTxt(Math.abs(+c.pts || 0))} · ${esc(new Date(+c.at || 0).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</p>
      <button class="primary" data-act="hpAgain" data-id="${esc(c.id)}">Do it again +${+c.pts || 0}</button>
      <button class="ghost hp-del" data-act="hpDelMoment" data-id="${esc(c.id)}">Remove this moment</button>`);
  }
  function logSheet() {
    const to = pageFor(); let pick = "";
    openSheet(`${sheetHead("A happy moment for " + esc(pname(to)))}<form id="hpLogF" class="stack" autocomplete="off"><div class="hp-big small" id="hpPrev">${artHtml("heart", "live big")}</div>
      <label class="fld"><span>What happened?</span><input id="hpT" maxlength="80" placeholder="e.g. Made her laugh at dinner" enterkeyhint="done"></label>
      <label class="fld"><span>Points</span><div class="chips hp-ptschips">${[5, 10, 15, 20, 30, 50].map(p => `<button type="button" class="chip${p === 10 ? " on" : ""}" data-p="${p}">${p}</button>`).join("")}<input id="hpP" type="number" inputmode="numeric" min="1" max="1000" value="10" aria-label="Points"></div></label>
      <button class="primary" type="submit">Celebrate it</button></form>`, sh => {
      const t = sh.querySelector("#hpT"), p = sh.querySelector("#hpP"), prev = sh.querySelector("#hpPrev");
      t.oninput = () => { pick = guessArt(t.value); prev.innerHTML = artHtml(pick === "star" ? "heart" : pick, "live big"); };
      sh.querySelector(".hp-ptschips").onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; p.value = b.dataset.p; sh.querySelectorAll(".hp-ptschips .chip").forEach(c => c.classList.toggle("on", c === b)); };
      sh.querySelector("#hpLogF").onsubmit = e => {
        e.preventDefault(); const title = t.value.trim(); if (!title) { t.focus(); toast("Say what happened first"); return; }
        const pts = Math.max(1, Math.min(1000, Math.round(+p.value || 10))), art = pick && pick !== "star" ? pick : "heart";
        closeSheet(); cheer({ to, item: null, title, row: "joy", art, pts });
      };
      setTimeout(() => { try { t.focus(); } catch (_) { } }, 60);
    });
  }

  /* ---------- doing things ---------- */
  function cheer(c, undoFn) {
    const by = viewId(), before = pointsBy(by);
    const id = ST.add("cheers", Object.assign({ at: Date.now() }, c));
    if ((+c.pts || 0) < 0) grump(c, by, Math.max(0, before + (+c.pts || 0))); else celebrate(c, by, before, before + (+c.pts || 0));
    setTimeout(() => toast(ptsTxt(c.pts) + " for " + pname(by), "Undo", () => { ST.del("cheers", id); undoFn && undoFn(); toast("Undone"); }), 400);
    return id;
  }
  function doItem(id, cross) {
    const it = H().find(x => x.id === id); if (!it) return;
    closeSheet();
    const prev = { done: !!it.done, doneAt: it.doneAt || null, doneBy: it.doneBy ?? null, times: +it.times || 0, lastAt: it.lastAt || null };
    const prevX = { crossed: +it.crossed || 0, crossAt: it.crossAt || null };
    if (cross) ST.patch("happy", id, { crossed: prevX.crossed + 1, crossAt: Date.now() });
    else if (it.row === "like" || it.row === "never" || it.row === "bound") ST.patch("happy", id, { times: prev.times + 1, lastAt: Date.now() });
    else ST.patch("happy", id, { done: true, doneAt: Date.now(), doneBy: viewId() });
    const pts = Math.abs(+it.pts || 0) * (it.row === "never" || cross ? -1 : 1);
    cheer({ to: +it.to, item: id, title: (cross ? "Crossed: " : "") + it.title, row: cross ? "cross" : it.row, art: cross ? "angry" : artOf(it.art), pts }, () => ST.patch("happy", id, cross ? prevX : prev));
  }

  /* ---------- the celebration ---------- */
  let chimeCtx = null;
  function chime(up) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!chimeCtx || chimeCtx.state === "closed") chimeCtx = new AC(); const ac = chimeCtx; if (ac.state !== "running" && ac.resume) ac.resume().catch(() => { }); // iPhone says "interrupted" after the app was away
      const t0 = ac.currentTime + 0.02, notes = up ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [659.25, 783.99, 1046.5];
      notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * 0.11; o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.55); });
    } catch (_) { }
  }
  let celeT = 0;
  function celebrate(c, by, before, after) {
    const w = document.querySelector(".wrap"); if (!w) return;
    const old = document.getElementById("hpCele"); if (old) old.remove();
    const lvA = level(before), lvB = level(after), up = lvB.n > lvA.n, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const words = c.row === "wish" ? "A wish came true!" : c.row === "goal" ? "Goal reached!" : pname(c.to) + " is happy!";
    const el = document.createElement("div"); el.id = "hpCele"; el.className = "hp-cele"; el.setAttribute("role", "status");
    el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="hp-cele-card">${artHtml(c.art, "live huge")}<b class="hp-plus num">+0</b><p class="hp-words">${esc(words)}</p><p class="hp-sm">${esc(c.title)}</p>${up ? `<p class="hp-up">Level up! ${esc(pname(by))} is now ${esc(lvB.name)} ✨</p>` : `<p class="hp-sm">${esc(pname(by))} · Lv ${lvB.n} ${esc(lvB.name)} · ${after} pts</p>`}<span class="hp-tapclose">Tap to close</span></div>`;
    w.append(el);
    const close = () => { clearTimeout(celeT); el.classList.add("out"); setTimeout(() => el.remove(), 260); };
    el.onclick = close; celeT = setTimeout(close, up ? 5200 : 3800);
    chime(up);
    try { navigator.vibrate && navigator.vibrate(up ? [30, 40, 30, 40, 60] : 30); } catch (_) { }
    const plus = el.querySelector(".hp-plus"), pts = +c.pts || 0, t0 = performance.now(), dur = calm ? 1 : 700;
    const tick = now => { const k = Math.min(1, (now - t0) / dur); plus.textContent = "+" + Math.round(pts * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (calm || !window.confetti || !confetti.create) return;
    try {
      const fire = confetti.create(el.querySelector("canvas"), { resize: true }), cols = ARTS[artOf(c.art)][1].concat(["#FFE14D", "#FFFFFF", "#FF7EB8", "#56A8FF"]);
      fire({ particleCount: 90, spread: 80, startVelocity: 42, origin: { y: 0.62 }, colors: cols, scalar: 1.05 });
      setTimeout(() => fire({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: cols }), 220);
      setTimeout(() => fire({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: cols }), 380);
      if (up) setTimeout(() => fire({ particleCount: 160, spread: 160, startVelocity: 50, origin: { y: 0.4 }, shapes: ["star"], colors: ["#FFE14D", "#FFCB2E", "#FFFFFF"] }), 700);
    } catch (_) { }
  }

  /* a never-do happened: a very red, very angry face, and the points come off */
  function grumble() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!chimeCtx || chimeCtx.state === "closed") chimeCtx = new AC(); const ac = chimeCtx; if (ac.state !== "running" && ac.resume) ac.resume().catch(() => { }); // iPhone says "interrupted" after the app was away
      const t0 = ac.currentTime + 0.02;
      [[311.1, 0], [293.7, 0.22], [261.6, 0.44], [233.1, 0.66]].forEach(([f, d], i) => { const o = ac.createOscillator(), g = ac.createGain(), t = t0 + d, len = i === 3 ? 0.7 : 0.24; o.type = "sawtooth"; o.frequency.setValueAtTime(f, t); if (i === 3) o.frequency.linearRampToValueAtTime(f * 0.85, t + len); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + len + 0.05); });
    } catch (_) { }
  }
  function grump(c, by, after) {
    const w = document.querySelector(".wrap"); if (!w) return;
    const old = document.getElementById("hpCele"); if (old) old.remove();
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches, lv = level(after), faces = ["angry", "grr", "storm"];
    const el = document.createElement("div"); el.id = "hpCele"; el.className = "hp-cele grump"; el.setAttribute("role", "status");
    el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="hp-cele-card">${artHtml(faces.includes(c.art) ? c.art : "angry", "live huge")}<div class="hp-faces" aria-hidden="true">${faces.map(f => artHtml(f, "live")).join("")}</div><b class="hp-plus num">−0</b><p class="hp-words">Oh no! ${esc(pname(c.to))} is upset</p><p class="hp-sm">${esc(c.title)}</p><p class="hp-sm">${esc(pname(by))} · Lv ${lv.n} ${esc(lv.name)} · ${after} pts</p><span class="hp-tapclose">Tap to close</span></div>`;
    w.append(el);
    const close = () => { clearTimeout(celeT); el.classList.add("out"); setTimeout(() => el.remove(), 260); };
    el.onclick = close; celeT = setTimeout(close, 4200);
    grumble();
    try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (_) { }
    const plus = el.querySelector(".hp-plus"), pts = Math.abs(+c.pts || 0), t0 = performance.now(), dur = calm ? 1 : 700;
    const tick = now => { const k = Math.min(1, (now - t0) / dur); plus.textContent = "−" + Math.round(pts * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (calm || !window.confetti || !confetti.create) return;
    try { const fire = confetti.create(el.querySelector("canvas"), { resize: true }), reds = ["#FF0000", "#E0101E", "#FF4D4D", "#B80C18"];
      fire({ particleCount: 70, spread: 100, startVelocity: 30, gravity: 1.4, origin: { y: 0.5 }, colors: reds, shapes: ["circle"], scalar: 1.2 });
      setTimeout(() => fire({ particleCount: 40, spread: 140, startVelocity: 24, gravity: 1.6, origin: { y: 0.45 }, colors: reds, shapes: ["square"] }), 300); } catch (_) { }
  }

  /* ---------- taps ---------- */
  const armDel = (a, key, fn) => { if (delArm !== key) { delArm = key; a.textContent = "Tap again to delete"; a.classList.add("arm"); setTimeout(() => { if (delArm === key) delArm = ""; }, 4000); return; } delArm = ""; fn(); };
  window.hpAct = function (act, a) {
    const id = a.dataset.id;
    switch (act) {
      case "hpWho": forId = +a.dataset.k; return render();
      case "hpOpen": return itemSheet(id);
      case "hpAdd": return editSheet(a.dataset.k);
      case "hpEdit": { const it = H().find(x => x.id === id); closeSheet(); return it && editSheet(it.row, id); }
      case "hpIdea": { const to = pageFor(); ST.add("happy", { to, row: a.dataset.k, title: a.dataset.t, pts: +a.dataset.p || 10, art: artOf(a.dataset.a), note: "", done: false, times: 0 }); if (a.dataset.k !== "never") party(); return toast("Added: " + a.dataset.t); }
      case "hpDo": return doItem(id);
      case "hpCross": return doItem(id, true);
      case "hpReopen": { const it = H().find(x => x.id === id); if (!it) return; ST.patch("happy", id, { done: false, doneAt: null, doneBy: null }); closeSheet(); return toast("It's back on the list. The points stay"); }
      case "hpDel": { const it = H().find(x => x.id === id); if (!it) return; return armDel(a, "i" + id, () => { const keep = Object.assign({}, it); delete keep.id; ST.del("happy", id); closeSheet(); toast("Card deleted", "Undo", () => ST.put("happy", id, keep)); }); }
      case "hpMoment": return momentSheet(id);
      case "hpAgain": { const c0 = C().find(x => x.id === id); if (!c0) return; closeSheet(); const it = c0.item && H().find(x => x.id === c0.item); if (it && c0.row === "cross") return doItem(it.id, true); if (it && (it.row === "like" || it.row === "never" || it.row === "bound")) return doItem(it.id); return cheer({ to: +c0.to, item: c0.item || null, title: c0.title, row: c0.row || "joy", art: artOf(c0.art), pts: +c0.pts || 0 }); }
      case "hpDelMoment": { const c0 = C().find(x => x.id === id); if (!c0) return; return armDel(a, "m" + id, () => { const keep = Object.assign({}, c0); delete keep.id; ST.del("cheers", id); closeSheet(); toast("Moment removed", "Undo", () => ST.put("cheers", id, keep)); }); }
      case "hpLog": return logSheet();
      case "hpBuddy": return buddyTap(a);
    }
  };
  window.hpFab = () => editSheet("like");
  // the page opens on Mum each time it is opened from the bottom bar
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest('.tab[data-tab="happy"]')) forId = null; }, true);
  window.hpArts = ART_KEYS; // for tests
  if (location.hash.replace("#", "") === "happy") render(); // the page was opened before this file had loaded
})();
