/* Happy Home: Piano page.
   Plain script, no libraries, no network. Defines window.HHPiano = {mount, unmount, refresh, parseSong, SONGS}.
   Sections: 1 notes  2 song text  3 built-in songs  4 colours  5 sound  6 hearing (pitch)  7 drawing
             8 page  9 keyboard  10 lessons  11 celebration  12 microphone  13 song list and editor  14 mount */
(function(){
"use strict";
var HH=null;                                   // window.HH, read when mount() is called

// ───────────────────────── 1. Notes ─────────────────────────
var LETTERS="CDEFGAB", SOLFA=["Do","Re","Mi","Fa","Sol","La","Ti"];
var LET_SEMI=[0,2,4,5,7,9,11];                 // semitones of C D E F G A B above C
var SEMI_LET=[0,0,1,1,2,3,3,4,4,5,5,6];        // letter index for each semitone (black keys spelled as sharps)
var BLACK=[0,1,0,1,0,0,1,0,1,0,1,0];
function clamp(v,a,b){return v<a?a:v>b?b:v}
/* Everything the page needs to know about one MIDI note. step = staff steps above middle C (C4=0, D4=1 ... C5=7). */
function info(midi,flat){
  var pc=((midi%12)+12)%12, oct=Math.floor(midi/12)-1, li=SEMI_LET[pc], acc=BLACK[pc];
  if(acc&&flat){li+=1;acc=-1}
  var sign=acc>0?"♯":acc<0?"♭":"";
  return {midi:midi,pc:pc,oct:oct,li:li,acc:acc,step:(oct-4)*7+li,black:!!BLACK[pc],l:LETTERS[li]+sign,s:SOLFA[li]+sign};
}
function countsWord(b){
  var r=Math.round(b*100)/100;
  return r===1?"1 count":r===0.5?"half a count":r===0.25?"a quarter count":r===1.5?"1 and a half counts":(r%1?String(r):r)+" counts";
}

// ───────────────────────── 2. Song text ─────────────────────────
/* "C C G G | A A G-"  ->  {notes:[{midi|null,beats}], bars:[index where each bar starts], errors:[text]}. Never throws. */
var TOKEN=/^([Dd][Oo]|[Rr][Ee]|[Mm][Ii]|[Ff][Aa]|[Ss][Oo][Ll]?|[Ll][Aa]|[Tt][Ii]|[Ss][Ii]|[A-Ga-g]|_|[Rr])([#♯b♭]?)([',]*)(\d?)([',]*)([-\/.]*)$/;
var SOLMAP={"do":0,re:1,mi:2,fa:3,sol:4,so:4,la:5,ti:6,si:6};
function parseSong(text){
  var out={notes:[],bars:[],errors:[]};
  try{
    var bad=0,range=0;
    var src=String(text==null?"":text).slice(0,20000).replace(/[‘’`´′]/g,"'").replace(/[–—−]/g,"-").replace(/\|+/g," | ");
    var toks=src.split(/\s+/).filter(Boolean), names=toks.filter(function(t){return t!=="|"});
    // "C, D, E, F" typed as a list: the commas are separators there, not "one octave lower" marks
    if(names.length>3&&names.slice(0,-1).every(function(t){return /^[^,]+,$/.test(t)})&&!/,$/.test(names[names.length-1]))
      toks=toks.map(function(t){return t.replace(/,$/,"")});
    var add=function(m){
      var name=m[1].toLowerCase(), marks=m[3]+m[5], len=m[6], beats=1, i;
      for(i=0;i<len.length;i++) if(len[i]==="-") beats+=1;
      for(i=0;i<len.length;i++) if(len[i]==="/") beats/=2;
      var dots=len.split(".").length-1; if(dots) beats*=dots>1?1.75:1.5;
      if(name==="_"||name==="r"){out.notes.push({midi:null,beats:beats});return}
      var li=name.length>1?SOLMAP[name]:LETTERS.indexOf(name.toUpperCase());
      var oct=m[4]?+m[4]:4; for(i=0;i<marks.length;i++) oct+=marks[i]==="'"?1:-1;
      var acc=/[#♯]/.test(m[2])?1:m[2]?-1:0, midi=(oct+1)*12+LET_SEMI[li]+acc;
      if(midi<21||midi>108){ if(!range++) out.errors.push('"'+m[0].slice(0,12)+'" is too '+(midi<21?"low":"high")+" for a piano."); return }
      var n={midi:midi,beats:beats}; if(acc<0) n.flat=true; out.notes.push(n);
    };
    toks.forEach(function(tk){
      if(out.notes.length>=600) return;
      if(tk==="|"){ if(out.notes.length&&out.bars[out.bars.length-1]!==out.notes.length) out.bars.push(out.notes.length); return }
      if(/^-+$/.test(tk)){
        var last=out.notes[out.notes.length-1];
        if(last) last.beats+=tk.length; else if(!bad++) out.errors.push('A "-" makes the note before it longer, so it needs a note first.');
        return;
      }
      var m=TOKEN.exec(tk);
      if(m){add(m);return}
      if(/^[A-Ga-g_]{2,}$/.test(tk)){ tk.split("").forEach(function(ch){add(TOKEN.exec(ch))}); return }   // CDE typed without spaces
      if(bad++<4) out.errors.push('I do not understand "'+tk.slice(0,14)+'".');
    });
    if(bad>4) out.errors.push("…and "+(bad-4)+" more bits I could not read.");
    if(out.notes.length>=600) out.errors.push("That is a very long song. I kept the first 600 notes.");
    if(out.bars[out.bars.length-1]===out.notes.length) out.bars.pop();
    if(out.notes.length&&out.bars[0]!==0) out.bars.unshift(0);
  }catch(e){ out.errors.push("Sorry, I could not read these notes.") }
  return out;
}

// ───────────────────────── 3. Built-in songs ─────────────────────────
/* Traditional or public-domain melodies only. grade 0 Starter (3 to 5 different notes), 1 Easy, 2 Next step.
   bpm = counts per minute at full speed, beats = counts in a bar. In the three 6/8 tunes one count is one quaver. */
var GRADES=["Starter","Easy","Next step"];
function song(id,title,sub,grade,bpm,beats,notes){return {id:id,title:title,sub:sub,grade:grade,bpm:bpm,beats:beats,notes:notes}}
var SONGS=[
song("hot-cross-buns","Hot Cross Buns","English nursery rhyme",0,100,4,
 "E D C- | E D C- | C/ C/ C/ C/ D/ D/ D/ D/ | E D C-"),
song("rain-rain","Rain, Rain, Go Away","Nursery rhyme",0,100,4,
 "G- E- | G G E- | G G E A | G G E- | G G E A | G G E- | G- E- | G G E-"),
song("mary-lamb","Mary Had a Little Lamb","Nursery rhyme",0,100,4,
 "E D C D | E E E- | D D D- | E G G- | E D C D | E E E E | D D E D | C---"),
song("lightly-row","Lightly Row","German folk song (Hänschen klein)",0,110,4,
 "G E E- | F D D- | C D E F | G G G- | G E E- | F D D- | C E G G | E--- | D D D D | D E F- | E E E E | E F G- | G E E- | F D D- | C E G G | C---"),
song("ode-to-joy","Ode to Joy","Beethoven, the first part",0,110,4,
 "E E F G | G F E D | C C D E | E. D/ D- | E E F G | G F E D | C C D E | D. C/ C-"),
song("aunt-rhody","Go Tell Aunt Rhody","Folk song",0,100,4,
 "E- E D | C- C- | D- D F | E D C- | G- G F | E- E- | D C D E | C---"),
song("saints","When the Saints Go Marching In","Spiritual",0,120,4,
 "_ C E F | G--- | _ C E F | G--- | _ C E F | G- E- | C- E- | D--- | E- E D | C-- C | E- G G | F- E F | G- E- | C- D- | C---"),
song("jingle-bells","Jingle Bells","James Pierpont, 1857",0,120,4,
 "E E E- | E E E- | E G C. D/ | E--- | F F F. F/ | F E E E/ E/ | E D D E | D- G- | E E E- | E E E- | E G C. D/ | E--- | F F F. F/ | F E E E/ E/ | G G F D | C---"),
song("camptown","Camptown Races","Stephen Foster, the verse",0,120,4,
 "G G E G | A G E- | E D- _ | E D- _ | G G E G | A G E- | D- E D | C---"),
song("twinkle","Twinkle Twinkle Little Star","French melody, 1761",1,100,4,
 "C C G G | A A G- | F F E E | D D C- | G G F F | E E D- | G G F F | E E D- | C C G G | A A G- | F F E E | D D C-"),
song("baa-baa","Baa Baa Black Sheep","Nursery rhyme",1,100,4,
 "C C G G | A/ B/ C'/ A/ G- | F F E E | D D C- | G G/ G/ F F | E E/ E/ D- | G G/ G/ F/ F/ F/ F/ | E E/ E/ D- | C C G G | A/ B/ C'/ A/ G- | F F E E | D D C-"),
song("frere-jacques","Frère Jacques","French round. In Chinese: 两只老虎 (Two Tigers)",1,110,4,
 "G A B G | G A B G | B C' D'- | B C' D'- | D'/ E'/ D'/ C'/ B G | D'/ E'/ D'/ C'/ B G | G D G- | G D G-"),
song("au-clair","Au clair de la lune","French folk song",1,100,4,
 "F F F G | A- G- | F A G G | F--- | F F F G | A- G- | F A G G | F--- | G G G G | D- D- | G F E D | C--- | F F F G | A- G- | F A G G | F---"),
song("london-bridge","London Bridge","English nursery rhyme",1,110,4,
 "G. A/ G F | E F G- | D E F- | E F G- | G. A/ G F | E F G- | D- G- | E C--"),
song("old-macdonald","Old MacDonald Had a Farm","Folk song",1,120,4,
 "G G G D | E E D- | B B A A | G-- D | G G G D | E E D- | B B A A | G-- D/ D/ | G G G D/ D/ | G G G- | G/ G/ G G/ G/ G | G/ G/ G/ G/ G G | G G G D | E E D- | B B A A | G---"),
song("this-old-man","This Old Man","English counting song",1,110,4,
 "G E G- | G E G- | A G F E | D E F E/ F/ | G C C/ C/ C | C/ D/ E/ F/ G- | G D D F | E D C-"),
song("row-row","Row, Row, Row Your Boat","Round. Three quick counts to each pull of the oars",1,180,3,
 "C-- C-- | C- D E-- | E- D E- F | G----- | C' C' C' G G G | E E E C C C | G- F E- D | C-----"),
song("long-long-ago","Long, Long Ago","T. H. Bayly, 1833",1,110,4,
 "C- C D | E- E F | G- A G | E-- _ | G- F E | D-- _ | F- E D | C-- _ | C- C D | E- E F | G- A G | E-- _ | G- F E | D- E D | C---"),
song("yankee-doodle","Yankee Doodle","American folk song",1,130,4,
 "C' C' D' E' | C' E' D' G | C' C' D' E' | C'- B- | C' C' D' E' | F' E' D' C' | B G A B | C'- C'- | A. B/ A G | A B C'- | G. A/ G F | E- G- | A. B/ A G | A B C' A | G C' B D' | C'- C'-"),
song("oh-susanna","Oh! Susanna","Stephen Foster, 1848",1,120,4,
 "C/ D/ | E G G. A/ | G E C. D/ | E E D C | D-- C/ D/ | E G G. A/ | G E C. D/ | E E D D | C--- | F- F- | A A- A | G G E C | D-- C/ D/ | E G G. A/ | G E C. D/ | E E D D | C---"),
song("itsy-bitsy","Itsy Bitsy Spider","Nursery rhyme. Three quick counts to each beat",1,180,3,
 "D | G- G G- A | B-- B- B | A- G A- B | G-- _-- | B-- B- C' | D'-- _- D' | C'- B C'- D' | B-- _-- | G-- G- A | B-- _- B | A- G A- B | G-- _ D D | G- G G- A | B-- B- B | A- G A- B | G-----"),
song("happy-birthday","Happy Birthday to You","Melody by the Hill sisters, 1893",1,100,3,
 "G/ G/ | A G C' | B- G/ G/ | A G D' | C'- G/ G/ | G' E' C' | B A F'/ F'/ | E' C' D' | C'--"),
song("merry-christmas","We Wish You a Merry Christmas","English carol",1,130,3,
 "G | C' C'/ D'/ C'/ B/ | A A A | D' D'/ E'/ D'/ C'/ | B G G | E' E'/ F'/ E'/ D'/ | C' A G/ G/ | A D' B | C'--"),
song("brahms-lullaby","Brahms' Lullaby","Johannes Brahms, 1868",2,90,3,
 "E/ E/ | G. E/ E | G- E/ G/ | C' B. A/ | A G D/ E/ | F D D/ E/ | F- D/ F/ | B/ A/ G B | C'- C/ C/ | C'- A/ F/ | G- E/ C/ | F G A | G- C/ C/ | C'- A/ F/ | G- E/ C/ | F E D | C--"),
song("amazing-grace","Amazing Grace","Hymn tune \"New Britain\", 1829",2,90,3,
 "D | G- B/ G/ | B- A | G- E | D- D | G- B/ G/ | B- A | D'-- | _- B | D'. B/ D'/ B/ | G- D | E. G/ G/ E/ | D- D | G- B/ G/ | B- A | G--"),
song("silent-night","Silent Night","Franz Gruber, 1818",2,90,3,
 "G. A/ G | E-- | G. A/ G | E-- | D'- D' | B-- | C'- C' | G-- | A- A | C'. B/ A | G. A/ G | E-- | A- A | C'. B/ A | G. A/ G | E-- | D'- D' | F'. D'/ B | C'-- | E'-- | C' G E | G. F/ D | C--"),
song("auld-lang-syne","Auld Lang Syne","Scottish folk song",2,100,4,
 "C | F. F/ F A | G. F/ G A | F. F/ A C' | D'-- D' | C'. A/ A F | G. F/ G A | F. D/ D C | F-- D' | C'. A/ A F | G. F/ G D' | C'. A/ A C' | D'-- D' | C'. A/ A F | G. F/ G A | F. D/ D C | F--"),
song("sakura","Sakura Sakura","さくら Japanese folk song (Cherry Blossoms)",2,80,4,
 "A A B- | A A B- | A B C' B | A B/ A/ F- | E C E F | E E/ C/ B,- | A B C' B | A B/ A/ F- | E C E F | E E/ C/ B,- | A A B- | A A B- | E F B/ A/ F | E---"),
song("mo-li-hua","Mo Li Hua","茉莉花 Chinese folk song (Jasmine Flower)",2,80,4,
 "A A/ C'/ D'/ F'/ F'/ D'/ | C' C'/ D'/ C'- | A A/ C'/ D'/ F'/ F'/ D'/ | C' C'/ D'/ C'- | C' C' C' A/ C'/ | D' D' C'- | A G/ A/ C' A/ G/ | F F/ G/ F- | A/ G/ F/ A/ G. A/ | C' D'/ F'/ C'- | G A/ C'/ G/ A/ F/ D/ | C- D F | G. A/ F/ G/ F/ D/ | C---"),
song("ode-to-joy-whole","Ode to Joy (the whole tune)","Beethoven, 1824",2,110,4,
 "B B C' D' | D' C' B A | G G A B | B. A/ A- | B B C' D' | D' C' B A | G G A B | A. G/ G- | A A B G | A B/ C'/ B G | A B/ C'/ B A | G A D- | B B C' D' | D' C' B A | G G A B | A. G/ G-"),
song("minuet-in-g","Minuet in G","Christian Petzold, from Anna Magdalena Bach's notebook (the opening)",2,110,3,
 "D' G/ A/ B/ C'/ | D' G G | E' C'/ D'/ E'/ F#'/ | G' G G | C' D'/ C'/ B/ A/ | B C'/ B/ A/ G/ | F# G/ A/ B/ G/ | A-- | D' G/ A/ B/ C'/ | D' G G | E' C'/ D'/ E'/ F#'/ | G' G G | C' D'/ C'/ B/ A/ | B C'/ B/ A/ G/ | A B/ A/ G/ F#/ | G--"),
song("fur-elise","Für Elise","Beethoven, the opening theme made simple",2,130,3,
 "E'/ D#'/ | E'/ D#'/ E'/ B/ D'/ C'/ | A _/ C/ E/ A/ | B _/ E/ G#/ B/ | C' _/ E/ E'/ D#'/ | E'/ D#'/ E'/ B/ D'/ C'/ | A _/ C/ E/ A/ | B _/ E/ C'/ B/ | A--")
];

// ───────────────────────── 4. Colours ─────────────────────────
/* One bright colour for each note name C D E F G A B. The same colour is used on the key, the sheet and the glow. */
var PALETTES=[
 {name:"Rainbow", c:["#E53935","#FB8C00","#FDD835","#43A047","#00ACC1","#3F51B5","#D81B9A"]},
 {name:"Splash",  c:["#1E88E5","#8E24AA","#EC407A","#E53935","#FB8C00","#FDD835","#43A047"]},
 {name:"Lollipop",c:["#FF3D7F","#FF8A00","#FFD600","#00C853","#00B8D4","#2979FF","#AA00FF"]},
 {name:"Jungle",  c:["#1FAB54","#A4DE02","#FFD60A","#FF8C1A","#F0443C","#D6399A","#3A86FF"]},
 {name:"Space",   c:["#7C4DFF","#2979FF","#00D5F0","#1DE9B6","#FFEA00","#FF9100","#FF4081"]},
 {name:"Sunset",  c:["#FF7A00","#FFC300","#8FDB4F","#19C3B1","#3D8BFD","#9B5DE5","#F15BB5"]}
];
function inkOn(hex){                              // dark or white text, whichever is easier to read on this colour
  var lum=[1,3,5].map(function(i){var v=parseInt(hex.substr(i,2),16)/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
  var L=0.2126*lum[0]+0.7152*lum[1]+0.0722*lum[2];
  return (L+0.05)/0.062>1.05/(L+0.05)?"#1B1B1F":"#FFFFFF";   // contrast with near-black against contrast with white
}
function hashText(s){var h=7;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h}
function dayNumber(){var d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5)}
/* mode: "day" (default), "week", "song", or "fix:N". Seeded, so it stays the same for that day, week or song. */
function pickPalette(mode,songKey){
  var n=PALETTES.length,m=String(mode||"day");
  if(m.indexOf("fix:")===0) return clamp(parseInt(m.slice(4),10)||0,0,n-1);
  if(m==="song") return hashText(songKey||"free")%n;
  if(m==="week") return Math.floor((dayNumber()+3)/7)%n;      // weeks start on Monday
  return dayNumber()%n;
}

// ───────────────────────── 5. Sound (Web Audio) ─────────────────────────
var AU={ac:null,out:null,wave:null,voices:[]};
var appSoundUntil=0;                             // while the app itself is sounding, the microphone ignores what it hears
function now(){return (window.performance&&performance.now)?performance.now():Date.now()}
function setAudioSession(recording){             // iPhone: without this the mute switch silences web audio
  try{ if(navigator.audioSession) navigator.audioSession.type=recording?"play-and-record":"playback" }catch(e){}
}
/* Create or wake the AudioContext. Must be called from inside a touch or click. Returns null if there is no Web Audio. */
function audio(){
  var C=window.AudioContext||window.webkitAudioContext;
  if(!C) return null;
  if(!AU.ac){
    try{
      AU.ac=new C(); AU.out=AU.ac.createGain(); AU.out.gain.value=0.9;
      var comp=AU.ac.createDynamicsCompressor(); AU.out.connect(comp); comp.connect(AU.ac.destination);
      var h=[0,1,0.5,0.28,0.16,0.09,0.06,0.035,0.02];        // a few harmonics give a soft piano-like colour
      AU.wave=AU.ac.createPeriodicWave(new Float32Array(h.length),new Float32Array(h));
      setAudioSession(MIC.on);
    }catch(e){AU.ac=null;return null}
  }
  if(AU.ac.state!=="running"&&AU.ac.resume){ try{var p=AU.ac.resume(); if(p&&p.catch) p.catch(function(){})}catch(e){} }
  return AU.ac;
}
/* One piano-like note: quick attack, natural decay (longer for low notes), short release when stop() is called.
   opt: {at: seconds from now, dur: seconds, vel: 0..1, app: true when the app plays it by itself} */
function tone(midi,opt){
  var ac=audio(); if(!ac||!AU.wave) return null; opt=opt||{};
  try{
    var t=ac.currentTime+(opt.at||0)+0.002, f=440*Math.pow(2,(midi-69)/12), vel=opt.vel||0.5;
    var tau=clamp(0.95-(midi-60)*0.014,0.22,1.7);
    var o=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain(),g2=ac.createGain(),lp=ac.createBiquadFilter();
    o.setPeriodicWave(AU.wave); o.frequency.value=f;
    o2.type="sine"; o2.frequency.value=f*2.004; g2.gain.value=0.1;       // a touch of shimmer
    lp.type="lowpass"; lp.frequency.setValueAtTime(Math.min(f*9,14000),t); lp.frequency.exponentialRampToValueAtTime(Math.max(f*2.4,600),t+0.45);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vel,t+0.008); g.gain.setTargetAtTime(0,t+0.012,tau);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(AU.out);
    o.start(t); o2.start(t);
    var v={midi:midi,done:false,stop:function(after){
      if(v.done) return; v.done=true;
      var e=Math.max(ac.currentTime,t)+(after||0);
      try{ g.gain.setTargetAtTime(0,e,0.05); o.stop(e+0.4); o2.stop(e+0.4) }catch(x){}
    }};
    o.onended=function(){ try{g.disconnect()}catch(x){} var i=AU.voices.indexOf(v); if(i>=0) AU.voices.splice(i,1) };
    AU.voices.push(v);
    if(opt.dur) v.stop((opt.at||0)+opt.dur); else { try{o.stop(t+tau*7);o2.stop(t+tau*7)}catch(x){} }
    if(opt.app) appSoundUntil=Math.max(appSoundUntil,now()+((opt.at||0)+(opt.dur||0.6))*1000+250);
    return v;
  }catch(e){return null}
}
function click(at,accent){                       // metronome tick
  var ac=audio(); if(!ac) return;
  try{
    var t=ac.currentTime+(at||0)+0.002,o=ac.createOscillator(),g=ac.createGain();
    o.type="triangle"; o.frequency.value=accent?1560:1040;
    g.gain.setValueAtTime(accent?0.22:0.13,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
    o.connect(g); g.connect(AU.out); o.start(t); o.stop(t+0.08);
  }catch(e){}
}
function fanfare(){ [[72,0,.16],[76,.14,.16],[79,.28,.16],[84,.42,.5],[72,.42,.9],[76,.42,.9],[79,.42,.9],[88,.72,.7]].forEach(function(n){tone(n[0],{at:n[1],dur:n[2]+0.25,vel:0.34,app:true})}) }
function ding(){ tone(88,{dur:0.25,vel:0.3,app:true}); tone(93,{at:0.09,dur:0.3,vel:0.3,app:true}) }
function silence(){ AU.voices.slice().forEach(function(v){v.stop(0)}) }

// ───────────────────────── 6. Hearing a note (McLeod pitch method) ─────────────────────────
/* buf: about 2048 samples of sound. Returns {rms, freq, clarity}. clarity near 1 means one clear steady note. */
function detectPitch(buf,sr){
  var n=buf.length,i,t,rms=0;
  for(i=0;i<n;i++) rms+=buf[i]*buf[i];
  rms=Math.sqrt(rms/n);
  if(rms<0.008) return {rms:rms,freq:0,clarity:0};
  var maxLag=Math.min(n>>1,Math.floor(sr/65)), nsdf=new Float32Array(maxLag+2);
  for(t=0;t<=maxLag+1;t++){                       // normalised square difference: 1 = the wave repeats exactly after t samples
    var acf=0,m=0;
    for(i=0;i<n-t;i++){var a=buf[i],b=buf[i+t];acf+=a*b;m+=a*a+b*b}
    nsdf[t]=m>0?2*acf/m:0;
  }
  t=1; while(t<maxLag&&nsdf[t]>0) t++;            // skip the hill around zero lag
  var peaks=[],best=0,bi=0,hi=0;
  for(;t<=maxLag;t++){
    if(nsdf[t]>0){ if(nsdf[t]>best){best=nsdf[t];bi=t} }
    else if(best>0){peaks.push(bi);if(best>hi)hi=best;best=0}
  }
  if(best>0&&bi<maxLag){peaks.push(bi);if(best>hi)hi=best}
  for(i=0;i<peaks.length;i++) if(nsdf[peaks[i]]>=hi*0.9) break;    // the first tall hill is the true pitch (not an octave below)
  if(i>=peaks.length) return {rms:rms,freq:0,clarity:0};
  var p=peaks[i],y0=nsdf[p-1],y1=nsdf[p],y2=nsdf[p+1],d=y0-2*y1+y2,shift=d?0.5*(y0-y2)/d:0;
  return {rms:rms,freq:sr/(p+shift),clarity:y1};
}

// ───────────────────────── 7. Drawing staves and sheet music (inline SVG) ─────────────────────────
/* Treble clef drawn as a path for a staff whose lines are 10 apart with the top line at y=0. No font needed. */
var CLEF="M14 31C11.4 31 10.4 28 12 26.2C14 23.8 18.4 24.6 19.8 28.2C21.4 32.4 18.6 37.6 13.4 38C7.6 38.4 3.8 33.6 4.8 27.8C5.8 22.2 10.8 18.4 14.6 13.8C18.2 9.4 20.6 3.6 18.8-2.2C17.8-5.6 15-6 13.6-3C11.8 1 12.2 7.6 13.2 13.6L17.4 41.6C18.2 47.2 14.8 50.4 11.2 49.4";
var SHARP="M-2.2-7.5V7.5M2.2-8.5V6.5M-4.8-1.4L4.8-3.8M-4.8 4.2L4.8 1.8", FLAT="M-2.8-11V5C1.2 3.2 4.6.6 2.8-2.4C1.4-4.4-1.6-3.4-2.8-1.2";
function clefSvg(x,yTop,gap){ var s=gap/10; return '<g class="pn-clef" transform="translate('+x+' '+yTop+') scale('+s+')"><path d="'+CLEF+'"/><circle cx="10.4" cy="47" r="2.7"/></g>' }
function fx(v){return Math.round(v*10)/10}
function staffLines(x1,x2,yTop,gap){ var d="";for(var i=0;i<5;i++)d+="M"+x1+" "+(yTop+i*gap)+"H"+x2;return '<path class="pn-sl" d="'+d+'"/>' }
function ledgerPath(step,x,half,yOf){              // short lines for notes above or below the five staff lines
  var d="",s;
  for(s=0;s>=step;s-=2) d+="M"+fx(x-half)+" "+fx(yOf(s))+"h"+fx(half*2);
  for(s=12;s<=step;s+=2) d+="M"+fx(x-half)+" "+fx(yOf(s))+"h"+fx(half*2);
  return d?'<path class="pn-sl" d="'+d+'"/>':"";
}
/* The tiny staff printed on every white key. Notes far outside the treble staff are shown in the nearest octave. */
function miniStaff(midi){
  var st=info(midi).step; while(st<0) st+=7; while(st>14) st-=7;
  var yOf=function(s){return 28-(s-2)*2}, y=yOf(st);
  return '<svg class="pn-ms" viewBox="0 0 40 37" aria-hidden="true">'+staffLines(4,36,12,4)+ledgerPath(st,20,6.5,yOf)+
    '<ellipse class="pn-sh" cx="20" cy="'+y+'" rx="3.7" ry="2.7" transform="rotate(-18 20 '+y+')"/></svg>';
}
/* The big "now playing" staff: clef, one large note in its colour, sharp or flat sign. */
function bigStaff(midi,color,flat){
  var g=9,yTop=31,h='<svg class="pn-bs" viewBox="0 0 118 100" aria-hidden="true">'+staffLines(3,115,yTop,g)+clefSvg(6,yTop,g);
  if(midi!=null){
    var n=info(midi,flat),st=n.step,shift=0; while(st<-3){st+=7;shift--} while(st>16){st-=7;shift++}
    var yOf=function(s){return yTop+4*g-(s-2)*g/2},y=yOf(st),x=76;
    h+=ledgerPath(st,x,13,yOf);
    if(n.acc) h+='<path class="pn-acc" transform="translate('+(x-19)+' '+y+') scale(1.15)" d="'+(n.acc>0?SHARP:FLAT)+'"/>';
    h+='<ellipse class="pn-bh" cx="'+x+'" cy="'+y+'" rx="8.6" ry="6.2" transform="rotate(-20 '+x+' '+y+')" style="fill:'+color+'"/>';
    h+='<path class="pn-stem" d="M'+(st<6?x+8:x-8)+" "+y+"v"+(st<6?-30:30)+'"/>';
    if(shift) h+='<text class="pn-8va" x="108" y="'+(shift>0?12:97)+'" text-anchor="end">'+(shift>0?"higher":"lower")+"</text>";
  }
  return h+"</svg>";
}
/* Note value for drawing: base = 4 whole, 2 half (hollow), 1 quarter, 0.5 one flag, 0.25 two flags; dotted if half as long again. */
function noteShape(beats){
  var base=beats>=4?4:beats>=2?2:beats>=1?1:beats>=0.5?0.5:0.25;
  return {base:base,dot:beats>=base*1.45&&beats<base*2?1:0,extra:beats>=6};
}
/* Draw a whole song as wrapped lines of beginner sheet music.
   opt: {width, compact (one short line at a time), labels, color(midi), paper}. Returns {lineH, lines, starts:[line of each note]}. */
function renderSheet(box,notes,bars,bpb,opt){
  var G=10,W=Math.max(220,Math.round(opt.width)),clefW=40,padR=10,i,k;
  var two=opt.labels==="all"&&!opt.compact, show=opt.labels!=="none";
  var isBar={}; (bars||[]).forEach(function(b){isBar[b]=1});
  if(!bars||bars.length<2){                          // no bar lines typed: count them out
    var acc=0; isBar={0:1};
    for(i=0;i<notes.length;i++){ if(acc>=bpb-0.001){isBar[i]=1;acc=0} acc+=notes[i].beats }
  }
  var wOf=function(n){return (n.midi==null?22:26)+13*Math.min(n.beats,4)+(n.midi!=null&&BLACK[n.midi%12]?10:0)};
  var groups=[],cur=null;                            // bars are kept whole on a line when they fit
  for(i=0;i<notes.length;i++){ if(isBar[i]||!cur){cur={from:i,to:i,w:8};groups.push(cur)} cur.to=i+1;cur.w+=wOf(notes[i]) }
  var avail=W-clefW-padR,lines=[],line=null;
  groups.forEach(function(g){
    if(g.w>avail*1.3){                               // one very long bar: split it between notes
      var part=null;
      for(var j=g.from;j<g.to;j++){ var w=wOf(notes[j]); if(!part||part.w+w>avail*1.15){part={from:j,to:j,w:0,bars:[]};lines.push(part)} part.to=j+1;part.w+=w }
      line=null;return;
    }
    if(!line||line.w+g.w>avail*1.3){line={from:g.from,to:g.to,w:0,bars:[]};lines.push(line)}
    else line.bars.push(g.from);
    line.to=g.to;line.w+=g.w;
  });
  var steps=notes.filter(function(n){return n.midi!=null}).map(function(n){return info(n.midi,n.flat).step});
  var maxS=Math.max.apply(null,[10].concat(steps)),minS=Math.min.apply(null,[2].concat(steps));
  var yTop=Math.max(22,(maxS-10)*5+20),yBot=yTop+4*G,yOf=function(s){return yBot-(s-2)*G/2};
  var nameY=yBot+Math.max(24,(2-minS)*5+22),H=nameY+(show?(two?17:6):-8);
  var html="",starts=[];
  lines.forEach(function(ln,li){
    var sc=avail/ln.w; if(li===lines.length-1&&sc>1.3) sc=1.3; if(lines.length===1&&sc>1.6) sc=1.6;
    var x=clefW,h='<svg class="pn-line" data-line="'+li+'" viewBox="0 0 '+W+" "+H+'" width="'+W+'" height="'+H+'">'+staffLines(2,W-2,yTop,G)+clefSvg(6,yTop,G);
    for(i=ln.from;i<ln.to;i++){
      var n=notes[i],w=wOf(n)*sc; starts[i]=li;
      if(ln.bars.indexOf(i)>=0){ h+='<path class="pn-bl" d="M'+fx(x+2)+" "+yTop+"V"+yBot+'"/>'; x+=8*sc }
      var cx=fx(x+w/2+(n.midi!=null&&BLACK[n.midi%12]?5:0)),sh=noteShape(n.beats),g='<g class="pn-n'+(n.midi==null?" pn-rest":"")+'" data-i="'+i+'"';
      if(n.midi==null){
        var ym=yTop+2*G; g+=">";
        if(sh.base>=4) g+='<rect class="pn-ink" x="'+(cx-7)+'" y="'+(yTop+G)+'" width="14" height="5.5"/>';
        else if(sh.base>=2) g+='<rect class="pn-ink" x="'+(cx-7)+'" y="'+(ym-5.5)+'" width="14" height="5.5"/>';
        else if(sh.base>=1) g+='<path class="pn-rq" d="M'+(cx-3)+" "+(ym-13)+"l6.5 8-5.5 6 6 8c-6-3-10 1-4.5 6"+'"/>';
        else g+='<circle class="pn-ink" cx="'+(cx-3)+'" cy="'+(ym-4)+'" r="2.6"/><path class="pn-rq" d="M'+(cx-1.5)+" "+(ym-4.5)+"q4 .5 5.5-1.5l-5 15"+'"/>';
        if(sh.dot) g+='<circle class="pn-ink" cx="'+(cx+10)+'" cy="'+(ym-5)+'" r="2"/>';
      }else{
        var nf=info(n.midi,n.flat),y=yOf(nf.step),up=nf.step<6,col=opt.color(n.midi),sx=up?cx+5.9:cx-5.9;
        g+=' style="--c:'+col+'">'+'<path class="pn-mark" d="M'+(cx-6)+" 2h12l-6 9z"+'"/><circle class="pn-ring" cx="'+cx+'" cy="'+y+'" r="12.5"/>'+ledgerPath(nf.step,cx,11,yOf);
        if(nf.acc) g+='<path class="pn-acc" transform="translate('+fx(cx-15)+" "+y+')" d="'+(nf.acc>0?SHARP:FLAT)+'"/>';
        if(sh.base<4) g+='<path class="pn-stem" d="M'+fx(sx)+" "+y+"v"+(up?-28:28)+'"/>';
        if(sh.base<1) for(k=0;k<(sh.base<0.5?2:1);k++) g+='<path class="pn-flag" d="M'+fx(sx)+" "+(up?y-28+k*7:y+28-k*7)+(up?"c1.5 7 9 8 6.5 17":"c1.5-7 9-8 6.5-17")+'"/>';
        g+='<g class="pn-hd"><ellipse class="pn-head" cx="'+cx+'" cy="'+y+'" rx="6.6" ry="4.9" transform="rotate(-20 '+cx+" "+y+')"/>';
        if(sh.base>=2) g+='<ellipse class="pn-hole" cx="'+cx+'" cy="'+y+'" rx="4" ry="2.1" transform="rotate(-20 '+cx+" "+y+')"/>';
        g+="</g>";
        if(sh.dot) g+='<circle class="pn-ink" cx="'+fx(cx+11)+'" cy="'+(nf.step%2?y:y-5)+'" r="2"/>';
        if(show) g+='<text class="pn-nt" x="'+cx+'" y="'+nameY+'" text-anchor="middle">'+(opt.labels==="doremi"?nf.s:nf.l)+"</text>";
        if(two) g+='<text class="pn-ns" x="'+cx+'" y="'+(nameY+12)+'" text-anchor="middle">'+nf.s+"</text>";
      }
      h+=g+'<rect class="pn-hit" x="'+fx(x)+'" y="0" width="'+fx(w)+'" height="'+H+'"/></g>';
      x+=w;
    }
    var end=li===lines.length-1?fx(Math.min(x+4,W-3)):W-2;
    h+='<path class="pn-bl" d="M'+end+" "+yTop+"V"+yBot+(li===lines.length-1?"M"+(end-4)+" "+yTop+"V"+yBot:"")+'"/>';
    html+=h+"</svg>";
  });
  box.innerHTML=html;
  return {lineH:H,lines:lines.length,starts:starts};
}

// ───────────────────────── 8. The page ─────────────────────────
var UI=null;                                     // everything that belongs to one mount(); null when not mounted
var ST={mode:"learn",speed:"medium",labels:"all",keys:"",size:"big",pal:"day"};   // the player's choices (kept with HH.pref)
var CHOICES={
  mode:[["listen","Listen"],["learn","Learn"],["time","Play in time","In time"],["free","Free play","Free"]],
  speed:[["slow","Slow"],["medium","Medium"],["full","Full speed","Full"]],
  labels:[["all","All"],["abc","C D E"],["doremi","Do Re Mi"],["none","None"]],
  keys:[["13","1 octave","1 oct"],["25","2 octaves","2 oct"],["37","3 octaves","3 oct"],["61","61 keys","61"],["88","88 keys","88"]],
  size:[["big","Big"],["bigger","Bigger"]],
  pal:[["song","Each song"],["day","Each day"],["week","Each week"]]
};
var PREF={mode:"pianoMode",speed:"pianoSpeed",labels:"pianoLabels",keys:"pianoKeys",size:"pianoSize",pal:"pianoPal"};
var CYCLE_WORD={speed:"Speed",labels:"Names",keys:"Keys"};
var IC={
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
  stop:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
  again:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4 4v4.5h4.5"/></svg>',
  mic:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  full:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  x:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5.5l10-2v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="6.5" cy="17.5" rx="3.1" ry="2.5" fill="currentColor"/><ellipse cx="16.5" cy="15.5" rx="3.1" ry="2.5" fill="currentColor"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l3 6.1 6.7 1-4.9 4.7 1.2 6.7L12 17.7l-6 3.2 1.2-6.7L2.3 9.5l6.7-1z"/></svg>',
  yt:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="currentColor"/><path d="M10 9v6l5.2-3z" fill="#fff"/></svg>'
};
function esc(t){ try{return HH.esc(t)}catch(e){ return String(t==null?"":t).replace(/[&<>"']/g,function(c){return "&#"+c.charCodeAt(0)+";"}) } }
function pref(k,v){
  try{ if(arguments.length>1){HH.pref(k,String(v));return v} var r=HH.pref(k); return r==null?"":String(r) }catch(e){return ""}
}
function toast(m){ try{HH.toast(m)}catch(e){} }
function label(k,v,short){ var c=(CHOICES[k]||[]).filter(function(o){return o[0]===v})[0]; return c?(short&&c[2])||c[1]:"" }
function segHtml(k,short,cls){
  return '<div class="seg '+(cls||"")+'" role="group">'+CHOICES[k].map(function(o){
    return '<button type="button" data-pn="set" data-k="'+k+'" data-v="'+o[0]+'">'+(short&&o[2]||o[1])+"</button>" }).join("")+"</div>";
}
function pageHtml(){
  var cyc=function(k){return '<button type="button" class="pn-bb" data-pn="cycle" data-k="'+k+'"></button>'};
  return ''+
  /* slim top bar: only in the piano-only view */
  '<div class="pn-bar"><button type="button" class="pn-bb pn-exit" data-pn="exit" aria-label="Exit piano only view">'+IC.x+'<span>Exit</span></button><button type="button" class="pn-bb pn-play" data-pn="play"></button>'+
    '<div class="pn-barmid"><button type="button" class="pn-bb pn-bsong" data-pn="pick" aria-label="Choose a song">'+IC.note+'<span class="pn-title"></span></button>'+segHtml("mode",true,"pn-bseg")+cyc("speed")+cyc("labels")+cyc("keys")+'</div>'+
    '<div class="pn-micslot pn-barmic"></div></div>'+
  /* normal page: song, mode, play */
  '<div class="pn-stage"><div class="pn-row"><button type="button" class="pn-songbtn" data-pn="pick" aria-label="Choose a song">'+IC.note+
      '<span class="grow"><b class="pn-title"></b><small class="pn-songmeta"></small></span><i aria-hidden="true">▾</i></button>'+
    '<button type="button" class="pn-sq" data-pn="mic" aria-label="Use a real piano (microphone)">'+IC.mic+'<span>Mic</span></button>'+
    '<button type="button" class="pn-sq" data-pn="focus" aria-label="Piano only, full screen">'+IC.full+'<span>Piano only</span></button></div>'+
    segHtml("mode",false,"pn-modeseg")+
    '<div class="pn-row"><button type="button" class="primary pn-play pn-playbig" data-pn="play"></button>'+segHtml("speed",false,"pn-speedseg grow")+'</div></div>'+
  '<div class="pn-micslot pn-microw"></div>'+
  /* follow-along: sheet music (or the game), the big "now" note, feedback */
  '<div class="pn-follow"><div class="pn-sheetbox"><div class="pn-sheet"></div><div class="pn-game"></div></div>'+
    '<div class="pn-now"><div class="pn-nowstaff"></div><div class="pn-nowname"><b></b><span></span></div></div>'+
    '<div class="pn-side"><div class="pn-fbrow"><i class="pn-beat"></i><div class="pn-fb" aria-live="polite"></div></div><div class="pn-hold"></div></div></div>'+
  /* keyboard: falling bars, name strip, keys, then the mini strip for moving about */
  '<div class="pn-kb"><div class="pn-scroll"><div class="pn-fall"><div class="pn-track"></div></div><div class="pn-names"></div><div class="pn-keys"></div></div>'+
    '<button type="button" class="pn-arrow pn-al" data-pn="left" aria-label="Lower keys">‹</button><button type="button" class="pn-arrow pn-ar" data-pn="right" aria-label="Higher keys">›</button>'+
    '<div class="pn-mini" aria-hidden="true"><div class="pn-minitrack"></div><div class="pn-miniview"></div></div></div>'+
  '<div class="pn-hint" hidden><span>No sound? Turn off silent mode and turn the volume up.</span><button type="button" class="link" data-pn="hintok">OK</button></div>'+
  /* below the piano: lesson link, settings, songs */
  '<div class="pn-below"><a class="pn-yt ghost" target="_blank" rel="noopener">'+IC.yt+'<span>Watch a lesson on YouTube</span></a>'+
    '<div class="card pn-set"><div class="pn-setrow"><div class="label">How many keys</div>'+segHtml("keys")+'</div>'+
      '<div class="pn-two"><div class="pn-setrow"><div class="label">Key size</div>'+segHtml("size")+'</div>'+
      '<div class="pn-setrow"><div class="label">Names on the keys</div>'+segHtml("labels")+'</div></div>'+
      '<div class="pn-setrow"><div class="label">New colours</div>'+segHtml("pal")+'<div class="pn-pals"></div><div class="pn-legend"></div></div>'+
      '<button type="button" class="ghost pn-micwide" data-pn="mic">'+IC.mic+'<span>Use a real piano (microphone)</span></button>'+
      '<div class="sub">Play a real piano or keyboard, or sing. The app listens and follows you.</div></div>'+
    '<div class="card pn-songs">'+songsUi(true)+'</div></div>'+
  '<div class="pn-count" hidden></div><div class="pn-over" hidden></div>';
}
function loadChoices(){
  Object.keys(PREF).forEach(function(k){
    var v=pref(PREF[k]),ok=CHOICES[k].some(function(o){return o[0]===v})||(k==="pal"&&/^fix:\d$/.test(v));
    if(ok) ST[k]=v; else ST[k]={mode:"learn",speed:"medium",labels:"all",keys:"",size:"big",pal:"day"}[k];
  });
}
function $(sel){return UI.root.querySelector(sel)}
function $$(sel){return Array.prototype.slice.call(UI.root.querySelectorAll(sel))}
/* Show the current choices on every control (no re-rendering). */
function syncControls(){
  var keysShown=ST.keys||String(K.autoKeys||25);
  $$("[data-pn=set]").forEach(function(b){ var k=b.dataset.k; b.classList.toggle("on",(k==="keys"?keysShown:ST[k])===b.dataset.v) });
  $$("[data-pn=cycle]").forEach(function(b){ var k=b.dataset.k; b.innerHTML="<small>"+CYCLE_WORD[k]+"</small>"+label(k,k==="keys"?keysShown:ST[k],true) });
  $$("[data-pn=pal]").forEach(function(b){ b.classList.toggle("on",ST.pal==="fix:"+b.dataset.v) });
  var run=L.run, m=L.mode, txt=m==="listen"?(run?"Stop":"Play"):m==="time"?(run?"Stop":"Start"):m==="learn"?"Start again":(GAME.on?"Stop game":"Find the note");
  var ic=run||(m==="free"&&GAME.on)?IC.stop:m==="learn"?IC.again:IC.play;
  $$(".pn-play").forEach(function(b){ b.innerHTML=ic+"<span>"+(txt==="Start again"&&b.classList.contains("pn-bb")?"Restart":txt)+"</span>"; b.classList.toggle("pn-stopping",run||(m==="free"&&GAME.on)) });
  var r=UI.root; r.className=r.className.replace(/\bpn-(m|lab|size)-\w+/g,"").trim()+" pn-m-"+m+" pn-lab-"+ST.labels+" pn-size-"+ST.size;
  r.classList.toggle("pn-running",run);
}
function setChoice(k,v){
  if(k==="keys"&&v===(ST.keys||String(K.autoKeys))&&ST.keys) return;
  ST[k]=v; pref(PREF[k],v);
  if(k==="mode") setMode(v);
  else if(k==="speed"){ if(L.run&&L.mode==="time") stopRun(); buildFalls(); if(L.mode==="learn"&&!L.hold) learnArm() }
  else if(k==="labels"){ syncControls(); drawSheet(); showNow(NOW.midi,NOW.flat) }
  else if(k==="keys"||k==="size"){ buildKeys(); drawSheet(); buildFalls() }
  else if(k==="pal") applyPalette();
  syncControls();
}
function act(name,b,e){
  if(name==="set") setChoice(b.dataset.k,b.dataset.v);
  else if(name==="cycle"){ var k=b.dataset.k,cur=k==="keys"?(ST.keys||String(K.autoKeys)):ST[k],o=CHOICES[k],i=0; while(i<o.length&&o[i][0]!==cur) i++; setChoice(k,o[(i+1)%o.length][0]) }
  else if(name==="pal") setChoice("pal","fix:"+b.dataset.v);
  else if(name==="play") playButton();
  else if(name==="pick") openPicker();
  else if(name==="focus"){ UI.manual=true; UI.dismissed=false; syncFocus() }
  else if(name==="exit"){ UI.manual=false; if(UI.mq.matches) UI.dismissed=true; syncFocus() }
  else if(name==="left"||name==="right") scrollKeys(UI.scroll.scrollLeft+(name==="left"?-1:1)*UI.scroll.clientWidth*0.6);
  else if(name==="hintok") $(".pn-hint").hidden=true;
  else if(name==="mic") micButton();
  else if(name==="micgo"){ closeOver(); pref("pianoMicOk","1"); micStart() }
  else if(name==="micstop") micStop();
  else if(name==="close"){ var wasParty=UI.over.classList.contains("pn-cele"); closeOver(); if(wasParty&&L.mode!=="free") resetLesson() }   // Done: back to the start of the song
  else if(name==="again"){ closeOver(); if(L.mode==="time") startTime(); else resetLesson() }
  else if(name==="next"){ closeOver(); nextSong() }
  else if(name==="game") gameToggle();
  else songsAct(name,b,e);
}

// ───────────────────────── 9. The keyboard ─────────────────────────
var K={lo:60,hi:84,white:[],el:{},nm:{},x:{},w:48,bh:0.6,autoKeys:25};
var PAL=PALETTES[0], PTR={}, HELD={}, VOICE={}, NOW={midi:null,flat:false};
function colorOf(midi){return PAL.c[info(midi).li]}
/* Which keys to show: the player's choice, widened when the song needs notes outside it (to the C or F below, the C, E or B above). */
function keyRange(){
  var table={"13":[60,72],"25":[60,84],"37":[48,84],"61":[36,96],"88":[21,108]},k=ST.keys;
  if(!table[k]){                                   // no choice made yet: two octaves, or one on a small sideways phone when the song fits
    k="25"; var cw=UI.scroll.clientWidth||UI.root.clientWidth||360;
    if(UI.focus&&UI.short&&cw/15<44&&(L.lo==null||(L.lo>=60&&L.hi<=72))) k="13";
  }
  K.autoKeys=+k;
  var lo=table[k][0],hi=table[k][1];
  if(L.lo!=null&&L.mode!=="free"){
    while(lo>21&&(lo>L.lo||[0,5].indexOf(lo%12)<0)) lo--;
    while(hi<108&&(hi<L.hi||[0,4,11].indexOf(hi%12)<0)) hi++;
  }
  return [Math.max(lo,21),Math.min(hi,108)];
}
function buildKeys(){
  var r=keyRange(),m,n,hw="",hb="",hn="",hm="";
  K.lo=r[0];K.hi=r[1];K.white=[];K.el={};K.nm={};K.x={};PTR={};HELD={};
  for(m=K.lo;m<=K.hi;m++){
    n=info(m);
    if(!n.black){
      K.white.push(m);
      hw+='<div class="pn-key pn-w'+(m===60?" pn-mc":"")+'" data-m="'+m+'"><div class="pn-kl">'+(m===60?'<i class="pn-mcdot" title="Middle C">★</i>':"")+miniStaff(m)+
        "<b>"+n.l+(n.li===0?"<sub>"+n.oct+"</sub>":"")+"</b><span>"+n.s+"</span></div></div>";
      hn+='<div class="pn-nm" data-m="'+m+'"><b>'+n.l+"</b><span>"+n.s+"</span></div>";
      hm+='<i data-m="'+m+'"></i>';
    }else{
      var f=info(m,true);
      hb+='<div class="pn-key pn-b" data-m="'+m+'"><div class="pn-btag"><b>'+n.l+"</b><b>"+f.l+"</b><span>"+n.s+"</span><span>"+f.s+"</span></div></div>";
    }
  }
  UI.keys.innerHTML=hw+hb; UI.names.innerHTML=hn; UI.minitrack.innerHTML=hm;
  Array.prototype.forEach.call(UI.keys.children,function(el){K.el[+el.dataset.m]=el});
  Array.prototype.forEach.call(UI.names.children,function(el){K.nm[+el.dataset.m]=el});
  layoutKeys(); paintKeys(); relight();
}
/* Sizes and positions only (used again when the screen turns or changes size). */
function layoutKeys(){
  var cw=UI.scroll.clientWidth||360,n=K.white.length,bigger=ST.size==="bigger";
  var minW=UI.focus?(bigger?56:44):(bigger?58:46), w=cw/n>=minW?Math.min(cw/n,bigger?110:92):minW, total=Math.round(w*n), bw=Math.round(w*0.6);
  K.w=w; K.bh=UI.focus&&UI.short?0.55:0.6;
  [UI.keys,UI.names,UI.fall].forEach(function(el){el.style.width=total+"px"});
  UI.keys.style.setProperty("--kw",w+"px"); UI.keys.style.setProperty("--bh",(K.bh*100)+"%"); UI.names.style.setProperty("--kw",w+"px");
  K.white.forEach(function(m,i){
    var s=K.el[m].style,x=fx(i*w); s.left=x+"px"; s.width=fx(w)+"px"; K.x[m]={x:i*w,w:w};
    s=K.nm[m].style; s.left=x+"px"; s.width=fx(w)+"px";
    if(K.el[m+1]&&BLACK[(m+1)%12]){ s=K.el[m+1].style; s.left=fx((i+1)*w-bw/2)+"px"; s.width=bw+"px"; K.x[m+1]={x:(i+1)*w-bw/2,w:bw,black:true} }
  });
  UI.root.classList.toggle("pn-scrolls",total>cw+1);
  updateMini();
}
function paintKeys(){
  Object.keys(K.el).forEach(function(m){ var c=colorOf(+m),el=K.el[m]; el.style.setProperty("--c",c); el.style.setProperty("--ct",inkOn(c)); if(K.nm[m]){K.nm[m].style.setProperty("--c",c);K.nm[m].style.setProperty("--ct",inkOn(c))} });
  Array.prototype.forEach.call(UI.minitrack.children,function(i){i.style.background=colorOf(+i.dataset.m)});
}
function applyPalette(){
  var idx=pickPalette(ST.pal,L.key); PAL=PALETTES[idx];
  paintKeys();
  $(".pn-legend").innerHTML=PAL.c.map(function(c,i){return '<span style="background:'+c+";color:"+inkOn(c)+'"><b>'+LETTERS[i]+"</b>"+SOLFA[i]+"</span>"}).join("")+'<em>★ is middle C</em>';
  $(".pn-pals").innerHTML='<span class="sub">or always:</span>'+PALETTES.map(function(p,i){
    return '<button type="button" data-pn="pal" data-v="'+i+'" aria-label="'+p.name+' colours" title="'+p.name+'"'+(ST.pal==="fix:"+i?' class="on"':"")+">"+p.c.map(function(c){return '<i style="background:'+c+'"></i>'}).join("")+"</button>" }).join("");
  drawSheet(); buildFalls(); showNow(NOW.midi,NOW.flat);
}
/* Which key is under a finger. Black keys cover the top part of the keyboard. */
function keyAt(cx,cy){
  var r=UI.keys.getBoundingClientRect(),x=cx-r.left,y=cy-r.top,w=K.w;
  if(x<0||y<0||x>=r.width||y>r.height) return null;
  if(y<r.height*K.bh){
    var edge=Math.round(x/w),lower=K.white[edge-1];
    if(lower!=null&&Math.abs(x-edge*w)<=w*0.3&&K.el[lower+1]&&BLACK[(lower+1)%12]) return lower+1;
  }
  return K.white[clamp(Math.floor(x/w),0,K.white.length-1)];
}
function press(m,src){
  audio();
  if(VOICE[m]) VOICE[m].stop(0);
  VOICE[m]=tone(m,{vel:0.55});
  if(MIC.on) appSoundUntil=Math.max(appSoundUntil,now()+900);     // do not count our own speaker as the child's playing
  HELD[m]=(HELD[m]||0)+1;
  if(K.el[m]) K.el[m].classList.add("pn-down");
  if(!UI.hinted){ UI.hinted=true; if(pref("pianoHint")!=="1"){ pref("pianoHint","1"); $(".pn-hint").hidden=false; setTimeout(function(){ if(UI) $(".pn-hint").hidden=true },12000) } }
  onNote(m,src||"touch");
}
function release(m){
  HELD[m]=Math.max(0,(HELD[m]||0)-1);
  if(HELD[m]) return;
  if(K.el[m]) K.el[m].classList.remove("pn-down");
  if(VOICE[m]){VOICE[m].stop(0);VOICE[m]=null}
  onNoteUp(m);
}
function releaseAll(){ Object.keys(HELD).forEach(function(m){ if(HELD[m]){HELD[m]=1;release(+m)} }); PTR={} }
function bindKeys(){
  var kd=UI.keys;
  on(kd,"pointerdown",function(e){
    if(e.pointerType==="mouse"&&e.button!==0) return;
    var m=keyAt(e.clientX,e.clientY); if(m==null) return;
    e.preventDefault(); try{kd.setPointerCapture(e.pointerId)}catch(x){}
    PTR[e.pointerId]=m; press(m);
  });
  on(kd,"pointermove",function(e){                 // sliding a finger across the keys plays each one
    if(!(e.pointerId in PTR)) return;
    var m=keyAt(e.clientX,e.clientY),old=PTR[e.pointerId];
    if(m===old) return;
    if(old!=null) release(old);
    PTR[e.pointerId]=m; if(m!=null) press(m);
  });
  var up=function(e){ if(!(e.pointerId in PTR)) return; var m=PTR[e.pointerId]; delete PTR[e.pointerId]; if(m!=null) release(m) };
  on(kd,"pointerup",up); on(kd,"pointercancel",up); on(kd,"lostpointercapture",up);
  // A long press, a double tap or a second finger must never select text, open the iPhone bubble or zoom.
  var stop=function(e){e.preventDefault()};
  on(kd,"touchstart",stop,{passive:false}); on(kd,"touchmove",stop,{passive:false}); on(kd,"touchend",stop,{passive:false});
  var sheetStop=function(e){ if(UI.focus||(e.touches&&e.touches.length>1)) e.preventDefault() };
  on(UI.sheetbox,"touchstart",sheetStop,{passive:false}); on(UI.sheetbox,"touchmove",sheetStop,{passive:false});
  ["contextmenu","selectstart","dragstart"].forEach(function(t){ on(UI.root,t,function(e){ if(!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||"")) e.preventDefault() }) });
  on(UI.root,"touchmove",function(e){             // piano-only view: nothing scrolls up or down
    if(UI.focus&&!(e.target.closest&&e.target.closest(".pn-barmid,.pn-names,.pn-pop"))) e.preventDefault();
  },{passive:false});
  on(UI.root,"gesturestart",stop,{passive:false});
  // moving along a long keyboard
  on(UI.scroll,"scroll",function(){ if(!UI.miniRaf) UI.miniRaf=requestAnimationFrame(function(){ if(UI){UI.miniRaf=0;updateMini()} }) },{passive:true});
  var mini=UI.mini,drag=function(e){ var r=mini.getBoundingClientRect(),sc=UI.scroll; sc.scrollLeft=(e.clientX-r.left)/r.width*sc.scrollWidth-sc.clientWidth/2 };
  on(mini,"pointerdown",function(e){ e.preventDefault(); UI.miniDrag=true; try{mini.setPointerCapture(e.pointerId)}catch(x){} drag(e) });
  on(mini,"pointermove",function(e){ if(UI.miniDrag) drag(e) });
  on(mini,"pointerup",function(){UI.miniDrag=false}); on(mini,"pointercancel",function(){UI.miniDrag=false});
  // a computer keyboard plays too: A S D F G H J K are the white keys from middle C, W E T Y U the black ones
  var map="awsedftgyhujkolp;",code=function(e){ var i=map.indexOf((e.key||"").toLowerCase()); return i<0||e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||"")?null:60+i };
  on(document,"keydown",function(e){ var m=code(e); if(m==null||e.repeat||!K.el[m]||HELD["k"+m]) return; HELD["k"+m]=1; press(m) });
  on(document,"keyup",function(e){ var m=code(e); if(m==null||!HELD["k"+m]) return; HELD["k"+m]=0; release(m) });
}
function scrollKeys(left,instant){
  var sc=UI.scroll; left=clamp(left,0,Math.max(0,sc.scrollWidth-sc.clientWidth));
  if(sc.scrollTo&&!instant&&!UI.calm) sc.scrollTo({left:left,behavior:"smooth"}); else sc.scrollLeft=left;
}
/* Keep the lit key in view on a keyboard that is wider than the screen. */
function follow(m,instant){
  var p=K.x[m],sc=UI.scroll; if(!p) return;
  var vw=sc.clientWidth,left=sc.scrollLeft,pad=Math.min(K.w*1.3,vw*0.22);
  if(p.x<left+pad||p.x+p.w>left+vw-pad) scrollKeys(p.x+p.w/2-vw/2,instant);
}
function updateMini(){
  var sc=UI.scroll,sw=sc.scrollWidth||1,v=UI.miniview.style;
  v.left=(sc.scrollLeft/sw*100)+"%"; v.width=Math.min(100,sc.clientWidth/sw*100)+"%";
  UI.root.classList.toggle("pn-canl",sc.scrollLeft>2); UI.root.classList.toggle("pn-canr",sc.scrollLeft<sw-sc.clientWidth-2);
}
/* On the normal page, make sure the whole keyboard is above the tab bar before a song starts. */
function showKeys(){
  if(!UI||UI.focus) return;
  var r=$(".pn-kb").getBoundingClientRect(),tabs=document.querySelector("nav.tabs"),limit=(tabs?tabs.getBoundingClientRect().top:window.innerHeight)-6;
  if(r.bottom>limit){ try{window.scrollBy({top:r.bottom-limit,behavior:UI.calm?"auto":"smooth"})}catch(e){window.scrollBy(0,r.bottom-limit)} }
}
function light(m){
  if(L.lit===m) return;
  unlight(); L.lit=m;
  if(K.el[m]){ K.el[m].classList.add("pn-lit"); if(K.nm[m]) K.nm[m].classList.add("pn-lit"); follow(m) }
}
function unlight(){ if(L.lit!=null&&K.el[L.lit]){ K.el[L.lit].classList.remove("pn-lit"); if(K.nm[L.lit]) K.nm[L.lit].classList.remove("pn-lit") } L.lit=null }
function relight(){ var m=L.lit; L.lit=null; if(m!=null) light(m) }
function flash(m,cls,ms){ var el=K.el[m]; if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(function(){el.classList.remove(cls)},ms||420) }
/* The big staff above the keys: the pressed note, or the note that comes next. */
function showNow(midi,flat,hideName){
  NOW.midi=midi;NOW.flat=!!flat;
  if(!UI) return;
  UI.nowstaff.innerHTML=bigStaff(midi,midi==null?"#888":colorOf(midi),flat);
  var b=UI.nowname.firstChild,s=UI.nowname.lastChild;
  if(midi==null||hideName){ b.textContent=midi==null?"":"?"; s.textContent=""; b.style.background=""; b.style.color=""; return }
  var n=info(midi,flat),c=colorOf(midi),both=n.black?info(midi,!flat):null;
  b.textContent=ST.labels==="doremi"?n.s:n.l; b.style.background=c; b.style.color=inkOn(c);
  s.textContent=ST.labels==="none"?"":(ST.labels==="doremi"?n.l:n.s)+(both?" (also "+both.l+")":"")+(midi===60?" · middle C":"");
}
function say(text,kind){ if(!UI) return; UI.fb.textContent=text; UI.fb.className="pn-fb pn-"+(kind||"info") }
/* A row of boxes, one for each count of the note; they fill while the finger stays down. */
function holdBar(beats,ms){
  var el=UI.hold,n=Math.max(1,Math.ceil(beats-0.01)),h="";
  if(!beats){el.innerHTML="";return}
  for(var i=0;i<n;i++) h+="<i"+(i===n-1&&beats%1?' style="flex:'+(beats%1)+'"':"")+"><u></u></i>";
  el.innerHTML=h;
  if(ms>0){ void el.offsetWidth; Array.prototype.forEach.call(el.children,function(c,i){ var part=(i===n-1&&beats%1?beats%1:1)/beats*ms; c.firstChild.style.transition="transform "+Math.round(part)+"ms linear "+Math.round(i/beats*ms)+"ms"; c.firstChild.style.transform="scaleX(1)" }) }
}

// ── Sheet music on the page ──
var SH={els:[],lines:[],starts:[],cur:-1};
function isCompact(){return !!(UI.focus&&UI.short)}
function drawSheet(){
  if(!UI) return;
  if(!L.song||!L.notes.length){ UI.sheet.innerHTML=L.song?'<div class="empty">This song has no notes yet. Open the song list and tap Edit to add some.</div>':""; SH={els:[],lines:[],starts:[],cur:-1}; return }
  var compact=isCompact(),bw=Math.max(200,UI.sheetbox.clientWidth-(compact?4:12)),opt={width:bw,compact:compact,labels:ST.labels,color:colorOf};
  var r=renderSheet(UI.sheet,L.notes,L.bars,L.beats,opt);
  if(compact){                                    // one line fills the strip: draw it at the size that makes the heights match
    var sc=clamp((UI.sheetbox.clientHeight-2)/r.lineH,0.5,1.5); opt.width=bw/sc; r=renderSheet(UI.sheet,L.notes,L.bars,L.beats,opt);
  }
  SH.els=[]; Array.prototype.forEach.call(UI.sheet.querySelectorAll(".pn-n"),function(g){SH.els[+g.getAttribute("data-i")]=g});
  SH.lines=Array.prototype.slice.call(UI.sheet.children); SH.starts=r.starts; SH.onLine=-1;
  UI.root.style.setProperty("--pn-lineh",r.lineH+"px");
  L.st.forEach(function(v,i){ if(v&&SH.els[i]) SH.els[i].classList.add("pn-done") });
  var c=SH.cur; SH.cur=-1; setCur(c<0&&L.notes.length?0:c,true);
}
function setCur(i,quiet){
  if(SH.cur>=0&&SH.els[SH.cur]) SH.els[SH.cur].classList.remove("pn-cur");
  SH.cur=i;
  var g=SH.els[i]; if(!g) return;
  if(!quiet||L.mode!=="free") g.classList.add("pn-cur");
  var li=SH.starts[i];
  if(li!==SH.onLine){
    if(SH.lines[SH.onLine]) SH.lines[SH.onLine].classList.remove("pn-on");
    SH.onLine=li; var ln=SH.lines[li]; if(!ln) return;
    ln.classList.add("pn-on");
    if(!isCompact()){ var top=Math.max(0,ln.getBoundingClientRect().top-UI.sheet.getBoundingClientRect().top+(li?3:0)); if(UI.sheetbox.scrollTo&&!UI.calm&&!quiet) UI.sheetbox.scrollTo({top:top,behavior:"smooth"}); else UI.sheetbox.scrollTop=top }
  }
}
function setDone(i,verdict){ var g=SH.els[i]; if(g){ g.classList.add("pn-done"); if(verdict) g.classList.add("pn-v-"+verdict) } }
function clearDone(){ SH.els.forEach(function(g){ if(g) g.setAttribute("class",g.getAttribute("class").replace(/ pn-(done|cur|v-\w+)/g,"")) }); SH.cur=-1 }

// ── Piano-only view ──
/* On by itself when a phone lies sideways, or from the button. html.pn-focus hides the app's header and tab bar (see piano.css). */
function syncFocus(){
  if(!UI) return;
  var land=UI.mq.matches; if(!land) UI.dismissed=false;
  var want=UI.manual||(land&&!UI.dismissed),short=window.innerHeight<=520;
  var changed=want!==UI.focus||short!==UI.short,w=window.innerWidth,h=window.innerHeight;
  if(!changed&&w===UI.lastW&&(!want||h===UI.lastH)) return;          // e.g. Safari's address bar sliding away: nothing to redo
  UI.focus=want;UI.short=short;UI.lastW=w;UI.lastH=h;
  UI.root.classList.toggle("pn-focus-on",want); UI.root.classList.toggle("pn-short",want&&short);
  document.documentElement.classList.toggle("pn-focus",want);
  if(changed&&MIC.on) micUi();
  relayout();
}
function relayout(){
  if(!UI) return;
  var r=keyRange();
  if(r[0]!==K.lo||r[1]!==K.hi) buildKeys(); else layoutKeys();
  drawSheet(); buildFalls(); syncControls();
  var m=L.lit!=null?L.lit:(L.notes[L.i]&&L.notes[L.i].midi); if(m!=null) follow(m,true);
}

// ───────────────────────── 10. Lessons: Listen, Learn, Play in time, Free play ─────────────────────────
/* L = the song on the stand and where we are in it. st[i]: 1 = right first time, 2 = needed more than one try. */
var L={song:null,key:"",notes:[],bars:[],beats:4,bpm:90,starts:[],total:0,real:[],lo:null,hi:null,
       mode:"learn",run:false,i:-1,st:[],timers:[],raf:0,hold:null,T:null,lit:null,wrong:0,ppb:40};
var GAME={on:false,target:null,score:0,tries:0,kind:"name",lock:false,timer:0};
var SPEED={slow:0.6,medium:0.8,full:1};
function beatMs(){return 60000/(L.bpm*(SPEED[ST.speed]||0.8))}
function later(fn,ms){var id=setTimeout(fn,ms);L.timers.push(id);return id}
function nextReal(i){ for(var k=i+1;k<L.notes.length;k++) if(L.notes[k].midi!=null) return k; return -1 }
function nameOf(n){ var f=info(n.midi,n.flat); return ST.labels==="doremi"?f.s:f.l }

function setSong(key){
  var s=findSong(key)||findSong("b:hot-cross-buns"),p=parseSong(s.notes),t=0;
  stopRun(); closeOver();
  L.song=s;L.key=s.key;L.notes=p.notes;L.bars=p.bars;L.beats=s.beats;L.bpm=s.bpm;L.starts=[];L.real=[];L.lo=L.hi=null;L.st=[];SH.cur=-1;
  p.notes.forEach(function(n,i){ L.starts[i]=t; t+=n.beats; if(n.midi!=null){ L.real.push(i); L.lo=L.lo==null?n.midi:Math.min(L.lo,n.midi); L.hi=L.hi==null?n.midi:Math.max(L.hi,n.midi) } });
  L.total=t; pref("pianoSong",s.key);
  var r=keyRange(); if(r[0]!==K.lo||r[1]!==K.hi) buildKeys();
  applyPalette();                                  // also redraws the sheet (the colours may change with the song)
  songHead(); renderList();
  if(L.mode==="free") syncControls(); else resetLesson();
}
function songHead(){
  if(!UI||!L.song) return;
  var s=L.song,pr=progressOf(s.key);
  $$(".pn-title").forEach(function(el){el.textContent=s.title});
  $(".pn-songmeta").innerHTML=esc(GRADES[s.grade])+" · "+L.real.length+" notes"+(pr.stars?' · <span class="pn-stars">'+starText(pr.stars)+"</span>":"");
  var a=$(".pn-yt"); a.href=s.yt||("https://www.youtube.com/results?search_query="+encodeURIComponent(s.title+" easy piano tutorial"));
  a.lastChild.textContent=s.yt?"Watch our saved lesson on YouTube":"Watch a lesson on YouTube";
}
function stopRun(){
  L.timers.forEach(clearTimeout); L.timers=[];
  if(L.raf){cancelAnimationFrame(L.raf);L.raf=0}
  if(L.hold){clearTimeout(L.hold.timer);L.hold=null}
  var was=L.run; L.run=false; L.T=null;
  if(UI){ UI.count.hidden=true; holdBar(0); UI.beat.classList.remove("pn-tick","pn-tock"); if(was){ silence(); unlight(); syncControls() } }
}
function resetLesson(){
  stopRun(); L.st=[]; L.wrong=0; L.from=0; clearDone(); unlight(); holdBar(0);
  L.i=L.real.length?L.real[0]:-1;
  if(L.i<0){ say("This song has no notes yet.","warn"); showNow(null); syncControls(); return }
  var n=L.notes[L.i];
  if(L.mode==="learn") learnArm();
  else { setCur(L.i,true); showNow(n.midi,n.flat); follow(n.midi,true); placeFalls(-1);
    say(L.mode==="listen"?"Tap Play to hear the song.":"Tap Start. Count in, then press each key as its bar lands.","info") }
  syncControls();
}
function setMode(m){
  stopRun(); gameStop(); closeOver();
  L.mode=m; unlight();
  var r=keyRange(); if(r[0]!==K.lo||r[1]!==K.hi) buildKeys();
  syncControls();
  if(m==="free"){ L.st=[]; clearDone(); gameUi(); showNow(null); say("Play anything you like!","info") }
  else { drawSheet(); buildFalls(); resetLesson() }
}
function playButton(){
  audio();
  if(L.mode==="free"){gameToggle();return}
  if(L.i<0&&!L.real.length){ say("This song has no notes yet.","warn"); return }
  if(L.run){ stopRun(); resetLesson(); return }
  if(L.mode==="listen") startListen(L.from||0);
  else if(L.mode==="time") startTime();
  else { resetLesson(); say("From the start. Tap the glowing key!","info") }
}
/* A press from a finger or a heard note from the microphone both arrive here. */
function onNote(m,src){
  if(GAME.on){ gameAnswer(m,src); return }
  showNow(m,false);
  if(L.mode==="learn"&&L.i>=0) learnPress(m,src);
  else if(L.mode==="time"&&L.run&&L.T) timePress(m,src);
}
function onNoteUp(m){
  if(L.mode==="learn") learnRelease(m);
  else if(L.mode==="time"&&L.T) timeRelease(m);
}
function jumpTo(i){                                // a note on the sheet was tapped
  if(L.notes[i]&&L.notes[i].midi==null) i=nextReal(i);
  if(i<0||!L.notes[i]) return;
  if(L.mode==="learn"){ if(L.hold){clearTimeout(L.hold.timer);L.hold=null} L.i=i; learnArm() }
  else if(L.mode==="listen"){ if(L.run) startListen(i); else { L.from=i; L.i=i; setCur(i); showNow(L.notes[i].midi,L.notes[i].flat); follow(L.notes[i].midi); say("Tap Play to hear it from here.","info") } }
  else if(L.mode==="time"&&!L.run) say("Play in time always starts at the beginning. Tap Start!","info");
}

// ── Listen: the app plays, keys light, the sheet follows ──
function startListen(from){
  stopRun(); L.run=true; L.from=0; syncControls(); showKeys();
  var i=from||0;
  SH.els.forEach(function(g,k){ if(g) g.classList.toggle("pn-done",k<i) });
  (function step(){
    if(!L.run) return;
    if(i>=L.notes.length){ stopRun(); resetLesson(); say("That is how it goes. Now you try: tap Learn.","good"); return }
    var n=L.notes[i],ms=n.beats*beatMs(); L.i=i;
    if(i>0) setDone(i-1);
    if(n.midi!=null){
      setCur(i); unlight(); light(n.midi); showNow(n.midi,n.flat); flash(n.midi,"pn-auto",Math.max(120,ms*0.85));
      if(!MIC.on) tone(n.midi,{dur:ms/1000*0.92,vel:0.5,app:true});    // the app stays quiet while the microphone listens
      say(nameOf(n)+" · "+countsWord(n.beats)+(MIC.on?" (quiet while I listen)":""),"info");
    }else { unlight(); setCur(i); say("Rest · "+countsWord(n.beats),"info") }
    i++; later(step,ms);
  })();
}

// ── Learn: one note at a time, no hurry ──
function learnArm(){
  var n=L.notes[L.i]; if(!n) return;
  setCur(L.i); unlight(); light(n.midi); showNow(n.midi,n.flat); holdBar(n.beats,0);
  say("Tap "+nameOf(n)+(n.beats===1?"":" and hold for "+countsWord(n.beats)),"info");
}
function learnPress(m,src){
  if(L.hold) learnAdvance();                        // a new press ends the note before it
  var n=L.notes[L.i]; if(!n) return;
  // a heard note may be an octave out (singing, a small keyboard), a tapped key must be the very key
  var ok=src==="mic"?(m%12===n.midi%12&&Math.abs(m-n.midi)<=12):m===n.midi;
  if(!ok){
    if(src==="mic"){ say("I hear "+info(m).l+". We are looking for "+nameOf(n)+".","info"); return }   // stray sounds are never counted
    L.wrong++; L.st[L.i]=2; flash(m,"pn-bad"); showNow(n.midi,n.flat);
    say("Not that one. Find the glowing "+nameOf(n)+"!","warn"); return;
  }
  if(!L.st[L.i]) L.st[L.i]=1;
  flash(n.midi,"pn-ok");
  var need=n.beats*beatMs();
  if(src==="mic"){ say("Yes! "+nameOf(n),"good"); L.hold={i:L.i,midi:m,t0:now(),need:0,mic:true}; learnAdvance(); return }
  L.hold={i:L.i,midi:m,t0:now(),need:need};
  holdBar(n.beats,need);
  say(n.beats>1?"Yes! Keep holding: "+countsWord(n.beats):"Yes!","good");
  L.hold.timer=setTimeout(function(){ if(L.hold){ L.hold.full=true; learnAdvance() } },need);
}
function learnRelease(m){ if(L.hold&&L.hold.midi===m) learnAdvance() }
function learnAdvance(){
  var h=L.hold; if(!h) return;
  clearTimeout(h.timer); L.hold=null;
  var n=L.notes[h.i],short=!h.mic&&!h.full&&n.beats>=2&&(now()-h.t0)<h.need*0.6;
  setDone(h.i);
  var nx=nextReal(h.i);
  if(nx<0){ unlight(); finishLearn(); return }
  L.i=nx; learnArm();
  if(short) say("Good! Next time hold that one for "+countsWord(n.beats)+". Now tap "+nameOf(L.notes[nx])+".","info");
  else if(h.full&&n.beats>=2) say("Lovely long note! Now tap "+nameOf(L.notes[nx])+".","good");
}
function finishLearn(){
  var total=L.real.length,clean=0; L.real.forEach(function(i){ if(L.st[i]===1) clean++ });
  var acc=total?clean/total:0;
  celebrate({stars:acc>=0.9?3:acc>=0.6?2:1,acc:acc,
    line:clean===total?"Every note right the first time!":clean+" of "+total+" notes right the first time.",
    tip:acc>=0.9?"Ready for more? Try Play in time.":"Look at the colour of the note on the sheet, then find the same colour on the keys."});
}

// ── Play in time: count-in, falling bars, a verdict for every note ──
/* Bars fall onto the keys: a bar touches the bottom of the lane at the moment its key should go down,
   and its length is how long to hold. Only one transform changes per frame, so it stays smooth. */
function buildFalls(){
  if(!UI) return;
  if(L.mode!=="time"||!L.real.length){ UI.track.innerHTML=""; return }
  var h=UI.fall.clientHeight||110,bm=beatMs(),ppb=h/clamp(2600/bm,2,6),html="";
  L.ppb=ppb;
  L.real.forEach(function(i){
    var n=L.notes[i],p=K.x[n.midi]; if(!p) return;
    var hh=Math.max(10,n.beats*ppb-3),c=colorOf(n.midi);
    html+='<i data-i="'+i+'" style="left:'+fx(p.x+(p.black?0:3))+"px;width:"+fx(p.w-(p.black?0:6))+"px;bottom:"+fx(L.starts[i]*ppb)+"px;height:"+fx(hh)+"px;background:"+c+";color:"+inkOn(c)+'">'+(hh>=16&&ST.labels!=="none"?nameOf(n):"")+"</i>";
  });
  UI.track.innerHTML=html;
  placeFalls(L.run&&L.T?(now()-L.T.t0)/L.T.bm:-1);
}
function placeFalls(beat){ if(UI) UI.track.style.transform="translate3d(0,"+fx(beat*L.ppb)+"px,0)" }
function startTime(){
  if(!L.real.length) return;
  stopRun(); clearDone(); L.st=[]; audio(); buildFalls();
  var bm=beatMs(),s=clamp(bm/667,0.85,1.4),wG=300*s;
  // windows that suit a child, a little wider at slow speeds
  L.T={bm:bm,t0:now()+L.beats*bm+300,wP:120*s,wG:wG,wOut:clamp(bm*0.9,wG+80,650*s),j:[],mi:0,next:0,lastBeat:-99,litEnd:-1,hold:null,last:"",
       res:{perfect:0,good:0,early:0,late:0,missed:0,wrong:0,heldOk:0,heldShort:0}};
  L.run=true; L.i=L.real[0]; setCur(L.i,true); follow(L.notes[L.i].midi,true);
  syncControls(); showKeys(); say("Get ready…","info");
  tickTime();
}
function tickTime(){
  if(!L.run||!L.T||!UI) return;
  var T=L.T,t=now(),bp=(t-T.t0)/T.bm,b=Math.floor(bp+0.02);
  placeFalls(bp);
  if(b!==T.lastBeat&&b>=-L.beats){                 // metronome: count-in numbers first, then a soft tick on every count
    T.lastBeat=b;
    var first=((b%L.beats)+L.beats)%L.beats===0;
    if(b<0){ UI.count.hidden=false; UI.count.textContent=b+L.beats+1; UI.count.classList.remove("pn-pop1"); void UI.count.offsetWidth; UI.count.classList.add("pn-pop1"); click(0,true) }
    else { UI.count.hidden=true; if(!MIC.on) click(0,first) }
    UI.beat.classList.toggle("pn-tick",b%2===0); UI.beat.classList.toggle("pn-tock",b%2!==0); UI.beat.classList.toggle("pn-first",first);
  }
  while(T.next<L.notes.length&&L.starts[T.next]<=bp){ // the note that is due now: light its key and mark it on the sheet
    var n=L.notes[T.next];
    if(n.midi!=null){ setCur(T.next); unlight(); light(n.midi); T.litEnd=L.starts[T.next]+n.beats*0.9; if(!HELD[n.midi]) showNow(n.midi,n.flat) }
    T.next++;
  }
  if(L.lit!=null&&bp>=T.litEnd) unlight();
  while(T.mi<L.real.length){                        // notes whose moment has passed without the right key
    var i=L.real[T.mi];
    if(T.j[i]){T.mi++;continue}
    if(t>T.t0+L.starts[i]*T.bm+T.wOut){ judge(i,"missed"); T.mi++ } else break;
  }
  if(bp>=L.total+0.75){ finishTime(); return }
  L.raf=requestAnimationFrame(tickTime);
}
var VERDICT={perfect:["Perfect!","good"],good:["Good!","good"],early:["Early. Wait for the bar.","warn"],late:["Late. Get your finger ready.","warn"],missed:["Missed that one. Keep going!","bad"]};
function judge(i,v){
  var T=L.T; T.j[i]=v; T.res[v]++; T.last=VERDICT[v][0];
  setDone(i,v); say(T.last,VERDICT[v][1]);
  var bar=UI.track.querySelector('[data-i="'+i+'"]'); if(bar) bar.classList.add(v==="missed"?"pn-miss":"pn-hit");
}
function timePress(m,src){
  var T=L.T,t=now()-(src==="mic"?140:0),best=-1,bd=1e9,bdSigned=0,near=false,k,i,d,n;
  if(T.hold) timeRelease(T.hold.midi);
  for(k=T.mi;k<L.real.length;k++){
    i=L.real[k]; if(T.j[i]) continue;
    d=t-(T.t0+L.starts[i]*T.bm);
    if(d<-T.wOut) break;
    if(d>T.wOut) continue;
    near=true; n=L.notes[i];
    if((src==="mic"?m%12===n.midi%12:m===n.midi)&&Math.abs(d)<bd){bd=Math.abs(d);bdSigned=d;best=i}
  }
  if(best<0){
    if(src==="mic") return;
    if(near){ T.res.wrong++; flash(m,"pn-bad"); say("Oops, another key. Keep going!","warn") }
    else { var nx=L.real[T.mi]; if(nx!=null&&L.notes[nx].midi===m&&t<T.t0+L.starts[nx]*T.bm) say("Too soon. Wait for the bar to land.","warn") }
    return;
  }
  judge(best,bd<=T.wP?"perfect":bd<=T.wG?"good":bdSigned<0?"early":"late");
  flash(m,"pn-ok");
  if(L.notes[best].beats>=2&&src!=="mic") T.hold={i:best,midi:m,t0:now()};
}
function timeRelease(m){
  var T=L.T; if(!T||!T.hold||T.hold.midi!==m) return;
  var ok=(now()-T.hold.t0)>=L.notes[T.hold.i].beats*T.bm*0.65;
  T.res[ok?"heldOk":"heldShort"]++; T.hold=null;
  say(T.last+(ok?" Held just right.":" Let go too soon: hold it longer."),ok?"good":"warn");
}
function finishTime(){
  var T=L.T,r=T.res,n=L.real.length; if(T.hold) timeRelease(T.hold.midi);
  var acc=n?(r.perfect+0.75*r.good+0.4*(r.early+r.late))/n:0,tip;
  if(r.missed>n*0.3) tip="Lots got away. Try Slow speed, or Learn the song first.";
  else if(r.early>=Math.max(2,r.late+1)&&r.early>=n*0.15) tip="You were often early: wait for the bar to touch the key.";
  else if(r.late>=Math.max(2,r.early+1)&&r.late>=n*0.15) tip="You were often a little late: watch the next bar coming and be ready.";
  else if(r.heldShort>r.heldOk&&r.heldShort>=2) tip="Hold the long notes until their bar has gone.";
  else if(acc>=0.85) tip=ST.speed==="full"?"Wonderful timing! Try a harder song next.":"Great timing! Try a faster speed next.";
  else tip="Count along with the clicks: 1, 2, 3"+(L.beats===4?", 4":"")+".";
  L.run=false; if(L.raf){cancelAnimationFrame(L.raf);L.raf=0} unlight(); syncControls();
  celebrate({stars:acc>=0.8?3:acc>=0.5?2:1,acc:acc,line:Math.round(acc*100)+"% in time · "+r.perfect+" perfect, "+r.good+" good"+(r.missed?", "+r.missed+" missed":""),tip:tip,res:r});
}

// ── Free play and the "Find the note" game ──
function gameUi(){
  if(!UI) return;
  var t=GAME.target,n=t!=null?info(t):null,q;
  if(!GAME.on) q='<div class="pn-gq">Free play: every key shows its name.<small>Want a game? I name a note, you find its key.</small></div>';
  else if(GAME.kind==="name") q='<div class="pn-gq">Find <b style="background:'+colorOf(t)+";color:"+inkOn(colorOf(t))+'">'+n.l+"</b> <em>"+n.s+"</em></div>";
  else q='<div class="pn-gq">Which key is this note?<small>Look at the big staff.</small></div>';
  UI.game.innerHTML=q+'<div class="pn-gside">'+(GAME.on?'<span class="pn-score">'+IC.star+"<b>"+GAME.score+"</b></span>":"")+
    '<button type="button" class="'+(GAME.on?"ghost":"primary")+'" data-pn="game">'+(GAME.on?"Stop":"Find the note")+"</button></div>";
}
function gameToggle(){ if(GAME.on){ gameStop(); gameUi(); say("Play anything you like!","info"); showNow(null) } else { audio(); GAME.on=true; GAME.score=0; GAME.target=null; gameNext() } syncControls() }
function gameStop(){ clearTimeout(GAME.timer); GAME.on=false; GAME.lock=false; GAME.target=null; unlight() }
function gameNext(){
  if(!GAME.on||!UI) return;
  var pool=K.white.filter(function(m){return m>=60&&m<=81&&m!==GAME.target}); if(!pool.length) pool=K.white.slice();
  GAME.target=pool[Math.floor(Math.random()*pool.length)]; GAME.tries=0; GAME.lock=false;
  GAME.kind=ST.labels==="none"||Math.random()<0.5?"staff":"name";
  unlight(); gameUi(); follow(GAME.target);
  if(GAME.kind==="staff"){ showNow(GAME.target,false,true); say("Which key is this note?","info") }
  else { showNow(null); say("Find "+info(GAME.target).l+" ("+info(GAME.target).s+")","info") }
}
function gameAnswer(m,src){
  var t=GAME.target; if(t==null||GAME.lock) return;
  if(src==="mic"?m%12===t%12:m===t){
    GAME.score++; GAME.lock=true; ding(); flash(t,"pn-ok"); showNow(t,false); gameUi();
    if(GAME.score%5===0){
      if(starsToGive("game",1,true)>0){ try{HH.star(1,"Piano: Find the note")}catch(e){} say(GAME.score+" right! You earned a star.","good") }
      else say(GAME.score+" right! You already have today's 3 game stars. Brilliant!","good");
    }
    else say("Yes! That is "+info(t).l+" ("+info(t).s+").","good");
    GAME.timer=setTimeout(gameNext,1000);
  }else if(src!=="mic"){
    GAME.tries++; flash(m,"pn-bad");
    if(GAME.tries>=2){ light(t); say("It is the glowing key. Tap it!","info") } else say("Not that one. Try again!","warn");
  }
}

// ───────────────────────── 11. Celebration ─────────────────────────
function today(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function progressOf(key){ try{ var p=HH.pianoProgress(); return (p&&p[key])||{} }catch(e){return {}} }
function starText(n){return "★★★".slice(0,n)+"☆☆☆".slice(0,3-n)}
/* Stars for the family scoreboard: a song (or the game) gives at most 3 a day; more plays only add what was not
   earned yet today. oneMore = ask for one more star on top of today's (used by the game). */
function starsToGive(key,stars,oneMore){
  var raw=pref("pianoAward").split("|"),map={},k=encodeURIComponent(key);
  if(raw[0]===today()) raw.slice(1).forEach(function(p){var a=p.split("=");map[a[0]]=+a[1]||0});
  if(oneMore) stars=Math.min(3,(map[k]||0)+1);
  var give=Math.max(0,stars-(map[k]||0)); map[k]=Math.max(map[k]||0,stars);
  pref("pianoAward",today()+"|"+Object.keys(map).slice(-40).map(function(x){return x+"="+map[x]}).join("|"));
  return give;
}
function celebrate(r){
  if(!UI) return;
  var s=L.song,old=progressOf(s.key),pct=Math.round(r.acc*100),who="";
  var rec={stars:Math.max(old.stars||0,r.stars),best:Math.max(old.best||0,pct),plays:(old.plays||0)+1,last:today()};
  try{HH.savePianoProgress(s.key,rec)}catch(e){}
  var give=starsToGive(s.key,r.stars);
  if(give>0){ try{HH.star(give,s.title)}catch(e){} }
  try{who=HH.pname(HH.learnerId())||""}catch(e){}
  var confetti="";
  if(!UI.calm) for(var i=0;i<44;i++) confetti+='<i style="left:'+(i*37%100)+"%;background:"+PAL.c[i%7]+";animation-delay:"+(i%11)*0.09+"s;animation-duration:"+(2.2+(i%5)*0.35)+"s;--r:"+((i%7)*50-150)+'deg"></i>';
  var stars=""; for(i=1;i<=3;i++) stars+='<span class="'+(i<=r.stars?"pn-won":"")+'" style="animation-delay:'+(i*0.22)+'s">'+IC.star+"</span>";
  UI.over.innerHTML='<div class="pn-confetti" aria-hidden="true">'+confetti+'</div><div class="pn-pop" role="dialog" aria-label="Song finished"><div class="pn-bigstars" aria-label="'+r.stars+' of 3 stars">'+stars+"</div>"+
    "<h2>"+esc(["Well done","Great playing","Amazing"][r.stars-1]+(who?", "+who:"")+"!")+'</h2><div class="pn-popsong">You played <b>'+esc(s.title)+"</b> to the end.</div>"+
    '<div class="pn-popline">'+esc(r.line)+(old.best!=null&&pct>old.best&&old.plays?" New best!":"")+'</div><div class="pn-poptip">'+esc(r.tip)+"</div>"+
    '<div class="pn-popgive">'+(give>0?"+"+give+" star"+(give>1?"s":"")+" for the family scoreboard":"Stars for this song are already on today's scoreboard")+"</div>"+
    '<div class="pn-popbtns"><button type="button" class="primary" data-pn="again">Play again</button><button type="button" class="ghost" data-pn="next">Next song</button><button type="button" class="ghost" data-pn="close">Done</button></div></div>';
  UI.over.className="pn-over pn-cele"; UI.over.hidden=false;
  fanfare(); songHead(); renderList();
}
function closeOver(){ if(UI&&!UI.over.hidden){ UI.over.hidden=true; UI.over.innerHTML="" } }
function nextSong(){
  var all=allSongs().filter(function(s){return metaOf(s.notes).n>0}),i=0;
  while(i<all.length&&all[i].key!==L.key) i++;
  setSong(all[(i+1)%all.length].key);
}

// ───────────────────────── 12. Microphone ─────────────────────────
/* The microphone is only ever on between a tap on the button and Stop (or leaving, or 3 quiet minutes).
   Sound is analysed here in the page and thrown away at once: nothing is recorded, kept or sent. */
var MIC={on:false,stream:null,src:null,an:null,buf:null,timer:0,cand:null,n:0,fired:null,quiet:0,floor:0,level:0,heardAt:0,lastTrack:null,log:[],hear:[],needle:[],starting:false};
function micButton(){
  if(MIC.on||MIC.starting) return;
  if(pref("pianoMicOk")==="1"){ micStart(); return }
  UI.over.innerHTML='<div class="pn-pop pn-micpop" role="dialog" aria-label="Use a real piano"><div class="pn-micicon">'+IC.mic+"</div><h2>Use a real piano (microphone)</h2>"+
    "<ul><li>The microphone only listens while this is switched on.</li><li>The sound is checked on this phone.</li><li>Nothing is recorded, saved or sent anywhere.</li></ul>"+
    '<div class="pn-popbtns"><button type="button" class="primary" data-pn="micgo">Turn on the microphone</button><button type="button" class="ghost" data-pn="close">Not now</button></div></div>';
  UI.over.className="pn-over"; UI.over.hidden=false;
}
function micStart(){
  var md=navigator.mediaDevices,ac=audio();
  if(!md||!md.getUserMedia||!ac||!ac.createAnalyser){ say("This browser cannot use the microphone here. You can still tap the keys.","warn"); toast("The microphone is not available here"); return }
  MIC.starting=true;
  var mine=UI;
  md.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}).then(function(stream){
    MIC.starting=false;
    if(UI!==mine||document.hidden){ stream.getTracks().forEach(function(t){t.stop()}); return }      // the page was left while the question was open
    MIC.stream=stream; MIC.lastTrack=stream.getTracks()[0]||null;
    MIC.src=ac.createMediaStreamSource(stream); MIC.an=ac.createAnalyser(); MIC.an.fftSize=2048; MIC.an.smoothingTimeConstant=0;
    MIC.src.connect(MIC.an);                                                                       // not connected to the speakers
    MIC.buf=new Float32Array(MIC.an.fftSize); MIC.bytes=new Uint8Array(MIC.an.fftSize);
    MIC.on=true; MIC.cand=null; MIC.n=0; MIC.fired=null; MIC.quiet=0; MIC.heardAt=now(); MIC.log=[];
    setAudioSession(true); audio();
    MIC.timer=setInterval(micTick,50);
    micUi(); say("I am listening. Play the glowing note on your piano.","good");
  }).catch(function(err){
    MIC.starting=false; if(UI!==mine) return;
    var nm=err&&err.name;
    say(nm==="NotFoundError"||nm==="OverconstrainedError"?"I could not find a microphone. You can still tap the keys.":"No problem. The microphone stays off. You can still tap the keys.","warn");
  });
}
function micStop(why){
  if(MIC.timer){clearInterval(MIC.timer);MIC.timer=0}
  if(MIC.stream){ try{MIC.stream.getTracks().forEach(function(t){t.stop()})}catch(e){} }
  if(MIC.src){ try{MIC.src.disconnect()}catch(e){} }
  var was=MIC.on;
  MIC.stream=MIC.src=MIC.an=MIC.buf=null; MIC.on=false;
  if(was){ setAudioSession(false); if(UI){ micUi(); say(why||"The microphone is off.","info") } }
}
function micUi(){
  if(!UI) return;
  var pill='<div class="pn-listen"><i class="pn-reddot"></i><b>Listening</b><span class="pn-hear"><em>I hear: </em><b>…</b></span><span class="pn-meter" title="Is it in tune?"><i></i></span>'+
    '<button type="button" data-pn="micstop" aria-label="Stop listening">'+IC.stop+"<span>Stop</span></button></div>";
  $(".pn-barmic").innerHTML=MIC.on?pill:'<button type="button" class="pn-bb pn-micb" data-pn="mic" aria-label="Use a real piano (microphone)">'+IC.mic+"<span>Mic</span></button>";
  $(".pn-microw").innerHTML=MIC.on?pill:"";
  UI.root.classList.toggle("pn-mic-on",MIC.on);
  MIC.hear=$$(".pn-hear b"); MIC.needle=$$(".pn-meter i");
  if(UI.focus) drawSheet();
}
function micShow(m,cents){
  var txt=m==null?"…":info(m).l,left=m==null?50:50+clamp(cents,-50,50)*0.9;
  MIC.hear.forEach(function(el){ if(el.textContent!==txt) el.textContent=txt });
  MIC.needle.forEach(function(el){ el.style.left=left+"%"; el.className=m==null?"":Math.abs(cents)<18?"pn-intune":"" });
}
function micTick(){
  var an=MIC.an,buf=MIC.buf,t=now(),i;
  if(!MIC.on||!an||!AU.ac) return;
  if(t-MIC.heardAt>180000){ micStop("The microphone switched itself off after 3 quiet minutes."); return }
  if(an.getFloatTimeDomainData) an.getFloatTimeDomainData(buf); else { an.getByteTimeDomainData(MIC.bytes); for(i=0;i<buf.length;i++) buf[i]=(MIC.bytes[i]-128)/128 }
  if(t<appSoundUntil){ MIC.cand=null; MIC.n=0; return }                // the app itself is sounding: do not listen to that
  var p=detectPitch(buf,AU.ac.sampleRate);
  if(!(p.freq>60&&p.freq<2300&&p.clarity>0.86&&p.rms>0.012)){
    if(++MIC.quiet>=2){ MIC.fired=null; MIC.cand=null; MIC.n=0 }       // silence re-arms the same note
    if(MIC.quiet===8) micShow(null,0);
    return;
  }
  MIC.quiet=0;
  var mf=69+12*Math.log(p.freq/440)/Math.LN2,m=Math.round(mf);
  micShow(m,(mf-m)*100);
  if(m!==MIC.cand){MIC.cand=m;MIC.n=1} else MIC.n++;
  if(MIC.fired===m){                                                    // same note again: needs a fresh attack (the sound jumps back up)
    MIC.floor=Math.min(MIC.floor,p.rms);
    if(p.rms>MIC.floor*1.8&&p.rms>MIC.level*0.6){ MIC.fired=null; MIC.n=2 }
  }
  if(MIC.n>=3&&MIC.fired!==m){                                          // steady for about 150 ms: it counts as a played note
    MIC.fired=m; MIC.floor=MIC.level=p.rms; MIC.heardAt=t;
    MIC.log.push(m); if(MIC.log.length>60) MIC.log.shift();
    onNote(m,"mic");
  }
}

// ───────────────────────── 13. Song list and the "Add a song" sheet ─────────────────────────
var META={};
function metaOf(notes){                            // number of notes and a fair grade for the family's own songs
  if(META[notes]) return META[notes];
  var p=parseSong(notes),real=p.notes.filter(function(n){return n.midi!=null}),d={},quick=false,blacks=false;
  real.forEach(function(n){d[n.midi]=1; if(BLACK[n.midi%12]) blacks=true}); p.notes.forEach(function(n){ if(n.beats<1) quick=true });
  var k=Object.keys(d).length;
  return META[notes]={n:real.length,grade:k<=5&&!quick&&!blacks?0:k<=8&&!blacks?1:2};
}
/* Only real https YouTube links are ever opened. */
function safeYt(u){
  try{
    if(typeof u!=="string"||!u||u.length>300) return "";
    var url=new URL(u.trim());
    return url.protocol==="https:"&&/^((www|m|music)\.)?youtube\.com$|^youtu\.be$|^www\.youtube-nocookie\.com$/.test(url.hostname)?url.href:"";
  }catch(e){return ""}
}
function ownSongs(){ var a=[]; try{a=HH.S().songs}catch(e){} return Array.isArray(a)?a.filter(function(d){return d&&typeof d==="object"&&d.id!=null}):[] }
/* Built-in songs plus the family's own. Family fields are never trusted: everything is cleaned here. */
function allSongs(){
  var list=SONGS.map(function(b){return {key:"b:"+b.id,title:b.title,sub:b.sub,grade:b.grade,bpm:b.bpm,beats:b.beats,notes:b.notes}});
  ownSongs().forEach(function(d){
    var notes=typeof d.notes==="string"?d.notes.slice(0,20000):"";
    list.push({key:"c:"+d.id,id:d.id,own:true,title:String(d.title==null?"":d.title).trim().slice(0,80)||"Our song",sub:"Our song",
      bpm:clamp(Math.round(+d.bpm)||90,30,240),beats:+d.beats===3?3:4,notes:notes,yt:safeYt(d.yt),grade:metaOf(notes).grade});
  });
  return list;
}
function findSong(key){ var a=allSongs(); for(var i=0;i<a.length;i++) if(a[i].key===key) return a[i]; return null }
function songsUi(inPage){
  return '<div class="pn-songsui">'+(inPage?'<div class="row between"><h2>Songs</h2><button type="button" class="link" data-pn="add">+ Add a song</button></div>':"")+
    '<div class="field"><input type="search" class="pn-q" placeholder="Search songs" aria-label="Search songs" autocomplete="off" enterkeyhint="search"></div>'+
    '<div class="chips pn-filters"></div><div class="pn-list"></div>'+(inPage?"":'<button type="button" class="ghost" data-pn="add">+ Add a song</button>')+"</div>";
}
function songBoxes(){ var a=$$(".pn-songsui"); if(UI.pick&&document.documentElement.contains(UI.pick)) a=a.concat(Array.prototype.slice.call(UI.pick.querySelectorAll(".pn-songsui"))); return a }
function renderList(){
  if(!UI) return;
  var q=UI.q.trim().toLowerCase(),f=UI.filter,all=allSongs(),prog={};
  try{prog=HH.pianoProgress()||{}}catch(e){}
  var chips=[["all","All"],["0","Starter"],["1","Easy"],["2","Next step"],["own","Our songs"]].map(function(c){
    return '<button type="button" class="chip'+(f===c[0]?" on":"")+'" data-pn="filter" data-v="'+c[0]+'">'+c[1]+"</button>" }).join("");
  var rows=all.filter(function(s){
    return (f==="all"||(f==="own"?s.own:!s.own&&String(s.grade)===f))&&(!q||(s.title+" "+s.sub).toLowerCase().indexOf(q)>=0);
  }).map(function(s){
    var m=metaOf(s.notes),st=(prog[s.key]&&prog[s.key].stars)||0;
    return '<div class="pn-song'+(s.key===L.key?" pn-on":"")+'"><button type="button" class="pn-songmain" data-pn="song" data-key="'+esc(s.key)+'">'+
      '<span class="pn-g pn-g'+s.grade+'">'+GRADES[s.grade]+'</span><span class="pn-st"><b>'+esc(s.title)+"</b><small>"+esc(s.sub)+"</small></span>"+
      '<span class="pn-sm">'+m.n+' notes<i class="pn-stars'+(st?"":" pn-nostars")+'">'+starText(st)+"</i></span></button>"+
      (s.own?'<button type="button" class="pn-edit" data-pn="edit" data-key="'+esc(s.key)+'">Edit</button>':"")+"</div>";
  }).join("");
  if(!rows) rows='<div class="empty">'+(f==="own"&&!q?"No songs of your own yet. Tap “Add a song” to write one, or ask Claude for the notes.":"No song with that name. Try another word.")+"</div>";
  songBoxes().forEach(function(box){ box.querySelector(".pn-filters").innerHTML=chips; box.querySelector(".pn-list").innerHTML=rows; var i=box.querySelector(".pn-q"); if(i.value!==UI.q&&document.activeElement!==i) i.value=UI.q });
}
function bindSongsUi(box){
  box.addEventListener("input",function(e){ if(UI&&e.target.classList&&e.target.classList.contains("pn-q")){ UI.q=e.target.value; renderList() } });
}
function closeSheet(){ try{HH.closeSheet()}catch(e){} if(UI) UI.pick=null; ED.sheet=null }
function openPicker(){
  try{ HH.openSheet(HH.sheetHead("Choose a song")+songsUi(false),function(sheet){ UI.pick=sheet; bindSheet(sheet); bindSongsUi(sheet); renderList() }) }catch(e){ var c=$(".pn-songs"); if(c&&c.scrollIntoView) c.scrollIntoView() }
}
function bindSheet(sheet){ sheet.addEventListener("click",function(e){ var b=e.target.closest&&e.target.closest("[data-pn]"); if(b&&UI) act(b.dataset.pn,b,e) }) }
/* After choosing or saving a song further down the page, bring the piano back into view. */
function toPiano(){
  if(!UI||UI.focus) return;
  var top=Math.max(0,UI.root.getBoundingClientRect().top+window.pageYOffset-76);
  if(Math.abs(top-window.pageYOffset)<40) return;
  try{window.scrollTo({top:top,behavior:UI.calm?"auto":"smooth"})}catch(e){window.scrollTo(0,top)}
}
function songsAct(name,b){
  if(name==="filter"){ UI.filter=b.dataset.v; renderList() }
  else if(name==="song"){
    var inSheet=UI.pick&&UI.pick.contains(b); setSong(b.dataset.key);
    if(inSheet) closeSheet();
    toPiano();
  }
  else if(name==="add") openEditor(null);
  else if(name==="edit") openEditor(b.dataset.key);
  else if(name==="edplay") editorPlay();
  else if(name==="edsave") editorSave();
  else if(name==="eddel"){ var id=ED.id; editorStop(); closeSheet(); try{HH.delUndo("songs",id,"Song deleted")}catch(e){} if(L.key==="c:"+id) setSong("b:hot-cross-buns"); renderList() }
}
// ── Add or edit one of the family's songs ──
var ED={sheet:null,id:null,timers:[]};
function openEditor(key){
  var s=key?findSong(key):null,doc=null; if(key&&(!s||!s.own)) return;
  if(s) doc=ownSongs().filter(function(d){return "c:"+d.id===key})[0];
  editorStop();
  var html=HH.sheetHead(s?"Edit song":"Add a song")+
    '<div class="field"><label>Song name</label><input class="pn-f-title" maxlength="80" autocomplete="off" value="'+esc(s?s.title:"")+'"></div>'+
    '<div class="field"><label>Notes</label><textarea class="pn-f-notes" rows="4" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="C C G G | A A G- | F F E E | D D C-">'+esc(s?s.notes:"")+"</textarea></div>"+
    '<div class="sub pn-help">Type note letters with spaces: <b>C D E F G A B</b> (Do Re Mi works too). <b>C\'</b> is the high C, <b>B,</b> the low B, <b>F#</b> and <b>Bb</b> are black keys.<br>'+
    "Longer: <b>C-</b> is 2 counts, <b>C--</b> is 3. Shorter: <b>C/</b> is half a count. Rest: <b>_</b>. Bar line: <b>|</b>. Example: <b>C C G G | A A G- | F F E E | D D C-</b></div>"+
    '<div class="pn-prev"><div class="pn-sheet"></div></div><div class="pn-msgs" aria-live="polite"></div>'+
    '<div class="two"><div class="field"><label>Speed (counts a minute)</label><input class="pn-f-bpm" type="number" inputmode="numeric" min="30" max="240" value="'+(s?s.bpm:90)+'"></div>'+
    '<div class="field"><label>Counts in a bar</label><select class="pn-f-beats"><option value="4">4</option><option value="3"'+(s&&s.beats===3?" selected":"")+">3</option></select></div></div>"+
    '<div class="field"><label>YouTube lesson link (optional)</label><input class="pn-f-yt" type="url" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=…" value="'+esc(doc&&typeof doc.yt==="string"?doc.yt.slice(0,300):"")+'"></div>'+
    '<div class="sub pn-claude">The app cannot work out the notes from a YouTube video. But you can ask Claude for the letter notes of a song and paste them here, or ask Claude to add the song to Happy Home if Claude is connected.</div>'+
    '<div class="two"><button type="button" class="ghost" data-pn="edplay">'+IC.play+'<span>Play</span></button><button type="button" class="primary" data-pn="edsave">Save song</button></div>'+
    (s?'<button type="button" class="link pn-del" data-pn="eddel">Delete this song</button>':"");
  HH.openSheet(html,function(sheet){
    UI.pick=null; ED.sheet=sheet; ED.id=s?s.id:null;
    bindSheet(sheet);
    sheet.addEventListener("input",function(){ editorPreview() });
    editorPreview();
  });
}
function edVal(c){ var el=ED.sheet&&ED.sheet.querySelector(c); return el?el.value:"" }
function editorPreview(){
  var sh=ED.sheet; if(!sh||!document.documentElement.contains(sh)) return null;
  var p=parseSong(edVal(".pn-f-notes")),box=sh.querySelector(".pn-prev .pn-sheet"),msg=sh.querySelector(".pn-msgs"),n=p.notes.filter(function(x){return x.midi!=null}).length;
  if(p.notes.length) renderSheet(box,p.notes,p.bars,+edVal(".pn-f-beats")===3?3:4,{width:Math.max(240,box.parentNode.clientWidth-8),labels:ST.labels==="none"?"abc":ST.labels,color:colorOf,compact:true});
  else box.innerHTML='<div class="empty">Your sheet music will appear here as you type.</div>';
  msg.innerHTML=p.errors.map(function(e){return '<div class="pn-err">'+esc(e)+"</div>"}).join("")+(n?'<div class="pn-okmsg">'+n+" note"+(n>1?"s":"")+" understood.</div>":"");
  return p;
}
function editorStop(){ ED.timers.forEach(clearTimeout); ED.timers=[]; var b=ED.sheet&&ED.sheet.querySelector("[data-pn=edplay]"); if(b) b.innerHTML=IC.play+"<span>Play</span>" }
function editorPlay(){
  if(ED.timers.length){ editorStop(); silence(); return }
  var p=editorPreview(); if(!p||!p.notes.length) return;
  audio();
  var bm=60000/clamp(+edVal(".pn-f-bpm")||90,30,240),t=0,sh=ED.sheet,gs=sh.querySelectorAll(".pn-prev .pn-n");
  sh.querySelector("[data-pn=edplay]").innerHTML=IC.stop+"<span>Stop</span>";
  p.notes.forEach(function(n,i){
    ED.timers.push(setTimeout(function(){
      if(!UI||!document.documentElement.contains(sh)){ editorStop(); return }       // the sheet was closed: stop
      Array.prototype.forEach.call(gs,function(g,k){ g.classList.toggle("pn-cur",k===i) });
      if(n.midi!=null) tone(n.midi,{dur:n.beats*bm/1000*0.92,vel:0.5,app:true});
    },t)); t+=n.beats*bm;
  });
  ED.timers.push(setTimeout(editorStop,t+50));
}
function editorSave(){
  var p=editorPreview(); if(!p) return;
  var title=edVal(".pn-f-title").trim().slice(0,80),yt=edVal(".pn-f-yt").trim(),msg=ED.sheet.querySelector(".pn-msgs"),bad="";
  if(!title) bad="Give the song a name first.";
  else if(!p.notes.some(function(n){return n.midi!=null})) bad="Type at least one note, for example: C D E";
  else if(yt&&!safeYt(yt)) bad="That is not a YouTube link. It should start with https://www.youtube.com or https://youtu.be (or leave it empty).";
  if(bad){ msg.innerHTML='<div class="pn-err">'+esc(bad)+"</div>"; return }
  var doc={title:title,notes:edVal(".pn-f-notes").trim().slice(0,20000),bpm:clamp(Math.round(+edVal(".pn-f-bpm"))||90,30,240),beats:+edVal(".pn-f-beats")===3?3:4,yt:safeYt(yt)},id=ED.id;
  editorStop();
  try{ if(id!=null) HH.ST.patch("songs",id,doc); else id=HH.ST.add("songs",doc) }catch(e){ msg.innerHTML='<div class="pn-err">Sorry, the song could not be saved.</div>'; return }
  closeSheet(); toast("Song saved");
  if((typeof id==="string"||typeof id==="number")&&findSong("c:"+id)){ setSong("c:"+id); toPiano() } else renderList();
}

// ───────────────────────── 14. Mount, unmount, refresh ─────────────────────────
function on(el,type,fn,opt){ el.addEventListener(type,fn,opt); UI.offs.push(function(){el.removeEventListener(type,fn,opt)}) }
function mount(el){
  if(UI) unmount();
  if(!el) return;
  HH=window.HH||{};
  loadChoices();
  var root=document.createElement("div"); root.className="pn-root";
  el.innerHTML=""; el.appendChild(root);
  UI={el:el,root:root,offs:[],q:"",filter:"all",focus:false,short:false,manual:false,dismissed:false,pick:null,hinted:false,miniRaf:0};
  root.innerHTML=pageHtml();
  ["scroll","keys","names","fall","track","mini","minitrack","miniview","sheetbox","sheet","game","nowstaff","nowname","fb","hold","beat","count","over"].forEach(function(n){UI[n]=root.querySelector(".pn-"+n)});
  UI.mq=window.matchMedia?window.matchMedia("(orientation: landscape) and (max-height: 520px)"):{matches:false};
  var calm=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)"); UI.calm=!!(calm&&calm.matches);
  L.mode=ST.mode; L.run=false; L.lit=null; L.song=null; L.key=""; L.lo=L.hi=null; GAME.on=false; PAL=PALETTES[pickPalette(ST.pal,"")];
  UI.focus=UI.mq.matches; UI.short=window.innerHeight<=520;          // know the view before the first layout
  root.classList.toggle("pn-focus-on",UI.focus); root.classList.toggle("pn-short",UI.focus&&UI.short); document.documentElement.classList.toggle("pn-focus",UI.focus);
  on(root,"click",function(e){ var b=e.target.closest&&e.target.closest("[data-pn]"); if(b&&root.contains(b)) act(b.dataset.pn,b,e) });
  // iPhone only lets sound start from the END of a touch (or a click): wake the audio there too, so it is ready for the next key
  var wake=function(){ if(!AU.ac||AU.ac.state!=="running") audio() };
  ["pointerup","touchend","click","keydown"].forEach(function(t){ on(root,t,wake,true) });
  bindKeys(); bindSongsUi(root);
  // tapping a note on the sheet jumps the lesson there (pointer events, so it also works where touch defaults are blocked)
  var tap=null;
  on(UI.sheetbox,"pointerdown",function(e){ var g=e.target.closest&&e.target.closest(".pn-n"); tap=g?{x:e.clientX,y:e.clientY,i:+g.getAttribute("data-i"),id:e.pointerId}:null });
  on(UI.sheetbox,"pointerup",function(e){ if(tap&&tap.id===e.pointerId&&Math.abs(e.clientX-tap.x)<10&&Math.abs(e.clientY-tap.y)<10){ audio(); jumpTo(tap.i) } tap=null });
  on(UI.sheetbox,"pointercancel",function(){tap=null});
  var rs=0; on(window,"resize",function(){ clearTimeout(rs); rs=setTimeout(syncFocus,90) });
  var mqf=function(){syncFocus()};
  if(UI.mq.addEventListener){ UI.mq.addEventListener("change",mqf); UI.offs.push(function(){UI.mq.removeEventListener("change",mqf)}) }
  else if(UI.mq.addListener){ UI.mq.addListener(mqf); UI.offs.push(function(){UI.mq.removeListener(mqf)}) }
  on(document,"visibilitychange",function(){ if(document.hidden){ micStop("The microphone switched off because you left the app."); if(L.run){ stopRun(); resetLesson() } releaseAll(); silence() } });
  micUi(); buildKeys();
  var saved=pref("pianoSong");
  setSong(findSong(saved)?saved:"b:hot-cross-buns");
  if(L.mode==="free"){ gameUi(); showNow(null); say("Play anything you like!","info") }
  syncControls();
  var first=L.notes[L.i]; follow(first&&first.midi!=null?first.midi:60,true);
}
/* Leaving the page: stop every sound and timer and give the microphone back. Safe to call twice. */
function unmount(){
  document.documentElement.classList.remove("pn-focus");
  micStop(); MIC.starting=false;
  if(!UI) return;
  stopRun(); gameStop(); editorStop(); releaseAll(); silence();
  UI.offs.forEach(function(f){ try{f()}catch(e){} });
  if(UI.miniRaf) cancelAnimationFrame(UI.miniRaf);
  try{ if(UI.root.parentNode) UI.root.parentNode.removeChild(UI.root) }catch(e){}
  UI=null; L.song=null; L.T=null; VOICE={}; HELD={}; PTR={};
  try{ if(AU.ac&&AU.ac.state==="running"&&AU.ac.suspend) AU.ac.suspend() }catch(e){}
}
/* Family data changed (a new song arrived, stars were saved). Only the song list and titles are updated;
   the keyboard and a song that is being played are never touched. */
function refresh(){
  if(!UI) return;
  renderList();
  var s=L.song&&findSong(L.key);
  if(s&&!L.run&&!L.hold&&s.own&&(s.notes!==L.song.notes||s.bpm!==L.song.bpm||s.beats!==L.song.beats)&&L.i===(L.real.length?L.real[0]:-1)) setSong(L.key);
  else if(s){ L.song.title=s.title; L.song.yt=s.yt; songHead() }
}
window.HHPiano={mount:mount,unmount:unmount,refresh:refresh,parseSong:parseSong,SONGS:SONGS,PALETTES:PALETTES,
  _detectPitch:detectPitch,
  _debug:function(){ return {mounted:!!UI,mode:L.mode,i:L.i,run:L.run,lit:L.lit,key:L.key,notes:L.notes,real:L.real,starts:L.starts,st:L.st,wrong:L.wrong,
    T:L.T?{t0:L.T.t0,bm:L.T.bm,j:L.T.j,res:L.T.res,wP:L.T.wP,wG:L.T.wG,wOut:L.T.wOut}:null,range:[K.lo,K.hi],keyW:K.w,palette:PAL.name,focus:!!(UI&&UI.focus),
    game:{on:GAME.on,target:GAME.target,score:GAME.score,kind:GAME.kind},mic:{on:MIC.on,track:MIC.lastTrack,log:MIC.log.slice()},now:now()} }
};
})();
