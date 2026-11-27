/* Happy Home — phone app UI */
(function () {
"use strict";
const ST = window.Store;
const S = () => ST.state;
const SET = () => ST.state.settings;

/* ---------- dates ---------- */
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function addDays(s,n){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return iso(d)}
const TODAY=()=>iso(new Date());
const monthKey=d=>(d||"").slice(0,7);
const thisMonth=()=>TODAY().slice(0,7);

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const peopleRaw=()=>SET().people||[];
// shown with the youngest first, then the other parent, then the parent who set it up, unless the family picks another order
const people=()=>{const raw=peopleRaw(),ord=SET().order;if(Array.isArray(ord)&&ord.length){const pos=id=>{const i=ord.indexOf(id);return i<0?99:i};return [...raw].sort((a,b)=>pos(a.id)-pos(b.id))}return [...raw].reverse()};
const kidId=()=>(peopleRaw()[2]||peopleRaw()[peopleRaw().length-1])?.id||meId();
const person=id=>people().find(p=>p.id===+id);
const pname=id=>id==0?"Family":(person(id)?.name||"Someone");
const meId=()=>ST.me.personId||1;
/* whose things come first on this phone: the person signed in, or the profile picked at the top right */
const viewId=()=>{if(ST.mode==="cloud"){const v=+ST._localPref("view");if(v&&peopleRaw().some(p=>p.id===v))return v}return meId()};
/* Another person's profile is in use on this phone (family accounts only). The family's shared things then go under that profile.
   Private things, and anything that needs a person's own agreement (a mood check, sharing location), stay with the person who is signed in. */
const switched=()=>viewId()!==meId();
const fromPhone=r=>r&&r.via!=null&&+r.via!==+(r.who??r.person??r.by)&&person(r.via)?" · from "+esc(pname(r.via))+"'s phone":"";
const colorIdx=id=>id==0?0:((peopleRaw().findIndex(p=>p.id===+id)%3)+1)||0;
const dot=id=>{const ph=id!=0&&photoOf(id);return `<span class="dot who-${colorIdx(id)}${ph?" ph ph-"+(+id):""}" aria-hidden="true">${id==0?"All":esc(pname(id).slice(0,1).toUpperCase())}</span>`};
function money(n,sign){const v=Math.abs(n).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});return (sign&&n<0?"−":sign&&n>0?"+":"")+(SET().currency||"$")+v}
function nice(d){const t=TODAY();if(d===t)return"Today";if(d===addDays(t,1))return"Tomorrow";if(d===addDays(t,-1))return"Yesterday";return new Date(d+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
function ago(ts){const s=Math.round((Date.now()-ts)/1000);if(s<60)return"just now";if(s<3600)return Math.round(s/60)+" min ago";if(s<86400)return Math.round(s/3600)+" h ago";return new Date(ts).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}
function toast(m,act,fn){const t=$("#toast");t.textContent=m;if(act){const b=document.createElement("button");b.className="tact";b.textContent=act;b.onclick=ev=>{ev.stopPropagation();t.hidden=true;fn()};t.append(b)}t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,act?5000:2000)}
function delUndo(col,id,msg){const r=(S()[col]||[]).find(x=>x.id===id);ST.del(col,id);if(!r){toast(msg||"Deleted");return}const {id:_i,...rest}=r;toast(msg||"Deleted","Undo",()=>{ST.put(col,id,rest);toast("Restored")})}
const ICON={
 lists:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 2 2 4-4M4 17l2 2 4-4M14 7h7M14 17h7"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
 tick:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
 note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
 calc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/></svg>',
 pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
 gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
 wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M6 3h12"/><circle cx="16.5" cy="15" r="1.2"/></svg>',
 mood:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01"/></svg>',
 swim:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 22c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16" cy="6" r="2"/><path d="m6 14 4-5 3 2 3-2"/></svg>',
 meal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-2.2 1.2-3.5 3.6-3.5 7s1.3 4 3.5 4"/></svg>',
 cake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9M2 21h20M4 15c1.5 1 3 1 4 0s2.5-1 4 0 3 1 4 0 2.5-1 4 0M12 10V6M12 3.5v.01"/></svg>',
 bill:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h3"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
 mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
 spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
 back:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
 cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M16 12.5h2M2 10h20"/></svg>',
 sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/></svg>'
};

/* ---------- view state ---------- */
let tab="home", listTab="tasks", listWho="mine", moneyMonth=thisMonth(), calDay=TODAY(), calMonth=thisMonth(), cameFrom="more";
const routes=["home","today","calendar","lists","happy","money","more","notes","calc","location","wallet","mood","bills","meals","dates","activities","learn","piano","alarms","signups"];
const routeOf=h=>h==="live"?"home":h; // the live view is the home page now
const parentTab={lists:"more",today:"home",calendar:"more",money:"more",notes:"more",calc:"more",location:"more",wallet:"more",mood:"more",bills:"more",meals:"more",dates:"more",activities:"more",learn:"more",alarms:"more"};
if(routes.includes(routeOf(location.hash.slice(1))))tab=routeOf(location.hash.slice(1));
/* "piano and happiness are home screen when first open, they switch between each opening like random" (27 Nov 2026):
   opening the app (not a reload, not a link to one page) starts on the Piano or the Happy page, picked at random */
const OPENERS=["piano","happy"],pickOpener=()=>OPENERS[Math.floor(Math.random()*OPENERS.length)];
{const h=location.hash.slice(1),nav=((performance.getEntriesByType&&performance.getEntriesByType("navigation")[0])||{}).type;
 if((h===""||h==="home")&&nav!=="reload"&&nav!=="back_forward"){tab=pickOpener();try{history.replaceState(null,"","#"+tab)}catch(e){}}}
let authMode="signin", authErr="", busy=false, authEm="", authPw="", authCode="", authFocus="", mfaFor="";
let cpCode="", cpMsg="", cpOk=false; // the coupon box on the sign-up page

function monthStats(m){
  let inc=0,out=0;const byCat={};
  S().tx.filter(x=>monthKey(x.date)===m).forEach(x=>{if(x.type==="in")inc+=x.amount;else{out+=x.amount;byCat[x.cat]=(byCat[x.cat]||0)+x.amount}});
  return {inc,out,byCat};
}

/* ---------- list items ---------- */
const checkBtn=(on,act,id)=>`<button class="check ${on?"on":""}" data-act="${act}" data-id="${id}" aria-label="${on?"Mark not done":"Mark done"}">${on?ICON.tick:""}</button>`;
function tm(t){if(!t)return"";const [h,m]=t.split(":").map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}).replace(" ","\u00a0")}
function duePill(due,done,time){if(!due)return"";const now=new Date(),nowT=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");const late=!done&&(due<TODAY()||(due===TODAY()&&time&&time<nowT)),today=due===TODAY();const day=today?"Today":due===addDays(TODAY(),1)?"Tomorrow":due===addDays(TODAY(),-1)?"Yesterday":new Date(due+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric"})+(Math.abs((new Date(due+"T12:00:00")-new Date(TODAY()+"T12:00:00"))/864e5)>6?" "+new Date(due+"T12:00:00").toLocaleDateString("en-AU",{month:"short"}):"");
  return `<span class="pill ${late?"late":today?"today":""}">${late?"Late · "+(today?tm(time):day):day+(time?" · "+tm(time):"")}</span>`}
const row=(col,id,inner,done)=>`<div class="swipe" data-col="${col}" data-id="${id}"><div class="act" data-act="swipeDel">Delete</div><div class="item ${done?"done":""}">${inner}</div></div>`;
function taskItem(t){return row("tasks",t.id,`${checkBtn(t.done,"toggle",t.id)}<div class="grow tap" data-act="edit" data-col="tasks" data-id="${t.id}"><div class="t">${esc(t.title)}</div><div class="m">${esc(pname(t.who))}${t.repeat&&t.repeat!=="none"?" · "+t.repeat:""}${+t.points>0?` · <span class="star">★ ${+t.points}</span>`:""}</div></div>${duePill(t.due,t.done,t.time)}`,t.done)}
function hwItem(h){return row("homework",h.id,`${checkBtn(h.done,"toggleHw",h.id)}<div class="grow tap" data-act="edit" data-col="homework" data-id="${h.id}"><div class="t">${esc(h.title)}</div><div class="m">${esc(h.subject)} · ${esc(pname(h.who))}</div></div>${duePill(h.due,h.done,h.time)}`,h.done)}
function eventItem(e,showDate){return row("events",e.id,`<span class="time">${e.time?tm(e.time):"All day"}</span>${dot(e.who)}<div class="grow tap" data-act="edit" data-col="events" data-id="${e.id}" data-d="${e.date}"><div class="t">${esc(e.title)}${isRep(e)?' <span class="rep" title="Repeats">↻</span>':""}</div><div class="m">${showDate?nice(e.date)+" · ":""}${esc(pname(e.who))}${e.place?" · "+esc(placeTxt(e.place)):""}</div></div>${joinBtn(e)}`).replace('class="swipe"',isRep(e)?'class="swipe" data-occ="'+e.date+'"':'class="swipe"')}
function txItem(x){const n=x.type==="in"?x.amount:-x.amount;return row("tx",x.id,`${dot(x.who)}<div class="grow tap" data-act="edit" data-col="tx" data-id="${x.id}"><div class="t">${esc(x.note||x.cat)}</div><div class="m">${esc(x.cat)} · ${nice(x.date)} · ${esc(pname(x.who))}</div></div><span class="num ${n>0?"pos":""}" style="font-weight:600">${money(n,true)}</span>`)}
const sortTasks=a=>a.sort((x,y)=>(!!x.done-!!y.done)||((x.due||"9")+(x.time||"99")>(y.due||"9")+(y.time||"99")?1:-1));
const sortEv=a=>a.sort((x,y)=>(x.date+(x.time||"00:00")).localeCompare(y.date+(y.time||"00:00")));
/* weekly activities: one event with repeat:"weekly", days:[0-6 Sun..Sat], optional until and skip dates */
const DAYN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const dow=d=>new Date(d+"T12:00:00").getDay();
const isRep=e=>e.repeat==="weekly"&&Array.isArray(e.days)&&e.days.length;
function evOn(d){const wd=dow(d);return S().events.filter(e=>isRep(e)?(d>=e.date&&(!e.until||d<=e.until)&&e.days.includes(wd)&&!(e.skip||[]).includes(d)):e.date===d).map(e=>isRep(e)?{...e,date:d,start:e.date}:e)}
function evRange(a,b){const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(...evOn(d));return out}
const repText=e=>!isRep(e)?"":e.days.length===7?"Every day":[...e.days].sort().join()==="1,2,3,4,5"?"Every weekday":[...e.days].sort().join()==="0,6"?"Every weekend":isRep(e)?"Every "+[...e.days].sort((a,b)=>((a+6)%7)-((b+6)%7)).map(i=>DAYN[i]).join(", "):"";
const isUrl=v=>/^https?:\/\/\S+$/i.test(String(v||"").trim());
const placeTxt=p=>isUrl(p)?p.replace(/^https?:\/\/(www\.)?/i,"").split("/")[0]:p;
const joinBtn=e=>isUrl(e.place)?`<a class="mini join" href="${esc(e.place.trim())}" target="_blank" rel="noopener">Open</a>`:"";
const swipeHint=()=>`<div class="hint">Swipe left on a row to delete it</div>`;

/* ---------- Today ---------- */
const lw=()=>listWho==="mine"?String(viewId()):listWho;
/* "Yours first" falls back to everyone when you have nothing of your own in that list (a parent opening Homework) */
const lwFor=col=>listWho==="mine"&&!S()[col].some(x=>x.who==viewId())?"all":lw();
/* the person whose profile is showing gets their things first, the rest of the family after */
function mineFirst(arr,item){
  const v=viewId(),a=arr.filter(x=>+x.who===v),b=arr.filter(x=>+x.who!==v);
  if(peopleRaw().length<2||!a.length||!b.length)return arr.map(item).join("");
  return `<div class="aisle rest" style="margin-top:2px">${v===meId()?"Yours":esc(pname(v))}</div>`+a.map(item).join("")+`<div class="aisle rest">Rest of the family</div>`+b.map(item).join("");
}
function qaCard(){return `<section class="card qacard"><form id="qaForm" class="quick qa" autocomplete="off"><span class="qaic">${ICON.spark}</span><input id="qa" placeholder="Add anything…" aria-label="Quick add" enterkeyhint="done" autocomplete="off" autocorrect="on">${hasMic?`<button type="button" class="qamic" data-act="voice" aria-label="Speak">${ICON.mic}</button>`:""}<button type="submit">Add</button></form>
   <div id="qaPrev" class="qaprev" hidden></div><div class="qatip" id="qaTip" ${+(ST._localPref("qaUses")||0)>=3?"hidden":""}>Type or tap the microphone on your keyboard and just say it. The app works out if it's a task, event, shopping or spending.</div></section>`}
function viewToday(){
  const t=TODAY(),v=viewId(),kidView=peopleRaw().length>2&&v===kidId(),myStars=starsThisWeek()[v]||0;
  const due=sortTasks(S().tasks.filter(x=>!x.done&&x.due&&x.due<=t));
  const hw=sortTasks(S().homework.filter(h=>!h.done&&h.due&&h.due<=addDays(t,1)));
  const ev=sortEv(evOn(t));
  const next=sortEv(evRange(addDays(t,1),addDays(t,7))).slice(0,5);
  const m=monthStats(thisMonth()), left=m.inc-m.out;
  const shopLeft=S().shopping.filter(s=>!s.done).length;
  const nowT=String(new Date().getHours()).padStart(2,"0")+":"+String(new Date().getMinutes()).padStart(2,"0");
  const upNext=ev.find(e=>e.time&&e.time>=nowT);
  const billsDue=billsSorted().filter(b=>b.next&&b.next<=addDays(t,3));
  const dinner=mealOn(t), cds=countdownsSoon(2).filter(c=>daysUntil(c.nd)<=60);
  return `${slotInfo().r==="today"?"":`<button class="back" data-go="home">${ICON.back}Home</button>`}${moodRequestBanner()}${syncNote()}
  ${qaCard()}
  ${upNext?`<button class="upnext" data-act="edit" data-col="events" data-id="${upNext.id}"><span class="label">Up next · ${tm(upNext.time)}</span><b>${esc(upNext.title)}</b><span>${esc(pname(upNext.who))}${upNext.place?" · "+esc(placeTxt(upNext.place)):""}${(()=>{const [h,m]=upNext.time.split(":").map(Number),d=new Date();d.setHours(h,m,0,0);const mins=Math.round((d-Date.now())/6e4);return mins<=0?" · now":mins<60?" · in "+mins+" min":" · in "+Math.floor(mins/60)+" h "+(mins%60?mins%60+" min":"")})()}</span></button>`:""}
  ${billsDue.length&&!kidView?`<section class="card"><div class="row between"><h2>Bills due</h2><button class="link" data-go="bills">All bills</button></div><div class="list" style="margin-top:6px">${billsDue.map(billRow).join("")}</div></section>`:""}
  <section class="card"><div class="row between"><h2>Today's plan</h2><span class="sub">${new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</span></div>
   <div class="list" style="margin-top:6px">${ev.length?ev.map(e=>eventItem(e)).join(""):`<div class="empty">Nothing on the calendar today. Tap + to add an event.</div>`}</div></section>
  <section class="card"><div class="row between"><h2>To do now</h2><button class="link" data-go="lists" data-list="tasks">All tasks</button></div>
   <div class="list" style="margin-top:6px">${due.length?mineFirst(due,taskItem):`<div class="empty">All caught up.</div>`}</div></section>
  ${hw.length?`<section class="card"><div class="row between"><h2>Homework due soon</h2><button class="link" data-go="lists" data-list="homework">All homework</button></div><div class="list" style="margin-top:6px">${mineFirst(hw,hwItem)}</div></section>`:""}
  ${Object.values(starsThisWeek()).some(v=>v>0)?scoreboard():""}
  <div class="two">
   <button class="tile" data-go="meals"><span class="label">Dinner tonight</span><b>${dinner?esc(dinner.title):"Not planned"}</b><span>${dinner&&dinner.cook?esc(pname(dinner.cook))+" cooking":"Tap to plan the week"}</span></button>
   ${cds.length?`<button class="tile" data-go="dates"><span class="label">${esc(cdLabel(cds[0]))}</span><b>${esc(cds[0].title)}</b><span>${nice(cds[0].nd)}</span></button>`:`<button class="tile" data-act="addCountdown"><span class="label">Countdown</span><b>Add a date</b><span>Birthdays, trips, holidays</span></button>`}
  </div>
  <div class="two">${learnTodayCard()}${(()=>{const k=kidId(),nx=sortEv(evRange(t,addDays(t,6)).filter(e=>isRep(e)&&+e.who===k)).filter(e=>e.date>t||!e.time||e.time>=nowT)[0];return nx?`<button class="tile" data-go="activities"><span class="label">${esc(pname(k))}'s next class</span><b>${esc(nx.title)}</b><span>${nice(nx.date)}${nx.time?" · "+tm(nx.time):""}</span></button>`:`<button class="tile" data-go="activities"><span class="label">Activities</span><b>Weekly classes</b><span>Swimming, lessons, sport</span></button>`})()}</div>
  <div class="two">
   ${kidView?`<button class="tile" data-go="lists" data-list="tasks"><span class="label">Stars this week</span><b class="num">★ ${myStars}</b><span>Tick off chores to earn more</span></button>`:`<button class="tile" data-go="money"><span class="label">Money left</span><b class="num ${left<0?"neg":""}">${left<0?"−":""}${money(left)}</b><span>this month</span></button>`}
   <button class="tile" data-go="lists" data-list="shopping"><span class="label">Shopping</span><b class="num">${shopLeft} item${shopLeft===1?"":"s"}</b><span>still to buy</span></button>
  </div>
  <section class="card"><div class="row between"><h2>Coming up this week</h2><button class="link" data-go="calendar">Calendar</button></div>
   <div class="list" style="margin-top:6px">${next.length?next.map(e=>eventItem(e,true)).join(""):`<div class="empty">Nothing planned for the next 7 days.</div>`}</div></section>`;
}
/* family board: short notes to each other ("Home late tonight", "Swimming bag packed?") */
function boardCard(){
  const cut=Date.now()-5*864e5,msgs=[...S().board].filter(m=>(m.at||m.createdAt||0)>cut).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,4);
  return `<section class="card board"><div class="row between"><h2>Family board</h2><span class="sub">Notes for each other</span></div>
   ${msgs.length?`<div class="list" style="margin-top:4px">${msgs.map(m=>{const ack=Object.keys(m.ack||{}).filter(k=>(m.ack||{})[k]).map(Number).filter(i=>i!==+m.who);const mine=+m.who===viewId(),iAck=(m.ack||{})[viewId()];
     return row("board",m.id,`${dot(m.who)}<div class="grow"><div class="t bt">${esc(m.text)}</div><div class="m">${esc(pname(m.who))} · ${ago(m.at||m.createdAt)}${fromPhone(m)}${ack.length?" · 👍 "+ack.map(i=>esc(pname(i))).join(", "):""}</div></div>${mine?"":`<button class="mini ${iAck?"ghostmini":""}" data-act="boardAck" data-id="${m.id}">${iAck?"👍":"Got it"}</button>`}`)}).join("")}</div>`:""}
   <form id="boardForm" class="quick" style="margin-top:8px" autocomplete="off"><input id="boardIn" placeholder="${msgs.length?"Reply or post a note…":"e.g. Home late tonight, dinner in the fridge"}" maxlength="200" enterkeyhint="send"><button type="submit">Post</button></form></section>`;
}
function syncNote(){return ""}
let wasOffline=!navigator.onLine,hadPending=false;
function syncBar(){
  if(ST.mode==="local")return"";
  if(!navigator.onLine)return `<div class="syncbar off"><span class="sdot"></span><div><b>Offline</b> · everything you add is kept on this phone${ST.pending?" and waiting to upload":""}. It uploads by itself when the internet is back.</div></div>`;
  if(ST.pending)return `<div class="syncbar up"><span class="spin"></span><div>Uploading your changes…</div></div>`;
  return"";
}

/* ---------- Calendar ---------- */
function viewCalendar(){
  const [y,mo]=calMonth.split("-").map(Number);
  const first=new Date(y,mo-1,1), lead=(first.getDay()+6)%7;
  const start=addDays(iso(first),-lead);
  const daysIn=new Date(y,mo,0).getDate();
  const cells=Math.ceil((lead+daysIn)/7)*7;
  const label=first.toLocaleDateString("en-AU",{month:"long",year:"numeric"});
  const wd=[...Array(7)].map((_,i)=>new Date(2024,0,1+i).toLocaleDateString("en-AU",{weekday:"narrow"}));
  const grid=[...Array(cells)].map((_,i)=>{
    const d=addDays(start,i), dt=new Date(d+"T12:00:00");
    const evs=evOn(d);
    const hw=S().homework.some(h=>h.due===d&&!h.done);
    const special=S().countdowns.some(c=>c.yearly?c.date.slice(5)===d.slice(5):c.date===d)||S().bills.some(b=>b.next===d);
    const whos=[...new Set(evs.map(e=>+e.who))].slice(0,3);
    const dots=whos.map(w=>`<i class="who-${colorIdx(w)}"></i>`).join("")+(hw&&whos.length<3?`<i style="background:var(--muted)"></i>`:"");
    const cls=["mday",monthKey(d)!==calMonth?"out":"",d===TODAY()?"today":"",d===calDay?"sel":""].join(" ");
    return `<button class="${cls}" data-act="day" data-d="${d}" aria-label="${dt.toDateString()}${evs.length?", "+evs.length+" events":""}"><span class="n">${dt.getDate()}</span><span class="dots">${dots}${special?`<i class="sp"></i>`:""}</span></button>`;
  }).join("");
  const ev=sortEv(evOn(calDay));
  const hwDay=S().homework.filter(h=>h.due===calDay);
  const taskDay=S().tasks.filter(t=>t.due===calDay);
  const dayLabel=new Date(calDay+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"});
  const cdDay=S().countdowns.filter(c=>c.yearly?c.date.slice(5)===calDay.slice(5):c.date===calDay),billDay=S().bills.filter(b=>b.next===calDay),dinDay=mealOn(calDay);
  const any=ev.length||hwDay.length||taskDay.length||cdDay.length||billDay.length||dinDay;
  return `${tabBack("calendar")}<section class="card">
   <div class="mhead"><h2>${label}</h2><div class="navbtns"><button class="link" data-act="calToday">Today</button>
    <button class="iconbtn" data-act="cPrev" aria-label="Previous month">‹</button><button class="iconbtn" data-act="cNext" aria-label="Next month">›</button></div></div>
   <div class="wd">${wd.map(w=>`<span>${w}</span>`).join("")}</div><div class="mgrid">${grid}</div></section>
  <section class="card"><div class="row between"><h2>${dayLabel}</h2><button class="link" data-act="addEventDay">+ Event</button></div>
   <div class="list" style="margin-top:6px">${ev.map(e=>eventItem(e)).join("")}${hwDay.map(hwItem).join("")}${taskDay.map(taskItem).join("")}${cdDay.map(c=>`<button class="item cdrow" data-act="editCountdown" data-id="${c.id}"><span class="time">🎉</span><div class="grow"><div class="t">${esc(c.title)}</div><div class="m">${c.yearly&&c.kind==="birthday"&&+c.date.slice(0,4)>1900?"Turns "+(+calDay.slice(0,4)-+c.date.slice(0,4)):esc({birthday:"Birthday",anniversary:"Anniversary",trip:"Trip",other:"Date"}[c.kind]||"")}</div></div></button>`).join("")}${billDay.map(billRow).join("")}${dinDay?`<button class="item mealrow" data-act="editMeal" data-d="${calDay}"><span class="time">Dinner</span><div class="grow"><div class="t">${esc(dinDay.title)}</div>${dinDay.cook?`<div class="m">${esc(pname(dinDay.cook))} cooking</div>`:""}</div></button>`:""}${any?"":`<div class="empty">Nothing planned.</div>`}</div></section>`;
}

/* ---------- Lists ---------- */
function whoChips(col){const cur=col?lwFor(col):lw();return `<div class="chips">${[["all","Everyone"],...people().map(p=>[String(p.id),p.name])].map(([k,n])=>`<button class="chip ${cur==k?"on":""}" data-act="who" data-k="${k}">${esc(n)}</button>`).join("")}</div>`}
function viewLists(){
  const seg=`<div class="seg sticky">${[["tasks","Tasks"],["shopping","Shopping"],["homework","Homework"]].map(([k,n])=>`<button class="${listTab===k?"on":""}" data-act="listTab" data-k="${k}">${n}</button>`).join("")}</div>`;
  let body="";
  if(listTab==="tasks"){
    const tw=lwFor("tasks"),list=sortTasks(S().tasks.filter(t=>tw==="all"||t.who==tw));
    const open=list.filter(t=>!t.done),done=list.filter(t=>t.done);
    body=`${whoChips("tasks")}${scoreboard()}<section class="card"><h2>To do <span class="sub">(${open.length})</span></h2><div class="list" style="margin-top:6px">${open.length?open.map(taskItem).join(""):`<div class="empty">Nothing to do. Tap + to add a task or chore.</div>`}</div></section>
    ${list.length?swipeHint():""}
    ${done.length?`<section class="card"><div class="row between"><h2>Done</h2><button class="link" data-act="clearDone">Clear done</button></div><div class="list" style="margin-top:6px">${done.map(taskItem).join("")}</div></section>`:""}`;
  }
  if(listTab==="shopping"){
    const open=S().shopping.filter(s=>!s.done),got=S().shopping.filter(s=>s.done);
    const item=s=>row("shopping",s.id,`${checkBtn(s.done,"toggleShop",s.id)}<div class="grow"><div class="t">${esc(s.name)}</div><div class="m">Added by ${esc(pname(s.who))}</div></div>${s.qty?`<span class="qty">${esc(s.qty)}</span>`:""}`,s.done);
    const order=[...AISLES.map(a=>a[0]),"Other"],groups={};open.forEach(s=>{const k=s.aisle||aisleOf(s.name);(groups[k]=groups[k]||[]).push(s)});
    const usual=usualItems();
    body=`<form class="quick" id="shopForm"><input id="shopInput" placeholder="Add an item, e.g. Eggs 12" aria-label="Add shopping item" autocomplete="off" enterkeyhint="done"><button type="submit">Add</button></form>
    ${usual.length?`<div class="usual"><span class="label">Usual items · tap to add</span><div class="chips">${usual.map(u=>`<button class="chip" data-act="reAdd" data-k="${esc(u.name)}">+ ${esc(u.name)}</button>`).join("")}</div></div>`:""}
    <section class="card"><div class="row between"><h2>This week's shopping <span class="sub">(${open.length})</span></h2>${open.length?`<button class="link" data-act="shareShop">Share</button>`:""}</div>
    ${open.length?order.filter(k=>groups[k]).map(k=>`<div class="aisle">${esc(k)}</div><div class="list">${groups[k].map(item).join("")}</div>`).join(""):`<div class="list" style="margin-top:6px"><div class="empty">The list is empty. Add what you need above, or say "buy milk and eggs" in Quick add on Today.</div></div>`}</section>
    ${got.length?`<section class="card"><div class="row between"><h2>In the trolley</h2><button class="link" data-act="newWeek">Start new week</button></div><div class="list" style="margin-top:6px">${got.map(item).join("")}</div></section>`:""}`;
  }
  if(listTab==="homework"){
    const hw=lwFor("homework"),list=sortTasks(S().homework.filter(h=>hw==="all"||h.who==hw));
    const open=list.filter(h=>!h.done),done=list.filter(h=>h.done);
    body=`${whoChips("homework")}<section class="card"><h2>Homework to do <span class="sub">(${open.length})</span></h2><div class="list" style="margin-top:6px">${open.length?open.map(hwItem).join(""):`<div class="empty">No homework due. Tap + to add some.</div>`}</div></section>
    ${done.length?`<section class="card"><div class="row between"><h2>Finished</h2><button class="link" data-act="clearHw">Clear finished</button></div><div class="list" style="margin-top:6px">${done.map(hwItem).join("")}</div></section>`:""}`;
  }
  return tabBack("lists")+seg+body;
}

/* ---------- Money ---------- */
function viewMoney(){
  const m=monthStats(moneyMonth);
  const label=new Date(moneyMonth+"-15T12:00:00").toLocaleDateString("en-AU",{month:"long",year:"numeric"});
  const budgets=SET().budgets||{};
  const cats=Array.from(new Set([...Object.keys(budgets),...Object.keys(m.byCat)]));
  const tx=S().tx.filter(x=>monthKey(x.date)===moneyMonth).sort((a,b)=>b.date.localeCompare(a.date));
  const byWho=people().map(p=>({p,v:tx.filter(x=>x.type==="out"&&x.who===p.id).reduce((a,x)=>a+x.amount,0)}));
  return `${tabBack("money")}<div class="row between"><button class="iconbtn" data-act="mPrev" aria-label="Previous month">‹</button><h2>${label}</h2><button class="iconbtn" data-act="mNext" aria-label="Next month">›</button></div>
  <section class="card"><div class="trio"><div><div class="label">In</div><div class="v num pos">${money(m.inc)}</div></div><div><div class="label">Spent</div><div class="v num">${money(m.out)}</div></div><div><div class="label">Left</div><div class="v num ${m.inc-m.out<0?"neg":""}">${money(m.inc-m.out)}</div></div></div>
   <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:14px">${byWho.map(x=>`<span class="row" style="gap:6px">${dot(x.p.id)}<span class="sub num">${esc(x.p.name)} spent ${money(x.v)}</span></span>`).join("")}</div></section>
  ${trendCard()}
  ${billsCard()}
  <section class="card"><div class="row between"><h2>Budgets</h2><button class="link" data-act="budgets">Edit</button></div>
   <div class="stack" style="gap:12px;margin-top:10px">${cats.length?cats.map(c=>{const sp=m.byCat[c]||0,b=+budgets[c]||0,pct=b?Math.min(100,sp/b*100):100,over=b&&sp>b;
     return `<div><div class="row between"><span>${esc(c)}</span><span class="num sub">${money(sp)}${b?" of "+money(b):""}</span></div><div class="bar ${over||!b?"over":""}"><i style="width:${b?pct:0}%"></i></div>${over?`<div class="sub neg" style="margin-top:2px">${money(sp-b)} over budget</div>`:""}</div>`}).join(""):`<div class="empty">No budgets yet. Tap Edit to set monthly limits.</div>`}</div></section>
  <section class="card"><h2>Entries</h2><div class="list" style="margin-top:6px">${tx.length?tx.map(txItem).join(""):`<div class="empty">No entries this month. Tap + to add one.</div>`}</div></section>`;
}

function trendCard(){
  const months=[...Array(6)].map((_,i)=>{const d=new Date(moneyMonth+"-15T12:00:00");d.setMonth(d.getMonth()-5+i);return iso(d).slice(0,7)});
  const vals=months.map(m=>({m,...monthStats(m)}));if(!vals.some(v=>v.out||v.inc))return"";
  const max=Math.max(1,...vals.map(v=>Math.max(v.out,v.inc)));const past=vals.slice(0,5).filter(v=>v.out>0);const avg=past.length?past.reduce((x,v)=>x+v.out,0)/past.length:0;
  return `<section class="card"><div class="row between"><h2>Last 6 months</h2>${avg?`<span class="sub">Usually spend ${money(Math.round(avg))}</span>`:""}</div>
   <div class="trend">${vals.map(v=>`<div class="tcol ${v.m===moneyMonth?"cur":""}"><div class="tbars"><i class="tin" style="height:${v.inc/max*100}%"></i><i class="tout" style="height:${v.out/max*100}%"></i></div><span>${new Date(v.m+"-15T12:00:00").toLocaleDateString("en-AU",{month:"short"})}</span></div>`).join("")}</div>
   <div class="row" style="gap:14px;margin-top:6px"><span class="sub"><i class="lg tin"></i>In</span><span class="sub"><i class="lg tout"></i>Spent</span></div></section>`;
}
function billsCard(){
  const list=billsSorted(),total=list.reduce((a,b)=>a+perMonth(b),0),soon=list.slice(0,3);
  return `<section class="card"><div class="row between"><h2>Bills & subscriptions</h2><button class="link" data-go="bills">${list.length?"See all":"Set up"}</button></div>
   ${list.length?`<div class="sub" style="margin-top:2px">${money(total)} a month · ${money(total*12)} a year</div><div class="list" style="margin-top:6px">${soon.map(billRow).join("")}</div>`:`<div class="empty">Track rent, power, phone and subscriptions. See what's due and record payments in one tap.</div><button class="ghost" data-act="addBill" style="width:100%">Add a bill</button>`}</section>`;
}
/* ---------- More ---------- */
const backTo=()=>cameFrom==="home"||cameFrom==="today"?cameFrom:"more";
const backBar=()=>`<button class="back" data-go="${backTo()}">${ICON.back}${{home:"Home",today:"Today",more:"More"}[backTo()]}</button>`;
const tabBack=r=>slotInfo().r===r?"":backBar(); // pages that can sit in the bottom bar need no back button while they are there
function viewMore(){
  const tile=(go,icon,title,sub)=>`<button class="tile" data-go="${go}">${icon}<b>${title}</b><span>${sub}</span></button>`;
  const cards=allCards().length,t0=TODAY(),wk=evRange(t0,addDays(t0,6)).length,ms=monthStats(thisMonth()),sl=slotInfo(),na=(S().alarms||[]).filter(a=>a.on!==false).length;
  return `<div class="tiles">
   ${tile("lists",ICON.lists,"Lists",(()=>{const n=S().tasks.filter(t=>!t.done).length,sh=S().shopping.filter(x=>!x.done).length;return n||sh?n+" to do · "+sh+" to buy":"Tasks, shopping and homework"})())}
   ${tile("calendar",ICON.cal,"Calendar",wk?wk+" plan"+(wk===1?"":"s")+" this week":"Plans, classes and events")}
   ${tile("money",ICON.money,"Money",(ms.inc-ms.out<0?"−":"")+money(ms.inc-ms.out)+" left this month")}
   ${tile("today",ICON.sun,"Today","Today's plan, to-dos and quick add")}
   ${tile("alarms",ICON.bell,"Alarms",na?na+" alarm"+(na===1?"":"s")+" on, plus reminders":"Wake-ups and reminders")}
   ${tile("learn",'<span class="tilechar">学</span>',"Chinese",(()=>{const st=learnStreak(kidId());return st?"🔥 "+st+" day streak":"Words and quizzes for "+esc(pname(kidId()))})())}
   ${tile("activities",ICON.swim,"Activities",(()=>{const n=S().events.filter(isRep).length;return n?n+" weekly class"+(n===1?"":"es")+" and lessons":"Swimming, lessons, sport"})())}
   ${tile("meals",ICON.meal,"Dinner plan",(()=>{const m=mealOn(TODAY());return m?"Tonight: "+esc(m.title):"Plan the week's dinners"})())}
   ${tile("dates",ICON.cake,"Dates",(()=>{const c=countdownsSoon(1)[0];return c?esc(c.title)+" · "+esc(cdLabel(c)):"Birthdays and trips"})())}
   ${tile("bills",ICON.bill,"Bills",S().bills.length?S().bills.length+" bill"+(S().bills.length===1?"":"s")+" tracked":"Rent, power, subscriptions")}
   ${tile("mood",ICON.mood,"Mood","Check in, or a 5-minute family check")}
   ${tile("wallet",ICON.wallet,"Wallet",cards+" card"+(cards===1?"":"s")+" and passes")}
   ${tile("notes",ICON.note,"Notes",S().notes.length+" note"+(S().notes.length===1?"":"s"))}
   ${tile("calc",ICON.calc,"Calculator","Quick sums, then save as spending")}
   ${tile("location",ICON.pin,"Family location","See where everyone is")}
   <button class="tile" data-act="slot"><span class="tilechar">🎲</span><b>Bottom shortcut</b><span>This week: ${esc(NAV[sl.r][0])}. Tap to change</span></button>
   <button class="tile" data-act="settings">${ICON.gear}<b>Settings</b><span>Names, currency, ${ST.mode==="cloud"?"family code":"backup"}</span></button>
   ${suShow()?tile("signups",'<span class="tilechar">📈</span>',"Sign-ups",SU.can&&SU.res&&SU.res.ok?SU.res.list.length+(SU.res.list.length===1?" person has":" people have")+" signed up":SU.can?"How many people have signed up":"Turn on the sign-up count"):""}
  </div>`;
}

/* ---------- Sign-ups ---------- */
/* How many people have signed up to Happy Home. Each account notes only when it was made (store.js _signupPing).
   The list can be read only by the accounts of the family that runs the app: the Firestore rules name that family.
   Until those rules are published, the person who made this family (and only a family made before 1 Dec 2026, so no
   later family is shown this) sees one step to publish them, with this family's own code already filled in. */
const SU={uid:null,can:null,res:null,un:null,asking:false};
const SU_SINCE=Date.UTC(2026,10,30,14);            // 1 Dec 2026, Brisbane
function suSync(){                                 // a different account signed in on this phone: start again for it
  const u=ST.mode==="cloud"&&ST.me.uid||"";if(SU.uid===u)return;
  try{SU.un&&SU.un()}catch(_){}
  Object.assign(SU,{uid:u,can:null,res:null,un:null,asking:false,pinged:false});
  const c=u&&ST._localPref("suCan:"+u);if(c)SU.can=c==="1";
}
function suIsSetter(){const st=S().settings||{};return ST.mode==="cloud"&&!!ST.me.uid&&st.owner===ST.me.uid&&!(st.createdAt>=SU_SINCE)}
function suShow(){suSync();return !!SU.uid&&(SU.can===true||suIsSetter())}
function suAsk(force){
  suSync();if(!SU.uid||SU.asking)return;
  const at=+(ST._localPref("suAt:"+SU.uid)||0);if(!force&&Date.now()-at<(SU.can===null?120e3:3600e3))return;
  SU.asking=true;ST._localPref("suAt:"+SU.uid,String(Date.now()));const u=SU.uid;
  ST.signupsProbe(v=>{if(SU.uid!==u)return;SU.asking=false;if(v===null)return;const was=SU.can;SU.can=v;ST._localPref("suCan:"+u,v?"1":"0");if(was!==v)render()});
}
function suWatch(){
  suSync();if(SU.un||!SU.uid||(SU.res&&!SU.res.ok))return;const u=SU.uid;   // after a refusal it waits for Check again
  SU.un=ST.signupsWatch(r=>{if(SU.uid!==u)return;SU.res=r;if(r.ok&&SU.can!==true){SU.can=true;ST._localPref("suCan:"+u,"1")}
    if(!r.ok){if(r.code==="permission-denied"){SU.can=false;ST._localPref("suCan:"+u,"0")}try{SU.un&&SU.un()}catch(_){}SU.un=null}render()});
}
function suRules(fid){
  return `rules_version = '2';
// Happy Home security rules: only members of a family can see or change that family's data.
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isMember(fid) {
      return signedIn() && request.auth.uid in get(/databases/$(database)/documents/families/$(fid)).data.members;
    }

    // Each person's own record (which family they belong to) and private things
    // (private wallet cards, their own mood-check results). Nobody else can read these.
    match /users/{uid} {
      allow read, write: if signedIn() && request.auth.uid == uid;
      match /{sub=**} {
        allow read, write: if signedIn() && request.auth.uid == uid;
      }
    }

    // Sign-ups: each account notes only when it was made (no name, no email).
    // Only the accounts of the family that runs Happy Home can see the list.
    match /signups/{uid} {
      allow get: if signedIn() && request.auth.uid == uid;
      allow create: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['joined', 'at'])
        && request.resource.data.joined is int
        && request.resource.data.at == request.time;
      allow read: if isMember('${fid}');
    }

    match /families/{fid} {
      allow read: if signedIn() && request.auth.uid in resource.data.members;
      allow create: if signedIn()
        && request.resource.data.members == [request.auth.uid]
        && request.resource.data.owner == request.auth.uid;
      // Members can change family settings (names, budgets, ...).
      allow update: if signedIn() && request.auth.uid in resource.data.members
        && request.resource.data.owner == resource.data.owner;
      // Someone with the family code can add only themself to the member list.
      allow update: if signedIn()
        && !(request.auth.uid in resource.data.members)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members'])
        && request.resource.data.members.hasAll(resource.data.members)
        && request.resource.data.members.size() == resource.data.members.size() + 1
        && request.auth.uid in request.resource.data.members
        && request.resource.data.members.size() <= 8;
      allow delete: if signedIn() && request.auth.uid == resource.data.owner;

      // Tasks, calendar, money, shopping, homework, notes, shared wallet cards,
      // shared mood check-ins, locations people chose to share, mood-check requests.
      match /{col}/{docId} {
        allow read, write: if isMember(fid);
      }
    }
  }
}
`;
}
function suFamily(){
  const ps=people(),have=ps.filter(p=>p.uid).length;
  return `<section class="card"><div class="row between"><h2>Our family</h2><span class="sub">${have} of ${ps.length} have an account</span></div>
   <div class="list su-fam">${ps.map(p=>`<div class="su-row"><span class="dot who-${colorIdx(p.id)}${photoOf(p.id)?" ph ph-"+p.id:""}">${photoOf(p.id)?"":esc((pname(p.id)||"?").slice(0,1).toUpperCase())}</span><b>${esc(pname(p.id))}</b><span class="${p.uid?"su-yes":"su-no"}">${p.uid?(p.uid===ST.me.uid?"Has an account · you":"Has an account"):"Not yet"}</span></div>`).join("")}</div>
   ${have<ps.length?`<p class="sub" style="margin-top:8px">Not yet: they make their own account in the app, then enter the family code from Settings.</p><button class="ghost" data-act="settings" style="width:100%;margin-top:6px">Family code in Settings</button>`:""}</section>`;
}
function viewSignups(){
  const back=backBar();
  if(!suShow())return back+`<section class="card"><p class="sub">This page is for the family that runs Happy Home.</p></section>`;
  suWatch();
  const r=SU.res;
  if(!r)return back+`<section class="card"><h2>Sign-ups</h2><p class="sub">Counting…</p></section>`+suFamily();
  if(!r.ok){
    if(r.code==="permission-denied"&&suIsSetter())return back+`<section class="card su-setup"><h2>Turn on the sign-up count</h2>
     <p class="sub">One time, about two minutes. It lets your family's accounts see how many people have signed up to Happy Home. Nobody's name or email is kept, only the time each account was made.</p>
     <ol class="su-steps"><li>Tap <b>Copy the new rules</b>. Your family code is already in them.</li><li>Tap <b>Open Firebase rules</b> and sign in with the Google account that owns Happy Home.</li><li>Select all the text there, paste, then tap <b>Publish</b>.</li><li>Come back and tap <b>Check again</b>.</li></ol>
     <div class="two"><button class="primary" data-act="suCopy">Copy the new rules</button><button class="ghost" data-act="suOpen">Open Firebase rules</button></div>
     <textarea id="suRules" class="su-rules" readonly hidden aria-label="The new rules"></textarea>
     <button class="ghost" data-act="suCheck" style="width:100%;margin-top:8px">Check again</button></section>`+suFamily();
    return back+`<section class="card"><h2>Sign-ups</h2><p class="sub">${r.code==="unavailable"?"No internet just now. The count comes back when the phone is online.":"The count can't be read right now."}</p><button class="ghost" data-act="suCheck" style="width:100%;margin-top:8px">Check again</button></section>`+suFamily();
  }
  if(!SU.pinged&&!r.list.some(x=>x.id===ST.me.uid)){SU.pinged=true;try{ST.signupNow()}catch(_){}}   // this account itself, at once
  const list=r.list.slice().sort((x,y)=>y.joined-x.joined),n=list.length,now=Date.now(),day=864e5;
  const week=list.filter(x=>now-x.joined<7*day).length,today=list.filter(x=>iso(new Date(x.joined))===TODAY()).length;
  // the last 8 weeks, Monday to Sunday
  const t=new Date();t.setHours(0,0,0,0);t.setDate(t.getDate()-((t.getDay()+6)%7));
  const weeks=[];for(let i=7;i>=0;i--){const s=new Date(t);s.setDate(t.getDate()-7*i);const e=new Date(s);e.setDate(s.getDate()+7);weeks.push({s,n:list.filter(x=>x.joined>=s.getTime()&&x.joined<e.getTime()).length})}
  const top=Math.max(1,...weeks.map(w=>w.n));
  const mine={};(S().settings.people||[]).forEach(p=>{if(p.uid)mine[p.uid]=p.id});
  const when=ts=>new Date(ts).toLocaleString("en-AU",{weekday:"short",day:"numeric",month:"short",year:new Date(ts).getFullYear()===new Date().getFullYear()?undefined:"numeric",hour:"numeric",minute:"2-digit"});
  return back+`<section class="card su-top"><div class="su-big">${n}</div><div><b>${n===1?"person has":"people have"} signed up to Happy Home</b><div class="sub">${week} in the last 7 days · ${today} today</div></div></section>
   <section class="card"><h2>Sign-ups each week</h2><div class="su-bars" role="img" aria-label="Sign-ups in each of the last 8 weeks: ${weeks.map(w=>w.n).join(", ")}">${weeks.map((w,i)=>`<div class="su-bar${i===7?" now":""}"><span class="su-n">${w.n||""}</span><i style="height:${Math.round(w.n/top*100)}%"></i><small>${w.s.getDate()} ${w.s.toLocaleDateString("en-AU",{month:"short"})}</small></div>`).join("")}</div><p class="sub" style="margin-top:6px">Each bar is one week, Monday to Sunday. The last one is this week.</p></section>
   <section class="card"><h2>Newest</h2><div class="list su-new">${list.slice(0,20).map(x=>{const pid=mine[x.id];return `<div class="su-row"><span class="dot ${pid?"who-"+colorIdx(pid):"su-anon"}">${pid?esc((pname(pid)||"?").slice(0,1).toUpperCase()):"✨"}</span><b>${pid?esc(pname(pid))+(x.id===ST.me.uid?" (you)":""):"Someone new"}</b><span class="sub">${esc(when(x.joined))}</span></div>`}).join("")||`<p class="sub">Nobody yet.</p>`}</div>
   <p class="sub" style="margin-top:8px">Only your family's accounts can see this. It keeps no names or emails: an account from another family shows as "Someone new". An account appears here the first time it opens this version of the app.</p></section>`+suFamily();
}

/* ---------- Notes ---------- */
function viewNotes(){
  const notes=[...S().notes].sort((a,b)=>(!!b.pinned-!!a.pinned)||((b.updated||0)-(a.updated||0)));
  return `${backBar()}<div class="stack" style="gap:10px">${notes.length?notes.map(n=>`<button class="note" data-act="openNote" data-id="${n.id}"><b>${n.pinned?"📌 ":""}${esc(n.title||"Untitled")}</b><p>${esc(String(n.body||"").replace(/^\s*\[ \]\s?/gm,"☐ ").replace(/^\s*\[x\]\s?/gim,"☑ "))}</p><span class="m">${esc(pname(n.who))} · ${new Date(n.updated||n.createdAt||Date.now()).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span></button>`).join(""):`<div class="card empty">No notes yet. Tap + to write one.</div>`}</div>`;
}

/* ---------- Calculator ---------- */
let calcExpr="", calcLast=null;
function calcEval(s){
  const toks=s.match(/\d*\.?\d+|[+\-×÷%()]/g)||[];let i=0;
  const peek=()=>toks[i], next=()=>toks[i++];
  function prim(){let t=next();if(t==="-")return -prim();if(t==="("){const v=expr();next();return v}let v=parseFloat(t);if(isNaN(v))throw 0;if(peek()==="%"){next();v=v/100}return v}
  function term(){let v=prim();while(peek()==="×"||peek()==="÷"){const o=next(),r=prim();v=o==="×"?v*r:v/r}return v}
  function expr(){let v=term();while(peek()==="+"||peek()==="-"){const o=next(),r=term();v=o==="+"?v+r:v-r}return v}
  const v=expr();if(i<toks.length||!isFinite(v))throw 0;return Math.round(v*1e10)/1e10;
}
function calcPreview(){try{return calcExpr?calcEval(calcExpr):0}catch(e){return null}}
function viewCalc(){
  const p=calcPreview();
  const keys=[["C","fn"],["(","fn"],[")","fn"],["÷","op"],["7"],["8"],["9"],["×","op"],["4"],["5"],["6"],["-","op"],["1"],["2"],["3"],["+","op"],["%","fn"],["0"],["."],["=","eq"]];
  return `${backBar()}<div class="calc"><div class="screen" aria-live="polite"><div class="e">${esc(calcExpr)||"&nbsp;"}</div><div class="r">${p===null?"…":p.toLocaleString("en-AU",{maximumFractionDigits:8})}</div></div>
  <div class="keys">${keys.map(([k,c])=>`<button class="key ${c||""}" data-act="key" data-k="${k}" aria-label="${k==="C"?"Clear":k}">${k==="-"?"−":k}</button>`).join("")}</div>
  <div class="two"><button class="ghost" data-act="key" data-k="⌫">⌫ Delete</button><button class="primary" data-act="calcSpend">Save as spending</button></div></div>`;
}
function calcKey(k){
  if(k==="C"){calcExpr="";calcLast=null}
  else if(k==="⌫"){calcExpr=calcExpr.slice(0,-1)}
  else if(k==="="){const v=calcPreview();if(v!==null&&calcExpr){calcLast=v;calcExpr=String(v)}}
  else{if(calcLast!==null&&/[\d.]/.test(k)&&calcExpr===String(calcLast))calcExpr="";calcLast=null;calcExpr+=k}
  render();
}

/* ---------- Location ---------- */
let geoWatch=null;
function mySharing(){return S().locations.some(l=>l.id===String(meId()))}
function viewLocation(){
  const locs=S().locations;
  const sharing=mySharing();
  const others=people().map(p=>{const l=locs.find(x=>x.id===String(p.id));
    return `<div class="item">${dot(p.id)}<div class="grow"><div class="t">${esc(p.name)}${p.id===meId()?(switched()?" (this phone)":" (you)"):""}</div><div class="m">${l?`Updated ${ago(l.at)} · within ${Math.round(l.acc||0)} m`:"Not sharing"}</div></div>${l?`<a class="mapl" href="https://www.google.com/maps?q=${l.lat},${l.lng}" target="_blank" rel="noopener">Map</a>`:""}</div>`}).join("");
  return `${backBar()}
  <section class="card stack" style="gap:12px"><div class="row between"><div class="grow"><h2>${switched()?"Share this phone's location":"Share my location"}</h2><div class="sub">${switched()?"It shows as "+esc(pname(meId()))+"'s, because "+esc(pname(meId()))+" is signed in on this phone":"With "+(ST.mode==="cloud"?"your family":"this device only, until family sharing is set up")}</div></div>
   <button class="toggle ${sharing?"on":""}" data-act="toggleLoc" role="switch" aria-checked="${sharing}" aria-label="Share my location"></button></div>
   <div class="sub">Your location updates while Happy Home is open on your phone. Turn this off any time and your location is removed straight away.${switched()&&!sharing?" Only "+esc(pname(meId()))+" can turn it on, from "+esc(pname(meId()))+"'s own profile.":""}</div></section>
  <section class="card"><h2>Family</h2><div class="list" style="margin-top:6px">${others}</div></section>`;
}
function startGeo(){
  if(!navigator.geolocation){toast("This phone can't share location");return}
  if(geoWatch!==null)return;
  geoWatch=navigator.geolocation.watchPosition(pos=>{
    const prev=S().locations.find(l=>l.id===String(meId()));
    if(prev&&Date.now()-prev.at<60000&&Math.abs(prev.lat-pos.coords.latitude)<0.0005&&Math.abs(prev.lng-pos.coords.longitude)<0.0005)return;
    ST.put("locations",String(meId()),{lat:+pos.coords.latitude.toFixed(5),lng:+pos.coords.longitude.toFixed(5),acc:pos.coords.accuracy,at:Date.now(),person:meId()});
  },err=>{toast(err.code===1?"Location permission was turned down":"Couldn't get your location");stopGeo(true)},{enableHighAccuracy:false,maximumAge:60000,timeout:30000});
}
function stopGeo(remove){if(geoWatch!==null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null}if(remove&&mySharing())ST.del("locations",String(meId()))}

/* ---------- Wallet ---------- */
const CARD_COLORS=["#E0662F","#1E7F5C","#22325A","#7A4FB5","#2B2B2B","#1C8FB3","#C2457A","#B08A12"];
function allCards(){return [...S().wallet.map(c=>({...c,shared:true})),...(switched()?[]:S().myWallet.map(c=>({...c,shared:false})))]}
function walletCard(w,full){
  return `<button class="wcard ${full?"full":""}" data-act="openCard" data-id="${w.id}" style="background:${/^#[0-9a-f]{3,8}$/i.test(w.bg||"")?w.bg:"#22325A"};color:#fff">
  <div class="row between"><span class="wk">${esc(w.kind||"Card")}${w.shared?"":" · Private"}</span><span class="wh">${dot(w.holder??meId())}</span></div>
  <div class="wn">${esc(w.name)}</div>${full?`${w.num?`<div class="wnum">${esc(w.num)}</div>`:""}${w.extra?`<div class="wx">${esc(w.extra)}</div>`:""}`:""}</button>`;
}
function viewWallet(){
  const cards=allCards(),hid=switched()?S().myWallet.length:0;
  return `${backBar()}${hid?`<div class="sub" id="w_hid">${esc(pname(meId()))}'s ${hid} private card${hid===1?" is":"s are"} put away while ${esc(pname(viewId()))}'s profile is in use.</div>`:""}${cards.length?`<div class="wstack">${cards.map(w=>walletCard(w,false)).join("")}</div>`:`<section class="card empty">No cards yet. Add loyalty cards, memberships, tickets or a boarding pass.</section>`}
  <section class="card stack" style="gap:8px"><h2>Add to Wallet</h2><div class="sub">Type in the card number to make a scannable barcode or QR code, and add a photo of the card if you like. ${switched()?"Cards added on "+esc(pname(viewId()))+"'s profile here are shared with the whole family.":"Shared cards show for the whole family; private ones only for you."}</div>
  <button class="primary" data-act="addCard">Add a card or pass</button></section>`;
}
function cardSheet(id){
  const w=allCards().find(x=>x.id===id); if(!w)return;
  const code=w.code==="qr"?Codes.qrSVG(w.num):w.code==="bar"?Codes.barcodeSVG(w.num):"";
  openSheet(`${sheetHead(esc(w.kind||"Card"))}${walletCard(w,true)}
   ${code?`<div class="codebox">${code}<div class="num" style="text-align:center;margin-top:6px;color:#111;letter-spacing:.08em">${esc(w.num)}</div></div><div class="sub">Turn your screen brightness up if a scanner has trouble reading it.</div>`:""}
   ${PHOTO_OK.test(w.photo||"")?`<img class="photo" src="${w.photo}" alt="Photo of ${esc(w.name)}">`:""}
   <div class="sub">Belongs to ${esc(pname(w.holder??meId()))} · ${w.shared?"Shared with the family":"Only you can see this"}</div>
   <div class="two"><button class="ghost" data-act="editCard" data-id="${w.id}">Edit</button><button class="ghost" id="c_del">Delete</button></div>`,sh=>{
    const d=sh.querySelector("#c_del");d.onclick=()=>{if(d.dataset.arm){ST.del(w.shared?"wallet":"myWallet",w.id);closeSheet();toast("Card deleted")}else{d.dataset.arm=1;d.textContent="Tap again to delete";d.style.color="var(--bad)"}};
  });
}
function cardForm(id){
  const w=id?allCards().find(x=>x.id===id):{kind:"Loyalty card",name:"",num:"",extra:"",code:"bar",bg:CARD_COLORS[0],holder:viewId(),shared:true};
  let bg=w.bg, photo=w.photo||"";
  openSheet(`${sheetHead(id?"Edit card":"Add a card")}<form id="f" class="stack" style="gap:12px">
   <div class="two"><div class="field"><label for="w_kind">Type</label><select id="w_kind">${["Loyalty card","Membership","Health card","Tickets","Boarding pass","Gift card","ID","Other"].map(k=>`<option ${k===w.kind?"selected":""}>${k}</option>`).join("")}</select></div>
   <div class="field"><label for="w_holder">Belongs to</label><select id="w_holder"><option value="0" ${w.holder==0?"selected":""}>Whole family</option>${people().map(p=>`<option value="${p.id}" ${p.id==w.holder?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div></div>
   <div class="field"><label for="w_name">Name on the card</label><input id="w_name" required value="${esc(w.name)}" placeholder="e.g. Supermarket Rewards"></div>
   <div class="field"><label for="w_num">Card or ticket number</label><input id="w_num" value="${esc(w.num)}" placeholder="e.g. 9355 0142 7781 206" autocomplete="off"></div>
   <div class="field"><label for="w_code">Show as</label><select id="w_code"><option value="bar" ${w.code==="bar"?"selected":""}>Barcode</option><option value="qr" ${w.code==="qr"?"selected":""}>QR code</option><option value="none" ${w.code==="none"?"selected":""}>Number only</option></select></div>
   <div class="field"><label for="w_extra">Extra details (optional)</label><input id="w_extra" value="${esc(w.extra||"")}" placeholder="e.g. Valid to 03/2029, seat 34A"></div>
   <div class="field"><label>Colour</label><div class="colors">${CARD_COLORS.map(c=>`<button type="button" data-c="${c}" class="${c===bg?"on":""}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}</div></div>
   <div class="field"><label for="w_photo">Photo of the card (optional)</label><input id="w_photo" type="file" accept="image/*"></div>
   ${switched()?`<div class="sub">On ${esc(pname(viewId()))}'s profile here, a card is shared with the whole family. A private card needs ${esc(pname(viewId()))}'s own sign-in.</div>`:`<label class="checkrow" for="w_shared"><input type="checkbox" id="w_shared" ${w.shared?"checked":""}> Share with the family</label>`}
   <button class="primary" type="submit">Save card</button></form>`,sh=>{
    sh.querySelectorAll(".colors button").forEach(b=>b.onclick=()=>{bg=b.dataset.c;sh.querySelectorAll(".colors button").forEach(x=>x.classList.toggle("on",x===b))});
    sh.querySelector("#w_photo").onchange=async e=>{const f=e.target.files[0];if(!f)return;photo=await shrinkImage(f,900,.72);toast("Photo added")};
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const v=k=>sh.querySelector("#"+k).value.trim();
      const rec={kind:v("w_kind"),holder:+v("w_holder"),name:v("w_name"),num:v("w_num"),code:v("w_code"),extra:v("w_extra"),bg,photo};
      const shared=switched()||sh.querySelector("#w_shared").checked;
      if(id){const old=allCards().find(x=>x.id===id);if(old.shared!==shared){ST.del(old.shared?"wallet":"myWallet",id);ST.add(shared?"wallet":"myWallet",rec)}else ST.patch(shared?"wallet":"myWallet",id,rec)}
      else ST.add(shared?"wallet":"myWallet",rec);
      closeSheet();toast("Card saved")};
  });
}
function shrinkImage(file,max,q){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);res(c.toDataURL("image/jpeg",q))};img.onerror=rej;img.src=URL.createObjectURL(file)})}

/* ---------- Mood ---------- */
function setMapKey(col,id,field,key,val){const r=S()[col].find(x=>x.id===id);if(!r)return;if(ST.mode==="local")ST.patch(col,id,{[field]:{...(r[field]||{}),[key]:val}});else ST.patch(col,id,{[field+"."+key]:val})}
const MOODS=[["great","Great","#2E9E6A"],["good","Good","#7DB547"],["okay","Okay","#D2A21B"],["tired","Tired","#7B8794"],["stressed","Stressed","#D2702B"],["upset","Upset","#C24848"]];
const moodOf=k=>MOODS.find(x=>x[0]===k)||MOODS[2];
const moodBadge=k=>{const m=moodOf(k);return `<span class="mbadge" style="--m:${m[2]}">${m[1]}</span>`};
let pickMood="good";
const MOOD_SECONDS=300, ASK_SECONDS=120;
function activeSession(){const now=Date.now();return S().moodSessions.filter(s=>(s.state==="asking"&&now-s.createdAt<ASK_SECONDS*1000)||(s.state==="ready"&&now-s.createdAt<(ASK_SECONDS+180)*1000)||(s.state==="listening"&&now<s.endsAt+15000)).sort((a,b)=>b.createdAt-a.createdAt)[0]}
function lastResultForMe(){const mine=S().moodSessions.filter(s=>s.state==="done"&&s.result&&(s.people||[]).includes(meId())).sort((a,b)=>b.createdAt-a.createdAt)[0];return mine&&Date.now()-mine.createdAt<6*3600e3&&!(mine.seen||{})[meId()]?mine:null}
function moodRequestBanner(){
  const s=activeSession();
  if(!s||s.state!=="asking"||!(s.people||[]).includes(meId())||(s.agreed||{})[meId()])return "";
  if(switched())return `<div class="reqbar"><b>${esc(pname(s.starter))} asks ${esc(pname(meId()))} to join a 5-minute family mood check</b><span class="sub">Only ${esc(pname(meId()))} can say yes, from ${esc(pname(meId()))}'s own profile. This phone is on ${esc(pname(viewId()))}'s profile now.</span>
  <div class="two"><button class="ghost" data-act="moodDecline" data-id="${s.id}">No thanks</button><button class="primary" data-act="viewAs" data-k="${meId()}">Switch to ${esc(pname(meId()))}</button></div></div>`;
  return `<div class="reqbar"><b>${esc(pname(s.starter))} wants to do a 5-minute family mood check</b><span class="sub">${esc(pname(s.starter))}'s phone will listen to the room. Nothing is recorded or saved. The result goes to everyone who takes part.</span>
  <div class="two"><button class="ghost" data-act="moodDecline" data-id="${s.id}">No thanks</button><button class="primary" data-act="moodAgree" data-id="${s.id}">I agree</button></div></div>`;
}
function viewMood(){
  const s=activeSession();
  if(s&&s.state==="asking")return `${backBar()}${moodRequestBanner()}
   <section class="card stack" style="gap:12px"><h2>Family mood check</h2><p style="margin:0">It starts only when everyone below has said yes on their own phone.</p>
    <div class="list">${(s.people||[]).map(id=>{const ok=(s.agreed||{})[id],no=(s.declined||{})[id];return `<div class="item">${dot(id)}<div class="grow"><div class="t">${esc(pname(id))}</div><div class="m">${id===s.starter?"Started this":ok?"Agreed":no?"Said no":"Waiting for an answer"}</div></div><span class="pill ${ok?"today":no?"late":""}">${ok?"Agreed":no?"No":"Waiting"}</span></div>`}).join("")}</div>
    <div class="sub">If anyone says no, or doesn't answer within 2 minutes, it won't start.</div>
    <button class="ghost" data-act="moodCancel" data-id="${s.id}">Cancel</button></section>`;
  if(s&&s.state==="ready"){
    const mine=s.starter===meId()&&!switched();
    return `${backBar()}<section class="card stack" style="gap:14px;text-align:center;align-items:center"><h2>Everyone agreed</h2>
     <div class="row" style="justify-content:center;gap:14px;flex-wrap:wrap">${(s.people||[]).map(i=>`<span class="row" style="gap:6px">${dot(i)}<span class="sub">${esc(pname(i))}</span></span>`).join("")}</div>
     ${mine?`<p class="sub" style="margin:0">Your phone will listen for 5 minutes. Keep Happy Home open and the phone in the middle of the room.</p><button class="primary" style="width:100%" data-act="moodListen" data-id="${s.id}">Start listening</button>`:`<p class="sub" style="margin:0">Waiting for ${esc(pname(s.starter))} to start it${s.starter===meId()?" from "+esc(pname(meId()))+"'s own profile":""}.</p>${s.starter===meId()?`<button class="ghost" style="width:100%" data-act="viewAs" data-k="${meId()}">Switch to ${esc(pname(meId()))}'s profile</button>`:""}`}
     <button class="ghost" style="width:100%" data-act="moodCancel" data-id="${s.id}">Cancel</button></section>`;
  }
  if(s&&s.state==="listening"){
    const left=Math.max(0,Math.round((s.endsAt-Date.now())/1000));const frac=left/MOOD_SECONDS;
    const here=s.starter===meId()&&listener.sid===s.id;
    return `<section class="listen"><div class="recdot"><i></i>Listening on ${esc(pname(s.starter))}'s phone · everyone agreed</div>
     <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="prog" style="stroke-dasharray:326.7;stroke-dashoffset:${(326.7*(1-frac)).toFixed(1)}"/></svg><div class="clock"><b>${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}</b><span>left of 5:00</span></div></div>
     <div class="row" style="justify-content:center;gap:14px;flex-wrap:wrap">${(s.people||[]).map(i=>`<span class="row" style="gap:6px">${dot(i)}<span class="sub">${esc(pname(i))}</span></span>`).join("")}</div>
     <button class="stopbtn" data-act="moodStop" data-id="${s.id}">Stop now</button>
     <p class="sub" style="margin:0;text-align:center">Anyone taking part can stop it from their own phone. ${here?"Sound is measured on this phone and never recorded or saved.":"Nothing is recorded or saved."}</p></section>`;
  }
  const res=switched()?null:lastResultForMe();
  const t=TODAY();
  const todays=people().map(p=>{const c=S().moods.filter(m=>m.person===p.id&&m.date===t).sort((a,b)=>b.at-a.at)[0];
    return `<div class="item">${dot(p.id)}<div class="grow"><div class="t">${esc(p.name)}${p.id===viewId()?" (you)":""}</div><div class="m">${c?`Checked in ${new Date(c.at).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})}${c.note?` · "${esc(c.note)}"`:""}${fromPhone(c)}`:"Hasn't shared today"}</div></div>${c?moodBadge(c.mood):`<span class="pill">Private</span>`}</div>`}).join("");
  const week=[...Array(7)].map((_,i)=>addDays(t,i-6));
  return `${backBar()}${res?resultCard(res):""}
  <section class="card stack" style="gap:10px"><div class="row between"><h2>How's everyone today?</h2><span class="sub">${nice(t)}</span></div><div class="list">${todays}</div><div class="sub">You only see what each person chooses to share.</div></section>
  <section class="card stack" style="gap:10px"><h2>${switched()?"How is "+esc(pname(viewId()))+" feeling?":"How are you feeling?"}</h2>
   <div class="moodpick">${MOODS.map(([k,n,c])=>`<button class="${k===pickMood?"on":""}" style="--m:${c}" data-act="pickMood" data-k="${k}"><i></i>${n}</button>`).join("")}</div>
   <input class="noteinput" id="moodNote" placeholder="Add a few words (optional)" aria-label="Mood note" maxlength="80">
   ${switched()?`<button class="primary" data-act="moodShare">Share with family as ${esc(pname(viewId()))}</button>`:`<div class="two"><button class="ghost" data-act="moodPrivate">Keep private</button><button class="primary" data-act="moodShare">Share with family</button></div>`}</section>
  <section class="card stack" style="gap:8px"><h2>5-minute family mood check</h2>
   <div class="sub">Your phone listens to the room for 5 minutes and gives a rough read of how calm or loud it was. Everyone in the room agrees on their own phone first, anyone can stop it, and nothing is recorded or saved.</div>
   ${switched()?`<div class="sub">Only ${esc(pname(meId()))}, who is signed in on this phone, can start one, from ${esc(pname(meId()))}'s own profile.</div><button class="ghost" data-act="viewAs" data-k="${meId()}">Switch to ${esc(pname(meId()))}'s profile</button>`:`<button class="primary" data-act="moodStart">Start a mood check</button>`}</section>
  <section class="card"><div class="row between"><h2>This week</h2><span class="sub">Shared check-ins</span></div>
   <div class="week">${week.map(d=>`<div><span class="sub">${new Date(d+"T12:00:00").toLocaleDateString("en-AU",{weekday:"narrow"})}</span>${people().map(p=>{const c=S().moods.filter(m=>m.person===p.id&&m.date===d).sort((a,b)=>b.at-a.at)[0];return `<i style="background:${c?moodOf(c.mood)[2]:"var(--sunk)"}" title="${esc(p.name)}"></i>`}).join("")}</div>`).join("")}</div>
   <div class="row" style="gap:12px;margin-top:8px;flex-wrap:wrap">${people().map((p,i)=>`<span class="sub">Row ${i+1}: ${esc(p.name)}</span>`).join("")}</div></section>`;
}
function resultCard(s){
  const r=s.result, col=r.level===1?"#2E9E6A":r.level===2?"#7DB547":"#D2702B";
  return `<section class="card stack" style="gap:12px"><div class="row between"><h2>Family mood check</h2><span class="pill">For those who took part</span></div>
   <div class="row" style="gap:14px;flex-wrap:wrap"><div class="bigmood" style="--m:${col}">${esc(r.label)}</div><div class="sub grow">${Math.round(r.seconds/60)||"<1"} min · ${new Date(s.startedAt||s.createdAt).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})}</div></div>
   <div><div class="label" style="margin-bottom:6px">How it changed</div><div class="tline">${(r.buckets||[]).map(v=>`<i style="height:${v*12+8}px;background:${["","#2E9E6A","#7DB547","#D2A21B"][v]}"></i>`).join("")}</div></div>
   <p class="sub" style="margin:0">This is a rough read of how loud and up-and-down the room sounded, not a judgement of anyone. It can be wrong, for example when people are excited, laughing, or the TV is on.</p>
   <div class="two"><button class="ghost" data-act="moodSeen" data-id="${s.id}">Dismiss</button><button class="primary" data-act="moodShareResult" data-id="${s.id}">Share as my check-in</button></div></section>`;
}
function moodStartSheet(){
  const ppl=people();
  openSheet(`${sheetHead("Who's in the room?")}<p class="sub" style="margin:0">Everyone you tick gets a request on their phone and must say yes before listening starts. Only start if everyone in the room has agreed.</p>
   <form id="f" class="stack" style="gap:6px">${ppl.map(p=>{const can=ST.mode==="local"?p.id===meId():(!!p.uid);return `<label class="checkrow" for="mp_${p.id}"><input type="checkbox" id="mp_${p.id}" value="${p.id}" ${p.id===meId()?"checked disabled":""} ${can?"":"disabled"}> ${dot(p.id)} <span class="grow">${esc(p.name)}${can?"":` <span class="sub">· needs Happy Home on their phone first</span>`}</span></label>`}).join("")}
   <div class="err" id="mp_err" hidden></div><button class="primary" type="submit">Send request</button></form>`,sh=>{
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const ids=[meId(),...[...sh.querySelectorAll("input:checked:not(:disabled)")].map(i=>+i.value)];
      const sid=ST.add("moodSessions",{starter:meId(),people:ids,agreed:{[meId()]:true},declined:{},state:"asking"});
      closeSheet();toast(ids.length>1?"Request sent":"Starting");setTimeout(()=>moodTick(),300);};
  });
}
/* the listening engine runs only on the starter's phone, only after everyone agreed */
const listener={sid:null,stream:null,ctx:null,timer:null,levels:[]};
async function startListening(s){
  if(listener.sid)return;
  listener.sid=s.id; listener.levels=[];
  try{
    listener.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  }catch(e){listener.sid=null;ST.patch("moodSessions",s.id,{state:"cancelled",reason:"mic"});toast("Microphone permission was turned down, so the check was cancelled");return}
  const AC=window.AudioContext||window.webkitAudioContext; listener.ctx=new AC(); try{await listener.ctx.resume()}catch(e){}
  try{listener.wake=await navigator.wakeLock?.request("screen")}catch(e){}
  const src=listener.ctx.createMediaStreamSource(listener.stream); const an=listener.ctx.createAnalyser(); an.fftSize=2048; src.connect(an);
  const buf=new Float32Array(an.fftSize); let acc=[];
  const endsAt=Date.now()+MOOD_SECONDS*1000;
  ST.patch("moodSessions",s.id,{state:"listening",startedAt:Date.now(),endsAt});
  listener.timer=setInterval(()=>{
    an.getFloatTimeDomainData(buf);let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];
    acc.push(10*Math.log10(sum/buf.length+1e-10));
    if(acc.length>=10){listener.levels.push(Math.max(...acc));acc=[]} // one peak value per second
    const cur=S().moodSessions.find(x=>x.id===s.id);
    if(!cur||cur.state!=="listening"&&Date.now()>endsAt-MOOD_SECONDS*1000+5000||Date.now()>=endsAt) finishListening();
  },100);
}
function analyse(levels){
  if(!levels.length)return {label:"Too short to tell",level:1,buckets:[],seconds:0};
  const sorted=[...levels].sort((a,b)=>a-b), base=sorted[Math.floor(sorted.length*.2)];
  const n=Math.min(10,levels.length), size=Math.ceil(levels.length/n), buckets=[];
  let loudTotal=0;
  for(let i=0;i<levels.length;i+=size){const part=levels.slice(i,i+size);const loud=part.filter(v=>v>base+22).length/part.length;const busy=part.filter(v=>v>base+10).length/part.length;
    loudTotal+=part.filter(v=>v>base+22).length;buckets.push(loud>.2?3:busy>.35?2:1)}
  const lf=loudTotal/levels.length;
  const level=lf>.15?3:lf>.05||buckets.filter(b=>b>=2).length>buckets.length/2?2:1;
  return {label:level===1?"Mostly calm":level===2?"Some loud moments":"Lots of loud moments",level,buckets,seconds:levels.length};
}
function finishListening(){
  if(!listener.sid)return;
  const sid=listener.sid; clearInterval(listener.timer);
  try{listener.stream.getTracks().forEach(t=>t.stop())}catch(e){}
  try{listener.ctx.close()}catch(e){}
  try{listener.wake&&listener.wake.release()}catch(e){}
  const result=analyse(listener.levels);
  listener.sid=null;listener.stream=null;listener.ctx=null;listener.levels=[];
  const cur=S().moodSessions.find(x=>x.id===sid);
  ST.patch("moodSessions",sid,{state:"done",result,stoppedEarly:!!(cur&&cur.state==="stopped")});
  render();
}
function moodTick(){
  const s=S().moodSessions.filter(x=>x.state==="asking"||x.state==="ready"||x.state==="listening"||x.state==="stopped").sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(listener.sid){const cur=S().moodSessions.find(x=>x.id===listener.sid);if(!cur||cur.state==="stopped"||cur.state==="cancelled")finishListening()}
  if(!s)return;
  if(s.starter!==meId())return;
  if(s.state==="asking"){
    const all=(s.people||[]).every(id=>(s.agreed||{})[id]);
    const anyNo=(s.people||[]).some(id=>(s.declined||{})[id]);
    if(anyNo)ST.patch("moodSessions",s.id,{state:"cancelled",reason:"declined"});
    else if(Date.now()-s.createdAt>ASK_SECONDS*1000)ST.patch("moodSessions",s.id,{state:"cancelled",reason:"timeout"});
    else if(all)ST.patch("moodSessions",s.id,{state:"ready"});
  }
}
function cleanupMoodSessions(){ // old requests go away after a day
  S().moodSessions.filter(s=>Date.now()-s.createdAt>24*3600e3&&s.starter===meId()).forEach(s=>ST.del("moodSessions",s.id));
}

/* ---------- auth & family setup (cloud mode) ---------- */
function viewAuth(){
  return `<div class="auth"><div class="logo">H</div><h1>Happy Home</h1><p class="sub" style="margin:0">One place for your family's money, plans, lists and more.</p>
  <div class="seg"><button class="${authMode==="signin"?"on":""}" data-act="authMode" data-k="signin">Sign in</button><button class="${authMode==="signup"?"on":""}" data-act="authMode" data-k="signup">Create account</button></div>
  <form id="authForm" class="stack" style="gap:12px">
   <div class="field"><label for="a_email">Email</label><input id="a_email" type="email" autocomplete="email" required></div>
   <div class="field"><label for="a_pw">Password</label><input id="a_pw" type="password" autocomplete="${authMode==="signup"?"new-password":"current-password"}" minlength="6" required></div>
   ${authMode==="signin"?`<div class="field"><label for="a_code">2FA code</label><input id="a_code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7"></div>`:""}
   ${authErr?`<div class="err">${esc(authErr)}</div>`:""}
   <button class="primary" type="submit" ${busy?"disabled":""}>${authMode==="signup"?"Create account":"Sign in"}</button></form>
  ${authMode==="signin"?`<button class="link" data-act="forgot">Forgot password?</button>`:couponBox()}</div>`;
}
/* ---------- coupon on the sign-up page ----------
   "Use a coupon to get ads removed". There are no coupons yet, so every code gets an honest "That code isn't valid".
   To make a code work later, add the SHA-256 (hex) of the code, in capitals with only letters and numbers, to COUPONS.
   The code itself never goes in this public file. */
const COUPONS=[];
const cpNorm=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
async function cpCheck(code){
  const c=cpNorm(code);if(!c||!COUPONS.length)return false;
  try{const h=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(c)))].map(b=>b.toString(16).padStart(2,"0")).join("");return COUPONS.includes(h)}catch(_){return false}
}
function couponBox(){
  return `<section class="card stack coupon" style="gap:10px"><b class="cpline">🎟️ Use a coupon to get ads removed</b>
   <form id="cpForm" class="row" style="gap:8px;align-items:stretch" autocomplete="off" novalidate><div class="field grow"><input id="cp_code" value="${esc(cpCode)}" placeholder="Coupon code" aria-label="Coupon code" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="40" enterkeyhint="done" style="text-transform:uppercase;letter-spacing:.08em"></div><button class="ghost" type="submit" style="padding:0 18px">Apply</button></form>
   ${cpMsg?`<div class="${cpOk?"sub":"err"}" id="cpMsg" role="status">${esc(cpMsg)}</div>`:""}</section>`;
}
function viewFamilySetup(){
  return `<div class="auth"><h1>Set up your family</h1>
  <section class="card stack" style="gap:12px"><h2>Start a new family</h2>
   <form id="newFam" class="stack" style="gap:10px">
    <div class="field"><label for="n_me">Your name</label><input id="n_me" required placeholder="e.g. Dad"></div>
    <div class="two"><div class="field"><label for="n_2">Other parent</label><input id="n_2" placeholder="e.g. Mum"></div><div class="field"><label for="n_3">Child</label><input id="n_3" placeholder="Their name"></div></div>
    <div class="field"><label for="n_cur">Currency symbol</label><input id="n_cur" value="$" maxlength="4"></div>
    <button class="primary" type="submit" ${busy?"disabled":""}>Create family</button></form></section>
  <section class="card stack" style="gap:12px"><h2>Join your family</h2><div class="sub">Ask whoever set it up for the family code. It's in their Settings.</div>
   <form id="joinFam" class="stack" style="gap:10px"><div class="field"><label for="j_code">Family code</label><input id="j_code" required placeholder="e.g. K7QM2PXR" autocapitalize="characters" autocomplete="off" style="letter-spacing:.15em;text-transform:uppercase"></div>
   <button class="primary" type="submit" ${busy?"disabled":""}>Join family</button></form></section>
  ${authErr?`<div class="err">${esc(authErr)}</div>`:""}
  <button class="link" data-act="signOut">Sign out (${esc(ST.me.email||"")})</button></div>`;
}
function viewClaim(){
  const free=people().filter(p=>!p.uid);
  return `<div class="auth"><h1>Which one are you?</h1><p class="sub" style="margin:0">Pick your name so tasks and check-ins show up as yours.</p>
   <div class="stack" style="gap:10px">${free.map(p=>`<button class="tile" data-act="claim" data-k="${p.id}" style="flex-direction:row;align-items:center">${dot(p.id)}<b>${esc(p.name)}</b></button>`).join("")||`<div class="card">Everyone's name is taken. Ask a family member to add you in Settings.</div>`}</div>
   <button class="link" data-act="signOut">Sign out</button></div>`;
}
function authErrorText(e){const c=e&&e.code||"";return c.includes("invalid-verification-code")||c.includes("invalid-code")?"That code didn't work. Use the newest code in your authenticator app and try again.":c.includes("mfa-expired")||c.includes("code-expired")||c.includes("session-expired")?"That took too long. Go back and sign in again.":c.includes("unverified-email")?"Confirm your email first. Tap the link we sent you.":c.includes("requires-recent-login")?"Please check your password again.":c.includes("operation-not-allowed")?"Two-step sign-in isn't switched on for your family yet.":c.includes("too-many-requests")?"Too many tries. Wait a few minutes and try again.":c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")?"That email and password don't match. Check them and try again."
  :c.includes("email-already-in-use")?"There's already an account with that email. Tap Sign in instead.":c.includes("weak-password")?"Use a password with at least 6 characters.":c.includes("invalid-email")?"That email address doesn't look right."
  :c.includes("network")?"You seem to be offline. Connect to the internet and try again.":c.includes("permission-denied")||c.includes("not-found")?"That family code didn't work. Check it with the person who set up the family.":"Something went wrong. Please try again."}

/* ---------- quick add: type a sentence, the app works out what it is ---------- */
const WEEKDAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const MONTHS=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const EVENTISH=/\b(appointment|appt|dentist|doctor|gp|vet|party|meeting|training|practice|lesson|class|dinner|lunch|breakfast|brunch|birthday|game|match|flight|pickup|pick up|drop off|visit|concert|movie|cinema|swimming|swim|yoga|gym|dance|ballet|karate|taekwondo|playdate|sleepover|soccer|football|footy|netball|cricket|basketball|tennis|piano|guitar|tutor|haircut|interview|wedding|bbq|church|temple|excursion|camp|holiday|recital|assembly|parent teacher)\b/i;
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function parseQuick(txt){
  let s=" "+txt.trim()+" ";const out={kind:null,title:"",who:null,date:null,time:null,amount:null,items:null,subject:null};
  const cut=re=>{const m=s.match(re);if(m){s=s.replace(re," ");}return m};
  // shopping: "buy milk, eggs and bread"
  let m=s.match(/^\s*(buy|get|shop|shopping)\s*:?\s+(.+)$/i);
  if(m){out.kind="shop";out.items=m[2].split(/\s*(?:,|\band\b|&|\+)\s*/i).map(x=>x.trim()).filter(Boolean);return out}
  // money: "$45 petrol", "spent 12.50 on lunch", "paid 80 electricity"
  m=s.match(/\$\s?(\d+(?:\.\d{1,2})?)/)||s.match(/\b(?:spent|paid)\s+\$?(\d+(?:\.\d{1,2})?)/i);
  if(m){out.kind="money";out.amount=+m[1];s=s.replace(m[0]," ").replace(/\b(spent|paid|bought|on|for)\b/gi," ");}
  // person
  for(const p of people()){const first=p.name.split(/\s+/)[0],aka=String(p.aka||"").trim(),syn={mum:["mum","mom","mummy","mama"],dad:["dad","daddy","papa"]}[p.name.toLowerCase()]||[];for(const nm of [...new Set([p.name,first,aka,aka.split(/\s+/)[0],...syn])].filter(Boolean)){
    if(new RegExp("\\b(?:pick\\s*up|drop\\s*off|collect|call|meet|ring|text|visit|help)\\s+"+reEsc(nm)+"\\b","i").test(s)){out.keepWho=p.id;break}
    const pos=new RegExp("\\s"+reEsc(nm)+"'s(?=\\s)","i");if(pos.test(s)){out.who=p.id;break}
    const re=new RegExp("\\s(?:for\\s+|with\\s+)?"+reEsc(nm)+"(?=\\s)","i");if(re.test(s)){out.who=p.id;s=s.replace(re," ");break}}
    if(out.who||out.keepWho)break}
  // time
  const tmm=cut(/\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=\s)/i)||cut(/\s(?:at\s+|@\s*)(\d{1,2})(?:[:.](\d{2}))?(?=\s)/i)||cut(/\s(\d{1,2})[:](\d{2})(?=\s)/);
  if(tmm){let h=+tmm[1];const mi=+(tmm[2]||0),ap=(tmm[3]||"").toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;if(!ap&&h>=1&&h<=7)h+=12;if(h<24&&mi<60)out.time=String(h).padStart(2,"0")+":"+String(mi).padStart(2,"0")}
  if(cut(/\s(?:at\s+)?(noon|midday|lunchtime)(?=\s)/i)&&!out.time)out.time="12:00";
  if(cut(/\s(?:this\s+)?(morning)(?=\s)/i)&&!out.time)out.time="09:00";
  if(cut(/\s(?:this\s+)?(afternoon|arvo)(?=\s)/i)&&!out.time)out.time="15:00";
  if(cut(/\s(?:this\s+)?(tonight|evening)(?=\s)/i)){out.date=out.date||TODAY();if(!out.time)out.time="18:00"}
  {const nm=s.match(/\s(?:at\s+night|((?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?s?)\s+night)(?=\s)/i);if(nm){s=s.replace(nm[0]," "+(nm[1]||"")+" ");if(!out.time)out.time="19:00"}}
  // weekly: "swimming every tuesday and thursday 4pm", "piano wednesdays", "every day"
  const t=TODAY();
  if(!/\bevery\b/i.test(s))s=s.replace(/\s((?:sun|mon|tues|wednes|thurs|fri|satur)days)(?=\s)/i," every $1");
  if(cut(/\s(?:every\s*day|each\s+day|daily)(?=\s)/i))out.daily=true;
  else if(cut(/\s(?:every|each)\s+week(?=\s)/i))out.weekly=true;
  const DW="(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*";
  if((m=cut(new RegExp("\\s(?:on\\s+)?every\\s+("+DW+"(?:\\s*(?:,|and|&)\\s*"+DW+")*)(?=\\s)","i")))){
    out.days=[...new Set(m[1].split(/\s*(?:,|and|&)\s*/i).map(w=>WEEKDAYS.findIndex(x=>x.startsWith(w.toLowerCase().slice(0,3)))).filter(i=>i>=0))];
    if(out.days.length){out.kind="event";let d=t;while(!out.days.includes(dow(d)))d=addDays(d,1);out.date=d}}
  if(cut(/\s(?:on\s+)?today(?=\s)/i))out.date=t;
  else if(cut(/\s(?:on\s+)?yesterday(?=\s)/i))out.date=addDays(t,-1);
  else if(cut(/\s(?:on\s+)?(?:tomorrow|tmr|tmrw|tomoz)(?=\s)/i))out.date=addDays(t,1);
  else if((m=cut(/\s(?:on\s+)?(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?(?=\s)/i))){
    const want=WEEKDAYS.findIndex(w=>w.startsWith(m[2].toLowerCase().slice(0,3)));const now=new Date(t+"T12:00:00").getDay();let diff=(want-now+7)%7;if(diff===0)diff=7;if(m[1])diff+=diff<7?7:0;out.date=addDays(t,diff)}
  else if((m=cut(/\sin\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks)(?=\s)/i))){const n={a:1,an:1,one:1,two:2,three:3}[m[1].toLowerCase()]||+m[1];out.date=addDays(t,n*(m[2].startsWith("week")?7:1))}
  else if(cut(/\snext\s+week(?=\s)/i))out.date=addDays(t,7);
  else if((m=cut(/\s(?:on\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?(?=\s)/))){let y=m[3]?+m[3]:+t.slice(0,4);if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1],12);if(!m[3]&&iso(d)<t)d.setFullYear(y+1);out.date=iso(d)}
  else if((m=cut(new RegExp("\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+("+MONTHS.join("|")+")[a-z]*(?=\\s)","i"))||cut(new RegExp("\\s(?:on\\s+)?("+MONTHS.join("|")+")[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)","i")))){
    const a=isNaN(+m[1])?[m[2],m[1]]:[m[1],m[2]];const mo=MONTHS.indexOf(a[1].slice(0,3).toLowerCase());const y=+t.slice(0,4);const d=new Date(y,mo,+a[0],12);if(iso(d)<t)d.setFullYear(y+1);out.date=iso(d)}
  // homework
  const HWSUBJ=/\b(maths|math|english|science|hass|history|geography|spelling|reading|japanese|chinese|mandarin)\b/i;
  if(!out.kind&&(/\bhomework\b|\bassignment\b|\bworksheet\b/i.test(s)||(HWSUBJ.test(s)&&/\b(reading|spelling|test|project|practice|worksheet|questions|essay)\b/i.test(s)&&!out.time))){out.kind="homework";s=s.replace(/\bhomework\b/i," ").replace(/\bdue\b/i," ");
    const subj=["Maths","Math","English","Science","HASS","History","Geography","Art","Music","Japanese","Chinese","PE","Spelling","Reading"].find(x=>new RegExp("\\b"+x+"\\b","i").test(s));if(subj){out.subject=subj==="Math"?"Maths":subj;s=s.replace(new RegExp("\\b"+subj+"\\b","i")," ")}}
  if(!out.kind&&/\b(remind me to|todo|to do|task)\b/i.test(s)){out.kind="task";s=s.replace(/\b(remind me to|todo|to do|task)\b:?/i," ")}
  if(!out.time&&EVENTISH.test(s)){const bh=s.match(/\s(\d{1,2})\s*$/);if(bh&&+bh[1]>=1&&+bh[1]<=12){let h=+bh[1];if(h<=7)h+=12;out.time=String(h).padStart(2,"0")+":00";s=s.replace(/\s(\d{1,2})\s*$/," ")}}
  // a plain list of groceries: "milk eggs bread", "need milk"
  if(!out.kind&&!out.time&&!out.date){const body=s.replace(/^\s*(need|we need|out of|ran out of|more)\s+/i," ").trim();const parts=body.split(/\s*(?:,|\band\b|&)\s*/i).filter(Boolean);const toks=parts.length>1?parts:body.split(/\s+/);
    if(toks.length&&toks.length<=8&&toks.every(x=>aisleOf(x)!=="Other")){out.kind="shop";out.items=(parts.length>1||toks.length===1)?toks:toks;return out}}
  if(!out.kind)out.kind=(out.time||EVENTISH.test(s))?"event":"task";
  if(out.daily&&out.kind==="event"){out.days=[0,1,2,3,4,5,6];out.date=out.date||t}
  if(out.weekly&&out.kind==="event"&&!out.days){out.days=[dow(out.date||t)];out.date=out.date||t}
  if(out.kind==="task"&&(out.daily||out.weekly||out.days)){out.repeat=out.daily?"daily":"weekly";if(out.days&&!out.date)out.date=t}
  out.title=s.replace(/\s+(on|at|by|for|in|the)\s*$/i,"").replace(/^\s*(on|at|by|for)\s+/i,"").replace(/\s+/g," ").trim();
  out.title=out.title.replace(/^(bought|buy)\s+/i,"").replace(/\s+at$/i,"");
  if(out.kind==="homework"&&!out.title)out.title=out.subject||"Homework";
  out.title=out.title.charAt(0).toUpperCase()+out.title.slice(1);
  return out;
}
function quickPreview(q){
  if(!q||(!q.title&&!q.items))return"";
  const bits={shop:()=>`Shopping: ${q.items.map(esc).join(", ")}`,
    money:()=>`Spending ${money(q.amount||0)}${q.title?" · "+esc(q.title):""} · ${pname(q.who||viewId())}`,
    event:()=>q.days?`Weekly activity: ${esc(q.title||"Untitled")} · ${repText({repeat:"weekly",days:q.days})}${q.time?" · "+tm(q.time):""} · ${pname(q.who??0)}`:`Event: ${esc(q.title||"Untitled")} · ${nice(q.date||TODAY())}${q.time?" · "+tm(q.time):""} · ${pname(q.who??0)}`,
    task:()=>`Task: ${esc(q.title||"Untitled")} · ${pname(q.who||viewId())} · ${nice(q.date||TODAY())}${q.time?" · "+tm(q.time):""}${q.repeat?" · repeats "+(q.repeat==="daily"?"every day":"every week"):""}`,
    homework:()=>`Homework: ${esc(q.subject||"Homework")} · ${esc(q.title||"")} · due ${nice(q.date||addDays(TODAY(),1))}`}[q.kind];
  return bits?bits():"";
}
function saveQuick(q){
  if(q.kind==="shop"){q.items.forEach(n=>addShopItem(n));toast(q.items.length>1?q.items.length+" items added to shopping":"Added to shopping");return}
  if(!q.title&&q.kind!=="money")return toast("Type what it is, e.g. Dentist Friday 3pm");
  if(q.kind==="money"){if(!(q.amount>0))return;const cat=guessCat(q.title);ST.add("tx",{type:"out",amount:Math.round(q.amount*100)/100,cat,who:q.who||viewId(),date:q.date||TODAY(),note:q.title});toast("Spending added to "+cat);return}
  if(q.kind==="event"){const d=q.date||TODAY();if(q.days){ST.add("events",{title:q.title,who:q.who??0,date:d,time:q.time||"",place:"",repeat:"weekly",days:q.days.sort(),until:"",skip:[]});toast(q.title+": "+repText({repeat:"weekly",days:q.days}));return}ST.add("events",{title:q.title,who:q.who??0,date:d,time:q.time||"",place:""});toast("Added to the calendar for "+nice(d));return}
  if(q.kind==="homework"){ST.add("homework",{subject:q.subject||"Homework",title:q.title||q.subject||"Homework",who:q.who||kidId(),due:q.date||addDays(TODAY(),1),time:q.time||"",done:false});toast("Homework added");return}
  ST.add("tasks",{title:q.title,who:q.who||viewId(),due:q.date||TODAY(),time:q.time||"",repeat:q.repeat||"none",done:false});toast("Task added for "+nice(q.date||TODAY()));
}
const CAT_WORDS={Groceries:/grocer|woolies|woolworths|coles|aldi|iga|supermarket|market|food shop/i,Transport:/petrol|fuel|uber|taxi|bus|train|parking|toll|opal|go card|car|rego|servo/i,Bills:/electric|power|gas bill|water|internet|phone|rent|insurance|bill|netflix|spotify|subscription/i,School:/school|uniform|book|excursion|tuition|fees|stationery/i,"Eating out":/lunch|dinner|breakfast|cafe|coffee|restaurant|takeaway|pizza|mcdonald|kfc|sushi|pho|maccas|bubble tea/i,Health:/doctor|dentist|chemist|pharmacy|medicine|physio|gp|optometrist/i,Fun:/movie|cinema|game|toy|gift|present|holiday|concert|netflix|zoo|park/i};
function guessCat(t){const cats=SET().categories||[];for(const [c,re] of Object.entries(CAT_WORDS))if(re.test(t||"")&&cats.includes(c))return c;return cats.includes("Other")?"Other":(cats[0]||"Other")}

/* ---------- shopping helpers: aisles and usual items ---------- */
const AISLES=[["Fruit & veg",/apple|banana|orange|lemon|lime|grape|berr|melon|mango|pear|peach|plum|kiwi|avocado|tomato|potato|onion|garlic|ginger|carrot|lettuce|spinach|kale|cabbage|broccoli|cauli|capsicum|cucumber|zucchini|pumpkin|mushroom|corn|bean sprout|herb|coriander|parsley|basil|spring onion|celery|salad|fruit|veg|bok choy|eggplant/i],
 ["Meat & fish",/chicken|beef|pork|lamb|mince|steak|sausage|bacon|ham|fish|salmon|tuna|prawn|seafood|turkey|meat/i],
 ["Dairy & eggs",/milk|cheese|yoghurt|yogurt|butter|cream|egg|custard/i],
 ["Bakery",/bread|roll|bun|wrap|bagel|croissant|muffin|cake|loaf|tortilla/i],
 ["Frozen",/frozen|ice cream|peas|chips|fries|ice block/i],
 ["Pantry",/rice|pasta|noodle|flour|sugar|salt|pepper|oil|sauce|soy|vinegar|cereal|oats|honey|jam|peanut|spread|tin|can|beans|soup|stock|spice|curry|biscuit|cracker|snack|chocolate|lolly|nuts|coffee|tea|milo|baking/i],
 ["Drinks",/water|juice|soft drink|coke|soda|cordial|beer|wine|sparkling/i],
 ["Household",/toilet paper|loo roll|paper towel|tissue|detergent|dishwash|washing|bleach|spray|sponge|bin bag|garbage|foil|glad wrap|cling|battery|batteries|light bulb|cleaner/i],
 ["Personal care",/shampoo|conditioner|soap|body wash|toothpaste|toothbrush|deodorant|razor|sunscreen|nappy|nappies|wipes|pad|tampon|lotion|floss/i]];
const aisleOf=n=>(AISLES.find(([,re])=>re.test(n||""))||["Other"])[0];
const normName=n=>String(n||"").trim().toLowerCase().replace(/\s+/g," ");
function addShopItem(raw){
  const v=String(raw||"").trim();if(!v)return;
  const m=v.match(/^(.*?)\s+(?:x\s*)?(\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|packs|bunch|dozen)?)$/i)||v.match(/^(\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|packs|bunch|dozen|x)?)\s+(.*)$/i);
  let name=v,qty="";if(m){if(/^\d/.test(m[1])){qty=m[1].replace(/\s*x$/i,"");name=m[2]}else{name=m[1];qty=m[2]}}
  name=name.charAt(0).toUpperCase()+name.slice(1);
  const dupe=S().shopping.find(s=>!s.done&&normName(s.name)===normName(name));
  if(dupe){if(qty&&qty!==dupe.qty)ST.patch("shopping",dupe.id,{qty});return}
  ST.add("shopping",{name,qty,done:false,who:viewId(),aisle:aisleOf(name)});
  const key=normName(name).replace(/[^a-z0-9]+/g,"-").slice(0,60)||"item",f=S().shopFreq.find(x=>x.id===key);
  ST.put("shopFreq",key,{name,count:(f?.count||0)+1,last:Date.now()});
}
function usualItems(){
  const on=new Set(S().shopping.filter(s=>!s.done).map(s=>normName(s.name)));
  return [...S().shopFreq].filter(f=>!on.has(normName(f.name))).sort((a,b)=>(b.count-a.count)||((b.last||0)-(a.last||0))).slice(0,10);
}

/* ---------- bills & subscriptions ---------- */
const EVERY={week:["Every week",7],fortnight:["Every 2 weeks",14],month:["Every month",0],quarter:["Every 3 months",0],year:["Every year",0]};
function nextDue(d,every){if(every==="week")return addDays(d,7);if(every==="fortnight")return addDays(d,14);const x=new Date(d+"T12:00:00"),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+(every==="quarter"?3:every==="year"?12:1));const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,last));return iso(x)}
const perMonth=b=>({week:52/12,fortnight:26/12,month:1,quarter:1/3,year:1/12}[b.every]||1)*(+b.amount||0);
const billsSorted=()=>[...S().bills].sort((a,b)=>(a.next||"").localeCompare(b.next||""));
function billRow(b){const t=TODAY(),late=b.next<t,soon=b.next<=addDays(t,3);
  return row("bills",b.id,`<div class="billic">${esc((b.name||"?").slice(0,1).toUpperCase())}</div><div class="grow tap" data-act="editBill" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m">${EVERY[b.every]?.[0]||""}${b.auto?" · paid automatically":""}</div><div class="bpill"><span class="pill ${late?"late":soon?"today":""}">${late?"Overdue · ":""}${nice(b.next)}</span></div></div>
   <div class="num bamt">${money(+b.amount||0)}</div>
   <button class="mini" data-act="payBill" data-id="${b.id}">Paid</button>`)}
function payBill(id){const b=S().bills.find(x=>x.id===id);if(!b)return;
  ST.put("tx","bill-"+b.id+"-"+(b.next||TODAY()),{type:"out",amount:+b.amount||0,cat:b.cat||"Bills",who:b.who||meId(),date:TODAY(),note:b.name,createdAt:Date.now(),by:meId()});
  let n=nextDue(b.next||TODAY(),b.every);while(n<=TODAY())n=nextDue(n,b.every);ST.patch("bills",id,{next:n,lastPaid:TODAY()});toast(`${b.name} paid. Next one ${nice(n)}`)}
function autoPayBills(){ // bills marked "paid automatically" record themselves when their day comes
  const t=TODAY();S().bills.filter(b=>b.auto&&b.next&&b.next<=t&&b.lastPaid!==b.next).forEach(b=>{
    let d=b.next;const updates=[];while(d<=t){updates.push(d);d=nextDue(d,b.every)}
    updates.forEach(day=>ST.put("tx","bill-"+b.id+"-"+day,{type:"out",amount:+b.amount||0,cat:b.cat||"Bills",who:b.who||meId(),date:day,note:b.name+" (automatic)",createdAt:Date.now(),by:meId()}));
    ST.patch("bills",b.id,{next:d,lastPaid:updates[updates.length-1]});
  });
}
function billSheet(id){
  const b=id?S().bills.find(x=>x.id===id):null,cats=SET().categories||[];
  openSheet(`${sheetHead(b?"Edit bill":"Add a bill or subscription")}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="b_name">Name</label><input id="b_name" required placeholder="e.g. Electricity, Netflix, Rent" value="${esc(b?.name||"")}"></div>
   <div class="two"><div class="field"><label for="b_amt">Amount (${esc(SET().currency||"$")})</label><input id="b_amt" type="number" inputmode="decimal" step="0.01" min="0" required value="${b?.amount??""}"></div>
    <div class="field"><label for="b_every">How often</label><select id="b_every">${Object.entries(EVERY).map(([k,[n]])=>`<option value="${k}" ${(b?.every||"month")===k?"selected":""}>${n}</option>`).join("")}</select></div></div>
   <div class="two"><div class="field"><label for="b_next">Next due</label><input id="b_next" type="date" required value="${b?.next||TODAY()}"></div>
    <div class="field"><label for="b_cat">Category</label><select id="b_cat">${cats.map(c=>`<option ${(b?.cat||"Bills")===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div></div>
   <div class="field"><label for="b_who">Who pays</label><select id="b_who">${whoOptions(b?.who||viewId())}</select></div>
   <label class="checkrow" for="b_auto"><input type="checkbox" id="b_auto" ${b?.auto?"checked":""}> Paid automatically (direct debit). Record it on the due date by itself.</label>
   <button class="primary" type="submit">Save</button>${b?`<button type="button" class="link" id="b_del" style="color:var(--bad);align-self:center">Delete</button>`:""}</form>`,sh=>{
    const v=i=>sh.querySelector("#"+i).value;
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const amt=parseFloat(v("b_amt"));if(!v("b_name").trim()||!(amt>=0))return;
      const rec={name:v("b_name").trim(),amount:Math.round(amt*100)/100,every:v("b_every"),next:v("b_next")||TODAY(),cat:v("b_cat"),who:+v("b_who"),auto:sh.querySelector("#b_auto").checked};
      if(b){ST.patch("bills",b.id,rec);toast("Bill updated")}else{ST.add("bills",rec);toast("Bill added")}closeSheet();render()};
    const d=sh.querySelector("#b_del");if(d)d.onclick=()=>{if(d.dataset.arm){closeSheet();delUndo("bills",b.id);render()}else{d.dataset.arm=1;d.textContent="Tap again to delete"}};
  });
}
function viewBills(){
  const list=billsSorted(),total=list.reduce((a,b)=>a+perMonth(b),0);
  return `<button class="back" data-go="money">${ICON.back}Money</button>
  <section class="card"><div class="trio"><div><div class="label">Per month</div><div class="v num">${money(total)}</div></div><div><div class="label">Per year</div><div class="v num">${money(total*12)}</div></div><div><div class="label">Bills</div><div class="v num">${list.length}</div></div></div></section>
  <section class="card"><div class="row between"><h2>Bills & subscriptions</h2><button class="link" data-act="addBill">+ Add</button></div>
   <div class="list" style="margin-top:6px">${list.length?list.map(billRow).join(""):`<div class="empty">Add rent, power, phone, internet, insurance and subscriptions. You'll see what's due on Today, and one tap records the payment.</div>`}</div></section>
  ${list.length?swipeHint():""}`;
}

/* ---------- meal planner ---------- */
let mealWeek=null;
const weekStart=d=>{const x=new Date(d+"T12:00:00");return addDays(d,-((x.getDay()+6)%7))};
const mealOn=d=>S().meals.find(m=>m.id===d);
function viewMeals(){
  const ws=mealWeek||weekStart(TODAY()),days=[...Array(7)].map((_,i)=>addDays(ws,i));
  const label=new Date(ws+"T12:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"})+" – "+new Date(days[6]+"T12:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"});
  const ingr=days.flatMap(d=>(mealOn(d)?.ingredients||[]));
  return `${backBar()}<div class="row between"><button class="iconbtn" data-act="mealPrev" aria-label="Previous week">‹</button><h2>${label}</h2><button class="iconbtn" data-act="mealNext" aria-label="Next week">›</button></div>
  <section class="card"><h2>Dinners this week</h2><div class="list" style="margin-top:6px">${days.map(d=>{const m=mealOn(d),dt=new Date(d+"T12:00:00");
    return `<button class="item mealrow ${d===TODAY()?"is-today":""}" data-act="editMeal" data-d="${d}"><span class="mday2"><b>${dt.toLocaleDateString("en-AU",{weekday:"short"})}</b><span>${dt.getDate()}</span></span><div class="grow" style="text-align:left"><div class="t">${m?esc(m.title):`<span class="sub">Not planned</span>`}</div>${m&&m.ingredients?.length?`<div class="m">${esc(m.ingredients.join(", "))}</div>`:""}${m&&m.cook?`<div class="m">Cook: ${esc(pname(m.cook))}</div>`:""}</div></button>`}).join("")}</div></section>
  ${ingr.length?`<button class="primary" data-act="mealsToShop">Add ${ingr.length} ingredients to shopping</button>`:`<p class="sub" style="text-align:center">Tap a day to plan a dinner and list what you need. Then add it all to shopping in one tap.</p>`}`;
}
function mealSheet(d){
  const m=mealOn(d),past=[...new Map(S().meals.filter(x=>x.title).map(x=>[x.title.toLowerCase(),x])).values()];
  openSheet(`${sheetHead(new Date(d+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"}))}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="ml_t">Dinner</label><input id="ml_t" list="pastMeals" placeholder="e.g. Chicken curry" value="${esc(m?.title||"")}"><datalist id="pastMeals">${past.map(x=>`<option value="${esc(x.title)}">`).join("")}</datalist></div>
   <div class="field"><label for="ml_i">What you need (comma separated)</label><textarea id="ml_i" rows="3" placeholder="e.g. chicken thighs, curry paste, coconut milk, rice">${esc((m?.ingredients||[]).join(", "))}</textarea></div>
   <div class="field"><label for="ml_c">Who's cooking</label><select id="ml_c"><option value="">Not decided</option>${people().map(p=>`<option value="${p.id}" ${m?.cook==p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
   <button class="primary" type="submit">Save</button>${m?`<button type="button" class="link" id="ml_del" style="color:var(--bad);align-self:center">Clear this day</button>`:""}</form>`,sh=>{
    const t=sh.querySelector("#ml_t"),ing=sh.querySelector("#ml_i");
    t.onchange=()=>{const p=past.find(x=>x.title.toLowerCase()===t.value.trim().toLowerCase());if(p&&!ing.value.trim())ing.value=(p.ingredients||[]).join(", ")};
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const title=t.value.trim();if(!title){ST.del("meals",d);closeSheet();render();return}
      ST.put("meals",d,{title,ingredients:ing.value.split(/\s*[,\n]\s*/).map(x=>x.trim()).filter(Boolean),cook:+sh.querySelector("#ml_c").value||0,date:d,updated:Date.now()});closeSheet();toast("Dinner planned");render()};
    const del=sh.querySelector("#ml_del");if(del)del.onclick=()=>{ST.del("meals",d);closeSheet();render()};
  });
}
function mealsToShop(){const ws=mealWeek||weekStart(TODAY());const before=S().shopping.filter(s=>!s.done).length;
  [...Array(7)].map((_,i)=>addDays(ws,i)).flatMap(d=>mealOn(d)?.ingredients||[]).forEach(addShopItem);
  setTimeout(()=>{const n=S().shopping.filter(s=>!s.done).length-before;toast(n>0?n+" added to shopping":"Already on the shopping list")},50)}

/* ---------- countdowns (birthdays, holidays, trips) ---------- */
function cdNext(c){if(!c.yearly)return c.date;const t=TODAY(),y=+t.slice(0,4);let d=y+c.date.slice(4);if(d<t)d=(y+1)+c.date.slice(4);return d}
const daysUntil=d=>Math.round((new Date(d+"T12:00:00")-new Date(TODAY()+"T12:00:00"))/864e5);
function countdownsSoon(n){return S().countdowns.map(c=>({...c,nd:cdNext(c)})).filter(c=>c.nd>=TODAY()).sort((a,b)=>a.nd.localeCompare(b.nd)).slice(0,n)}
function cdLabel(c){const k=daysUntil(c.nd);const age=c.yearly&&c.kind==="birthday"&&+c.date.slice(0,4)>1900?` (turns ${+c.nd.slice(0,4)-+c.date.slice(0,4)})`:"";return k===0?"Today!"+age:k===1?"Tomorrow"+age:k+" days"+age}
function countdownSheet(id){
  const c=id?S().countdowns.find(x=>x.id===id):null;
  openSheet(`${sheetHead(c?"Edit date":"A date to remember")}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="c_t">What</label><input id="c_t" required placeholder="e.g. A birthday, a trip" value="${esc(c?.title||"")}"></div>
   <div class="two"><div class="field"><label for="c_d">Date</label><input id="c_d" type="date" required value="${c?.date||""}"></div>
    <div class="field"><label for="c_k">Type</label><select id="c_k">${[["birthday","Birthday"],["anniversary","Anniversary"],["trip","Trip or holiday"],["other","Other"]].map(([k,n])=>`<option value="${k}" ${(c?.kind||"birthday")===k?"selected":""}>${n}</option>`).join("")}</select></div></div>
   <label class="checkrow" for="c_y"><input type="checkbox" id="c_y" ${c?(c.yearly?"checked":""):"checked"}> Every year</label>
   <button class="primary" type="submit">Save</button>${c?`<button type="button" class="link" id="c_del" style="color:var(--bad);align-self:center">Delete</button>`:""}</form>`,sh=>{
    const k=sh.querySelector("#c_k"),y=sh.querySelector("#c_y");k.onchange=()=>{y.checked=k.value==="birthday"||k.value==="anniversary"};
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const rec={title:sh.querySelector("#c_t").value.trim(),date:sh.querySelector("#c_d").value,kind:k.value,yearly:y.checked};if(!rec.title||!rec.date)return;
      if(c)ST.patch("countdowns",c.id,rec);else ST.add("countdowns",rec);closeSheet();toast("Saved");render()};
    const d=sh.querySelector("#c_del");if(d)d.onclick=()=>{closeSheet();delUndo("countdowns",c.id);render()};
  });
}

/* ---------- chores & stars ---------- */
const weekKey=()=>weekStart(TODAY());
function starsThisWeek(){const ws=weekKey(),tot={};S().stars.filter(s=>s.date>=ws).forEach(s=>{tot[s.who]=(tot[s.who]||0)+(+s.pts||0)});return tot}
function giveStars(task){if(!(+task.points>0))return;ST.put("stars","t-"+task.id+"-"+(task.due||""),{who:task.who,pts:+task.points,date:TODAY(),title:task.title,task:task.id})}
function takeStars(task){const s=S().stars.find(x=>x.task===task.id&&x.id==="t-"+task.id+"-"+(task.due||""));if(s)ST.del("stars",s.id)}
function scoreboard(){
  const any=S().tasks.some(t=>+t.points>0)||S().stars.length;if(!any)return"";
  const tot=starsThisWeek(),max=Math.max(1,...Object.values(tot));
  return `<section class="card"><div class="row between"><h2>Stars this week</h2><span class="sub">Since Monday</span></div><div class="stack" style="gap:10px;margin-top:10px">${people().map(p=>{const v=tot[p.id]||0;return `<div class="row" style="gap:10px">${dot(p.id)}<div class="grow"><div class="row between"><span>${esc(p.name)}</span><b class="num">★ ${v}</b></div><div class="bar"><i style="width:${v/max*100}%"></i></div></div></div>`}).join("")}</div></section>`;
}

/* ---------- search ---------- */
function searchSheet(){
  openSheet(`${sheetHead("Search")}<input id="q" class="searchbox" type="search" placeholder="Search tasks, events, notes, money…" autocomplete="off" enterkeyhint="search"><div id="qr" class="list" style="margin-top:8px"></div>`,sh=>{
    const q=sh.querySelector("#q"),out=sh.querySelector("#qr");q.focus();
    const run=()=>{const s=q.value.trim().toLowerCase();if(s.length<2){out.innerHTML=`<div class="empty">Type at least 2 letters.</div>`;return}
      const has=(...f)=>f.some(x=>String(x||"").toLowerCase().includes(s));const res=[];
      S().events.filter(e=>has(e.title,e.place)).forEach(e=>res.push([isRep(e)?"Activity":"Event",e.title,(isRep(e)?repText(e):nice(e.date))+(e.time?" · "+tm(e.time):""),`data-act="edit" data-col="events" data-id="${e.id}"`,e.date]));
      S().tasks.filter(t=>has(t.title)).forEach(t=>res.push(["Task",t.title,(t.done?"Done · ":"")+(t.due?nice(t.due):""),`data-act="edit" data-col="tasks" data-id="${t.id}"`,t.due||""]));
      S().homework.filter(h=>has(h.title,h.subject)).forEach(h=>res.push(["Homework",h.subject+": "+h.title,h.due?nice(h.due):"",`data-act="edit" data-col="homework" data-id="${h.id}"`,h.due||""]));
      S().notes.filter(n=>has(n.title,n.body)).forEach(n=>res.push(["Note",n.title||"Untitled",(n.body||"").slice(0,60),`data-act="openNote" data-id="${n.id}"`,""]));
      S().shopping.filter(x=>has(x.name)).forEach(x=>res.push(["Shopping",x.name,x.done?"In the trolley":"On the list",`data-go="lists" data-list="shopping"`,""]));
      S().tx.filter(x=>has(x.note,x.cat)).forEach(x=>res.push(["Money",(x.note||x.cat)+" "+money(x.type==="in"?x.amount:-x.amount,true),nice(x.date),`data-go="money"`,x.date]));
      S().bills.filter(b=>has(b.name)).forEach(b=>res.push(["Bill",b.name+" "+money(+b.amount||0),"Next "+nice(b.next),`data-act="editBill" data-id="${b.id}"`,""]));
      allCards().filter(c=>has(c.name,c.holder)).forEach(c=>res.push(["Wallet",c.name,c.shared?"Shared":"Just me",`data-act="openCard" data-id="${c.id}"`,""]));
      S().meals.filter(m=>has(m.title,(m.ingredients||[]).join(" "))).forEach(m=>res.push(["Dinner",m.title,nice(m.id),`data-act="editMeal" data-d="${m.id}"`,m.id]));
      S().countdowns.filter(c=>has(c.title)).forEach(c=>res.push(["Date",c.title,nice(cdNext(c)),`data-act="editCountdown" data-id="${c.id}"`,""]));
      out.innerHTML=res.length?res.slice(0,40).map(([k,t,m,attr])=>`<button class="item sres" ${attr}><span class="pill">${k}</span><div class="grow" style="text-align:left"><div class="t">${esc(t)}</div><div class="m">${esc(m)}</div></div></button>`).join(""):`<div class="empty">Nothing found for “${esc(q.value)}”.</div>`};
    q.oninput=run;run();
  });
}

/* ---------- add to iPhone calendar (.ics) ---------- */
function icsFor(e){
  const d=e.date.replace(/-/g,""),p=n=>String(n).padStart(2,"0"),stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  let when;if(e.time){const [h,m]=e.time.split(":").map(Number);const end=new Date(2000,0,1,h+1,m);when=`DTSTART:${d}T${p(h)}${p(m)}00\r\nDTEND:${(end.getDate()>1?addDays(e.date,1):e.date).replace(/-/g,"")}T${p(end.getHours())}${p(end.getMinutes())}00`}
  else when=`DTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${addDays(e.date,1).replace(/-/g,"")}`;
  const clean=s=>String(s||"").replace(/[\\;,]/g,m=>"\\"+m).replace(/\n/g,"\\n"),lead=e.remind==null?+nprefs().ev:+e.remind;
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Happy Home//EN\r\nBEGIN:VEVENT\r\nUID:${e.id}@happyhome\r\nDTSTAMP:${stamp}\r\n${when}\r\nSUMMARY:${clean(e.title)}\r\n${isRep(e)?"RRULE:FREQ=WEEKLY;BYDAY="+e.days.map(i=>["SU","MO","TU","WE","TH","FR","SA"][i]).join(",")+(e.until?";UNTIL="+e.until.replace(/-/g,"")+"T235959":"")+"\r\n":""}${e.place?"LOCATION:"+clean(e.place)+"\r\n":""}${lead<0?"":`BEGIN:VALARM\r\nTRIGGER:${e.time?(lead>0?"-PT"+lead+"M":"PT0M"):"PT9H"}\r\nACTION:DISPLAY\r\nDESCRIPTION:${clean(e.title)}\r\nEND:VALARM\r\n`}END:VEVENT\r\nEND:VCALENDAR\r\n`;
}
function exportEvent(e){
  const blob=new Blob([icsFor(e)],{type:"text/calendar"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=(e.title||"event").replace(/[^\w\- ]+/g,"").slice(0,40)+".ics";a.rel="noopener";a.style.display="none";document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000);
}

/* ---------- Learn: Chinese practice and a little piano ---------- */
const ZH_DECKS=[
 ["hello","Hello & me","👋",[["你好","nǐ hǎo","hello","👋"],["谢谢","xièxie","thank you","🙏"],["再见","zàijiàn","goodbye","👋"],["我","wǒ","I, me","🙋"],["你","nǐ","you","👉"],["是","shì","is, am, are","✅"],["不","bù","no, not","🚫"],["好","hǎo","good","👍"],["对不起","duìbuqǐ","sorry","😔"],["老师","lǎoshī","teacher","🧑‍🏫"]]],
 ["numbers","Numbers 1–10","🔢",[["一","yī","one","1️⃣"],["二","èr","two","2️⃣"],["三","sān","three","3️⃣"],["四","sì","four","4️⃣"],["五","wǔ","five","5️⃣"],["六","liù","six","6️⃣"],["七","qī","seven","7️⃣"],["八","bā","eight","8️⃣"],["九","jiǔ","nine","9️⃣"],["十","shí","ten","🔟"]]],
 ["family","Family","👨‍👩‍👦",[["爸爸","bàba","dad","👨"],["妈妈","māma","mum","👩"],["哥哥","gēge","older brother","👦"],["姐姐","jiějie","older sister","👧"],["弟弟","dìdi","younger brother","👶"],["妹妹","mèimei","younger sister","👧"],["爷爷","yéye","grandpa","👴"],["奶奶","nǎinai","grandma","👵"],["家","jiā","home, family","🏠"],["朋友","péngyou","friend","🤝"]]],
 ["colours","Colours","🎨",[["红色","hóngsè","red","🔴"],["蓝色","lánsè","blue","🔵"],["绿色","lǜsè","green","🟢"],["黄色","huángsè","yellow","🟡"],["白色","báisè","white","⚪"],["黑色","hēisè","black","⚫"],["橙色","chéngsè","orange","🟠"],["紫色","zǐsè","purple","🟣"]]],
 ["animals","Animals","🐼",[["猫","māo","cat","🐱"],["狗","gǒu","dog","🐶"],["鱼","yú","fish","🐟"],["鸟","niǎo","bird","🐦"],["马","mǎ","horse","🐴"],["牛","niú","cow","🐮"],["猪","zhū","pig","🐷"],["兔子","tùzi","rabbit","🐰"],["熊猫","xióngmāo","panda","🐼"],["老虎","lǎohǔ","tiger","🐯"]]],
 ["food","Food & drink","🥟",[["水","shuǐ","water","💧"],["米饭","mǐfàn","rice","🍚"],["面条","miàntiáo","noodles","🍜"],["苹果","píngguǒ","apple","🍎"],["香蕉","xiāngjiāo","banana","🍌"],["牛奶","niúnǎi","milk","🥛"],["鸡蛋","jīdàn","egg","🥚"],["饺子","jiǎozi","dumplings","🥟"],["茶","chá","tea","🍵"],["蛋糕","dàngāo","cake","🍰"]]],
 ["body","My body","🙂",[["头","tóu","head","🙂"],["眼睛","yǎnjing","eyes","👀"],["耳朵","ěrduo","ears","👂"],["鼻子","bízi","nose","👃"],["嘴","zuǐ","mouth","👄"],["手","shǒu","hand","✋"],["脚","jiǎo","foot","🦶"]]],
 ["everyday","Everyday words","🏫",[["学校","xuéxiào","school","🏫"],["书","shū","book","📖"],["大","dà","big","🐘"],["小","xiǎo","small","🐭"],["喜欢","xǐhuan","to like","❤️"],["吃","chī","to eat","🍽️"],["喝","hē","to drink","🥤"],["看","kàn","to look, watch","👀"],["游泳","yóuyǒng","to swim","🏊"],["今天","jīntiān","today","📅"],["明天","míngtiān","tomorrow","🌅"],["太阳","tàiyáng","sun","☀️"],["月亮","yuèliang","moon","🌙"]]],
 ["days","Days & time","📅",[["星期一","xīngqī yī","Monday","1️⃣"],["星期二","xīngqī èr","Tuesday","2️⃣"],["星期三","xīngqī sān","Wednesday","3️⃣"],["星期四","xīngqī sì","Thursday","4️⃣"],["星期五","xīngqī wǔ","Friday","5️⃣"],["星期六","xīngqī liù","Saturday","6️⃣"],["星期天","xīngqī tiān","Sunday","☀️"],["早上","zǎoshang","morning","🌅"],["晚上","wǎnshang","evening","🌃"],["现在","xiànzài","now","⏰"]],2],
 ["weather","Weather","⛅",[["天气","tiānqì","weather","⛅"],["下雨","xià yǔ","to rain","🌧️"],["下雪","xià xuě","to snow","❄️"],["热","rè","hot","🥵"],["冷","lěng","cold","🥶"],["风","fēng","wind","🌬️"],["云","yún","cloud","☁️"],["晴天","qíngtiān","sunny day","🌞"]],2],
 ["feelings","Feelings","😊",[["高兴","gāoxìng","happy","😊"],["难过","nánguò","sad","😢"],["累","lèi","tired","😴"],["饿","è","hungry","😋"],["渴","kě","thirsty","🥤"],["生气","shēngqì","angry","😠"],["害怕","hàipà","scared","😨"],["爱","ài","to love","❤️"]],2],
 ["places","Places & travel","🗺️",[["公园","gōngyuán","park","🏞️"],["医院","yīyuàn","hospital","🏥"],["商店","shāngdiàn","shop","🏪"],["超市","chāoshì","supermarket","🛒"],["游泳池","yóuyǒngchí","swimming pool","🏊"],["中国","Zhōngguó","China","🇨🇳"],["澳大利亚","Àodàlìyà","Australia","🇦🇺"],["日本","Rìběn","Japan","🇯🇵"],["飞机","fēijī","plane","✈️"],["汽车","qìchē","car","🚗"]],2],
 ["actions","Doing words","🏃",[["走","zǒu","to walk","🚶"],["跑","pǎo","to run","🏃"],["跳","tiào","to jump","🦘"],["说","shuō","to speak","🗣️"],["听","tīng","to listen","🎧"],["写","xiě","to write","✍️"],["读","dú","to read","📚"],["睡觉","shuìjiào","to sleep","🛌"],["玩","wán","to play","🎮"],["来","lái","to come","👋"]],2],
 ["phrases","Useful sentences","💬",[["你好吗","nǐ hǎo ma","how are you?","🙂"],["我很好","wǒ hěn hǎo","I'm very well","😄"],["我叫","wǒ jiào","my name is…","🏷️"],["你叫什么名字","nǐ jiào shénme míngzi","what's your name?","❓"],["我爱你","wǒ ài nǐ","I love you","💕"],["生日快乐","shēngrì kuàilè","happy birthday","🎂"],["早上好","zǎoshang hǎo","good morning","🌄"],["晚安","wǎn'ān","good night","🌙"],["没关系","méi guānxi","it's OK, never mind","👌"],["加油","jiāyóu","you can do it!","💪"]],2]
];
const ZH_ALL=ZH_DECKS.flatMap(([k,,,w,lv])=>w.map(x=>({zh:x[0],py:x[1],en:x[2],em:x[3],deck:k,lv:lv||1})));
const learnLevel=()=>+(learnDoc(learnerId()).level||1);
let learnTab="chinese", lz=null, lzDeck=null, pianoLabels="letters", pianoGame=null;
const learnerId=()=>{const v=+ST._localPref("learner");return people().some(p=>p.id===v)?v:(meId()===kidId()?meId():kidId())};
const learnDoc=id=>S().learn.find(x=>x.id===String(id))||{boxes:{},streak:0,best:0,last:"",total:0,decks:{}};
function learnStreak(id){const d=learnDoc(id);if(!d.last)return 0;return d.last===TODAY()||d.last===addDays(TODAY(),-1)?d.streak||0:0}
function speakZh(t){try{const u=new SpeechSynthesisUtterance(t);u.lang="zh-CN";u.rate=.75;const v=speechSynthesis.getVoices().find(x=>/^zh(-|_)CN/i.test(x.lang))||speechSynthesis.getVoices().find(x=>/^zh/i.test(x.lang));if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){toast("This phone can't read Chinese aloud")}}
let actx=null;
function tone(freq,dur,type){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();actx.resume&&actx.resume();const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;o.type=type||"triangle";o.frequency.value=freq;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(.35,t+.015);g.gain.exponentialRampToValueAtTime(0.0001,t+(dur||.6));o.connect(g).connect(actx.destination);o.start(t);o.stop(t+(dur||.6)+.05)}catch(e){}}
const ding=()=>{tone(880,.18,"sine");setTimeout(()=>tone(1318.5,.3,"sine"),120)};
const bonk=()=>tone(196,.25,"square");
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function pickWords(deck,n){
  const box=learnDoc(learnerId()).boxes||{},di=w=>ZH_DECKS.findIndex(x=>x[0]===w.deck),lv=learnLevel();const pool=deck?ZH_ALL.filter(w=>w.deck===deck):ZH_ALL.filter(w=>w.lv===lv);
  return shuffle(pool).sort((a,b)=>((box[a.zh]||0)-(box[b.zh]||0))||(deck?0:di(a)-di(b))).slice(0,n);
}
function startLearn(mode,deck){
  lzDeck=deck||null;const words=pickWords(deck,mode==="cards"?Math.min(12,ZH_ALL.length):10);
  const qs=words.map((w,i)=>{const kind=mode==="cards"?"card":["meaning","listen","pick"][i%3];const others=shuffle(ZH_ALL.filter(x=>x.zh!==w.zh&&x.en!==w.en&&x.lv===w.lv)).slice(0,3);return {w,kind,opts:shuffle([w,...others])}});
  lz={mode,qs,i:0,right:0,flip:false,answered:null,missed:[],started:Date.now()};render();
  if(qs[0]&&qs[0].kind==="listen")setTimeout(()=>speakZh(qs[0].w.zh),300);
}
function learnSave(){
  const id=learnerId(),d=learnDoc(id),t=TODAY(),boxes={...(d.boxes||{})};
  lz.qs.forEach(q=>{const ok=!lz.missed.includes(q.w.zh);boxes[q.w.zh]=ok?Math.min(5,(boxes[q.w.zh]||0)+1):0});
  const streak=d.last===t?(d.streak||1):d.last===addDays(t,-1)?(d.streak||0)+1:1;
  const decks={...(d.decks||{})};if(lzDeck)decks[lzDeck]=Math.max(decks[lzDeck]||0,lz.right);
  const days={...(d.days||{})},td=days[t]||{n:0,r:0,min:0};days[t]={n:td.n+lz.qs.length,r:td.r+lz.right,min:td.min+Math.max(1,Math.round((Date.now()-(lz.started||Date.now()))/60000))};
  Object.keys(days).sort().slice(0,-60).forEach(k=>delete days[k]);
  const {id:_i,...keep}=d;
  ST.put("learn",String(id),{...keep,boxes,streak,best:Math.max(d.best||0,streak),last:t,total:(d.total||0)+lz.qs.length,decks,days,level:d.level||1,who:id,updated:Date.now()});
  const pts=Math.max(1,Math.round(lz.right/2)),sid="learn-"+id+"-"+t,prev=S().stars.find(x=>x.id===sid);
  ST.put("stars",sid,{who:id,pts:(prev?.pts||0)+pts,date:t,title:"Chinese practice"});
  return {pts,streak};
}
function learnAnswer(i){
  const q=lz.qs[lz.i];if(lz.answered!==null)return;const ok=q.opts[i].zh===q.w.zh;lz.answered=i;
  if(ok){lz.right++;ding()}else{lz.missed.push(q.w.zh);bonk()}
  speakZh(q.w.zh);render();
}
function learnNext(knew){
  const q=lz.qs[lz.i];
  if(lz.mode==="cards"){if(knew)lz.right++;else lz.missed.push(q.w.zh)}
  lz.i++;lz.flip=false;lz.answered=null;
  if(lz.i>=lz.qs.length){lz.done=learnSave()}
  else if(lz.qs[lz.i].kind==="listen")setTimeout(()=>{if(lz&&!lz.done&&lz.qs[lz.i])speakZh(lz.qs[lz.i].w.zh)},250);
  render();
}
function viewLearn(){
  const seg=`<div class="seg"><button class="on">中文 Chinese</button><button data-go="piano">🎹 Piano</button></div>`;
  if(lz)return `${backBar()}${lessonView()}`;
  const id=learnerId(),d=learnDoc(id),st=learnStreak(id),box=d.boxes||{},known=Object.values(box).filter(v=>v>=2).length,did=d.last===TODAY();
  const who=people().length>1?`<div class="chips">${people().map(p=>`<button class="chip ${p.id===id?"on":""}" data-act="learner" data-k="${p.id}">${esc(p.name)}</button>`).join("")}</div>`:"";
  return `${backBar()}${seg}${who}
  <section class="card learnhero"><div class="row between"><div><div class="label">${esc(pname(id))}'s Chinese</div><div class="lbig">${st?"🔥 "+st+" day"+(st===1?"":"s"):"Start a streak"}</div><div class="sub">${did?"Practised today. Well done!":"A few minutes a day keeps the streak going."} ${known} of ${ZH_ALL.length} words learnt · Level ${learnLevel()}.</div></div><div class="lchar">学</div></div>
   <div class="two" style="margin-top:12px"><button class="primary" data-act="learnGo" data-k="quiz">Today's quiz</button><button class="ghost" data-act="learnGo" data-k="cards">Flashcards</button></div></section>
  <section class="card"><div class="row between"><h2>Pick a topic</h2><div class="seg mini2">${[1,2].map(l=>`<button class="${learnLevel()===l?"on":""}" data-act="learnLevel" data-k="${l}">Level ${l}</button>`).join("")}</div></div>
   <div class="sub" style="margin-top:4px">${learnLevel()===1?"Starter words: hello, numbers, family, colours, animals and more.":"Next steps: days, weather, feelings, places, doing words and whole sentences."} Today's quiz uses this level.</div>
   <div class="decks">${ZH_DECKS.filter(x=>(x[4]||1)===learnLevel()).map(([k,n,em,w])=>{const got=w.filter(x=>(box[x[0]]||0)>=2).length;return `<button class="deck" data-act="learnDeck" data-k="${k}"><span class="dem">${em}</span><b>${esc(n)}</b><span class="sub">${got}/${w.length} learnt</span><div class="bar"><i style="width:${got/w.length*100}%"></i></div></button>`}).join("")}</div></section>
  ${learnProgress(id)}
  <section class="card stack" style="gap:6px"><h2>Lessons</h2><div class="sub">Chinese lessons and practice times live in Activities, with a button that opens the lesson website.</div><button class="ghost" data-go="activities">Open Activities</button></section>
  <p class="sub" style="text-align:center">Words are read aloud by the phone's own Chinese voice. Nothing is sent anywhere.</p>`;
}
function lessonView(){
  if(!lz.done&&lz.i>=lz.qs.length)return ""; // the result is being saved; the next draw shows it
  if(lz.done){const pct=Math.round(lz.right/lz.qs.length*100);return `<section class="card stack lessondone" style="gap:12px;text-align:center;align-items:center"><div class="lchar big">${pct>=80?"🏆":pct>=50?"⭐":"💪"}</div><h2>${pct>=80?"Amazing!":pct>=50?"Good work!":"Nice try!"}</h2>
   <div class="lbig">${lz.right} / ${lz.qs.length}</div><div class="sub">★ ${lz.done.pts} star${lz.done.pts===1?"":"s"} for ${esc(pname(learnerId()))} · 🔥 ${lz.done.streak} day streak</div>
   ${lz.missed.length?`<div class="sub">Practise these again: ${lz.missed.map(z=>{const w=ZH_ALL.find(x=>x.zh===z);return `<button class="chip" data-act="say" data-k="${esc(z)}">${esc(z)} ${esc(w.en)}</button>`}).join(" ")}</div>`:""}
   <div class="two" style="width:100%"><button class="ghost" data-act="learnQuit">Finish</button><button class="primary" data-act="learnGo" data-k="${lz.mode}" data-d="${lzDeck||""}">Go again</button></div></section>`}
  const q=lz.qs[lz.i],w=q.w,prog=`<div class="row between"><button class="link" data-act="learnQuit">✕ Stop</button><span class="sub">${lz.i+1} of ${lz.qs.length}</span></div><div class="bar"><i style="width:${lz.i/lz.qs.length*100}%"></i></div>`;
  if(q.kind==="card")return `${prog}<button class="flash ${lz.flip?"on":""}" data-act="flip"><span class="lchar huge">${esc(w.zh)}</span>${lz.flip?`<span class="py">${esc(w.py)}</span><span class="en">${w.em} ${esc(w.en)}</span>`:`<span class="sub">Tap to turn over</span>`}</button>
   <button class="ghost" data-act="say" data-k="${esc(w.zh)}">🔊 Hear it</button>
   ${lz.flip?`<div class="two"><button class="ghost" data-act="cardNext" data-k="0">Still learning</button><button class="primary" data-act="cardNext" data-k="1">I knew it!</button></div>`:""}`;
  const a=lz.answered,ask=q.kind==="meaning"?`<div class="qask"><span class="lchar huge">${esc(w.zh)}</span><button class="iconbtn" data-act="say" data-k="${esc(w.zh)}" aria-label="Hear it">🔊</button></div><div class="sub" style="text-align:center">What does it mean?</div>`
   :q.kind==="listen"?`<div class="qask"><button class="bigsay" data-act="say" data-k="${esc(w.zh)}">🔊</button></div><div class="sub" style="text-align:center">Listen. Which one did you hear?</div>`
   :`<div class="qask"><span class="qem">${w.em}</span></div><div class="sub" style="text-align:center">Which one means “${esc(w.en)}”?</div>`;
  const label=o=>q.kind==="meaning"?`${o.em} ${esc(o.en)}`:`<span class="lchar">${esc(o.zh)}</span>${a!==null?`<span class="sub">${esc(o.py)}</span>`:""}`;
  return `${prog}<section class="card stack" style="gap:10px">${ask}</section>
   <div class="opts">${q.opts.map((o,i)=>`<button class="opt ${a!==null?(o.zh===w.zh?"right":i===a?"wrong":"dim"):""}" data-act="learnAns" data-k="${i}">${label(o)}</button>`).join("")}</div>
   ${a!==null?`<section class="card row" style="gap:12px"><span class="lchar">${esc(w.zh)}</span><div class="grow"><div class="t">${esc(w.py)}</div><div class="sub">${w.em} ${esc(w.en)}</div></div><button class="primary" data-act="learnNext">Next</button></section>`:""}`;
}
function learnProgress(id){
  const d=learnDoc(id),days=d.days||{},box=d.boxes||{},t=TODAY();if(!d.last)return"";
  const last14=[...Array(14)].map((_,i)=>addDays(t,i-13)),wk=last14.slice(7),wkDays=wk.filter(x=>days[x]).length;
  const n7=wk.reduce((a,x)=>a+(days[x]?.n||0),0),r7=wk.reduce((a,x)=>a+(days[x]?.r||0),0),min7=wk.reduce((a,x)=>a+(days[x]?.min||0),0);
  const hard=Object.entries(box).filter(([,v])=>v===0).map(([z])=>ZH_ALL.find(w=>w.zh===z)).filter(Boolean).slice(0,8);
  const lvl=l=>{const ws=ZH_ALL.filter(w=>w.lv===l);return [ws.filter(w=>(box[w.zh]||0)>=2).length,ws.length]};const [a1,b1]=lvl(1),[a2,b2]=lvl(2);
  return `<section class="card stack" style="gap:10px"><div class="row between"><h2>Progress</h2><span class="sub">For ${esc(pname(id))} and parents</span></div>
   <div class="trio"><div><div class="label">This week</div><div class="v num">${wkDays}/7 days</div></div><div><div class="label">Right</div><div class="v num">${n7?Math.round(r7/n7*100)+"%":"–"}</div></div><div><div class="label">Best streak</div><div class="v num">${d.best||0} day${(d.best||0)===1?"":"s"}</div></div></div>
   <div><div class="label" style="margin-bottom:6px">Last 2 weeks</div><div class="pdays">${last14.map(x=>`<span class="${days[x]?"on":""} ${x===t?"today":""}" title="${nice(x)}">${new Date(x+"T12:00:00").toLocaleDateString("en-AU",{weekday:"narrow"})}</span>`).join("")}</div></div>
   <div class="sub">${min7?"About "+min7+" min of practice this week · ":""}${d.total||0} questions answered in all</div>
   <div><div class="row between"><span>Level 1</span><span class="sub num">${a1} of ${b1} words</span></div><div class="bar"><i style="width:${a1/b1*100}%"></i></div></div>
   <div><div class="row between"><span>Level 2</span><span class="sub num">${a2} of ${b2} words</span></div><div class="bar"><i style="width:${a2/b2*100}%"></i></div></div>
   ${hard.length?`<div><div class="label" style="margin-bottom:6px">Needs more practice</div><div class="chips" style="flex-wrap:wrap">${hard.map(w=>`<button class="chip" data-act="say" data-k="${esc(w.zh)}">${esc(w.zh)} · ${esc(w.en)}</button>`).join("")}</div></div>`:""}
   ${a1>=b1*0.7&&learnLevel()===1?`<button class="primary" data-act="learnLevel" data-k="2">Ready for Level 2 →</button>`:""}</section>`;
}
/* piano: one octave and a bit, labels, a find-the-note game and a song to follow */
const NOTES=[["C",261.63],["C#",277.18],["D",293.66],["D#",311.13],["E",329.63],["F",349.23],["F#",369.99],["G",392],["G#",415.3],["A",440],["A#",466.16],["B",493.88],["C2",523.25]];
const SOLFA={C:"Do",D:"Re",E:"Mi",F:"Fa",G:"Sol",A:"La",B:"Ti",C2:"Do"};
const SONG=["C","C","G","G","A","A","G","F","F","E","E","D","D","C"];
const nlabel=n=>pianoLabels==="solfa"?SOLFA[n]||"":n.replace("2","");
function viewPiano(){
  const whites=NOTES.filter(n=>!n[0].includes("#")),g=pianoGame;
  const target=g&&g.kind==="find"?g.target:g&&g.kind==="song"?SONG[g.i]:null;
  const keys=`<div class="piano">${whites.map(([n])=>`<button class="wk ${target===n&&g.kind==="song"?"hint":""}" data-act="pkey" data-k="${n}"><span>${pianoLabels==="none"?"":nlabel(n)}</span></button>`).join("")}${NOTES.filter(n=>n[0].includes("#")).map(([n])=>{const idx=whites.findIndex(w=>w[0]===n[0]);return `<button class="bk" style="left:calc(${(idx+1)/whites.length*100}% - 4.2%)" data-act="pkey" data-k="${n}"></button>`}).join("")}</div>`;
  const status=!g?`<div class="sub">Tap the keys to play. Pick a game below.</div>`
   :g.kind==="find"?`<div class="lbig" style="text-align:center">Find <b class="accent">${nlabel(g.target)}</b></div><div class="sub" style="text-align:center">Score ${g.score} · ${g.msg||"Tap the right key"}</div>`
   :g.i>=SONG.length?`<div class="lbig" style="text-align:center">🎉 You played the whole tune!</div>`:`<div class="sub" style="text-align:center">Twinkle, Twinkle, Little Star · note ${g.i+1} of ${SONG.length}. Play the glowing key.</div><div class="songline">${SONG.map((n,i)=>`<span class="${i<g.i?"done":i===g.i?"now":""}">${nlabel(n)}</span>`).join("")}</div>`;
  return `<section class="card stack" style="gap:12px">${status}${keys}
   <div class="seg">${[["letters","C D E"],["solfa","Do Re Mi"],["none","No labels"]].map(([k,n])=>`<button class="${pianoLabels===k?"on":""}" data-act="plabels" data-k="${k}">${n}</button>`).join("")}</div></section>
  <div class="two"><button class="primary" data-act="pgame" data-k="find">Find the note</button><button class="ghost" data-act="pgame" data-k="song">Play a tune</button></div>
  ${g?`<button class="link" data-act="pgame" data-k="">Stop the game</button>`:""}
  <p class="sub" style="text-align:center">A first step before real lessons: learn where the notes are and play a simple tune.</p>`;
}
function viewPianoPage(){
  const st=pianoLd.state;
  if(st===""||st==="loading")return `<section class="card stack" style="gap:8px;text-align:center;padding:28px 16px"><div style="font-size:2.4rem" aria-hidden="true">🎹</div><div class="sub">Getting the piano ready…</div></section>`;
  const note=st==="none"?(ST.mode==="cloud"?"The big piano opens once its home is set in Settings.":"The big piano opens after you sign in to your family."):st==="fail"?"The big piano could not load just now. Here is the little one until it does.":"";
  return (note?`<section class="card stack" style="gap:8px"><div class="sub">${note}</div>${st==="fail"?`<button class="ghost" data-act="pianoRetry">Try again</button>`:""}</section>`:"")+viewPiano()}
function pianoKey(n){
  const f=NOTES.find(x=>x[0]===n);if(f)tone(f[1],.9);const g=pianoGame;if(!g)return;
  if(g.kind==="find"){if(n===g.target){g.score++;ding();g.msg="Yes! That's "+nlabel(n);const opts=NOTES.filter(x=>!x[0].includes("#")&&x[0]!==n&&x[0]!=="C2").map(x=>x[0]);g.target=opts[Math.floor(Math.random()*opts.length)];if(g.score%5===0)learnPianoStar()}else{g.msg="That's "+(n.includes("#")?"a black key":nlabel(n))+". Try again"}render();return}
  if(g.kind==="song"&&g.i<SONG.length){if(n===SONG[g.i]){g.i++;if(g.i>=SONG.length){setTimeout(ding,500);learnPianoStar()}render()}}
}
function learnPianoStar(){const id=learnerId(),t=TODAY(),sid="learn-"+id+"-"+t,prev=S().stars.find(x=>x.id===sid);ST.put("stars",sid,{who:id,pts:(prev?.pts||0)+1,date:t,title:"Practice"});toast("★ 1 star for "+pname(id))}
function learnTodayCard(){
  const k=kidId(),d=learnDoc(k),st=learnStreak(k),did=d.last===TODAY();
  const lbl=viewId()===k?"Your Chinese":esc(pname(k))+"'s Chinese";
  if(!d.last&&viewId()!==k)return `<button class="tile learntile" data-go="learn"><span class="label">${lbl}</span><b>学 Start practising</b><span>Flashcards and quizzes read aloud</span></button>`;
  return `<button class="tile learntile" data-go="learn"><span class="label">${lbl}</span><b>${did?"✓ Practised today":"Not practised yet"}</b><span>${st?"🔥 "+st+" day streak":"Tap to start"}</span></button>`;
}

/* ---------- Home: today as a family tree. Every branch is a person, every leaf is a real plan, task or piece of homework ---------- */
let liveTab="tree", liveSel=null, liveOpen={};
const pvar=id=>id==0?"var(--muted)":`var(--p${colorIdx(id)})`;
function recentIds(){const cut=Date.now()-90e3,ids=new Set();["tasks","events","tx","shopping","homework","board","bills","notes","alarms","songs"].forEach(c=>(S()[c]||[]).forEach(r=>{if((r.createdAt||r.at||0)>cut&&r.by!=null)ids.add(+r.by)}));return ids}
const lateTxt=d=>{const n=-daysUntil(d);return n===1?"1 day late":n+" days late"};
const minsOf=x=>{const a=String(x).split(":");return +a[0]*60+ +a[1]};
const freshRec=x=>Date.now()-(x.createdAt||0)<90e3;
function evLeaf(e,nowM){
  const m=TIME_OK.test(e.time||"")?minsOf(e.time):null,st=m===null?"today":nowM>m+60?"past":nowM>=m?"live":"soon",left=m===null?0:m-nowM;
  return {key:"1"+(e.time||"00:00")+"a",k:"ev",st,ic:isRep(e)?"🔁":"📅",title:e.title,meta:(e.time?tm(e.time):"All day")+(e.place?" · "+placeTxt(e.place):""),tag:st==="live"?"Now":st==="past"?"Earlier":left>0&&left<=90?"in "+left+" min":"",attr:`data-act="edit" data-col="events" data-id="${esc(e.id)}" data-d="${e.date}"`,fresh:freshRec(e)};
}
/* everything one person has on today, most urgent first */
function dayLeaves(id){
  const t=TODAY(),d0=new Date(),nowM=d0.getHours()*60+d0.getMinutes(),out=[];
  const timed=x=>TIME_OK.test(x||""),stars=x=>+x.points>0?" · ★ "+(+x.points):"";
  const doneToday=x=>x.done&&(x.doneAt?iso(new Date(x.doneAt))===t:x.due===t);
  evOn(t).filter(e=>+e.who===id).forEach(e=>out.push(evLeaf(e,nowM)));
  const todo=(col,x,sub,tick)=>{
    const base={k:col==="tasks"?"task":"hw",title:x.title,tick,id:x.id,attr:`data-act="edit" data-col="${col}" data-id="${esc(x.id)}"`,fresh:freshRec(x)},pre=sub?sub+" · ":"";
    if(doneToday(x)){out.push({...base,key:"8",st:"done",on:true,meta:pre+"Done"+stars(x),fresh:false});return}
    if(x.done)return;
    if(!x.due){out.push({...base,key:"6",st:"any",meta:pre+"Any time"+stars(x)});return}
    if(x.due>t){if(col==="homework"&&x.due===addDays(t,1))out.push({...base,key:"5",st:"next",meta:pre+"Due tomorrow"});return}
    const late=x.due<t||(timed(x.time)&&minsOf(x.time)<nowM);
    out.push({...base,key:x.due<t?"0"+x.due:"1"+(timed(x.time)?x.time:"99:99")+"b",st:late?"late":"now",meta:pre+(x.due<t?lateTxt(x.due):timed(x.time)?tm(x.time):"Today")+stars(x),tag:late?"Late":""});
  };
  S().tasks.forEach(x=>{if(+x.who===id)todo("tasks",x,"","toggle")});
  S().homework.forEach(x=>{if(+x.who===id)todo("homework",x,x.subject,"toggleHw")});
  const ld=learnDoc(id);
  if(ld.last){const did=ld.last===t,st=learnStreak(id);out.push({key:did?"8":"7a",k:"habit",st:did?"done":"now",ic:"学",zh:true,title:"Chinese practice",meta:(did?"Practised today":"Not yet today")+(st?" · 🔥 "+st+" day"+(st===1?"":"s"):""),attr:`data-go="learn"`})}
  if(ld.pianoAt){const did=iso(new Date(ld.pianoAt))===t;out.push({key:did?"8":"7b",k:"habit",st:did?"done":"now",ic:"🎹",title:"Piano practice",meta:did?"Played today":"Not yet today",attr:`data-go="piano"`})}
  out.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  out.filter(l=>l.st==="any").slice(2).forEach(l=>out.splice(out.indexOf(l),1));
  return out;
}
function nextUp(id){
  const t=TODAY(),c=[];
  const e=sortEv(evRange(addDays(t,1),addDays(t,7)).filter(x=>+x.who===id))[0];
  if(e)c.push([e.date+(e.time||"00:00"),{k:"ev",st:"next",ic:"📅",title:e.title,meta:"Next · "+nice(e.date)+(e.time?" · "+tm(e.time):""),attr:`data-act="edit" data-col="events" data-id="${esc(e.id)}" data-d="${e.date}"`}]);
  const x=sortTasks(S().tasks.filter(x=>+x.who===id&&!x.done&&x.due&&x.due>t&&x.due<=addDays(t,7)))[0];
  if(x)c.push([x.due+(x.time||"99:99"),{k:"task",st:"next",ic:"🗓️",title:x.title,meta:"Next · "+nice(x.due)+(x.time?" · "+tm(x.time):""),attr:`data-act="edit" data-col="tasks" data-id="${esc(x.id)}"`}]);
  c.sort((a,b)=>a[0].localeCompare(b[0]));return c[0]?c[0][1]:null;
}
/* the branch for things that belong to everyone: shared plans, dinner, shopping, bills, special days */
function familyLeaves(){
  const t=TODAY(),d0=new Date(),nowM=d0.getHours()*60+d0.getMinutes(),out=[],kidView=peopleRaw().length>2&&viewId()===kidId();
  sortEv(evOn(t).filter(e=>+e.who===0)).forEach(e=>out.push(evLeaf(e,nowM)));
  const meal=mealOn(t);
  out.push(meal?{k:"fam",st:"soon",ic:"🍽️",title:"Dinner: "+meal.title,meta:meal.cook?pname(meal.cook)+" is cooking":"Tonight",attr:`data-act="editMeal" data-d="${t}"`}:{k:"fam",st:"any",ic:"🍽️",title:"Dinner isn't planned yet",meta:"Tap to plan the week",attr:`data-go="meals"`});
  const shop=S().shopping.filter(s=>!s.done);
  if(shop.length)out.push({k:"fam",st:"soon",ic:"🛒",title:shop.length+" thing"+(shop.length===1?"":"s")+" to buy",meta:shop.slice(0,4).map(s=>s.name).join(", ")+(shop.length>4?"…":""),attr:`data-go="lists" data-list="shopping"`});
  if(!kidView)billsSorted().filter(b=>b.next&&b.next<=addDays(t,3)&&!b.auto).slice(0,2).forEach(b=>{const dn=nice(b.next);out.push({k:"fam",st:b.next<t?"late":"soon",ic:"🧾",title:b.name+" · "+money(+b.amount||0),meta:b.next<t?"Was due "+dn:"Due "+(dn==="Today"||dn==="Tomorrow"?dn.toLowerCase():dn),tag:b.next<t?"Late":"",attr:`data-act="editBill" data-id="${esc(b.id)}"`})});
  countdownsSoon(3).filter(c=>daysUntil(c.nd)<=7).slice(0,2).forEach(c=>out.push({k:"fam",st:daysUntil(c.nd)===0?"live":"soon",ic:"🎉",title:c.title,meta:cdLabel(c),attr:`data-act="editCountdown" data-id="${esc(c.id)}"`}));
  return out;
}
function dayStats(leaves){const c=leaves.filter(l=>l.tick||l.k==="habit"),done=c.filter(l=>l.st==="done").length,left=c.filter(l=>l.st==="late"||l.st==="now").length;return {done,left,total:done+left,late:c.filter(l=>l.st==="late").length,plans:leaves.filter(l=>l.k==="ev").length}}
const pring=(pct,inner)=>`<span class="pring" style="--pct:${Math.max(0,Math.min(100,Math.round(pct)))}">${inner}</span>`;
const avatarHtml=id=>{const ph=id!=0&&photoOf(id);return `<span class="dot avatar who-${colorIdx(id)}${ph?" ph ph-"+(+id):""}" aria-hidden="true">${id==0?"🏠":esc(pname(id).slice(0,1).toUpperCase())}</span>`};
function leafHtml(l){
  const lead=l.tick?`<button class="check ${l.on?"on":""}" data-act="${l.tick}" data-id="${esc(l.id)}" aria-label="${l.on?"Mark not done":"Mark done"}: ${esc(l.title)}">${l.on?ICON.tick:""}</button>`:`<span class="lf-ic${l.zh?" zh":""}" aria-hidden="true">${l.ic||"•"}</span>`;
  return `<div class="leaf st-${l.st} k-${l.k}${l.fresh?" fresh":""}">${lead}<button class="lf-body" ${l.attr||""}><span class="lf-t">${esc(l.title)}</span>${l.meta?`<span class="lf-m">${esc(l.meta)}</span>`:""}</button>${l.tag?`<span class="lf-tag">${esc(l.tag)}</span>`:""}</div>`;
}
function liveTree(){
  const v=viewId(),busy=recentIds(),ppl=people(),tot=starsThisWeek();
  const data=ppl.map(p=>{const leaves=dayLeaves(p.id);return {p,leaves,s:dayStats(leaves)}});
  const sel=liveSel!=null&&data.some(d=>d.p.id===liveSel)?liveSel:null;
  const all=data.reduce((a,d)=>({done:a.done+d.s.done,total:a.total+d.s.total}),{done:0,total:0});
  const sub=s=>s.left?s.left+" to do":s.total?"All done ✓":s.plans?s.plans+" plan"+(s.plans===1?"":"s"):"Free day";
  const top=`<div class="ftop"><button class="fhome${sel===null?" sel":""}" data-act="liveSel" data-k="home">${pring(all.total?all.done/all.total*100:0,`<span class="dot avatar homeic" aria-hidden="true">🏠</span>`)}<span class="fh-t"><b>Our day</b><span>${all.total?all.done+" of "+all.total+" done":"Nothing to tick off yet"}</span></span></button>
   <div class="frow" style="--n:${ppl.length||1}">${data.map(d=>`<button class="fperson${sel===d.p.id?" sel":""}${busy.has(d.p.id)?" busy":""}" style="--pc:${pvar(d.p.id)}" data-act="liveSel" data-k="${d.p.id}" aria-pressed="${sel===d.p.id}">${pring(d.s.total?d.s.done/d.s.total*100:0,avatarHtml(d.p.id))}${d.s.late?`<i class="fbadge" title="${d.s.late} late">${d.s.late}</i>`:""}<b>${esc(d.p.name.split(" ")[0])}</b><span>${sub(d.s)}</span></button>`).join("")}</div></div>`;
  const branch=(id,name,leaves,s,cap)=>{
    const open=sel===id||liveOpen[id],shown=open?leaves:leaves.slice(0,cap),more=leaves.length-shown.length,stars=id?tot[id]||0:0,bits=[];
    if(s&&s.total)bits.push(s.done+" of "+s.total+" done");if(s&&s.plans)bits.push(s.plans+" plan"+(s.plans===1?"":"s"));if(stars)bits.push("★ "+stars+" this week");
    const quiet=!leaves.some(l=>["late","now","soon","live","today"].includes(l.st)),nx=id&&quiet?nextUp(id):null;
    return `<div class="branch${busy.has(id)?" busy":""}" style="--pc:${pvar(id)}"><div class="bhead"><button class="bnode" data-act="liveSel" data-k="${id||"home"}">${avatarHtml(id)}<span class="bn-t"><b>${esc(name)}</b><span>${bits.join(" · ")||(id?"Nothing to tick off today":"Shared by the whole family")}</span></span></button>${id?`<button class="bn-add" data-act="addFor" data-k="${id}" aria-label="Add something for ${esc(name)}">＋</button>`:""}</div>
     <div class="leaves">${shown.map(leafHtml).join("")}${!leaves.length?`<div class="leaf st-free"><span class="lf-ic" aria-hidden="true">🎉</span><span class="lf-body"><span class="lf-t">Nothing on today</span></span></div>`:""}${nx&&!more?leafHtml(nx):""}${more>0?`<button class="leaf more" data-act="liveMore" data-k="${id}">+${more} more</button>`:(liveOpen[id]&&sel!==id&&leaves.length>cap?`<button class="leaf more" data-act="liveMore" data-k="${id}">Show less</button>`:"")}</div></div>`};
  const order=sel!==null?data.filter(d=>d.p.id===sel):[...data].sort((a,b)=>(b.p.id===v)-(a.p.id===v));
  return `<section class="card ftree">${top}<div class="branches">${order.map(d=>branch(d.p.id,d.p.name,d.leaves,d.s,d.p.id===v?6:4)).join("")}${sel===null?branch(0,"Everyone",familyLeaves(),null,6):""}</div>
   ${sel!==null?`<button class="ghost" data-act="liveSel" data-k="home" style="width:100%;margin-top:12px">Show the whole family</button>`:""}</section>`;
}
function feedItems(){
  const verb={tasks:"added a task",events:"added to the calendar",tx:"recorded money",shopping:"added to shopping",homework:"added homework",notes:"wrote a note",bills:"added a bill",countdowns:"added a date",board:"posted",meals:"planned dinner",stars:"earned stars",alarms:"set an alarm",songs:"added a song"};
  const em={tasks:"✅",events:"📅",tx:"💳",shopping:"🛒",homework:"📝",notes:"🗒️",bills:"🧾",countdowns:"🎉",board:"💬",meals:"🍽️",stars:"⭐",alarms:"⏰",songs:"🎵"};
  const out=[];Object.keys(verb).forEach(c=>(S()[c]||[]).forEach(r=>{const at=r.createdAt||r.at||r.updated;const who=c==="stars"?r.who:(r.by??r.who);if(!at||who==null)return;
    const what=c==="tx"?(r.note||r.cat)+" "+money(r.type==="in"?r.amount:-r.amount,true):c==="shopping"?r.name:c==="homework"?r.subject+": "+r.title:c==="stars"?"★ "+r.pts+" · "+(r.title||""):c==="meals"?r.title:c==="board"?r.text:c==="alarms"?(r.title||"Alarm")+(r.time?" · "+tm(r.time):""):(r.title||r.name||"");
    out.push({at,who:+who,c,txt:verb[c],what,em:em[c],via:r.via})}));
  ["tasks","homework"].forEach(c=>S()[c].forEach(r=>{if(r.done&&r.doneAt)out.push({at:r.doneAt,who:+r.who,c:"done",txt:c==="tasks"?"finished a task":"finished homework",what:r.title||"",em:"🎉"})}));
  S().learn.forEach(l=>{if(l.updated)out.push({at:l.updated,who:+l.who,c:"learn",txt:"practised Chinese",what:"🔥 "+(l.streak||1)+" day streak",em:"学"});if(l.pianoAt)out.push({at:l.pianoAt,who:+l.who,c:"piano",txt:"practised piano",what:Object.values(l.piano||{}).filter(Boolean).length+" song"+(Object.values(l.piano||{}).filter(Boolean).length===1?"":"s")+" played so far",em:"🎹"})});
  return out.sort((a,b)=>b.at-a.at);
}
function feedRow(f){return `<div class="item feedrow ${Date.now()-f.at<90e3?"fresh":""}">${dot(f.who)}<div class="grow"><div class="t"><b>${esc(pname(f.who).split(" ")[0])}</b> ${esc(f.txt)}</div><div class="m">${f.em} ${esc(String(f.what).slice(0,80))}${fromPhone(f)}</div></div><span class="sub fago">${ago(f.at)}</span></div>`}
function liveFeedMini(){const f=feedItems().slice(0,4);return f.length?`<section class="card"><div class="row between"><h2>Just now</h2><button class="link" data-act="liveTab" data-k="feed">All activity</button></div><div class="list" style="margin-top:4px">${f.map(feedRow).join("")}</div></section>`:""}
function liveFeed(){
  const f=feedItems().slice(0,60);let last="";
  return `<section class="card"><div class="list">${f.length?f.map(x=>{const d=iso(new Date(x.at)),h=d!==last?`<div class="aisle">${nice(d)}</div>`:"";last=d;return h+feedRow(x)}).join(""):`<div class="empty">Nothing yet. As the family adds things, they appear here straight away.</div>`}</div></section>`;
}

/* ---------- weekly activities per person ---------- */
function viewActivities(){
  const reps=S().events.filter(e=>isRep(e)&&(!e.until||e.until>=TODAY()));
  const card=p=>{const mine=reps.filter(e=>+e.who===p.id||(p.id===0&&+e.who===0));const cnt=mine.reduce((a,e)=>a+e.days.length,0);
    return `<section class="card"><div class="row between"><div class="row" style="gap:8px">${dot(p.id)}<h2>${esc(p.name)}</h2></div><button class="link" data-act="addActivity" data-k="${p.id}">+ Add</button></div>
     ${mine.length?`<div class="sub" style="margin-top:2px">${cnt} session${cnt===1?"":"s"} a week</div><div class="wkgrid">${[1,2,3,4,5,6,0].map(d=>{const on=mine.filter(e=>e.days.includes(d)).sort((a,b)=>(a.time||"").localeCompare(b.time||""));return `<div class="wkday ${dow(TODAY())===d?"is-today":""}"><b>${DAYN[d]}</b>${on.map(e=>`<button class="wkev" data-act="edit" data-col="events" data-id="${e.id}"><span>${esc(e.title)}</span>${e.time?`<i>${tm(e.time)}</i>`:""}</button>`).join("")}</div>`}).join("")}</div>
      <div class="list" style="margin-top:8px">${mine.map(e=>`<div class="item"><div class="grow tap" data-act="edit" data-col="events" data-id="${e.id}"><div class="t">${esc(e.title)}</div><div class="m">${repText(e)}${e.time?" · "+tm(e.time):""}${e.place?" · "+esc(placeTxt(e.place)):""}</div></div>${joinBtn(e)}</div>`).join("")}</div>`
     :`<div class="empty">No weekly activities yet. Add classes, sport, lessons or practice that happen on the same days each week.</div>`}</section>`};
  return `${backBar()}${people().map(card).join("")}${reps.some(e=>+e.who===0)?card({id:0,name:"Whole family"}):""}`;
}
/* ---------- important dates view ---------- */
function viewDates(){
  const list=S().countdowns.map(c=>({...c,nd:cdNext(c)})).sort((a,b)=>(a.nd||"").localeCompare(b.nd||""));
  const up=list.filter(c=>c.nd>=TODAY()),past=list.filter(c=>c.nd<TODAY());
  const item=c=>`<button class="item cdrow" data-act="editCountdown" data-id="${c.id}"><span class="cdnum"><b>${c.nd>=TODAY()?daysUntil(c.nd):"✓"}</b><span>${c.nd>=TODAY()?(daysUntil(c.nd)===1?"day":"days"):"past"}</span></span><div class="grow" style="text-align:left"><div class="t">${esc(c.title)}</div><div class="m">${nice(c.nd)}${c.yearly?" · every year":""}${c.yearly&&c.kind==="birthday"&&+c.date.slice(0,4)>1900&&c.nd>=TODAY()?" · turns "+(+c.nd.slice(0,4)-+c.date.slice(0,4)):""}</div></div></button>`;
  return `${backBar()}<section class="card"><div class="row between"><h2>Coming up</h2><button class="link" data-act="addCountdown">+ Add</button></div>
   <div class="list" style="margin-top:6px">${up.length?up.map(item).join(""):`<div class="empty">Add birthdays, anniversaries, holidays and trips. The next ones show on Today with a countdown.</div>`}</div></section>
  ${past.length?`<section class="card"><h2>Past</h2><div class="list" style="margin-top:6px">${past.map(item).join("")}</div></section>`:""}`;
}

/* ---------- profiles: whose things come first, and photos ---------- */
const PHOTO_OK=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const photoOf=id=>{const p=(S().profiles||[]).find(x=>x.id===String(id));return p&&PHOTO_OK.test(p.photo||"")&&p.photo.length<200000?p.photo:""};
let photoSig="";
function syncPhotos(){ // one style rule per person, so a photo is stored once and not repeated in every row
  const ps=peopleRaw().map(p=>[+p.id,photoOf(p.id)]).filter(x=>x[1]),sig=ps.map(x=>x[0]+":"+x[1].length+":"+x[1].slice(-24)).join("|");
  if(sig===photoSig)return;photoSig=sig;let el=document.getElementById("hh-photos");if(!el){el=document.createElement("style");el.id="hh-photos";document.head.appendChild(el)}
  el.textContent=ps.map(([id,ph])=>`.ph-${id}{background-image:url("${ph}")!important}`).join("\n");
}
function squarePhoto(file,size,q){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{try{const s=Math.min(img.width,img.height),c=document.createElement("canvas");c.width=c.height=size;c.getContext("2d").drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,size,size);URL.revokeObjectURL(img.src);res(c.toDataURL("image/jpeg",q))}catch(e){rej(e)}};img.onerror=()=>rej(new Error("photo"));img.src=URL.createObjectURL(file)})}
function setView(id){
  id=+id;if(!peopleRaw().some(p=>p.id===id))return;
  if(ST.mode==="local")ST.setMe(id);else ST._localPref("view",String(id));
  ST._localPref("learner",String(id===kidId()?id:(+ST._localPref("learner")||kidId())));
  if(id===kidId())ST._localPref("pianoWho",String(id));
  listWho="mine";liveSel=null;liveOpen={};
}
function profileSheet(){
  const v=viewId(),p=person(v)||{name:"Me"},cloud=ST.mode==="cloud",ph=photoOf(v),t=TODAY();
  const evs=evRange(t,addDays(t,6)).filter(e=>+e.who===v).length,todo=S().tasks.filter(x=>!x.done&&+x.who===v).length,hw=S().homework.filter(x=>!x.done&&+x.who===v).length,stars=starsThisWeek()[v]||0;
  const whose=v===meId()?(cloud?"Signed in as "+esc(ST.me.email||""):"Using this phone"):"Using "+esc(p.name)+"'s profile on "+esc(pname(meId()))+"'s phone";
  openSheet(`${sheetHead("Profile")}
   <div class="profhead"><button type="button" class="dot avatar who-${colorIdx(v)}${ph?" ph ph-"+v:""}" id="pf_pic" aria-label="Change photo">${esc(p.name.slice(0,1).toUpperCase())}</button>
    <div class="grow"><h2>${esc(p.name)}</h2><div class="sub">${whose}</div></div></div>
   <input type="file" id="pf_file" accept="image/*" hidden>
   ${ph?`<div class="two"><button class="primary" type="button" id="pf_change">Change photo</button><button class="ghost" type="button" id="pf_remove">Remove photo</button></div>`:`<button class="primary" type="button" id="pf_change">📷 Add a photo</button>`}
   <div class="trio"><div><div class="label">This week</div><div class="v num">${evs} plan${evs===1?"":"s"}</div></div><div><div class="label">To do</div><div class="v num">${todo+hw}</div></div><div><div class="label">Stars</div><div class="v num">★ ${stars}</div></div></div>
   ${peopleRaw().length>1?`<div class="label" style="margin-top:4px">Switch profile</div>
   <div class="profpick">${people().map(q=>`<button type="button" class="pp ${q.id===v?"on":""}" data-act="viewAs" data-k="${q.id}">${dot(q.id)}<span>${esc(q.name)}</span>${cloud&&q.id===meId()?`<small>signed in</small>`:""}</button>`).join("")}</div>
   <div class="sub">Tap a person to use the app as them on this phone. Their tasks, plans and stars come first, and notes, shopping and check-ins go under their name. Everything stays shared with the whole family.${cloud?" Private cards, the microphone mood check and location sharing stay with "+esc(pname(meId()))+", who is signed in here.":""}</div>
   ${cloud&&v!==meId()?`<button class="ghost" type="button" data-act="viewAs" data-k="${meId()}">Back to ${esc(pname(meId()))}'s profile</button>`:""}`:""}
   <div class="two"><button class="ghost" type="button" data-go="alarms">Alarms & reminders</button><button class="ghost" type="button" data-act="settings">Settings</button></div>`,sh=>{
    const file=sh.querySelector("#pf_file"),pick=()=>file.click();
    sh.querySelector("#pf_pic").onclick=pick;sh.querySelector("#pf_change").onclick=pick;
    file.onchange=async()=>{const f=file.files&&file.files[0];if(!f)return;
      try{let data=await squarePhoto(f,192,.82);if(data.length>90000)data=await squarePhoto(f,144,.7);
        ST.put("profiles",String(v),{photo:data,who:v,updated:Date.now()});toast("Photo saved");setTimeout(profileSheet,60)}
      catch(e){toast("That photo couldn't be opened. Try another one")}};
    const rm=sh.querySelector("#pf_remove");if(rm)rm.onclick=()=>{ST.put("profiles",String(v),{photo:"",who:v,updated:Date.now()});toast("Photo removed");setTimeout(profileSheet,60)};
  });
}

/* ---------- bottom bar: the fourth button is a shortcut that lasts a week ---------- */
const NAV={lists:["Lists",()=>ICON.lists],calendar:["Calendar",()=>ICON.cal],money:["Money",()=>ICON.money],today:["Today",()=>ICON.sun],meals:["Dinner",()=>ICON.meal],notes:["Notes",()=>ICON.note],bills:["Bills",()=>ICON.bill],learn:["Chinese",()=>'<span class="tabchar">学</span>'],activities:["Classes",()=>ICON.swim],dates:["Dates",()=>ICON.cake],alarms:["Alarms",()=>ICON.bell],wallet:["Wallet",()=>ICON.wallet],mood:["Mood",()=>ICON.mood],calc:["Sums",()=>ICON.calc],location:["Where",()=>ICON.pin]};
const SLOT_POOL=["calendar","money","today","meals","notes","bills","learn","activities","dates","alarms"];
function slotInfo(){
  let pick=null;try{pick=JSON.parse(ST._localPref("slot")||"null")}catch(e){}
  if(pick&&pick.wk===weekKey()&&NAV[pick.r])return {r:pick.r,mine:true};
  let h=7;for(const c of weekKey())h=(h*31+c.charCodeAt(0))>>>0;return {r:SLOT_POOL[h%SLOT_POOL.length],mine:false};
}
let slotSig="";
function renderTabs(){
  const s=slotInfo(),b=$("#tabSlot");if(!b)return;if(slotSig===s.r+s.mine)return;slotSig=s.r+s.mine;
  b.dataset.tab=s.r;b.classList.toggle("auto",!s.mine);b.innerHTML=NAV[s.r][1]()+esc(NAV[s.r][0]);b.setAttribute("aria-label",NAV[s.r][0]+". Hold to change this shortcut");
}
function slotSheet(){
  const cur=slotInfo(),end=new Date(addDays(weekKey(),6)+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"});
  openSheet(`${sheetHead("This week's shortcut")}<p class="sub" style="margin:0">Choose what the fourth button at the bottom opens. Your choice stays until ${end}. After that the app picks a different one for you each week, unless you choose again.</p>
   <div class="pickgrid slotgrid">${Object.entries(NAV).map(([r,[n,ic]])=>`<button type="button" class="${cur.r===r?"on":""}" data-act="slotPick" data-k="${r}">${ic()}<span>${n}</span></button>`).join("")}</div>
   <button class="ghost" type="button" data-act="slotPick" data-k="">🎲 Surprise me each week</button>
   <p class="sub" style="margin:0;text-align:center">${cur.mine?"You chose "+NAV[cur.r][0]+" for this week.":"This week the app picked "+NAV[cur.r][0]+"."} Tip: hold the button down to open this any time.</p>`);
}

/* ---------- Home: the live family view ---------- */
function viewHomeLive(){
  const t=TODAY(),v=viewId(),now=new Date(),nowT=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
  const ev=sortEv(evOn(t)),mine=x=>+x.who===v||+x.who===0;
  const n=ev.filter(mine).length+S().tasks.filter(x=>!x.done&&x.due&&x.due<=t&&+x.who===v).length+S().homework.filter(h=>!h.done&&h.due&&h.due<=addDays(t,1)&&+h.who===v).length;
  const next=ev.find(e=>e.time&&e.time>=nowT&&mine(e))||ev.find(e=>e.time&&e.time>=nowT),wk=evRange(t,addDays(t,6)).length;
  const seg=`<div class="seg">${[["tree","Family tree"],["feed","Live feed"]].map(([k,nm])=>`<button class="${liveTab===k?"on":""}" data-act="liveTab" data-k="${k}">${nm}</button>`).join("")}</div>`;
  return `${moodRequestBanner()}
  <div class="two homebtns">
   <button class="tile gotoday" data-go="today"><span class="label">☀️ Today</span><b>${n?n+" thing"+(n===1?"":"s")+" for "+(v===meId()?"you":esc(pname(v))):"All clear"}</b><span>${next?"Next: "+esc(next.title)+" · "+tm(next.time):"Open today's plan"} ›</span></button>
   <button class="tile gocal" data-go="calendar"><span class="label">📅 Calendar</span><b>${now.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}</b><span>${wk} plan${wk===1?"":"s"} this week ›</span></button>
  </div>
  <div class="livebar"><span class="livedot"></span>Live · updates the moment anyone changes something</div>
  ${seg}${liveTab==="tree"?liveTree()+qaCard()+boardCard()+liveFeedMini():liveFeed()}`;
}

/* ---------- alarms, reminders and notifications ---------- */
const nprefs=()=>Object.assign({ev:30,morning:"07:00",bills:"09:00",kids:true,sound:true},(S().notify||[]).find(x=>x.id==="prefs")||{});
const LEADS=[[-1,"No reminder"],[0,"At the time"],[5,"5 minutes before"],[10,"10 minutes before"],[15,"15 minutes before"],[30,"30 minutes before"],[60,"1 hour before"],[120,"2 hours before"],[1440,"1 day before"]];
const leadName=m=>(LEADS.find(x=>x[0]===+m)||[0,m+" minutes before"])[1];
const leadTxt=m=>m>=1440?"1 day":m>=60?(m/60)+" hour"+(m===60?"":"s"):m+" minutes";
const remindSelect=(val,usual)=>`<div class="field"><label for="f_rem">Remind</label><select id="f_rem"><option value="">Usual (${esc(leadName(usual).toLowerCase())})</option>${LEADS.map(([m,n])=>`<option value="${m}" ${val!=null&&val!==""&&+val===m?"selected":""}>${n}</option>`).join("")}</select></div>`;
const p2=n=>String(n).padStart(2,"0");
function whenMinus(date,time,mins){const d=new Date(date+"T"+time+":00");d.setMinutes(d.getMinutes()-mins);return iso(d)+"T"+p2(d.getHours())+":"+p2(d.getMinutes())}
const TIME_OK=/^([01]\d|2[0-3]):[0-5]\d$/;
const adultIds=()=>{const k=kidId();return peopleRaw().length>2?peopleRaw().filter(p=>p.id!==k).map(p=>p.id):peopleRaw().map(p=>p.id)};
function recips(who){who=+who||0;if(!who)return [];const k=kidId();return peopleRaw().length>2&&who===k&&nprefs().kids!==false?[k,...adultIds()]:[who]}
/* everything that should ring in the next days, as plain rows. The same list drives alarms inside the app and the phone notifications. */
function buildAgenda(days){
  const P=nprefs(),t=TODAY(),end=addDays(t,days||7),out=[];
  const add=(id,when,who,title,body,url,tag)=>{if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(when))return;out.push({id:String(id).slice(0,120),when,who:[...new Set(who)].sort(),title:String(title||"Reminder").slice(0,80),body:String(body||"").slice(0,160),url:url||"#today",tag:String(tag||id).slice(0,120)})};
  evRange(t,end).forEach(e=>{if(!TIME_OK.test(e.time||""))return;const lead=e.remind==null?+P.ev:+e.remind;if(!(lead>=0))return;
    add(`ev-${e.id}-${e.date}-${e.time}-${lead}`,whenMinus(e.date,e.time,lead),recips(e.who),lead>0?`${e.title} ${lead>=1440?"is tomorrow":"in "+leadTxt(lead)}`:e.title,`${tm(e.time)} · ${pname(e.who)}${e.place?" · "+placeTxt(e.place):""}`,"#calendar",`ev-${e.id}-${e.date}`)});
  S().tasks.forEach(x=>{if(x.done||!x.due||!TIME_OK.test(x.time||"")||x.due<t||x.due>end)return;const lead=x.remind==null?0:+x.remind;if(!(lead>=0))return;
    add(`tk-${x.id}-${x.due}-${x.time}-${lead}`,whenMinus(x.due,x.time,lead),recips(x.who),"To do: "+x.title,`${tm(x.time)} · ${pname(x.who)}`,"#lists")});
  S().homework.forEach(x=>{if(x.done||!x.due||!TIME_OK.test(x.time||"")||x.due<t||x.due>end)return;const lead=x.remind==null?0:+x.remind;if(!(lead>=0))return;
    add(`hw-${x.id}-${x.due}-${x.time}-${lead}`,whenMinus(x.due,x.time,lead),recips(x.who),"Homework: "+(x.subject||x.title),`${x.title} · ${tm(x.time)} · ${pname(x.who)}`,"#lists")});
  if(TIME_OK.test(P.bills||""))S().bills.forEach(b=>{if(!b.next||b.auto||b.next<t||b.next>end)return;add(`bl-${b.id}-${b.next}`,b.next+"T"+P.bills,adultIds(),`${b.name} is due today`,money(+b.amount||0)+" · tap to mark it paid","#bills")});
  (S().alarms||[]).forEach(a=>{if(a.on===false||!TIME_OK.test(a.time||""))return;const rep=Array.isArray(a.days)&&a.days.length;
    for(let d=t;d<=end;d=addDays(d,1)){if(rep?a.days.includes(dow(d)):a.date===d)add(`al-${a.id}-${d}-${a.time}`,d+"T"+a.time,recips(a.who),"⏰ "+(a.title||"Alarm"),`${tm(a.time)}${+a.who?" · "+pname(a.who):""}`,"#alarms")}});
  if(TIME_OK.test(P.morning||""))for(let d=t;d<=end;d=addDays(d,1)){const evs=sortEv(evOn(d)),k=kidId(),three=peopleRaw().length>2;
    peopleRaw().forEach(p=>{const mine=x=>+x.who===p.id,adult=three&&p.id!==k,bits=[];
      evs.filter(e=>mine(e)||+e.who===0).forEach(e=>bits.push((e.time?tm(e.time)+" ":"")+e.title));
      if(adult&&P.kids!==false)evs.filter(e=>+e.who===k).forEach(e=>bits.push(pname(k)+": "+(e.time?tm(e.time)+" ":"")+e.title));
      const tk=S().tasks.filter(x=>!x.done&&x.due===d&&mine(x)).length;if(tk)bits.push(tk+" thing"+(tk===1?"":"s")+" to do");
      const hw=S().homework.filter(x=>!x.done&&x.due===d&&(mine(x)||(adult&&P.kids!==false&&+x.who===k)));if(hw.length)bits.push((hw.length===1?hw[0].subject+" homework":hw.length+" lots of homework")+" due");
      if(adult||!three){const bl=S().bills.filter(b=>b.next===d&&!b.auto);if(bl.length)bits.push(bl.map(b=>b.name).join(", ")+" due")}
      S().countdowns.filter(c=>(c.yearly?c.date.slice(5)===d.slice(5):c.date===d)).forEach(c=>bits.push("🎉 "+c.title));
      if(bits.length)add(`am-${d}-${p.id}-${P.morning}`,d+"T"+P.morning,[p.id],"Good morning, "+p.name+" ☀️",bits.slice(0,6).join(" · "),"#today",`am-${d}-${p.id}`)})}
  ((P.tests||[])).forEach(x=>{if(x&&x.id&&x.when)add("test-"+x.id,x.when,[+x.who||0].filter(Boolean),"Happy Home notifications work 🎉","This is the test you asked for.","#alarms")});
  return out.sort((a,b)=>a.when.localeCompare(b.when)||a.id.localeCompare(b.id));
}
let agendaCache=null,agendaAt=0,agendaDirty=true;
const agenda=()=>{if(agendaDirty||!agendaCache||Date.now()-agendaAt>60e3){agendaCache=buildAgenda(7);agendaAt=Date.now();agendaDirty=false}return agendaCache};
const whenMs=w=>new Date(w+":00").getTime();
const forMe=i=>!i.who.length||i.who.includes(meId())||i.who.includes(viewId());
/* ringing inside the app */
let ringing=[],firedMap=null;
const fired=()=>{if(!firedMap){try{firedMap=JSON.parse(localStorage.getItem("hh.fired")||"{}")||{}}catch(e){firedMap={}}}return firedMap};
function chime(times){let n=0;const go=()=>{tone(880,.22,"sine");setTimeout(()=>tone(1174.7,.22,"sine"),170);setTimeout(()=>tone(1568,.45,"sine"),340);if(++n<times)setTimeout(go,1300)};go();try{navigator.vibrate&&navigator.vibrate([180,90,180])}catch(e){}}
function alarmTick(){
  if(ST.phase!=="ready"||(ST.mode==="cloud"&&!ST.me.personId))return;
  const now=Date.now(),f=fired();let hit=false;
  agenda().forEach(i=>{const at=whenMs(i.when);if(!(at<=now)||now-at>20*60e3||f[i.id]||!forMe(i))return;f[i.id]=now;hit=true;
    ringing=ringing.filter(r=>r.tag!==i.tag);ringing.unshift(i);
    if(nprefs().sound!==false&&ST._localPref("alarmMute")!=="1")chime(i.id.startsWith("al-")?3:1);
    if(document.hidden){if(window.HHPush)HHPush.showLocal(i.title,i.body,i.tag,i.url).catch(()=>{});else localNotify(i.title,i.body,i.tag,i.url)}});
  if(hit){Object.keys(f).forEach(k=>{if(now-f[k]>3*864e5)delete f[k]});try{localStorage.setItem("hh.fired",JSON.stringify(f))}catch(e){}ringing=ringing.slice(0,4);render()}
}
function alarmBanner(){return ringing.map(i=>`<div class="alarmbar" role="alert"><span class="bell">🔔</span><button class="grow tap" data-act="alarmGo" data-id="${esc(i.id)}"><b>${esc(i.title)}</b><span>${esc(i.body)}</span></button><button class="mini" data-act="alarmOk" data-id="${esc(i.id)}">OK</button></div>`).join("")}
/* keep the list for the notification helper up to date (only once phone notifications are set up) */
let agendaT=null,agendaSig="",agendaSigAt=0;
const agSig=items=>(items||[]).map(i=>[i.id,i.when,(i.who||[]).join(","),i.title,i.body,i.url,i.tag].join("|")).join("\n");
function syncAgenda(){
  if(ST.mode!=="cloud"||ST.phase!=="ready"||!SET().push||!ST.me.personId)return;
  clearTimeout(agendaT);agendaT=setTimeout(()=>{
    if(!navigator.onLine||ST.phase!=="ready"||!SET().push)return;
    const cut=Date.now()-3*3600e3,items=buildAgenda(7).filter(i=>whenMs(i.when)>=cut).slice(0,300),sig=agSig(items),cur=S().notify.find(x=>x.id==="agenda"),tz=SET().push.tz||deviceTz();
    if(cur&&agSig(cur.items)===sig&&cur.tz===tz)return;
    if(sig===agendaSig&&Date.now()-agendaSigAt<10*60e3)return; // two phones that disagree must not ping-pong
    agendaSig=sig;agendaSigAt=Date.now();
    ST.put("notify","agenda",{v:1,tz,day:TODAY(),updated:Date.now(),by:meId(),items});
  },5000);
}
const deviceTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"Australia/Brisbane"}catch(e){return"Australia/Brisbane"}};
function setPrefs(patch){const {id:_i,...cur}=(S().notify.find(x=>x.id==="prefs")||{});ST.put("notify","prefs",{...cur,...patch,updated:Date.now()});agendaDirty=true}
/* this phone's notification switch */
let pushState={checked:false,sub:null,busy:false,err:"",why:""},pushSeq=0;
async function refreshPush(){
  if(!window.HHPush){pushState.checked=true;return}
  const n=++pushSeq;let cur=null;
  try{cur=await HHPush.current()}catch(e){cur=null}
  if(cur&&!cur.key&&ST._localPref("pushEp")===cur.id)cur.key=ST._localPref("pushKey")||"";   // this phone's browser does not say which key it used: the app noted it when it was switched on
  if(n!==pushSeq)return;              // a newer look, or a tap on Turn on or Turn off, finished while this one was still asking the phone: keep that answer
  pushState.sub=cur;pushState.checked=true;
  const pub=SET().push&&SET().push.pub,s=pushState.sub;
  if(ST.mode==="cloud"&&s&&pub&&s.key===pub&&ST.me.personId){const doc=S().pushSubs.find(x=>x.id===s.id);
    if(!doc||doc.endpoint!==s.endpoint||+doc.who!==meId()||Date.now()-(doc.seen||0)>3*864e5)ST.put("pushSubs",s.id,{who:meId(),endpoint:s.endpoint,p256dh:s.p256dh,auth:s.auth,ua:HHPush.device(),created:(doc&&doc.created)||Date.now(),seen:Date.now()})}
  if(tab==="alarms")render();
}
async function turnOnNotifications(){
  if(pushState.busy)return;const sup=window.HHPush?HHPush.support():{ok:false},pub=SET().push&&SET().push.pub;
  pushState.busy=true;pushState.err="";pushState.why="";
  try{
    if(window.HHPush&&pub&&sup.ok){const s=await HHPush.enable(pub);if(!s.key)s.key=pub;pushSeq++;pushState.sub=s;pushState.checked=true;ST._localPref("pushEp",s.id);ST._localPref("pushKey",s.key);if(ST.mode==="cloud")ST.put("pushSubs",s.id,{who:meId(),endpoint:s.endpoint,p256dh:s.p256dh,auth:s.auth,ua:HHPush.device(),created:Date.now(),seen:Date.now()});ST._localPref("pushOn","1");toast("Notifications are on for this phone")}
    else{const r=("Notification" in window)?await Notification.requestPermission():"denied";if(r==="granted"){ST._localPref("pushOn","1");toast("Notifications are allowed on this phone")}else pushState.err="denied"}
  }catch(e){pushState.err=(e&&typeof e.code==="string"&&e.code)||"failed";pushState.why=String((e&&e.message)||"").replace(/[^\w .:/-]+/g," ").slice(0,60)}
  pushState.busy=false;render();
}
async function turnOffNotifications(){
  try{const id=window.HHPush?await HHPush.disable():null;if(id&&ST.mode==="cloud"&&S().pushSubs.some(x=>x.id===id))ST.del("pushSubs",id)}catch(e){}
  pushSeq++;pushState.sub=null;ST._localPref("pushOn","0");ST._localPref("pushEp","");toast("Notifications are off for this phone");render();
}
/* the helper that sends notifications while the app is closed: a spare family login that only the family's own GitHub page uses */
async function makeNotifier(){
  const cfg=window.HH_FIREBASE_CONFIG,rnd=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>"abcdefghjkmnpqrstuvwxyz23456789"[b%31]).join("");
  const app2=FB.initializeApp(cfg,"hh-notifier-"+Date.now()),auth2=FB.getAuth(app2);
  if(cfg.emulatorHost)FB.connectAuthEmulator(auth2,"http://"+cfg.emulatorHost+":9099",{disableWarnings:true});
  const email="notifier-"+rnd(12)+"@"+(String(cfg.authDomain||"").replace(/[^a-z0-9.-]/gi,"")||"example.com"),pw=rnd(28)+"-Qx7";
  const keys=await HHPush.makeKeys();
  const cred=await FB.createUserWithEmailAndPassword(auth2,email,pw),uid=cred.user.uid,old=SET().push&&SET().push.uid;
  const members=(SET().members||[]).filter(u=>u!==old).concat(uid);
  await FB.updateDoc(FB.doc(ST.db,"families",ST.familyId),{members,push:{pub:keys.x,uid,at:Date.now(),tz:deviceTz()}});
  try{await FB.signOut(auth2)}catch(e){}
  return HHPush.packSecret({e:email,p:pw,f:ST.familyId,d:keys.d,x:keys.x});
}
function stopNotifier(){const p=SET().push;if(!p)return;FB.updateDoc(FB.doc(ST.db,"families",ST.familyId),{members:(SET().members||[]).filter(u=>u!==p.uid),push:null}).catch(e=>ST._fail(e));S().pushSubs.forEach(x=>ST.del("pushSubs",x.id));toast("Closed-app notifications are switched off")}
function repoSecretsUrl(){const m=location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i),repo=location.pathname.split("/").filter(Boolean)[0];return m&&repo?`https://github.com/${m[1]}/${repo}/settings/secrets/actions/new`:"https://github.com/"}
function notifierSheet(){
  if(ST.mode!=="cloud"||!window.HHPush)return;
  const has=!!SET().push;
  openSheet(`${sheetHead("Notifications when the app is closed")}<div class="stack" style="gap:12px">
   <p class="sub" style="margin:0">A free helper on your family's own GitHub page checks every few minutes and sends each reminder to your phones. It takes about two minutes to set up, once, by the person who owns the GitHub page.</p>
   <ol class="steps"><li>Tap <b>Make my code</b>. The app adds a helper sign-in and shows its secret code.</li><li>Tap <b>Copy code</b>, then <b>Open GitHub</b>.</li><li>On GitHub, in <b>Name</b> type <code>HH_NOTIFIER</code>, paste the code into <b>Secret</b>, and tap <b>Add secret</b>.</li><li>Come back here and turn on notifications on each phone.</li></ol>
   <div class="sub">The code is a spare key to your family's Happy Home. The helper uses it only to read the list of reminders and send them to your phones. Treat it like a password: paste it only into that GitHub box. ${has?"Making a new code switches the old one off.":""}</div>
   <div class="err" id="nf_err" hidden></div>
   <button class="primary" type="button" id="nf_make">${has?"Make a new code":"Make my code"}</button>
   <div id="nf_out" hidden class="stack" style="gap:10px"><textarea id="nf_code" rows="4" readonly class="codearea"></textarea>
    <div class="two"><button class="primary" type="button" id="nf_copy">Copy code</button><a class="ghost" id="nf_open" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Open GitHub</a></div>
    <div class="sub">This code is shown once. If you lose it, just make a new one.</div></div>
   ${has?`<button class="link" type="button" id="nf_stop" style="color:var(--bad);align-self:center">Switch closed-app notifications off</button>`:""}</div>`,sh=>{
    const err=m=>{const x=sh.querySelector("#nf_err");x.hidden=!m;x.textContent=m||""};
    sh.querySelector("#nf_make").onclick=async ev=>{const b=ev.currentTarget;b.disabled=true;err("");
      try{const code=await makeNotifier();sh.querySelector("#nf_out").hidden=false;sh.querySelector("#nf_code").value=code;sh.querySelector("#nf_open").href=repoSecretsUrl();b.hidden=true}
      catch(e){err((navigator.onLine?"That didn't work. Check you're online and try again.":"You're offline. Connect to the internet and try again.")+(e&&typeof e.code==="string"?" ("+e.code.replace(/[^\w/-]+/g,"").slice(0,50)+")":""));b.disabled=false}};
    sh.querySelector("#nf_copy").onclick=()=>{const ta=sh.querySelector("#nf_code");try{navigator.clipboard.writeText(ta.value).then(()=>toast("Code copied"),()=>{ta.select();toast("Select all and copy")})}catch(_){ta.select();toast("Select all and copy")}};
    const st=sh.querySelector("#nf_stop");if(st)st.onclick=()=>{if(st.dataset.arm){stopNotifier();closeSheet()}else{st.dataset.arm=1;st.textContent="Tap again to switch it off"}};
  });
}
function alarmSheet(id){
  const a=id?S().alarms.find(x=>x.id===id):null,v=viewId();
  openSheet(`${sheetHead(a?"Edit alarm":"New alarm")}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="al_t">What for?</label><input id="al_t" placeholder="e.g. Wake up, Leave for school, Piano practice" value="${esc(a?.title||"")}" maxlength="60"></div>
   <div class="two"><div class="field"><label for="al_time">Time</label><input id="al_time" type="time" required value="${esc(a?.time||"07:00")}"></div><div class="field"><label for="al_who">For</label><select id="al_who">${whoOptions(a?a.who:v,true)}</select></div></div>
   <div class="field"><label>Days (none = just once)</label><div class="daypick">${[1,2,3,4,5,6,0].map(i=>`<button type="button" data-day="${i}" class="${a&&(a.days||[]).includes(i)?"on":""}">${DAYN[i]}</button>`).join("")}</div></div>
   <div class="field" id="al_datef"><label for="al_date">Date</label><input id="al_date" type="date" value="${esc(a?.date||TODAY())}"></div>
   <button class="primary" type="submit">Save alarm</button>
   ${a?`<button type="button" class="ghost" id="al_ics">Add to iPhone Calendar (rings even when the app is closed)</button><button type="button" class="link" id="al_del" style="color:var(--bad);align-self:center">Delete</button>`:""}</form>`,sh=>{
    const on=new Set(a?(a.days||[]):[]),df=sh.querySelector("#al_datef"),paint=()=>{sh.querySelectorAll("[data-day]").forEach(b=>b.classList.toggle("on",on.has(+b.dataset.day)));df.hidden=on.size>0};
    sh.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{const d=+b.dataset.day;on.has(d)?on.delete(d):on.add(d);paint()});paint();
    const read=()=>({title:sh.querySelector("#al_t").value.trim()||"Alarm",time:sh.querySelector("#al_time").value,who:+sh.querySelector("#al_who").value||0,days:[...on].sort(),date:on.size?"":(sh.querySelector("#al_date").value||TODAY()),on:true});
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const rec=read();if(!TIME_OK.test(rec.time))return;
      if(!rec.days.length&&rec.date===TODAY()&&rec.time<=p2(new Date().getHours())+":"+p2(new Date().getMinutes()))rec.date=addDays(TODAY(),1);
      if(a)ST.patch("alarms",a.id,rec);else ST.add("alarms",rec);agendaDirty=true;closeSheet();toast("Alarm set for "+tm(rec.time)+(rec.days.length?"":" · "+nice(rec.date)));render()};
    const ic=sh.querySelector("#al_ics");if(ic)ic.onclick=()=>{const r=read();exportEvent({id:"alarm-"+a.id,title:r.title,date:r.days.length?TODAY():r.date,time:r.time,place:"",repeat:r.days.length?"weekly":"none",days:r.days,until:"",remind:0});toast("Opening Calendar…")};
    const d=sh.querySelector("#al_del");if(d)d.onclick=()=>{closeSheet();delUndo("alarms",a.id,"Alarm deleted");agendaDirty=true;render()};
  });
}
function viewAlarms(){
  const P=nprefs(),v=viewId(),now=Date.now(),cloud=ST.mode==="cloud";
  const next=agenda().filter(i=>whenMs(i.when)>now&&forMe(i)).slice(0,6);
  const alarms=[...(S().alarms||[])].sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const dayTxt=a=>Array.isArray(a.days)&&a.days.length?(a.days.length===7?"Every day":[...a.days].sort().join()==="1,2,3,4,5"?"Weekdays":[...a.days].sort((x,y)=>((x+6)%7)-((y+6)%7)).map(i=>DAYN[i]).join(", ")):(a.date?nice(a.date):"Once");
  const sup=window.HHPush?HHPush.support():{ok:false,why:"no-push"},perm=window.HHPush?HHPush.permission():(("Notification" in window)?Notification.permission:"unsupported");
  const helper=SET().push,st=(S().notify||[]).find(x=>x.id==="state"),subOk=!!(pushState.sub&&helper&&pushState.sub.key===helper.pub),alive=st&&st.lastRun&&now-st.lastRun<40*60e3;
  const mineSubs=(S().pushSubs||[]);
  const phone=!sup.ok&&sup.why==="ios-needs-home-screen"?`<div class="sub">On an iPhone, notifications only work when you open Happy Home from its Home Screen icon. In Safari tap Share, then <b>Add to Home Screen</b>, then open it from there.</div>`
   :perm==="denied"||pushState.err==="denied"?`<div class="sub">Notifications are blocked for Happy Home on this phone. Open the phone's Settings, find Happy Home under Notifications, and allow them. Then come back.</div>`
   :perm==="unsupported"?`<div class="sub">This browser can't show notifications. Alarms still ring inside the app while it is open.</div>`
   :(perm==="granted"&&ST._localPref("pushOn")!=="0"&&(subOk||!helper))?`<div class="row between"><div class="grow"><b>On for this phone ✓</b><div class="sub">${helper?(subOk?"Reminders reach this phone even when Happy Home is closed.":""):"Alarms show a notification while Happy Home is open or was used a moment ago."}</div></div><button class="mini ghostmini" data-act="pushOff">Turn off</button></div>`
   :`<button class="primary" data-act="pushOn" ${pushState.busy?"disabled":""}>🔔 Turn on notifications on this phone</button>${pushState.err&&pushState.err!=="denied"?`<div class="sub neg">That did not work on this phone${pushState.why&&pushState.why!==pushState.err?" ("+esc(pushState.why)+")":""}. Close Happy Home, open it again from its Home Screen icon and try once more.</div>`:""}`;
  return `${backBar()}
  <section class="card"><div class="row between"><h2>Alarms</h2><button class="link" data-act="addAlarm">+ New alarm</button></div>
   <div class="list" style="margin-top:6px">${alarms.length?alarms.map(a=>row("alarms",a.id,`<button class="grow tap altap" data-act="editAlarm" data-id="${a.id}"><span class="altime ${a.on===false?"off":""}">${tm(a.time)}</span><span class="t">${esc(a.title||"Alarm")}</span><span class="m">${esc(dayTxt(a))} · ${esc(pname(a.who||0))}</span></button><button class="toggle ${a.on===false?"":"on"}" data-act="alarmToggle" data-id="${a.id}" role="switch" aria-checked="${a.on!==false}" aria-label="Alarm on"></button>`)).join(""):`<div class="empty">No alarms yet. Add one for waking up, leaving for school or practice time.</div>`}</div></section>
  <section class="card"><div class="row between"><h2>Coming up</h2><span class="sub">for ${v===meId()?"you":esc(pname(v))}</span></div>
   <div class="list" style="margin-top:6px">${next.length?next.map(i=>`<div class="item"><span class="alwhen">${esc(nice(i.when.slice(0,10)))}<br>${tm(i.when.slice(11))}</span><div class="grow"><div class="t">${esc(i.title)}</div><div class="m">${esc(i.body)}</div></div></div>`).join(""):`<div class="empty">Nothing is set to ring in the next week. Give an event or task a time and it will remind you.</div>`}</div></section>
  <section class="card stack" style="gap:12px"><h2>Reminders</h2>
   <div class="field"><label for="np_ev">Events and classes: remind</label><select id="np_ev" data-pref="ev">${LEADS.filter(x=>x[0]>=0).map(([m,n])=>`<option value="${m}" ${+P.ev===m?"selected":""}>${n}</option>`).join("")}</select></div>
   <div class="two"><div class="field"><label for="np_am">Morning summary at</label><input id="np_am" type="time" data-pref="morning" value="${esc(P.morning||"")}"></div><div class="field"><label for="np_bl">Bills due: remind at</label><input id="np_bl" type="time" data-pref="bills" value="${esc(P.bills||"")}"></div></div>
   <div class="sub">Clear a time to switch that reminder off. Tasks and homework remind at their own time. You can change the reminder for one event when you edit it.</div>
   ${peopleRaw().length>2?`<label class="checkrow" for="np_kids"><input type="checkbox" id="np_kids" data-pref="kids" ${P.kids!==false?"checked":""}> ${esc(adultIds().map(pname).join(" and "))} also get ${esc(pname(kidId()))}'s reminders</label>`:""}
   <label class="checkrow" for="np_snd"><input type="checkbox" id="np_snd" data-pref="mute" ${ST._localPref("alarmMute")==="1"?"":"checked"}> Play a sound on this phone</label></section>
  <section class="card stack" style="gap:12px"><h2>Notifications on this phone</h2>${phone}
   ${cloud&&window.HHPush?`<div class="hr"></div><div class="row between"><div class="grow"><b>When the app is closed</b><div class="sub">${helper?(alive?"Helper is working · last checked "+ago(st.lastRun):st&&st.lastRun?"Helper last checked "+ago(st.lastRun)+". It may be paused.":"Code made. Waiting for the helper's first check (up to 15 minutes after the code is saved on GitHub).")+(mineSubs.length?" · "+mineSubs.length+" phone"+(mineSubs.length===1?"":"s")+" on":""):"Not set up yet. Until then, reminders ring only while Happy Home is open."}</div>${st&&st.lastError?`<div class="sub neg">${esc(String(st.lastError).slice(0,140))}</div>`:""}</div><button class="mini" data-act="notifier">${helper?"Manage":"Set up"}</button></div>
   ${helper&&subOk?`<button class="ghost" data-act="pushTest">Send me a test notification</button>`:""}`:""}
   <div class="sub">How it works: while Happy Home is open, alarms ring here with a sound. For an alarm that must ring loudly at an exact minute even when the phone is asleep, use <b>Add to iPhone Calendar</b> on the alarm or event, or the phone's Clock app.${cloud?" Notifications sent by the helper can arrive a few minutes late.":""}</div></section>`;
}

/* ---------- small helpers for the new pages ---------- */
function localNotify(title,body,tag,url){try{if(!("Notification" in window)||Notification.permission!=="granted"||!navigator.serviceWorker||ST._localPref("pushOn")==="0")return;navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,tag,data:{url},icon:"icons/icon-192.png"})).catch(()=>{})}catch(e){}}
const hello=()=>{const h=new Date().getHours(),p=person(viewId());return (h<12?"Good morning":h<18?"Good afternoon":"Good evening")+(p?", "+p.name:"")};
function setActive(){const slot=slotInfo().r;let active=parentTab[tab]||tab;if(tab===slot||(tab==="bills"&&slot==="money"))active=slot;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.tab===active))}
/* piano: the new piano page builds itself once inside #pianoHost and is never rebuilt while someone is playing */
let pianoOn=false,pianoFail=false;
function pianoOff(){if(!pianoOn)return;pianoOn=false;try{window.HHPiano&&HHPiano.unmount()}catch(e){console.error(e)}}
/* Where the piano comes from. Its address is not written anywhere in this app: it is kept in the family's own settings
   (pianoHome), which only signed-in family members can read, so the app learns it only after sign-in.
   Until it is set, only the little piano shows. */
const PIANO_HOME_RE=/^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)\/piano\/$/;
const PIANO_HERE=null;             // the piano is no longer kept next to the app: it lives only in its own home
let pianoLd={state:""};           // want: the address picked; base: the one in use; state: "loading", "ok", "fail" or "none" (no address known yet)
function pianoHomeClean(v){ // what was pasted, as a piano address; "" for nothing, null if it is not one
  v=String(v||"").trim().toLowerCase().replace(/[?#].*$/,"");if(!v)return "";
  v="https://"+v.replace(/^[a-z]+:\/*/,"").replace(/\/+$/,"");if(!/\/piano$/.test(v))v+="/piano";v+="/";
  return PIANO_HOME_RE.test(v)?v:null}
function pianoHome(){const h=ST.mode==="cloud"&&ST.phase==="ready"?(S().settings||{}).pianoHome:"";return typeof h==="string"&&PIANO_HOME_RE.test(h)?h:""}
function pianoLoad(){ // on every render once the family is in: start loading the piano if it is not here yet
  const want=pianoHome()||PIANO_HERE;
  if(pianoLd.state==="loading"||pianoLd.state==="ok"||(pianoLd.state&&pianoLd.want===want))return;
  if(want===null){pianoLd={want,state:"none"};return}
  pianoGet(want,want)}
function pianoGet(base,want){
  pianoLd={want,base,state:"loading"};
  const one=(tag,attrs)=>new Promise((ok,no)=>{const el=document.createElement(tag);el.crossOrigin="anonymous";Object.assign(el,attrs);el.onload=()=>ok(el);el.onerror=()=>{el.remove();no(new Error(attrs.href||attrs.src))};document.head.appendChild(el)});
  one("link",{rel:"stylesheet",href:base+"piano.css"}).then(()=>one("script",{src:base+"piano.js"})).then(()=>{
    if(!window.HHPiano)throw new Error("no piano in "+base);
    pianoLd={want,base,state:"ok"};
    if(base&&base!==PIANO_HERE)try{const sw=navigator.serviceWorker&&navigator.serviceWorker.controller;if(sw)sw.postMessage({type:"hh-piano",base})}catch(e){}
    render()
  }).catch(e=>{console.warn("piano:",e&&e.message);
    if(!window.HHPiano&&base!==PIANO_HERE&&PIANO_HERE!==null){pianoGet(PIANO_HERE,want);return}   // its home did not answer: use the one with the app
    pianoLd={want,base,state:window.HHPiano?"ok":"fail"};render()})}
/* ---------- piano players: who is playing, and the list of songs played ----------
   Every song played to the end is kept as one row in the family's "plays" (one record per month, so the list stays cheap to load).
   A row can be given to another person or deleted; the song's stars and the scoreboard stars follow it. */
const PLAYS_MAX=3000;      // rows in one month's record; after that a play still counts, it just gets no row of its own
const pianoWho=()=>{const v=+ST._localPref("pianoWho");return people().some(p=>p.id===v)?v:learnerId()};
function setPianoWho(id){id=+id;if(!people().some(p=>p.id===id))return false;ST._localPref("pianoWho",String(id));try{if(pianoOn&&window.HHPiano)HHPiano.refresh()}catch(e){console.error(e)}return true}
const pkey=key=>String(key||"song").replace(/[^\w-]+/g,"_").slice(0,60)||"song";      // the name a song's stars are kept under
function playRows(){ // every play in the list, newest first
  const out=[];
  (S().plays||[]).forEach(d=>{const p=d&&d.p;if(!p||typeof p!=="object")return;Object.keys(p).forEach(id=>{const r=p[id];if(r&&typeof r==="object"&&r.who!=null)out.push({...r,id,m:d.id})})});
  return out.sort((a,b)=>(+b.at||0)-(+a.at||0));
}
/* scoreboard stars from the piano: one record per person per day, at most 10 a day so the scoreboard stays fair */
const pianoPts=(who,date)=>+((S().stars.find(x=>x.id==="piano-"+who+"-"+date)||{}).pts)||0;
function pianoStars(who,date,delta,title){ // add to (or take from) one person's piano stars for one day; says how many really changed
  delta=Math.round(+delta||0);if(!delta||!date)return 0;
  const sid="piano-"+who+"-"+date,prev=S().stars.find(x=>x.id===sid),had=+(prev&&prev.pts)||0,now=Math.max(0,Math.min(10,had+delta));
  if(now===had)return 0;
  if(!now)ST.del("stars",sid);else ST.put("stars",sid,{who:+who,pts:now,date,title:title?"Piano: "+String(title).slice(0,40):(prev&&prev.title)||"Piano"});
  return now-had;
}
function learnStar(n,title,who){ // stars from piano practice, for the person who is playing
  n=Math.max(0,Math.min(3,Math.round(+n||0)));if(!n)return 0;
  return pianoStars(who||pianoWho(),TODAY(),n,title||"practice");
}
/* one song's record for one person = the part from before the list was kept ("e") joined with that person's rows in the list */
const pianoOf=who=>learnDoc(who).piano||{};
const pianoClean=who=>{const pm=pianoOf(who),o={};Object.keys(pm).forEach(k=>{if(pm[k]&&typeof pm[k]==="object")o[k]=pm[k]});return o};      // without the empty places
const rowsOf=(all,who,k)=>all.filter(r=>+r.who===+who&&pkey(r.song)===k);
const E0=()=>({s:0,b:0,n:0,l:""});
function earlierOf(who,k,rows){
  const en=pianoOf(who)[k];if(!en||typeof en!=="object")return E0();
  if(en.e&&typeof en.e==="object"){const n=Math.max(0,Math.round(+en.e.n||0));return n?{s:+en.e.s||0,b:+en.e.b||0,n,l:String(en.e.l||"")}:E0()}
  const n=Math.max(0,(+en.plays||((+en.stars||+en.best)?1:0))-rows.length);
  return n?{s:+en.stars||0,b:+en.best||0,n,l:String(en.last||"")}:E0();
}
function pianoEntry(e,rows){ // null when nothing is left of the song
  const n=e.n+rows.length;if(!n)return null;
  return {stars:Math.max(e.s,...rows.map(r=>+r.stars||0)),best:Math.max(e.b,...rows.map(r=>+r.pct||0)),plays:n,last:[e.l,...rows.map(r=>String(r.date||""))].sort().pop()||TODAY(),e:{s:e.s,b:e.b,n:e.n,l:e.l}};
}
/* Saving touches only the songs that changed (and the "last practised" time), never the rest of the person's record, so
   lesson progress is safe even if this phone has not loaded it yet. A song that is taken away is kept as an empty place (null). */
function pianoSave(who,ch,o){ // ch: {song name: its new record, or null to take it away}. o.rows: the list after the change; o.add / o.drop: the time of a play that came or went
  o=o||{};const d=learnDoc(who),pm={...(d.piano||{})},set={},mine=(o.rows||playRows()).filter(r=>+r.who===+who);
  Object.keys(ch).forEach(k=>{set[k]=ch[k]||null;pm[k]=set[k]});
  let at=+d.pianoAt||0;
  if(o.drop&&at===+o.drop)at=Math.max(0,...mine.map(r=>+r.at||0));
  if(o.add)at=Math.max(at,+o.add);
  if(!mine.length&&!Object.keys(pm).some(k=>pm[k]))at=0;
  ST.merge("learn",String(who),{piano:set,pianoAt:at,who:+who});
}
function savePiano(key,obj){ // the older way to save a song (an older piano page): there is no row for it, so it counts as a play from before the list
  const id=pianoWho(),k=pkey(key),o=obj||{},all=playRows(),mine=rowsOf(all,id,k),e=earlierOf(id,k,mine);
  pianoSave(id,{[k]:pianoEntry({s:Math.max(e.s,+o.stars||0),b:Math.max(e.b,+o.best||0),n:e.n+1,l:String(o.last||TODAY()).slice(0,10)},mine)},{rows:all,add:Date.now()});
}
/* how many of a play's stars may still go on the scoreboard: a song gives a person at most 3 a day, and the piano at most 10 a day */
function starsDue(all,who,k,date,stars,skip){
  const had=all.filter(r=>+r.who===+who&&r.date===date&&pkey(r.song)===k&&r.id!==skip).reduce((n,r)=>n+(+r.gave||0),0);
  return Math.max(0,Math.min(3,(+stars||0)-had,10-pianoPts(who,date)));
}
function pianoPlayed(o){ // the piano calls this when a song is played to the end; it answers {id, who, gave}
  o=o||{};const who=pianoWho(),at=Date.now(),date=TODAY(),k=pkey(o.key),stars=Math.max(1,Math.min(3,Math.round(+o.stars||1))),pct=Math.max(0,Math.min(100,Math.round(+o.pct||0)));
  const all=playRows(),mine=rowsOf(all,who,k),e=earlierOf(who,k,mine),gave=starsDue(all,who,k,date,stars);
  const m=date.slice(0,7),doc=(S().plays||[]).find(d=>d.id===m),full=!!(doc&&doc.p&&Object.keys(doc.p).length>=PLAYS_MAX);
  const row={who,song:String(o.key||"song").slice(0,80),title:String(o.title||"Song").slice(0,60),mode:o.mode==="time"?"time":"learn",stars,pct,at,date,gave,by:meId()};
  let id=null;
  if(full)pianoSave(who,{[k]:pianoEntry({s:Math.max(e.s,stars),b:Math.max(e.b,pct),n:e.n+1,l:date},mine)},{rows:all,add:at});
  else{
    id=at.toString(36)+Math.random().toString(36).slice(2,6).padEnd(4,"0");
    ST.merge("plays",m,{m,p:{[id]:row}});
    pianoSave(who,{[k]:pianoEntry(e,mine.concat(row))},{rows:all.concat({...row,id,m}),add:at});
  }
  if(gave)pianoStars(who,date,gave,row.title);
  return {id,who,gave};
}
function playOut(all,r){ // a play leaves its person: what changes for them. Another play of the same song that day may now be owed the stars.
  const who=+r.who,k=pkey(r.song),rest=all.filter(x=>x.id!==r.id),mine=rowsOf(all,who,k),e=earlierOf(who,k,mine),left=mine.filter(x=>x.id!==r.id);
  const same=left.filter(x=>x.date===r.date),fix={};let delta=-(+r.gave||0);
  if(same.length&&+r.gave){
    const top=same.reduce((a,b)=>(+b.stars||0)>(+a.stars||0)?b:a),due=Math.min(+r.gave,Math.max(0,(+top.stars||0)-same.reduce((n,x)=>n+(+x.gave||0),0)));
    if(due){top.gave=(+top.gave||0)+due;fix[top.id]={gave:top.gave};delta+=due}
  }
  return {who,k,rest,fix,delta,entry:pianoEntry(e,left)};
}
function pianoMove(id,to){ // give a play to another person: the song's stars and the scoreboard stars go with it
  to=+to;const all=playRows(),r=all.find(x=>x.id===id);
  if(!r||+r.who===to||!people().some(p=>p.id===to))return null;
  const out=playOut(all,r),k=out.k,theirs=rowsOf(out.rest,to,k),e=earlierOf(to,k,theirs),gave=starsDue(out.rest,to,k,r.date,r.stars),moved={...r,who:to,gave},after=out.rest.concat(moved);
  ST.merge("plays",r.m,{p:{...out.fix,[id]:{who:to,gave}}});
  pianoSave(out.who,{[k]:out.entry},{rows:after,drop:r.at});
  pianoSave(to,{[k]:pianoEntry(e,theirs.concat(moved))},{rows:after,add:r.at});
  pianoStars(out.who,r.date,out.delta);
  pianoStars(to,r.date,gave,r.title);
  return {id,from:out.who,who:to,gave};
}
function pianoDrop(id){ // delete one play, with Undo
  const all=playRows(),r=all.find(x=>x.id===id);if(!r)return false;
  const out=playOut(all,r);
  ST.merge("plays",r.m,{p:{...out.fix,[id]:null}});
  pianoSave(out.who,{[out.k]:out.entry},{rows:out.rest,drop:r.at});
  pianoStars(out.who,r.date,out.delta);
  toast("Play deleted","Undo",()=>{playBack(r);toast("Restored")});
  return true;
}
function playBack(r){ // put a deleted play back where it was
  const all=playRows();if(all.some(x=>x.id===r.id))return;
  const who=+r.who,k=pkey(r.song),mine=rowsOf(all,who,k),e=earlierOf(who,k,mine),gave=starsDue(all,who,k,r.date,r.stars),{id,m,...row}=r;
  row.gave=gave;
  ST.merge("plays",m,{m,p:{[id]:row}});
  pianoSave(who,{[k]:pianoEntry(e,mine.concat({...row,id,m}))},{rows:all.concat({...row,id,m}),add:r.at});
  pianoStars(who,r.date,gave,r.title);
}
/* the older part of a song's record (from before the list): it can go to another person, or be deleted. The stars of its last day follow as well as can be known. */
function earlierMove(who,k,to){
  who=+who;to=+to;if(who===to||!people().some(p=>p.id===to))return null;
  const all=playRows(),ra=rowsOf(all,who,k),rb=rowsOf(all,to,k),a=earlierOf(who,k,ra),b=earlierOf(to,k,rb);if(!a.n)return null;
  pianoSave(who,{[k]:pianoEntry(E0(),ra)},{rows:all});
  pianoSave(to,{[k]:pianoEntry({s:Math.max(a.s,b.s),b:Math.max(a.b,b.b),n:a.n+b.n,l:a.l>b.l?a.l:b.l},rb)},{rows:all});
  const took=-pianoStars(who,a.l,-Math.min(3,a.s))||0,got=took?pianoStars(to,a.l,took):0;
  return {who,k,to,a,b,date:a.l,took,got};
}
function earlierDrop(who,k){
  who=+who;const all=playRows(),ra=rowsOf(all,who,k),a=earlierOf(who,k,ra);if(!a.n)return false;
  const u={who,k,to:null,a,b:null,date:a.l,took:0,got:0};
  pianoSave(who,{[k]:pianoEntry(E0(),ra)},{rows:all});
  u.took=-pianoStars(who,a.l,-Math.min(3,a.s))||0;
  toast("Deleted","Undo",()=>{earlierBack(u);toast("Restored")});
  return true;
}
function earlierBack(u){ // undo for the two above
  const all=playRows();
  pianoSave(u.who,{[u.k]:pianoEntry(u.a,rowsOf(all,u.who,u.k))},{rows:all});
  if(u.to!=null)pianoSave(u.to,{[u.k]:pianoEntry(u.b,rowsOf(all,u.to,u.k))},{rows:all});
  if(u.got)pianoStars(u.to,u.date,-u.got);
  if(u.took)pianoStars(u.who,u.date,u.took);
}
/* the sheet: pick who is playing, then the table of songs played */
let playsShown=40;
const BIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
const pstars=n=>{n=Math.max(0,Math.min(3,Math.round(+n||0)));return "★★★".slice(0,n)+"☆☆☆".slice(0,3-n)};
function songTitles(){
  const t={};
  try{((window.HHPiano&&HHPiano.SONGS)||[]).forEach(s=>{t[pkey("b:"+s.id)]=s.title})}catch(e){}
  (S().songs||[]).forEach(d=>{if(d&&d.id!=null)t[pkey("c:"+d.id)]=d.title||"Our song"});
  return t;
}
function pianoSheetBody(){
  const who=pianoWho(),ps=people(),all=playRows(),titles=songTitles();
  const sel=(attr,cur)=>`<select class="pwho" ${attr} aria-label="Who played">${ps.map(p=>`<option value="${p.id}"${p.id===+cur?" selected":""}>${esc(p.name)}</option>`).join("")}${ps.some(p=>p.id===+cur)?"":`<option value="${esc(cur)}" selected>Someone</option>`}</select>`;
  const time=at=>{try{return new Date(+at).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})}catch(e){return ""}};
  const day=d=>/^\d{4}-\d\d-\d\d$/.test(d)?nice(d):"Earlier";
  const pick=ps.length>1?`<div class="label">Who is playing?</div>
   <div class="profpick">${ps.map(q=>`<button type="button" class="pp ${q.id===who?"on":""}" data-act="pianoWho" data-k="${q.id}">${dot(q.id)}<span>${esc(q.name)}</span></button>`).join("")}</div>
   <div class="sub">Stars from the piano go to the person who is playing.</div>`:"";
  const rows=all.slice(0,playsShown).map(r=>`<div class="ptr" data-row="${esc(r.id)}"><div class="pwhen"><b>${esc(day(r.date))}</b><span>${esc(time(r.at))}</span></div>
    <div class="psong"><b>${esc(r.title||titles[pkey(r.song)]||"Song")}</b><span><i class="pst" aria-label="${+r.stars||0} of 3 stars">${pstars(r.stars)}</i> ${r.mode==="time"?"In time":"Learn"} · ${+r.pct||0}%</span></div>
    ${sel(`data-play="${esc(r.id)}"`,r.who)}<button type="button" class="pdel" data-act="playDel" data-id="${esc(r.id)}" aria-label="Delete this play">${BIN}</button></div>`).join("");
  const old=[];
  ps.forEach(p=>{const pm=pianoOf(p.id);Object.keys(pm).forEach(k=>{const e=earlierOf(p.id,k,rowsOf(all,p.id,k));if(e.n)old.push({who:p.id,k,e})})});
  old.sort((a,b)=>a.e.l<b.e.l?1:a.e.l>b.e.l?-1:(titles[a.k]||a.k).localeCompare(titles[b.k]||b.k));
  const olds=old.map(x=>`<div class="ptr pold" data-oldrow="${x.who}|${esc(x.k)}"><div class="pwhen"><b>${esc(day(x.e.l))}</b><span>${x.e.n} play${x.e.n===1?"":"s"}</span></div>
    <div class="psong"><b>${esc(titles[x.k]||x.k.replace(/^[bc]_/,"").replace(/[-_]+/g," "))}</b><span><i class="pst" aria-label="${x.e.s} of 3 stars">${pstars(x.e.s)}</i>${x.e.b?" Best "+Math.round(x.e.b)+"%":""}</span></div>
    ${sel(`data-old="${x.who}|${esc(x.k)}"`,x.who)}<button type="button" class="pdel" data-act="oldDel" data-k="${x.who}|${esc(x.k)}" aria-label="Delete this record">${BIN}</button></div>`).join("");
  const head=`<div class="ptr pth" aria-hidden="true"><span>When</span><span>Song</span><span>Who played</span><span></span></div>`;
  const table=all.length||old.length?`<div class="label" style="margin-top:6px">Songs played</div>
   <div class="ptable">${head}${rows}${all.length>playsShown?`<button type="button" class="ghost" data-act="playsMore">Show more</button>`:""}${olds?`${all.length?`<div class="pgap">Older, one row for each song</div>`:""}${olds}`:""}</div>
   <div class="sub">Change the name on a row to give that play and its stars to someone else. The bin deletes one row.</div>`
   :`<div class="label" style="margin-top:6px">Songs played</div><div class="sub">Nothing here yet. Play a song to the end in Learn or Play in time and it shows up here.</div>`;
  return pick+table;
}
function pianoSheet(){playsShown=40;const h=pianoSheetBody();openSheet(`${sheetHead("Piano players")}<div id="pp_body">${h}</div>`,()=>{const b=$("#pp_body");if(b)b._h=h})}
function pianoSheetPaint(){ // the table follows the family's data while it is open (but never under an open name list)
  const b=$("#pp_body");if(!b)return;
  const f=document.activeElement;if(f&&f.matches&&f.matches("select.pwho")&&b.contains(f))return;
  const h=pianoSheetBody();if(h!==b._h){b._h=h;b.innerHTML=h}
}
/* one-time tidy-up the family asked for: the grown-ups show as Dad and Mum. The old names are kept as "aka" so Quick add still understands them. */
let roleBusy=false;
function roleNames(){
  const s=SET(),raw=peopleRaw();
  if(roleBusy||s.roleNames||ST.mode!=="cloud"||ST.phase!=="ready"||!ST.settingsLive||raw.length!==3||!s.owner||s.owner!==ST.me.uid||raw[0].uid!==ST.me.uid)return;
  roleBusy=true;const want=["Dad","Mum"];
  ST.setSettings({people:raw.map((p,i)=>i<2&&p.name!==want[i]?Object.assign({},p,{name:want[i],aka:p.aka||p.name}):p),roleNames:1});
}

/* ---------- render ---------- */
const TITLES={happy:"Happy",signups:"Sign-ups",home:"Happy Home",today:"Today",calendar:"Calendar",lists:"Lists",money:"Money",more:"More",notes:"Notes",calc:"Calculator",location:"Location",wallet:"Wallet",mood:"Mood",bills:"Bills",meals:"Dinner plan",dates:"Dates",activities:"Activities",learn:"Chinese",piano:"Piano",alarms:"Alarms"};
let rendering=false;
/* the bright look: every page wears its own colour (theme.css reads html[data-page]) */
function paintPage(pg,again){const de=document.documentElement;if(de.dataset.page===pg&&!again)return;de.dataset.page=pg;
  try{const c=getComputedStyle(de).getPropertyValue("--bar").trim();if(/^#[0-9a-f]{3,8}$/i.test(c))document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{m.content=c})}catch(_){}}
/* "Can you make app change colour every time it opens" and "All ui are changing colours all the time" (27 Nov 2026):
   the eight bright colours trade places at random each time the app opens, so every page wears a new colour, and they
   glide to new places every 40 seconds while the app is open. Each colour takes its own contrast-checked text colour
   with it, so words stay readable. They hold still on the piano (it has its own lights) and, when the phone asks for
   less motion, change only when the app opens. */
const HUES={orange:["#FF9A2E","#A64200","#FFB25E"],amber:["#FFCB2E","#8F5A00","#FFD75A"],green:["#3DD68C","#097240","#5FE3A1"],teal:["#2CCFD6","#066F78","#57DCE2"],
  blue:["#56A8FF","#1257C9","#7DBBFF"],purple:["#A98BFF","#5B33D6","#BCA5FF"],pink:["#FF7EB8","#B8195F","#FF9CC8"],red:["#FF7272","#C3202F","#FF9494"]};
const HK=Object.keys(HUES);let hueOrder=HK.slice();
function hueCss(o){const one=(i,j)=>HK.map((k,n)=>`--${k}${j?"-t":""}:${HUES[o[n]][j||0]}`).join(";");
  return `:root{${one(0,0)};${one(0,1)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${one(0,2)}}}:root[data-theme="dark"]{${one(0,2)}}`}
function shuffleHues(){
  const o=HK.slice();for(let i=o.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[o[i],o[j]]=[o[j],o[i]]}
  for(let i=0;i<o.length;i++)if(o[i]===hueOrder[i]){const j=(i+1)%o.length;[o[i],o[j]]=[o[j],o[i]]}      // nearly every page gets a new colour
  hueOrder=o;let st=document.getElementById("hhHue");if(!st){st=document.createElement("style");st.id="hhHue";document.head.appendChild(st)}st.textContent=hueCss(o);
  clearTimeout(shuffleHues._t);shuffleHues._t=setTimeout(()=>paintPage(document.documentElement.dataset.page||"home",true),2800)}
try{shuffleHues();
  const calm=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(()=>{if(calm())return;const g=document.createElement("style");g.id="hhHueGlide";
    g.textContent=HK.map(k=>`@property --${k}{syntax:"<color>";inherits:true;initial-value:${HUES[k][0]}}`).join("")+`:root{transition:${HK.map(k=>`--${k} 2.6s ease-in-out`).join(",")}}`;
    document.head.appendChild(g)},1500);
  setInterval(()=>{if(document.hidden||calm()||tab==="piano"||document.documentElement.classList.contains("pn-focus"))return;shuffleHues()},40000);
}catch(e){console.error(e)}
/* a few stars fly out when something gets ticked off */
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>paintPage(document.documentElement.dataset.page||"home",true))}catch(_){}
let lastTap=null;
function party(){try{const e=lastTap,w=$(".wrap");if(!e||!w||!w.animate||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  ["⭐","✨","🎉","⭐","✨","💛"].forEach((ch,i,all)=>{const s=document.createElement("span");s.className="party";s.textContent=ch;s.setAttribute("aria-hidden","true");s.style.left=e.x+"px";s.style.top=e.y+"px";w.append(s);
    const a=(i/all.length)*Math.PI*2+Math.random()*.7,d=44+Math.random()*30,x=Math.cos(a)*d,y=Math.sin(a)*d-16;
    const an=s.animate([{transform:"translate(-50%,-50%) scale(.3)",opacity:1},{transform:`translate(calc(-50% + ${x.toFixed(0)}px),calc(-50% + ${y.toFixed(0)}px)) scale(1.1) rotate(${(Math.random()*80-40).toFixed(0)}deg)`,opacity:1,offset:.65},{transform:`translate(calc(-50% + ${(x*1.15).toFixed(0)}px),calc(-50% + ${(y*1.15+14).toFixed(0)}px)) scale(.7)`,opacity:0}],{duration:760,easing:"cubic-bezier(.2,.8,.3,1)"});
    an.onfinish=an.oncancel=()=>s.remove();setTimeout(()=>s.remove(),1200)})}catch(_){}}
function render(){
  if(rendering)return;rendering=true;
  try{
    const nav=$("nav.tabs"),head=$("header.top");
    if(ST.phase!=="ready"||(ST.mode==="cloud"&&!ST.me.personId)){
      nav.hidden=true;head.hidden=true;pianoOff();paintPage("auth");
      $("#view").innerHTML=ST.phase==="loading"?`<div class="auth"><div class="logo">H</div><p class="sub">Loading your family…</p></div>`:ST.phase==="signedOut"?viewAuth():ST.phase==="needsFamily"?viewFamilySetup():viewClaim();
      bindForms();return;
    }
    nav.hidden=false;head.hidden=false;pianoLoad();
    if(!TITLES[tab])tab="home";paintPage(tab);
    if(ST.mode==="cloud")suAsk();
    syncPhotos();renderTabs();
    {const pv=viewId(),pb=$("#btnProfile");if(pb){const ph=photoOf(pv),cls="avatarbtn dot who-"+colorIdx(pv)+(ph?" ph ph-"+pv:"")+(switched()?" sw":""),ini=(pname(pv)||"?").slice(0,1).toUpperCase();if(pb.className!==cls)pb.className=cls;if(pb.textContent!==ini)pb.textContent=ini;pb.setAttribute("aria-label","Profile: "+pname(pv)+(switched()?", on "+pname(meId())+"'s phone":""))}}
    if(tab==="piano"&&window.HHPiano&&!pianoFail){
      $("#title").textContent=TITLES.piano;$("#subtitle").textContent="";
      if(!pianoOn||!$("#pianoHost")){$("#view").innerHTML=`<div id="pianoTop"></div><div id="pianoHost"></div>`;pianoOn=true;try{HHPiano.mount($("#pianoHost"))}catch(e){console.error(e);pianoOn=false;pianoFail=true}}
      else{try{HHPiano.refresh()}catch(e){console.error(e)}}
      if(!pianoFail){const top=$("#pianoTop"),h=alarmBanner()+syncBar();if(top&&top._h!==h){top.innerHTML=h;top._h=h}setActive();return}
    }
    pianoOff();document.documentElement.classList.remove("pn-focus");      // the piano's full screen never stays on another page
    const keepShop=$("#shopInput"),shopVal=keepShop&&keepShop.value,shopFocus=keepShop&&document.activeElement===keepShop;
    const keepNote=$("#moodNote"),noteVal=keepNote&&keepNote.value;const keepQ=$("#qa"),qVal=keepQ&&keepQ.value,qFocus=keepQ&&document.activeElement===keepQ;const keepB=$("#boardIn"),bVal=keepB&&keepB.value,bFocus=keepB&&document.activeElement===keepB;
    if(!TITLES[tab])tab="home";
    $("#title").textContent=TITLES[tab];
    $("#subtitle").textContent=tab==="home"?hello():tab==="today"?new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"}):"";
    /* rows that swipe sideways keep their place when the page is drawn again, and an unchanged Happy page is not redrawn
       at all, so a swipe that is still gliding is never cut short */
    {const vw=$("#view"),xs=[...vw.querySelectorAll("[data-keepx]")].map(e=>[e.dataset.keepx,e.scrollLeft]),html=alarmBanner()+syncBar()+{happy:()=>window.viewHappy?viewHappy():"",home:viewHomeLive,today:viewToday,calendar:viewCalendar,lists:viewLists,money:viewMoney,more:viewMore,notes:viewNotes,calc:viewCalc,location:viewLocation,wallet:viewWallet,mood:viewMood,bills:viewBills,signups:viewSignups,meals:viewMeals,dates:viewDates,activities:viewActivities,learn:viewLearn,piano:viewPianoPage,alarms:viewAlarms}[tab]();
     if(!(tab==="happy"&&vw._h===html&&vw.querySelector(".hp-page"))){vw.innerHTML=html;vw._h=html;xs.forEach(([k,x])=>{if(!x)return;const e=vw.querySelector('[data-keepx="'+k+'"]');if(e)e.scrollLeft=x})}}
    setActive();
    if(shopVal&&$("#shopInput"))$("#shopInput").value=shopVal; if(shopFocus&&$("#shopInput"))$("#shopInput").focus();
    if(noteVal&&$("#moodNote"))$("#moodNote").value=noteVal;if(qVal&&$("#qa")){$("#qa").value=qVal;showQuick()}if(qFocus&&$("#qa"))$("#qa").focus();if(bVal&&$("#boardIn"))$("#boardIn").value=bVal;if(bFocus&&$("#boardIn"))$("#boardIn").focus();
    bindForms();
  }finally{rendering=false}
}
function bindForms(){
  const sf=$("#shopForm");if(sf)sf.onsubmit=e=>{e.preventDefault();const v=$("#shopInput").value.trim();if(!v)return;
    $("#shopInput").value="";v.split(/\s*,\s*/).filter(Boolean).forEach(addShopItem);$("#shopInput").focus()};
  const bf=$("#boardForm");if(bf)bf.onsubmit=e=>{e.preventDefault();const v=$("#boardIn").value.trim();if(!v)return;ST.add("board",{text:v,who:viewId(),at:Date.now(),ack:{}});$("#boardIn").value="";$("#boardIn").blur();toast("Posted for the family")};
  const qf=$("#qaForm");if(qf){const q=$("#qa");q.oninput=showQuick;qf.onsubmit=e=>{e.preventDefault();const v=q.value.trim();if(!v){q.focus();return}
    saveQuick(parseQuick(v));try{ST._localPref("qaUses",String(+(ST._localPref("qaUses")||0)+1))}catch(_){}q.value="";showQuick();q.blur()}}
  const cf=$("#cpForm");if(cf){const ci=$("#cp_code");ci.oninput=()=>{cpCode=ci.value;if(cpMsg){cpMsg="";cpOk=false;const m=$("#cpMsg");if(m)m.remove()}};
    cf.onsubmit=async e=>{e.preventDefault();cpCode=ci.value.trim();ci.blur();
      if(!cpNorm(cpCode)){cpOk=false;cpMsg="Type a coupon code first."}
      else if(await cpCheck(cpCode)){cpOk=true;cpMsg="Coupon accepted.";ST._localPref("coupon",cpNorm(cpCode))}
      else{cpOk=false;cpMsg="That code isn't valid."}
      render()}}
  const af=$("#authForm");if(af){
    {const ae=$("#a_email"),ap=$("#a_pw"),ac=$("#a_code");if(ae&&authEm)ae.value=authEm;if(ap&&authPw)ap.value=authPw;if(ac&&authCode)ac.value=authCode;
     const fe=authFocus&&$("#"+authFocus);authFocus="";if(fe)fe.focus()}
    af.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;authErr="";
      const em=$("#a_email").value.trim(),pw=$("#a_pw").value,ce=$("#a_code"),code=ce?ce.value.replace(/\D/g,""):"",key=em+"\n"+pw;
      let ok=false,codeStep=false;authEm=em;authPw=pw;authCode=code;
      const needCode=()=>{authErr="Type the 6-digit 2FA code.";authFocus="a_code"};
      const finish=async()=>{try{await ST.finishMfaSignIn(code);ok=true}catch(err){const c=err&&err.code||"";
        if(/expired/.test(c)){ST.cancelMfa();mfaFor="";authErr="That took too long. Tap Sign in again."}else authErr=authErrorText(err);authCode="";authFocus="a_code"}};
      try{
        if(authMode==="signup"){await ST.signUp(em,pw);ok=true}
        else if(ST.mfaResolver&&mfaFor===key){codeStep=true;if(code)await finish();else needCode()}
        else{ST.cancelMfa();mfaFor="";
          try{await ST.signIn(em,pw);ok=true}
          catch(err){if(!(err&&err.code==="hh/mfa-needed"))throw err;mfaFor=key;codeStep=true;if(code)await finish();else needCode()}}
      }catch(err){authErr=authErrorText(err)}
      if(ok){authEm="";authPw="";authCode="";mfaFor=""}else if(!codeStep){authPw="";authCode=""}
      busy=false;render()}}
  const nf=$("#newFam");if(nf)nf.onsubmit=async e=>{e.preventDefault();busy=true;authErr="";try{await ST.createFamily({myName:$("#n_me").value.trim(),otherNames:[$("#n_2").value.trim(),$("#n_3").value.trim()],currency:$("#n_cur").value.trim()})}catch(err){authErr=authErrorText(err)}busy=false;render()};
  const jf=$("#joinFam");if(jf)jf.onsubmit=async e=>{e.preventDefault();busy=true;authErr="";try{await ST.joinFamily($("#j_code").value)}catch(err){authErr=authErrorText(err)}busy=false;render()};
}
function showQuick(){const q=$("#qa"),p=$("#qaPrev"),tip=$("#qaTip");if(!q||!p)return;const v=q.value.trim();const h=v.length>1?quickPreview(parseQuick(v)):"";p.hidden=!h;p.innerHTML=h?`<span class="label">Will add</span> ${h}`:"";if(tip)tip.hidden=!!v||+(ST._localPref("qaUses")||0)>=3}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition, hasMic=!!SR;
function voiceAdd(){
  const q=$("#qa");if(!q)return;
  try{const r=new SR();r.lang="en-AU";r.interimResults=true;r.maxAlternatives=1;const btn=$(".qamic");btn&&btn.classList.add("on");toast("Listening… say it now");
    r.onresult=e=>{q.value=[...e.results].map(x=>x[0].transcript).join(" ");showQuick()};
    r.onerror=()=>{btn&&btn.classList.remove("on");q.focus();toast("Use the microphone on your keyboard instead")};
    r.onend=()=>{btn&&btn.classList.remove("on");if(q.value.trim())q.focus()};r.start()}
  catch(e){q.focus();toast("Use the microphone on your keyboard instead")}
}
function go(t){t=routeOf(t);if(!routes.includes(t))t="home";const v=$("#view");if(v&&t!==tab){if(tab==="home"||tab==="today"||tab==="more")cameFrom=tab;v.classList.remove("enter");void v.offsetWidth;v.classList.add("enter");clearTimeout(go._t);go._t=setTimeout(()=>v.classList.remove("enter"),400)}tab=t;try{history.replaceState(null,"","#"+t)}catch(e){location.hash=t}render();scrollTo(0,0)}

/* ---------- sheets ---------- */
function closeSheet(){$("#sheetHost").innerHTML="";document.body.classList.remove("sheet-open")}
function openSheet(html,onMount){
  document.body.classList.add("sheet-open");
  $("#sheetHost").innerHTML=`<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="in">${html}</div></div>`;
  onMount&&onMount($("#sheetHost .sheet"));
}
const whoOptions=(sel,fam)=>(fam?`<option value="0" ${sel==0?"selected":""}>Whole family</option>`:"")+people().map(p=>`<option value="${p.id}" ${p.id==sel?"selected":""}>${esc(p.name)}</option>`).join("");
const sheetHead=t=>`<div class="row between"><h2>${t}</h2><button class="del" style="display:block" data-act="close" aria-label="Close">${ICON.x}</button></div>`;
function defaultKind(){return {money:"money",calendar:"event",notes:"note",calc:"money",wallet:"card",lists:{tasks:"task",shopping:"shop",homework:"homework"}[listTab]}[tab]||"task"}
function addSheet(kind,preset,edit){
  kind=kind||defaultKind();preset=preset||{};
  if(kind==="card")return cardForm();
  const kinds=[["task","Task"],["event","Event"],["money","Money"],["shop","Shopping"],["homework","Homework"],["note","Note"]];
  const pick=`<div class="pickgrid">${kinds.map(([k,n])=>`<button type="button" class="${k===kind?"on":""}" data-kind="${k}">${n}</button>`).join("")}</div>`;
  const kid=kidId(), me=viewId(), cats=SET().categories||[];
  let body="";
  if(kind==="task")body=`<div class="field"><label for="f_title">What needs doing?</label><input id="f_title" required placeholder="e.g. Take bins out"></div>
   <div class="two"><div class="field"><label for="f_who">Who</label><select id="f_who">${whoOptions(preset.who??me)}</select></div><div class="field"><label for="f_due">Date</label><input id="f_due" type="date" value="${TODAY()}"></div></div>
   <div class="two"><div class="field"><label for="f_time">Time (optional)</label><input id="f_time" type="time"></div><div class="field"><label for="f_rep">Repeat</label><select id="f_rep"><option value="none">Doesn't repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div></div>
   <div class="field"><label for="f_pts">Stars for doing it (chores)</label><select id="f_pts"><option value="0">No stars</option>${[1,2,3,5,10].map(n=>`<option value="${n}">★ ${n}</option>`).join("")}</select></div>`;
  if(kind==="money")body=`<div class="seg" id="f_type"><button type="button" class="on" data-t="out">Spent</button><button type="button" data-t="in">Received</button></div>
   <div class="two"><div class="field"><label for="f_amt">Amount (${esc(SET().currency||"$")})</label><input id="f_amt" type="number" inputmode="decimal" step="0.01" min="0" required placeholder="0.00" value="${preset.amount??""}"></div><div class="field"><label for="f_date">Date</label><input id="f_date" type="date" value="${TODAY()}"></div></div>
   <div class="two"><div class="field"><label for="f_cat">Category</label><select id="f_cat">${cats.map(c=>`<option>${esc(c)}</option>`).join("")}<option>Salary</option></select></div><div class="field"><label for="f_who">Who</label><select id="f_who">${whoOptions(me)}</select></div></div>
   <div class="field"><label for="f_note">Note</label><input id="f_note" placeholder="e.g. Weekly shop"></div>`;
  if(kind==="event")body=`<div class="field"><label for="f_title">Event</label><input id="f_title" required placeholder="e.g. Football training"></div>
   <div class="two"><div class="field"><label for="f_date">Date</label><input id="f_date" type="date" value="${preset.date||(tab==="calendar"?calDay:TODAY())}"></div><div class="field"><label for="f_time">Time (blank = all day)</label><input id="f_time" type="time"></div></div>
   <div class="two"><div class="field"><label for="f_who">For</label><select id="f_who">${whoOptions(preset.who??0,true)}</select></div><div class="field"><label for="f_place">Where or link</label><input id="f_place" placeholder="Optional, e.g. pool or lesson link" autocapitalize="off"></div></div>
   <div class="field"><label for="f_erep">Repeat</label><select id="f_erep"><option value="none">Doesn't repeat</option><option value="weekly">Every week on…</option></select></div>
   <div class="field" id="f_daysf" hidden><label>Days</label><div class="daypick">${[1,2,3,4,5,6,0].map(i=>`<button type="button" data-day="${i}">${DAYN[i]}</button>`).join("")}</div></div>
   <div class="field" id="f_untilf" hidden><label for="f_until">Until (optional)</label><input id="f_until" type="date"></div>`;
  if(kind==="shop")body=`<div class="two"><div class="field"><label for="f_title">Item</label><input id="f_title" required placeholder="e.g. Eggs"></div><div class="field"><label for="f_qty">How many</label><input id="f_qty" placeholder="e.g. 12"></div></div>`;
  if(kind==="homework")body=`<div class="two"><div class="field"><label for="f_subj">Subject</label><input id="f_subj" list="subjects" required placeholder="e.g. Maths"><datalist id="subjects">${["Maths","English","Science","HASS","History","Geography","Art","Music","Japanese","PE"].map(s=>`<option value="${s}">`).join("")}</datalist></div><div class="field"><label for="f_due">Due</label><input id="f_due" type="date" value="${addDays(TODAY(),1)}"></div></div>
   <div class="field"><label for="f_title">What to do</label><input id="f_title" required placeholder="e.g. Fractions worksheet, page 14"></div>
   <div class="two"><div class="field"><label for="f_who">For</label><select id="f_who">${whoOptions(kid)}</select></div><div class="field"><label for="f_time">Time (optional)</label><input id="f_time" type="time"></div></div>`;
  if(kind==="note")body=`<div class="field"><label for="f_title">Title</label><input id="f_title" placeholder="e.g. Holiday ideas"></div>
   <div class="field"><label for="f_body">Note</label><textarea id="f_body" class="body" rows="7"></textarea></div>`;
  if(kind==="task"||kind==="homework"||kind==="event")body+=remindSelect(edit?edit.remind:null,kind==="event"?+nprefs().ev:0);
  openSheet(`${sheetHead(edit?{task:"Edit task",homework:"Edit homework",event:"Edit event",money:"Edit money entry"}[kind]:"Add")}${edit?"":pick}<form id="f" class="stack" style="gap:12px">${body}<button class="primary" type="submit">Save</button>${edit?`<button type="button" class="link" id="f_del" style="color:var(--bad);align-self:center">Delete</button>`:""}</form>`,sh=>{
    sh.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>addSheet(b.dataset.kind,preset));
    if(edit){const set=(id,val)=>{const el=sh.querySelector("#"+id);if(el&&val!=null)el.value=val};
      set("f_title",edit.title);set("f_who",edit.who);set("f_due",edit.due);set("f_time",edit.time||"");set("f_rep",kind==="event"?"0":(edit.repeat||"none"));set("f_subj",edit.subject);set("f_date",edit.date);set("f_place",edit.place||"");set("f_pts",String(+edit.points||0));
      if(kind==="event"){const b=document.createElement("button");b.type="button";b.className="ghost";b.textContent="Add to iPhone Calendar";b.onclick=()=>{exportEvent(edit);toast("Opening Calendar…")};sh.querySelector("#f_del").before(b);
        if(isRep(edit)&&preset.occ){const o=document.createElement("button");o.type="button";o.className="link";o.style.alignSelf="center";o.textContent="Skip just "+nice(preset.occ);o.onclick=()=>{ST.patch("events",edit.id,{skip:[...(edit.skip||[]),preset.occ]});closeSheet();toast("Skipped "+nice(preset.occ))};sh.querySelector("#f_del").before(o);sh.querySelector("#f_del").textContent="Delete every week"}}
      if((kind==="task"||kind==="homework")&&edit.due){const b=document.createElement("button");b.type="button";b.className="ghost";b.textContent="Add to iPhone Calendar";b.onclick=()=>{exportEvent({id:edit.id,title:(kind==="homework"?(edit.subject||"Homework")+": ":"")+edit.title,date:edit.due,time:edit.time||"",place:"",repeat:"none",remind:edit.remind==null?0:edit.remind});toast("Opening Calendar…")};sh.querySelector("#f_del").before(b)}
      const col={task:"tasks",homework:"homework",event:"events",money:"tx"}[kind],d=sh.querySelector("#f_del");
      d.onclick=()=>{if(d.dataset.arm){closeSheet();delUndo(col,edit.id);render()}else{d.dataset.arm=1;d.textContent="Tap again to delete"}};}
    if(kind==="event"){const rs=sh.querySelector("#f_erep"),df=sh.querySelector("#f_daysf"),uf=sh.querySelector("#f_untilf"),dp=sh.querySelectorAll("[data-day]");
      const on=new Set(edit&&isRep(edit)?edit.days:[]);const paint=()=>dp.forEach(b=>b.classList.toggle("on",on.has(+b.dataset.day)));
      const sync=()=>{const w=rs.value==="weekly";df.hidden=!w;uf.hidden=!w;if(w&&!on.size){auto=dow(sh.querySelector("#f_date").value||TODAY());on.add(auto);paint()}};
      let auto=null;dp.forEach(b=>b.onclick=()=>{const d=+b.dataset.day;if(auto!==null&&auto!==d&&on.size===1&&on.has(auto))on.delete(auto);auto=null;on.has(d)?on.delete(d):on.add(d);paint()});rs.onchange=sync;
      if(edit&&isRep(edit)){rs.value="weekly";sh.querySelector("#f_until").value=edit.until||""}else if(preset.days){rs.value="weekly"}
      paint();sync();sh._days=on}
    let type="out";
    if(edit&&kind==="money"){type=edit.type==="in"?"in":"out";sh.querySelectorAll("#f_type button").forEach(x=>x.classList.toggle("on",x.dataset.t===type));
      const cs=sh.querySelector("#f_cat");if(edit.cat&&![...cs.options].some(o=>o.value===edit.cat)){const o=document.createElement("option");o.textContent=edit.cat;cs.append(o)}
      cs.value=edit.cat||cs.value;sh.querySelector("#f_amt").value=edit.amount;sh.querySelector("#f_note").value=edit.note||""}
    sh.querySelectorAll("#f_type button").forEach(b=>b.onclick=()=>{type=b.dataset.t;sh.querySelectorAll("#f_type button").forEach(x=>x.classList.toggle("on",x===b));sh.querySelector("#f_cat").value=type==="in"?"Salary":cats[0]});
    const first=sh.querySelector("#f_subj,#f_title,#f_amt");if(!edit&&first)first.focus();
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const v=id=>(sh.querySelector("#"+id)?.value??""),rem=()=>v("f_rem")===""?null:+v("f_rem");
      if(kind==="task"){if(!v("f_title").trim())return;const rec={title:v("f_title").trim(),who:+v("f_who"),due:v("f_due"),time:v("f_time"),repeat:v("f_rep"),points:+v("f_pts")||0,remind:rem()};if(edit){ST.patch("tasks",edit.id,rec);toast("Task updated")}else{ST.add("tasks",{...rec,done:false});toast("Task added")}}
      if(kind==="money"){const a=parseFloat(v("f_amt"));if(!(a>0))return;const rec={type,amount:Math.round(a*100)/100,cat:v("f_cat"),who:+v("f_who"),date:v("f_date")||TODAY(),note:v("f_note").trim()};if(edit){ST.patch("tx",edit.id,rec);toast("Entry updated")}else{ST.add("tx",rec);toast(type==="in"?"Income added":"Spending added")}moneyMonth=monthKey(rec.date)}
      if(kind==="event"){if(!v("f_title").trim())return;const d0=v("f_date")||TODAY(),wk=v("f_erep")==="weekly"&&sh._days.size;
        const rec={title:v("f_title").trim(),who:+v("f_who"),date:d0,time:v("f_time"),place:v("f_place").trim(),repeat:wk?"weekly":"none",days:wk?[...sh._days].sort():[],until:wk?v("f_until"):"",remind:rem()};
        if(edit){ST.patch("events",edit.id,rec);toast(wk?"Activity updated":"Event updated")}else{ST.add("events",{...rec,skip:[]});toast(wk?repText(rec)+(rec.time?" at "+tm(rec.time):""):"Event added")}
        if(!edit||!wk){calDay=d0;calMonth=monthKey(d0)}}
      if(kind==="shop"){if(!v("f_title").trim())return;addShopItem(v("f_title").trim()+(v("f_qty").trim()?" "+v("f_qty").trim():""));toast("Added to shopping")}
      if(kind==="homework"){if(!v("f_title").trim())return;const rec={subject:v("f_subj").trim()||"Homework",title:v("f_title").trim(),who:+v("f_who"),due:v("f_due"),time:v("f_time"),remind:rem()};if(edit){ST.patch("homework",edit.id,rec);toast("Homework updated")}else{ST.add("homework",{...rec,done:false});toast("Homework added")}}
      if(kind==="note"){if(!v("f_title").trim()&&!v("f_body").trim())return;ST.add("notes",{title:v("f_title").trim(),body:v("f_body"),who:viewId(),updated:Date.now(),pinned:false});toast("Note saved")}
      closeSheet();
      if(edit){render();return}
      const dest={task:["lists","tasks"],shop:["lists","shopping"],homework:["lists","homework"],note:["notes"],money:["money"],event:["calendar"]}[kind];
      if(dest[1])listTab=dest[1];
      agendaDirty=true;
      if(tab!=="home"&&tab!=="today"&&tab!==dest[0])go(dest[0]);else render();
    };
  });
}
function noteSheet(id){
  const n=S().notes.find(x=>x.id===id);if(!n)return;
  openSheet(`${sheetHead("Note")}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="n_title">Title</label><input id="n_title" value="${esc(n.title)}"></div>
   <div id="n_ticks" class="ticks"></div>
   <div class="field"><div class="row between"><label for="n_body">Note</label><button type="button" class="link" id="n_addtick">+ Tick box</button></div><textarea id="n_body" class="body" rows="9" placeholder="Start a line with [ ] to make a tick box">${esc(n.body)}</textarea></div>
   <label class="checkrow" for="n_pin"><input type="checkbox" id="n_pin" ${n.pinned?"checked":""}> Pin to top</label>
   <button class="primary" type="submit">Save</button></form><button class="ghost" id="n_del" type="button">Delete note</button>`,sh=>{
    const ta=sh.querySelector("#n_body"),tk=sh.querySelector("#n_ticks");
    const paint=()=>{const lines=ta.value.split("\n");const items=lines.map((l,i)=>{const m=l.match(/^\s*\[( |x|X)\]\s?(.*)$/);return m?{i,on:m[1]!==" ",t:m[2]}:null}).filter(Boolean);
      tk.innerHTML=items.length?`<div class="label">Tick list · ${items.filter(x=>x.on).length} of ${items.length} done</div>`+items.map(x=>`<button type="button" class="tickrow ${x.on?"on":""}" data-i="${x.i}"><span class="check ${x.on?"on":""}">${x.on?ICON.tick:""}</span><span>${esc(x.t)||"&nbsp;"}</span></button>`).join(""):"";
      tk.querySelectorAll(".tickrow").forEach(b=>b.onclick=()=>{const ls=ta.value.split("\n"),i=+b.dataset.i;ls[i]=ls[i].replace(/\[( |x|X)\]/,m=>m==="[ ]"?"[x]":"[ ]");ta.value=ls.join("\n");paint();ST.patch("notes",id,{body:ta.value,updated:Date.now()})})};
    ta.oninput=paint;paint();
    sh.querySelector("#n_addtick").onclick=()=>{ta.value=(ta.value&&!ta.value.endsWith("\n")?ta.value+"\n":ta.value)+"[ ] ";ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);paint()};
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();ST.patch("notes",id,{title:sh.querySelector("#n_title").value.trim(),body:sh.querySelector("#n_body").value,pinned:sh.querySelector("#n_pin").checked,updated:Date.now()});closeSheet();toast("Note saved")};
    const d=sh.querySelector("#n_del");d.onclick=()=>{if(d.dataset.arm){closeSheet();delUndo("notes",id,"Note deleted")}else{d.dataset.arm=1;d.textContent="Tap again to delete";d.style.color="var(--bad)"}};
  });
}
function budgetSheet(){
  const cats=SET().categories||[],b0=SET().budgets||{};
  openSheet(`${sheetHead("Monthly budgets")}<p class="sub" style="margin:0">How much you plan to spend each month. Leave blank for no limit.</p>
   <form id="f" class="stack" style="gap:10px">${cats.map((c,i)=>`<div class="row"><label class="grow" for="b_${i}">${esc(c)}</label><input id="b_${i}" type="number" inputmode="decimal" min="0" step="1" value="${b0[c]??""}" style="width:120px;border:0;background:var(--sunk);border-radius:10px;padding:8px 10px"></div>`).join("")}
   <button class="primary" type="submit">Save budgets</button></form>`,sh=>{
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const b={};cats.forEach((c,i)=>{const v=parseFloat(sh.querySelector("#b_"+i).value);if(v>0)b[c]=v});ST.setSettings({budgets:b});closeSheet();toast("Budgets saved")};
  });
}
function settingsSheet(){
  const s=SET(), cloud=ST.mode==="cloud";
  openSheet(`${sheetHead("Settings")}
   <form id="f" class="stack" style="gap:12px">
    <div class="label">Family</div>
    ${people().map(p=>`<div class="row">${dot(p.id)}<input id="p_${p.id}" class="grow" value="${esc(p.name)}" aria-label="Name" style="border:0;background:var(--sunk);border-radius:10px;padding:9px 12px">${cloud?`<span class="sub" style="width:64px;text-align:right">${p.uid?(p.uid===ST.me.uid?"You":"Joined"):"Not yet"}</span>`:""}</div>`).join("")}
    ${!cloud?`<div class="field"><label for="s_me">Who uses this phone?</label><select id="s_me">${whoOptions(meId())}</select></div>`:""}
    <div class="field"><label for="s_cur">Currency symbol</label><input id="s_cur" value="${esc(s.currency)}" maxlength="4"></div>
    <div class="field"><label for="s_cats">Spending categories (comma separated)</label><textarea id="s_cats" rows="2" style="border:0;background:var(--sunk);border-radius:10px;padding:10px 12px">${esc((s.categories||[]).join(", "))}</textarea></div>
    <button class="primary" type="submit">Save</button>
   </form>
   ${cloud?`<div class="label" style="margin-top:6px">Family code</div><div class="code" id="s_code">${esc(ST.familyId)}</div>
    <div class="sub">Everyone else in the family enters this code after creating their own account. Keep it within the family.</div>
    <button class="ghost" type="button" id="s_copy">Copy code</button>
    <div class="label" style="margin-top:6px">Two-step sign-in</div><div class="sub">${ST.twoStepOn()?"On. You'll need a code from your authenticator app when you sign in.":"Off. Turn it on to need a code from an authenticator app as well as your password."}</div>
    <button class="ghost" type="button" data-act="twoStep">${ST.twoStepOn()?"Turn off two-step sign-in":"Turn on two-step sign-in"}</button>
    ${(S().settings||{}).owner===ST.me.uid?`<div class="label" style="margin-top:6px">Piano home</div><div class="sub">${pianoHome()?"The piano opens from its own private home. Only your family can see this address.":"No piano address saved yet, so only the little piano shows. Paste the piano's private address here."}</div>
    <div class="row" style="gap:8px"><input id="s_ph" class="grow" value="${esc((S().settings||{}).pianoHome||"")}" placeholder="Piano address" aria-label="Piano address" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="url" style="min-width:0;border:0;background:var(--sunk);border-radius:10px;padding:9px 12px"><button class="ghost" type="button" id="s_phs">Save</button></div>`:""}
    <div class="sub">Signed in as ${esc(ST.me.email)}</div><button class="ghost" type="button" data-act="signOut">Sign out</button>`
   :`<div class="label" style="margin-top:6px">This phone only</div><p class="sub" style="margin:0">Family sharing isn't set up yet, so everything stays on this phone. Copy a backup code to keep it safe, or paste one to restore.</p>
    <div class="two"><button class="ghost" type="button" id="s_copy">Copy backup</button><button class="ghost" type="button" id="s_restore">Restore</button></div>
    <textarea id="s_box" rows="3" hidden placeholder="Paste backup code here" style="border:0;background:var(--sunk);border-radius:10px;padding:10px 12px;width:100%"></textarea>
    <button class="ghost" type="button" id="s_reset">Erase everything on this phone</button>`}`,sh=>{
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();
      const ppl=peopleRaw().map(p=>Object.assign({},p,{name:sh.querySelector("#p_"+p.id).value.trim()||p.name}));
      const cats=sh.querySelector("#s_cats").value.split(",").map(x=>x.trim()).filter(Boolean);
      ST.setSettings({people:ppl,currency:sh.querySelector("#s_cur").value.trim()||"$",categories:cats.length?cats:s.categories});
      if(!cloud)ST.setMe(sh.querySelector("#s_me").value);
      closeSheet();toast("Settings saved")};
    const copy=(txt,okMsg,box)=>{try{navigator.clipboard.writeText(txt).then(()=>toast(okMsg),()=>{if(box){box.hidden=false;box.value=txt;box.select()}})}catch(_){if(box){box.hidden=false;box.value=txt;box.select()}}};
    const phs=sh.querySelector("#s_phs");if(phs)phs.onclick=async()=>{
      const v=pianoHomeClean(sh.querySelector("#s_ph").value);
      if(v===null){toast("That isn't a piano address. It looks like https://…web.app/piano/");return}
      if(v){phs.disabled=true;let ok=false;try{const r=await fetch(v+"piano.js",{mode:"cors",cache:"no-store"});ok=r.ok&&/HHPiano/.test(await r.text())}catch(e){}phs.disabled=false;
        if(!ok){toast("No piano answered at that address. Check it and try again.");return}}
      if(v===((S().settings||{}).pianoHome||"")){closeSheet();return}
      ST.setSettings({pianoHome:v});closeSheet();toast(v?"Piano home saved. Opening the piano from there…":"Piano home cleared");
      setTimeout(()=>location.reload(),1500)};
    if(cloud){sh.querySelector("#s_copy").onclick=()=>copy(ST.familyId,"Family code copied")}
    else{
      const box=sh.querySelector("#s_box");
      sh.querySelector("#s_copy").onclick=()=>copy(ST.exportJSON(),"Backup copied",box);
      sh.querySelector("#s_restore").onclick=e=>{if(box.hidden||!box.value.trim()){box.hidden=false;box.value="";box.focus();e.target.textContent="Restore now";return}
        try{ST.importJSON(box.value);closeSheet();toast("Backup restored")}catch(_){toast("That backup code isn't valid")}};
      const r=sh.querySelector("#s_reset");r.onclick=()=>{if(r.dataset.arm){ST.eraseLocal();closeSheet();toast("Everything erased")}else{r.dataset.arm=1;r.textContent="Tap again to erase all entries";r.style.color="var(--bad)"}};
    }
  });
}

/* ---------- two-step sign-in ---------- */
function twoStepSheet(){
  const on=ST.twoStepOn();
  if(!on&&!ST.emailVerified()){
    openSheet(`${sheetHead("Two-step sign-in")}<div class="stack" style="gap:12px"><p class="sub" style="margin:0">First, confirm your email address (${esc(ST.me.email)}). We'll send you a link. Open it, then come back here.</p>
     <div class="sub" id="t_note" hidden></div><div class="err" id="t_err" hidden></div><button class="primary" type="button" id="t_send">Send the link</button><button class="ghost" type="button" id="t_check">I've opened the link</button></div>`,sh=>{
      const err=m=>{const x=sh.querySelector("#t_err");x.hidden=!m;x.textContent=m||""};
      sh.querySelector("#t_send").onclick=async ev=>{const btn=ev.currentTarget;btn.disabled=true;try{await ST.sendVerifyEmail();err("");const n=sh.querySelector("#t_note");n.hidden=false;n.textContent="Sent to "+ST.me.email+" at "+new Date().toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})+". It comes from noreply@happy-family-791f1.firebaseapp.com and often lands in Spam or Junk, so look there too.";btn.textContent="Send again"}catch(e){err(authErrorText(e))}setTimeout(()=>btn.disabled=false,4000)};
      sh.querySelector("#t_check").onclick=async()=>{try{if(await ST.refreshUser())twoStepSheet();else err("Not confirmed yet. Open the link in the email, then try again.")}catch(e){err(authErrorText(e))}};
    });return;
  }
  openSheet(`${sheetHead("Two-step sign-in")}<form id="t_pwf" class="stack" style="gap:12px"><p class="sub" style="margin:0">${on?"Enter your password to turn two-step sign-in off.":"You'll need an authenticator app, such as Google Authenticator or the iPhone's Passwords app. Enter your password to start."}</p>
    <div class="field"><label for="t_pw">Password</label><input id="t_pw" type="password" autocomplete="current-password" required></div><div class="err" id="t_err" hidden></div>
    <button class="primary" type="submit">${on?"Turn off":"Continue"}</button></form>`,sh=>{
    const err=m=>{const x=sh.querySelector("#t_err");x.hidden=!m;x.textContent=m||""};
    sh.querySelector("#t_pwf").onsubmit=async e=>{e.preventDefault();err("");const pw=sh.querySelector("#t_pw").value;
      try{
        if(on){await ST.stopTwoStep(pw);closeSheet();toast("Two-step sign-in is off");return}
        const t=await ST.startTwoStep(pw);
        openSheet(`${sheetHead("Add Happy Home to your app")}<form id="t_cf" class="stack" style="gap:12px">
          <p class="sub" style="margin:0">On this phone, tap <b>Open authenticator app</b>. On another device, scan the code. Or type the key in by hand.</p>
          <a class="ghost" href="${esc(t.url)}" style="text-align:center;text-decoration:none">Open authenticator app</a>
          <div style="background:#fff;padding:12px;border-radius:12px;width:200px;align-self:center">${Codes.qrSVG(t.url)}</div>
          <div class="code" style="font-size:15px;word-break:break-all">${esc(t.key.replace(/(.{4})/g,"$1 ").trim())}</div>
          <div class="field"><label for="t_code">Then enter the 6-digit code it shows</label><input id="t_code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required style="font-size:22px;letter-spacing:.3em;text-align:center"></div>
          <div class="err" id="t_err2" hidden></div><button class="primary" type="submit">Turn on</button></form>`,sh2=>{
          sh2.querySelector("#t_cf").onsubmit=async ev=>{ev.preventDefault();try{await ST.finishTwoStep(t.secret,sh2.querySelector("#t_code").value);closeSheet();toast("Two-step sign-in is on")}catch(x){const m=sh2.querySelector("#t_err2");m.hidden=false;m.textContent=authErrorText(x)}};
        });
      }catch(x){err(authErrorText(x))}
    };
  });
}

/* ---------- repeating tasks ---------- */
function rollRepeat(t){
  if(!t.repeat||t.repeat==="none"||!t.due)return;
  const step=t.repeat==="daily"?1:t.repeat==="weekly"?7:0;
  const next=s=>{if(step)return addDays(s,step);const x=new Date(s+"T12:00:00");x.setMonth(x.getMonth()+1);return iso(x)};
  let d=next(t.due);while(d<TODAY())d=next(d);
  ST.add("tasks",{title:t.title,who:t.who,due:d,time:t.time||"",repeat:t.repeat,points:+t.points||0,done:false});
}

/* ---------- swipe to delete (tracks the finger 1:1, projects momentum on release) ---------- */
(function swipe(){
  let st=null; const W=88;
  const project=v=>(v/1000)*0.998/(1-0.998);
  document.addEventListener("pointerdown",e=>{
    const sw=e.target.closest(".swipe");if(!sw||e.target.closest(".act"))return;
    document.querySelectorAll(".swipe.open").forEach(o=>{if(o!==sw){o.classList.remove("open");o.querySelector(".item").style.transform=""}});
    const it=sw.querySelector(".item");
    st={sw,it,x0:e.clientX,y0:e.clientY,base:sw.classList.contains("open")?-W:0,dx:0,dir:null,hist:[[e.clientX,e.timeStamp]],id:e.pointerId};
  },{passive:true});
  document.addEventListener("pointermove",e=>{
    if(!st||e.pointerId!==st.id)return;
    const dx=e.clientX-st.x0,dy=e.clientY-st.y0;
    if(!st.dir){if(Math.abs(dx)<10&&Math.abs(dy)<10)return;st.dir=Math.abs(dx)>Math.abs(dy)?"x":"y";if(st.dir==="x"){try{st.sw.setPointerCapture(e.pointerId)}catch(_){}st.it.style.transition="none";st.sw.classList.add("dragging")}}
    if(st.dir!=="x")return;
    let x=st.base+dx; if(x>0)x=x*0.25; if(x<-W){const o=-W-x;x=-W-(o*W*0.55)/(W+0.55*o)}
    st.dx=x;st.it.style.transform=`translateX(${x}px)`;st.hist.push([e.clientX,e.timeStamp]);if(st.hist.length>5)st.hist.shift();
  },{passive:true});
  const end=e=>{
    if(!st||e.pointerId!==st.id)return;const s=st;st=null;
    if(s.dir!=="x")return;
    const [a,b]=[s.hist[0],s.hist[s.hist.length-1]];const v=b[1]>a[1]?(b[0]-a[0])/(b[1]-a[1])*1000:0;
    const target=s.dx+project(v)<-W/2?-W:0;
    s.it.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";s.it.style.transform=target?`translateX(${-W}px)`:"";
    s.sw.classList.toggle("open",!!target);setTimeout(()=>s.sw.classList.remove("dragging"),320);
    s.sw.dataset.justSwiped="1";setTimeout(()=>delete s.sw.dataset.justSwiped,50);
  };
  document.addEventListener("pointerup",end);document.addEventListener("pointercancel",end);
})();

/* ---------- clicks ---------- */
document.addEventListener("click",e=>{
  lastTap=e.clientX||e.clientY?{x:e.clientX,y:e.clientY}:null;
  const sw=e.target.closest(".swipe");if(sw&&sw.dataset.justSwiped){e.preventDefault();return}
  const g=e.target.closest("[data-go]");if(g){if(g.closest("#sheetHost"))closeSheet();if(g.dataset.list)listTab=g.dataset.list;go(g.dataset.go);return}
  const tb=e.target.closest(".tab");if(tb){go(tb.dataset.tab);return}
  const a=e.target.closest("[data-act]");if(!a)return;const id=a.dataset.id,act=a.dataset.act;
  if(act.slice(0,2)==="hp"&&window.hpAct){hpAct(act,a,e);return}
  const flip=(col,msg)=>{const t=S()[col].find(x=>x.id===id);if(!t)return;ST.patch(col,id,{done:!t.done,doneAt:t.done?null:Date.now()});if(!t.done){if(msg)toast(msg);if(col!=="shopping")party()}return t};
  switch(act){
    case"close":return closeSheet();
    case"voice":return voiceAdd();
    case"search":return searchSheet();
    case"addBill":return billSheet();
    case"editBill":closeSheet();return billSheet(id);
    case"payBill":{const b=S().bills.find(x=>x.id===id);if(b&&b.lastPaid===TODAY()&&!a.dataset.arm){a.dataset.arm=1;a.textContent="Again?";toast("Already paid today. Tap again to pay the next one early");return}return payBill(id)}
    case"mealPrev":case"mealNext":mealWeek=addDays(mealWeek||weekStart(TODAY()),act==="mealNext"?7:-7);break;
    case"editMeal":closeSheet();return mealSheet(a.dataset.d);
    case"mealsToShop":return mealsToShop();
    case"addCountdown":return countdownSheet();
    case"learnTab":learnTab=a.dataset.k;break;
    case"learner":ST._localPref("learner",a.dataset.k);break;
    case"learnLevel":{const id=learnerId(),{id:_x,...d}=learnDoc(id);ST.put("learn",String(id),{...d,level:+a.dataset.k,who:id,updated:Date.now()});return}
    case"learnGo":startLearn(a.dataset.k,a.dataset.d||null);scrollTo(0,0);return;
    case"learnDeck":{const k=a.dataset.k,box=learnDoc(learnerId()).boxes||{},seen=ZH_ALL.some(w=>w.deck===k&&box[w.zh]!==undefined);startLearn(seen?"quiz":"cards",k);scrollTo(0,0);return}
    case"flip":lz.flip=!lz.flip;if(lz.flip)speakZh(lz.qs[lz.i].w.zh);break;
    case"say":speakZh(a.dataset.k);return;
    case"cardNext":return learnNext(a.dataset.k==="1");
    case"learnAns":return learnAnswer(+a.dataset.k);
    case"learnNext":return learnNext();
    case"learnQuit":lz=null;break;
    case"pkey":return pianoKey(a.dataset.k);
    case"plabels":pianoLabels=a.dataset.k;break;
    case"pgame":pianoGame=a.dataset.k==="find"?{kind:"find",target:"C",score:0}:a.dataset.k==="song"?{kind:"song",i:0}:null;break;
    case"addActivity":return addSheet("event",{who:+a.dataset.k,days:[dow(TODAY())]});
    case"editCountdown":closeSheet();return countdownSheet(id);
    case"shareShop":{const open=S().shopping.filter(x=>!x.done),order=[...AISLES.map(a=>a[0]),"Other"],g={};open.forEach(x=>{const k=x.aisle||aisleOf(x.name);(g[k]=g[k]||[]).push(x)});
      const txt="Shopping list\n"+order.filter(k=>g[k]).map(k=>"\n"+k+"\n"+g[k].map(x=>"• "+x.name+(x.qty?" ("+x.qty+")":"")).join("\n")).join("\n");
      if(navigator.share)navigator.share({title:"Shopping list",text:txt}).catch(()=>{});else{try{navigator.clipboard.writeText(txt).then(()=>toast("List copied"))}catch(_){toast("Couldn't share")}}return}
    case"boardAck":{const m=S().board.find(x=>x.id===id);if(m)setMapKey("board",id,"ack",viewId(),!(m.ack||{})[viewId()]);return}
    case"liveTab":liveTab=a.dataset.k;break;
    case"liveMore":liveOpen[a.dataset.k]=!liveOpen[a.dataset.k];break;
    case"addFor":return addSheet("task",{who:+a.dataset.k});
    case"profile":return profileSheet();
    case"pianoSheet":return pianoSheet();
    case"pianoWho":{const ok=setPianoWho(a.dataset.k);closeSheet();if(ok)toast(pname(pianoWho())+" is playing now");break}
    case"playDel":pianoDrop(id);return;
    case"oldDel":{const v=String(a.dataset.k||""),i=v.indexOf("|");earlierDrop(+v.slice(0,i),v.slice(i+1));return}
    case"playsMore":playsShown+=40;pianoSheetPaint();return;
    case"viewAs":setView(a.dataset.k);closeSheet();toast("Now using "+pname(viewId())+"'s profile");break;
    case"slot":return slotSheet();
    case"slotPick":{const r=a.dataset.k;ST._localPref("slot",r?JSON.stringify({r,wk:weekKey()}):"");closeSheet();slotSig="";toast(r?NAV[r][0]+" is this week's shortcut":"The app will pick a shortcut each week");break}
    case"alarmOk":ringing=ringing.filter(i=>i.id!==id);break;
    case"alarmGo":{const i=ringing.find(x=>x.id===id);ringing=ringing.filter(x=>x.id!==id);if(i)go(String(i.url||"#today").replace(/^.*#/,""));else render();return}
    case"addAlarm":return alarmSheet();
    case"editAlarm":return alarmSheet(id);
    case"alarmToggle":{const al=S().alarms.find(x=>x.id===id);if(al){ST.patch("alarms",id,{on:al.on===false});agendaDirty=true}return}
    case"pushOn":return void turnOnNotifications();
    case"pushOff":return void turnOffNotifications();
    case"pushTest":{const d=new Date(Date.now()+2*60e3),when=iso(d)+"T"+p2(d.getHours())+":"+p2(d.getMinutes()),old=(nprefs().tests||[]).filter(x=>x&&x.when&&whenMs(x.when)>Date.now()-864e5).slice(-4);
      setPrefs({tests:[...old,{id:Math.random().toString(36).slice(2,8),when,who:meId()}]});toast("Test on its way. Close the app: it should arrive within about 15 minutes");return}
    case"notifier":return notifierSheet();
    case"liveSel":liveSel=a.dataset.k==="home"?null:(liveSel===+a.dataset.k?null:+a.dataset.k);break;
    case"reAdd":addShopItem(a.dataset.k);toast(a.dataset.k+" added");return;
    case"twoStep":return twoStepSheet();
    case"mfaCancel":ST.cancelMfa();authErr="";return render();
    case"edit":{closeSheet();const col=a.dataset.col,r=S()[col].find(x=>x.id===id);if(r)addSheet({tasks:"task",homework:"homework",events:"event",tx:"money"}[col],{occ:a.dataset.d},r);return}
    case"swipeDel":{const w=a.closest(".swipe");if(w.dataset.occ){const e=S().events.find(x=>x.id===w.dataset.id);if(e){const d=w.dataset.occ,old=e.skip||[];ST.patch("events",e.id,{skip:[...old,d]});toast("Removed for "+nice(d),"Undo",()=>ST.patch("events",e.id,{skip:old}))}return}delUndo(w.dataset.col,w.dataset.id);return}
    case"toggle":{const t=S().tasks.find(x=>x.id===id);if(!t)return;const was=!!t.done,snap={...t};ST.patch("tasks",id,{done:!was,doneAt:was?null:Date.now()});if(was)takeStars(snap);if(!was){party();giveStars(snap);toast(+snap.points>0?`Done! ★ ${+snap.points} for ${pname(snap.who)}`:"Done!");if(snap.repeat&&snap.repeat!=="none"&&!snap.rolled){ST.patch("tasks",id,{rolled:true});rollRepeat(snap)}}return}
    case"toggleHw":return void flip("homework","Homework finished!");
    case"toggleShop":return void flip("shopping");
    case"clearDone":{const gone=S().tasks.filter(x=>x.done);ST.delMany("tasks",gone.map(x=>x.id));toast(gone.length+" cleared","Undo",()=>gone.forEach(({id:i,...r})=>ST.put("tasks",i,r)));return}
    case"clearHw":ST.delMany("homework",S().homework.filter(x=>x.done).map(x=>x.id));return;
    case"newWeek":ST.delMany("shopping",S().shopping.filter(x=>x.done).map(x=>x.id));toast("Ready for a new week");return;
    case"who":listWho=a.dataset.k;break;
    case"listTab":listTab=a.dataset.k;break;
    case"day":calDay=a.dataset.d;if(monthKey(calDay)!==calMonth)calMonth=monthKey(calDay);break;
    case"calToday":calDay=TODAY();calMonth=thisMonth();break;
    case"cPrev":case"cNext":{const d=new Date(calMonth+"-15T12:00:00");d.setMonth(d.getMonth()+(act==="cNext"?1:-1));calMonth=iso(d).slice(0,7);break}
    case"mPrev":case"mNext":{const d=new Date(moneyMonth+"-15T12:00:00");d.setMonth(d.getMonth()+(act==="mNext"?1:-1));moneyMonth=iso(d).slice(0,7);break}
    case"addEventDay":return addSheet("event",{date:calDay});
    case"budgets":return budgetSheet();
    case"settings":return settingsSheet();
    case"suCopy":{const txt=suRules(ST.familyId),box=$("#suRules");try{navigator.clipboard.writeText(txt).then(()=>toast("Rules copied. Now open Firebase rules"),()=>{if(box){box.hidden=false;box.value=txt;box.select();toast("Select all and copy")}})}catch(_){if(box){box.hidden=false;box.value=txt;box.select()}}return}
    case"suOpen":window.open("https://console.firebase.google.com/project/"+encodeURIComponent((window.HH_FIREBASE_CONFIG||{}).projectId||"")+"/firestore/rules","_blank","noopener");return;
    case"suCheck":{try{SU.un&&SU.un()}catch(_){}SU.un=null;SU.res=null;suAsk(true);render();return}
    case"openNote":closeSheet();return noteSheet(id);
    case"openCard":closeSheet();return cardSheet(id);
    case"addCard":return cardForm();
    case"editCard":closeSheet();return cardForm(id);
    case"key":return calcKey(a.dataset.k);
    case"calcSpend":{const v=calcPreview();return addSheet("money",{amount:v&&v>0?Math.round(v*100)/100:""})}
    case"toggleLoc":if(mySharing()||geoWatch!==null){ST._localPref("shareLoc","0");stopGeo(true);toast("Stopped sharing your location")}else if(switched())toast("Switch to "+pname(meId())+"'s profile to share this phone's location");else{ST._localPref("shareLoc","1");startGeo();toast("Sharing your location")}break;
    case"pickMood":pickMood=a.dataset.k;break;
    case"moodShare":case"moodPrivate":{const note=($("#moodNote")?.value||"").trim();
      if(act==="moodShare")ST.add("moods",{person:viewId(),mood:pickMood,note,date:TODAY(),at:Date.now()});
      else if(switched())return;
      else ST.add("myMoodResults",{kind:"checkin",mood:pickMood,note,date:TODAY(),at:Date.now()});
      if($("#moodNote"))$("#moodNote").value="";toast(act==="moodShare"?"Shared with the family":"Saved just for you");return}
    case"moodStart":if(switched()){toast("Switch to "+pname(meId())+"'s profile to start a mood check");return}return moodStartSheet();
    case"moodAgree":if(switched())return;setMapKey("moodSessions",id,"agreed",meId(),true);go("mood");return;
    case"moodDecline":setMapKey("moodSessions",id,"declined",meId(),true);toast("You said no. It won't start.");return;
    case"moodListen":{const s=S().moodSessions.find(x=>x.id===id);if(s&&!switched())startListening(s);return}
    case"moodCancel":ST.patch("moodSessions",id,{state:"cancelled",reason:"cancelled"});return;
    case"moodStop":ST.patch("moodSessions",id,{state:"stopped",stoppedBy:meId()});if(listener.sid===id)finishListening();toast("Stopped");return;
    case"moodSeen":setMapKey("moodSessions",id,"seen",meId(),true);return;
    case"moodShareResult":{const s=S().moodSessions.find(x=>x.id===id);if(!s||switched())return;const m=s.result.level===1?"good":s.result.level===2?"okay":"stressed";
      ST.add("moods",{person:meId(),mood:m,note:"Family check: "+s.result.label,date:TODAY(),at:Date.now()});setMapKey("moodSessions",id,"seen",meId(),true);toast("Shared");return}
    case"authMode":authMode=a.dataset.k;authErr="";ST.cancelMfa();mfaFor="";authPw="";authCode="";break;
    case"forgot":{const em=$("#a_email")?.value.trim();if(!em){authErr="Type your email above first, then tap Forgot password.";break}ST.resetPassword(em).then(()=>toast("Check your email for a reset link"),err=>{authErr=authErrorText(err);render()});return}
    case"pianoRetry":pianoLd={state:""};render();return;
    case"signOut":closeSheet();stopGeo(false);authMode="signin";authErr="";ST._localPref("view","0");ST.signOut();return;
    case"claim":ST.claimPerson(a.dataset.k);return;
    default:return;
  }
  render();
});
$("#fab").onclick=()=>tab==="alarms"?alarmSheet():tab==="happy"&&window.hpFab?hpFab():addSheet();
{const bs=$("#btnSettings");if(bs)bs.onclick=settingsSheet;const bp=$("#btnProfile");if(bp)bp.onclick=profileSheet}
$("#btnSearch").onclick=searchSheet;
addEventListener("hashchange",()=>{const h=routeOf(location.hash.slice(1));if(routes.includes(h)&&h!==tab){tab=h;render()}});
/* reminder settings save the moment they are changed */
document.addEventListener("change",e=>{const el=e.target.closest&&e.target.closest("[data-pref]");if(!el)return;const k=el.dataset.pref;
  if(k==="mute"){ST._localPref("alarmMute",el.checked?"0":"1");return}
  const val=k==="kids"?el.checked:k==="ev"?+el.value:el.value;if((k==="morning"||k==="bills")&&val&&!TIME_OK.test(val))return;setPrefs({[k]:val})});
/* the table of songs played: a new name on a row gives that play to that person */
document.addEventListener("change",e=>{const el=e.target.closest&&e.target.closest("select.pwho");if(!el)return;el.blur();const to=+el.value;
  if(el.dataset.play){const r=pianoMove(el.dataset.play,to);if(r)toast(pname(r.who)+" played it"+(r.gave?": +"+r.gave+" ★":""),"Undo",()=>{pianoMove(r.id,r.from);toast("Changed back")})}
  else if(el.dataset.old){const v=el.dataset.old,i=v.indexOf("|"),u=earlierMove(+v.slice(0,i),v.slice(i+1),to);if(u)toast("Given to "+pname(to),"Undo",()=>{earlierBack(u);toast("Changed back")})}
  pianoSheetPaint()});
document.addEventListener("focusout",e=>{if(e.target&&e.target.matches&&e.target.matches("select.pwho"))setTimeout(pianoSheetPaint,0)});
/* hold the shortcut button in the bottom bar to choose what it opens */
(function(){let t=null,held=false;const off=()=>clearTimeout(t);
  document.addEventListener("pointerdown",e=>{if(!e.target.closest||!e.target.closest("#tabSlot"))return;held=false;off();t=setTimeout(()=>{held=true;slotSheet()},550)},{passive:true});
  ["pointerup","pointercancel","pointermove"].forEach(n=>document.addEventListener(n,e=>{if(n!=="pointermove"||Math.abs(e.movementX)+Math.abs(e.movementY)>6)off()},{passive:true}));
  document.addEventListener("click",e=>{if(held&&e.target.closest&&e.target.closest("#tabSlot")){held=false;e.stopPropagation();e.preventDefault()}},true);
  document.addEventListener("contextmenu",e=>{if(e.target.closest&&e.target.closest("nav.tabs"))e.preventDefault()});
})();
/* sounds may only start after a touch on iPhone, so wake the sound engine on the first touch */
document.addEventListener("pointerdown",()=>{try{if(actx&&actx.state==="suspended")actx.resume()}catch(e){}},{passive:true});
addEventListener("online",()=>{render();if(wasOffline)toast(ST.pending?"Back online. Uploading your changes…":"Back online")});addEventListener("offline",()=>{wasOffline=true;render();toast("Offline. Keep going, changes are saved on this phone")});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")return closeSheet();
  if(tab==="calc"&&!$("#sheetHost").innerHTML&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){
    const map={"*":"×","/":"÷","Enter":"=","Backspace":"⌫","Delete":"C"};const k=map[e.key]||e.key;
    if(/^[\d.+\-×÷%()=⌫C]$/.test(k)){e.preventDefault();calcKey(k)}
  }
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&ST.phase==="ready"){agendaDirty=true;alarmTick();refreshPush();if(tab==="home"||tab==="today")render()}});
if("serviceWorker" in navigator)navigator.serviceWorker.addEventListener("message",e=>{const d=e.data||{};if(d.type==="hh-open"&&d.url)go(String(d.url).replace(/^.*#/,""));if(d.type==="hh-push-changed")refreshPush()});

/* ---------- start ---------- */
let lastErr=null, prevPhase=null;
ST.onChange(()=>{
  if(ST.error&&ST.error!==lastErr){toast(ST.error);lastErr=ST.error;setTimeout(()=>{ST.error=null;lastErr=null},4000)}
  if(ST.phase==="ready"&&prevPhase!=="ready"){if(ST._localPref("shareLoc")==="1")startGeo();cleanupMoodSessions();refreshPush()}
  prevPhase=ST.phase;
  if(hadPending&&!ST.pending&&navigator.onLine&&wasOffline){wasOffline=false;setTimeout(()=>toast("All changes uploaded ✓"),300)}hadPending=ST.pending;
  agendaDirty=true;roleNames();syncAgenda();
  moodTick();render();pianoSheetPaint();
});
setInterval(()=>{if(tab==="mood"&&activeSession())render();moodTick()},1000);
setInterval(()=>{if((tab==="home"||tab==="today")&&!document.hidden&&!$("#sheetHost").innerHTML&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||""))render()},20000);
setInterval(()=>{try{alarmTick()}catch(e){console.error(e)}},15000);
/* what the piano page may use from the app */
/* what the Happy page (happy.js) borrows from here */
window.HHK={S,ST,SET,people,peopleRaw,pname,esc,dot,openSheet,closeSheet,sheetHead,toast,render:()=>render(),viewId,meId,iso,addDays,TODAY,ago,nice,party:()=>party()};
window.HH={S,ST,pianoFrom:()=>Object.assign({},pianoLd),esc,toast,openSheet,closeSheet,sheetHead,pname,learnerId,pref:(k,v)=>v===undefined?ST._localPref(k):ST._localPref(k,String(v)),star:(n,title)=>learnStar(n,title),pianoProgress:()=>pianoClean(pianoWho()),savePianoProgress:savePiano,delUndo,go:t=>go(t),dot,
  ...(typeof ST.merge==="function"?{people:()=>people().map(p=>({id:p.id,name:p.name})),playerId:pianoWho,setPlayer:setPianoWho,pianoPlayed,pianoMove,pianoSheet}:{})};
let autoPayDay=null;setInterval(()=>{if(ST.phase==="ready"&&autoPayDay!==TODAY()&&Date.now()-bootAt>6000){autoPayDay=TODAY();try{autoPayBills()}catch(e){}}},3000);
const bootAt=Date.now();
ST.init();
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
