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
// shown with the youngest first (Jugo, Akiyo, then the parent who set it up) unless the family picks another order
const people=()=>{const raw=peopleRaw(),ord=SET().order;if(Array.isArray(ord)&&ord.length){const pos=id=>{const i=ord.indexOf(id);return i<0?99:i};return [...raw].sort((a,b)=>pos(a.id)-pos(b.id))}return [...raw].reverse()};
const kidId=()=>(peopleRaw()[2]||peopleRaw()[peopleRaw().length-1])?.id||meId();
const person=id=>people().find(p=>p.id===+id);
const pname=id=>id==0?"Family":(person(id)?.name||"Someone");
const meId=()=>ST.me.personId||1;
const colorIdx=id=>id==0?0:((peopleRaw().findIndex(p=>p.id===+id)%3)+1)||0;
const dot=id=>`<span class="dot who-${colorIdx(id)}" aria-hidden="true">${id==0?"All":esc(pname(id).slice(0,1).toUpperCase())}</span>`;
function money(n,sign){const v=Math.abs(n).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});return (sign&&n<0?"−":sign&&n>0?"+":"")+(SET().currency||"$")+v}
function nice(d){const t=TODAY();if(d===t)return"Today";if(d===addDays(t,1))return"Tomorrow";if(d===addDays(t,-1))return"Yesterday";return new Date(d+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
function ago(ts){const s=Math.round((Date.now()-ts)/1000);if(s<60)return"just now";if(s<3600)return Math.round(s/60)+" min ago";if(s<86400)return Math.round(s/3600)+" h ago";return new Date(ts).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}
function toast(m,act,fn){const t=$("#toast");t.textContent=m;if(act){const b=document.createElement("button");b.className="tact";b.textContent=act;b.onclick=ev=>{ev.stopPropagation();t.hidden=true;fn()};t.append(b)}t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,act?5000:2000)}
function delUndo(col,id,msg){const r=(S()[col]||[]).find(x=>x.id===id);ST.del(col,id);if(!r){toast(msg||"Deleted");return}const {id:_i,...rest}=r;toast(msg||"Deleted","Undo",()=>{ST.put(col,id,rest);toast("Restored")})}
const ICON={
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
 back:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
};

/* ---------- view state ---------- */
let tab="home", listTab="tasks", listWho="all", moneyMonth=thisMonth(), calDay=TODAY(), calMonth=thisMonth();
const routes=["home","calendar","lists","money","more","notes","calc","location","wallet","mood","bills","meals","dates","activities"];
const parentTab={notes:"more",calc:"more",location:"more",wallet:"more",mood:"more",bills:"money",meals:"more",dates:"more",activities:"more"};
if(routes.includes(location.hash.slice(1)))tab=location.hash.slice(1);
let authMode="signin", authErr="", busy=false;

function monthStats(m){
  let inc=0,out=0;const byCat={};
  S().tx.filter(x=>monthKey(x.date)===m).forEach(x=>{if(x.type==="in")inc+=x.amount;else{out+=x.amount;byCat[x.cat]=(byCat[x.cat]||0)+x.amount}});
  return {inc,out,byCat};
}

/* ---------- list items ---------- */
const checkBtn=(on,act,id)=>`<button class="check ${on?"on":""}" data-act="${act}" data-id="${id}" aria-label="${on?"Mark not done":"Mark done"}">${on?ICON.tick:""}</button>`;
function tm(t){if(!t)return"";const [h,m]=t.split(":").map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}).replace(" ","\u00a0")}
function duePill(due,done,time){if(!due)return"";const now=new Date(),nowT=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");const late=!done&&(due<TODAY()||(due===TODAY()&&time&&time<nowT)),today=due===TODAY();return `<span class="pill ${late?"late":today?"today":""}">${late?"Late · ":""}${nice(due)}${time?" · "+tm(time):""}</span>`}
const row=(col,id,inner,done)=>`<div class="swipe" data-col="${col}" data-id="${id}"><div class="act" data-act="swipeDel">Delete</div><div class="item ${done?"done":""}">${inner}</div></div>`;
function taskItem(t){return row("tasks",t.id,`${checkBtn(t.done,"toggle",t.id)}<div class="grow tap" data-act="edit" data-col="tasks" data-id="${t.id}"><div class="t">${esc(t.title)}</div><div class="m">${esc(pname(t.who))}${t.repeat&&t.repeat!=="none"?" · repeats "+t.repeat:""}${+t.points>0?` · <span class="star">★ ${+t.points}</span>`:""}</div></div>${duePill(t.due,t.done,t.time)}`,t.done)}
function hwItem(h){return row("homework",h.id,`${checkBtn(h.done,"toggleHw",h.id)}<div class="grow tap" data-act="edit" data-col="homework" data-id="${h.id}"><div class="t">${esc(h.title)}</div><div class="m">${esc(h.subject)} · ${esc(pname(h.who))}</div></div>${duePill(h.due,h.done,h.time)}`,h.done)}
function eventItem(e,showDate){return row("events",e.id,`<span class="time">${e.time?tm(e.time):"All day"}</span>${dot(e.who)}<div class="grow tap" data-act="edit" data-col="events" data-id="${e.id}" data-d="${e.date}"><div class="t">${esc(e.title)}${isRep(e)?' <span class="rep" title="Repeats">↻</span>':""}</div><div class="m">${showDate?nice(e.date)+" · ":""}${esc(pname(e.who))}${e.place?" · "+esc(placeTxt(e.place)):""}</div></div>${joinBtn(e)}`).replace('class="swipe"',isRep(e)?'class="swipe" data-occ="'+e.date+'"':'class="swipe"')}
function txItem(x){const n=x.type==="in"?x.amount:-x.amount;return row("tx",x.id,`${dot(x.who)}<div class="grow"><div class="t">${esc(x.note||x.cat)}</div><div class="m">${esc(x.cat)} · ${nice(x.date)} · ${esc(pname(x.who))}</div></div><span class="num ${n>0?"pos":""}" style="font-weight:600">${money(n,true)}</span>`)}
const sortTasks=a=>a.sort((x,y)=>(!!x.done-!!y.done)||((x.due||"9")+(x.time||"99")>(y.due||"9")+(y.time||"99")?1:-1));
const sortEv=a=>a.sort((x,y)=>(x.date+(x.time||"00:00")).localeCompare(y.date+(y.time||"00:00")));
/* weekly activities: one event with repeat:"weekly", days:[0-6 Sun..Sat], optional until and skip dates */
const DAYN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const dow=d=>new Date(d+"T12:00:00").getDay();
const isRep=e=>e.repeat==="weekly"&&Array.isArray(e.days)&&e.days.length;
function evOn(d){const wd=dow(d);return S().events.filter(e=>isRep(e)?(d>=e.date&&(!e.until||d<=e.until)&&e.days.includes(wd)&&!(e.skip||[]).includes(d)):e.date===d).map(e=>isRep(e)?{...e,date:d,start:e.date}:e)}
function evRange(a,b){const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(...evOn(d));return out}
const repText=e=>isRep(e)?"Every "+[...e.days].sort((a,b)=>((a+6)%7)-((b+6)%7)).map(i=>DAYN[i]).join(", "):"";
const isUrl=v=>/^https?:\/\/\S+$/i.test(String(v||"").trim());
const placeTxt=p=>isUrl(p)?p.replace(/^https?:\/\/(www\.)?/i,"").split("/")[0]:p;
const joinBtn=e=>isUrl(e.place)?`<a class="mini join" href="${esc(e.place.trim())}" target="_blank" rel="noopener">Open</a>`:"";
const swipeHint=()=>`<div class="hint">Swipe left on a row to delete it</div>`;

/* ---------- Today ---------- */
function viewHome(){
  const t=TODAY();
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
  return `${moodRequestBanner()}${syncNote()}
  <section class="card qacard"><form id="qaForm" class="quick qa" autocomplete="off"><span class="qaic">${ICON.spark}</span><input id="qa" placeholder="Add anything… e.g. Dentist Fri 3pm" aria-label="Quick add" enterkeyhint="done" autocomplete="off" autocorrect="on">${hasMic?`<button type="button" class="qamic" data-act="voice" aria-label="Speak">${ICON.mic}</button>`:""}<button type="submit">Add</button></form>
   <div id="qaPrev" class="qaprev" hidden></div><div class="qatip" id="qaTip" ${+(ST._localPref("qaUses")||0)>=3?"hidden":""}>Type or tap the microphone on your keyboard and just say it. The app works out if it's a task, event, shopping or spending.</div></section>
  ${upNext?`<button class="upnext" data-act="edit" data-col="events" data-id="${upNext.id}"><span class="label">Up next · ${tm(upNext.time)}</span><b>${esc(upNext.title)}</b><span>${esc(pname(upNext.who))}${upNext.place?" · "+esc(placeTxt(upNext.place)):""}${(()=>{const [h,m]=upNext.time.split(":").map(Number),d=new Date();d.setHours(h,m,0,0);const mins=Math.round((d-Date.now())/6e4);return mins<=0?" · now":mins<60?" · in "+mins+" min":" · in "+Math.floor(mins/60)+" h "+(mins%60?mins%60+" min":"")})()}</span></button>`:""}
  ${billsDue.length?`<section class="card"><div class="row between"><h2>Bills due</h2><button class="link" data-go="bills">All bills</button></div><div class="list" style="margin-top:6px">${billsDue.map(billRow).join("")}</div></section>`:""}
  <section class="card"><div class="row between"><h2>Today's plan</h2><span class="sub">${new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</span></div>
   <div class="list" style="margin-top:6px">${ev.length?ev.map(e=>eventItem(e)).join(""):`<div class="empty">Nothing on the calendar today. Tap + to add an event.</div>`}</div></section>
  <section class="card"><div class="row between"><h2>To do now</h2><button class="link" data-go="lists" data-list="tasks">All tasks</button></div>
   <div class="list" style="margin-top:6px">${due.length?due.map(taskItem).join(""):`<div class="empty">All caught up.</div>`}</div></section>
  ${hw.length?`<section class="card"><div class="row between"><h2>Homework due soon</h2><button class="link" data-go="lists" data-list="homework">All homework</button></div><div class="list" style="margin-top:6px">${hw.map(hwItem).join("")}</div></section>`:""}
  ${Object.values(starsThisWeek()).some(v=>v>0)?scoreboard():""}
  <div class="two">
   <button class="tile" data-go="meals"><span class="label">Dinner tonight</span><b>${dinner?esc(dinner.title):"Not planned"}</b><span>${dinner&&dinner.cook?esc(pname(dinner.cook))+" cooking":"Tap to plan the week"}</span></button>
   ${cds.length?`<button class="tile" data-go="dates"><span class="label">${esc(cdLabel(cds[0]))}</span><b>${esc(cds[0].title)}</b><span>${nice(cds[0].nd)}</span></button>`:`<button class="tile" data-act="addCountdown"><span class="label">Countdown</span><b>Add a date</b><span>Birthdays, trips, holidays</span></button>`}
  </div>
  <div class="two">
   <button class="tile" data-go="money"><span class="label">Money left</span><b class="num ${left<0?"neg":""}">${money(left)}</b><span>this month</span></button>
   <button class="tile" data-go="lists" data-list="shopping"><span class="label">Shopping</span><b class="num">${shopLeft} item${shopLeft===1?"":"s"}</b><span>still to buy</span></button>
  </div>
  <section class="card"><div class="row between"><h2>Coming up this week</h2><button class="link" data-go="calendar">Calendar</button></div>
   <div class="list" style="margin-top:6px">${next.length?next.map(e=>eventItem(e,true)).join(""):`<div class="empty">Nothing planned for the next 7 days.</div>`}</div></section>`;
}
function syncNote(){
  if(ST.mode==="local")return "";
  return navigator.onLine?"":`<div class="offline">You're offline. Changes are saved and will sync when you reconnect.</div>`;
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
  return `<section class="card">
   <div class="mhead"><h2>${label}</h2><div class="navbtns"><button class="link" data-act="calToday">Today</button>
    <button class="iconbtn" data-act="cPrev" aria-label="Previous month">‹</button><button class="iconbtn" data-act="cNext" aria-label="Next month">›</button></div></div>
   <div class="wd">${wd.map(w=>`<span>${w}</span>`).join("")}</div><div class="mgrid">${grid}</div></section>
  <section class="card"><div class="row between"><h2>${dayLabel}</h2><button class="link" data-act="addEventDay">+ Event</button></div>
   <div class="list" style="margin-top:6px">${ev.map(e=>eventItem(e)).join("")}${hwDay.map(hwItem).join("")}${taskDay.map(taskItem).join("")}${cdDay.map(c=>`<button class="item cdrow" data-act="editCountdown" data-id="${c.id}"><span class="time">🎉</span><div class="grow"><div class="t">${esc(c.title)}</div><div class="m">${c.yearly&&c.kind==="birthday"&&+c.date.slice(0,4)>1900?"Turns "+(+calDay.slice(0,4)-+c.date.slice(0,4)):esc({birthday:"Birthday",anniversary:"Anniversary",trip:"Trip",other:"Date"}[c.kind]||"")}</div></div></button>`).join("")}${billDay.map(billRow).join("")}${dinDay?`<button class="item mealrow" data-act="editMeal" data-d="${calDay}"><span class="time">Dinner</span><div class="grow"><div class="t">${esc(dinDay.title)}</div>${dinDay.cook?`<div class="m">${esc(pname(dinDay.cook))} cooking</div>`:""}</div></button>`:""}${any?"":`<div class="empty">Nothing planned.</div>`}</div></section>`;
}

/* ---------- Lists ---------- */
function whoChips(){return `<div class="chips">${[["all","Everyone"],...people().map(p=>[String(p.id),p.name])].map(([k,n])=>`<button class="chip ${listWho==k?"on":""}" data-act="who" data-k="${k}">${esc(n)}</button>`).join("")}</div>`}
function viewLists(){
  const seg=`<div class="seg sticky">${[["tasks","Tasks"],["shopping","Shopping"],["homework","Homework"]].map(([k,n])=>`<button class="${listTab===k?"on":""}" data-act="listTab" data-k="${k}">${n}</button>`).join("")}</div>`;
  let body="";
  if(listTab==="tasks"){
    const list=sortTasks(S().tasks.filter(t=>listWho==="all"||t.who==listWho));
    const open=list.filter(t=>!t.done),done=list.filter(t=>t.done);
    body=`${whoChips()}${scoreboard()}<section class="card"><h2>To do <span class="sub">(${open.length})</span></h2><div class="list" style="margin-top:6px">${open.length?open.map(taskItem).join(""):`<div class="empty">Nothing to do. Tap + to add a task or chore.</div>`}</div></section>
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
    <section class="card"><h2>This week's shopping <span class="sub">(${open.length})</span></h2>
    ${open.length?order.filter(k=>groups[k]).map(k=>`<div class="aisle">${esc(k)}</div><div class="list">${groups[k].map(item).join("")}</div>`).join(""):`<div class="list" style="margin-top:6px"><div class="empty">The list is empty. Add what you need above, or say "buy milk and eggs" in Quick add on Today.</div></div>`}</section>
    ${got.length?`<section class="card"><div class="row between"><h2>In the trolley</h2><button class="link" data-act="newWeek">Start new week</button></div><div class="list" style="margin-top:6px">${got.map(item).join("")}</div></section>`:""}`;
  }
  if(listTab==="homework"){
    const list=sortTasks(S().homework.filter(h=>listWho==="all"||h.who==listWho));
    const open=list.filter(h=>!h.done),done=list.filter(h=>h.done);
    body=`${whoChips()}<section class="card"><h2>Homework to do <span class="sub">(${open.length})</span></h2><div class="list" style="margin-top:6px">${open.length?open.map(hwItem).join(""):`<div class="empty">No homework due. Tap + to add some.</div>`}</div></section>
    ${done.length?`<section class="card"><div class="row between"><h2>Finished</h2><button class="link" data-act="clearHw">Clear finished</button></div><div class="list" style="margin-top:6px">${done.map(hwItem).join("")}</div></section>`:""}`;
  }
  return seg+body;
}

/* ---------- Money ---------- */
function viewMoney(){
  const m=monthStats(moneyMonth);
  const label=new Date(moneyMonth+"-15T12:00:00").toLocaleDateString("en-AU",{month:"long",year:"numeric"});
  const budgets=SET().budgets||{};
  const cats=Array.from(new Set([...Object.keys(budgets),...Object.keys(m.byCat)]));
  const tx=S().tx.filter(x=>monthKey(x.date)===moneyMonth).sort((a,b)=>b.date.localeCompare(a.date));
  const byWho=people().map(p=>({p,v:tx.filter(x=>x.type==="out"&&x.who===p.id).reduce((a,x)=>a+x.amount,0)}));
  return `<div class="row between"><button class="iconbtn" data-act="mPrev" aria-label="Previous month">‹</button><h2>${label}</h2><button class="iconbtn" data-act="mNext" aria-label="Next month">›</button></div>
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
const backBar=`<button class="back" data-go="more">${ICON.back}More</button>`;
function viewMore(){
  const tile=(go,icon,title,sub)=>`<button class="tile" data-go="${go}">${icon}<b>${title}</b><span>${sub}</span></button>`;
  const cards=S().wallet.length+S().myWallet.length;
  return `<div class="tiles">
   ${tile("activities",ICON.swim,"Activities",(()=>{const n=S().events.filter(isRep).length;return n?n+" weekly class"+(n===1?"":"es")+" and lessons":"Swimming, lessons, sport"})())}
   ${tile("meals",ICON.meal,"Dinner plan",(()=>{const m=mealOn(TODAY());return m?"Tonight: "+esc(m.title):"Plan the week's dinners"})())}
   ${tile("dates",ICON.cake,"Dates",(()=>{const c=countdownsSoon(1)[0];return c?esc(c.title)+" · "+esc(cdLabel(c)):"Birthdays and trips"})())}
   ${tile("bills",ICON.bill,"Bills",S().bills.length?S().bills.length+" bill"+(S().bills.length===1?"":"s")+" tracked":"Rent, power, subscriptions")}
   ${tile("mood",ICON.mood,"Mood","Check in, or a 5-minute family check")}
   ${tile("wallet",ICON.wallet,"Wallet",cards+" card"+(cards===1?"":"s")+" and passes")}
   ${tile("notes",ICON.note,"Notes",S().notes.length+" note"+(S().notes.length===1?"":"s"))}
   ${tile("calc",ICON.calc,"Calculator","Quick sums, then save as spending")}
   ${tile("location",ICON.pin,"Family location","See where everyone is")}
   <button class="tile" data-act="settings">${ICON.gear}<b>Settings</b><span>Names, currency, ${ST.mode==="cloud"?"family code":"backup"}</span></button>
  </div>`;
}

/* ---------- Notes ---------- */
function viewNotes(){
  const notes=[...S().notes].sort((a,b)=>(!!b.pinned-!!a.pinned)||((b.updated||0)-(a.updated||0)));
  return `${backBar}<div class="stack" style="gap:10px">${notes.length?notes.map(n=>`<button class="note" data-act="openNote" data-id="${n.id}"><b>${n.pinned?"📌 ":""}${esc(n.title||"Untitled")}</b><p>${esc(n.body)}</p><span class="m">${esc(pname(n.who))} · ${new Date(n.updated||n.createdAt||Date.now()).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span></button>`).join(""):`<div class="card empty">No notes yet. Tap + to write one.</div>`}</div>`;
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
  return `${backBar}<div class="calc"><div class="screen" aria-live="polite"><div class="e">${esc(calcExpr)||"&nbsp;"}</div><div class="r">${p===null?"…":p.toLocaleString("en-AU",{maximumFractionDigits:8})}</div></div>
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
    return `<div class="item">${dot(p.id)}<div class="grow"><div class="t">${esc(p.name)}${p.id===meId()?" (you)":""}</div><div class="m">${l?`Updated ${ago(l.at)} · within ${Math.round(l.acc||0)} m`:"Not sharing"}</div></div>${l?`<a class="mapl" href="https://www.google.com/maps?q=${l.lat},${l.lng}" target="_blank" rel="noopener">Map</a>`:""}</div>`}).join("");
  return `${backBar}
  <section class="card stack" style="gap:12px"><div class="row between"><div class="grow"><h2>Share my location</h2><div class="sub">With ${ST.mode==="cloud"?"your family":"this device only, until family sharing is set up"}</div></div>
   <button class="toggle ${sharing?"on":""}" data-act="toggleLoc" role="switch" aria-checked="${sharing}" aria-label="Share my location"></button></div>
   <div class="sub">Your location updates while Happy Home is open on your phone. Turn this off any time and your location is removed straight away.</div></section>
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
function allCards(){return [...S().wallet.map(c=>({...c,shared:true})),...S().myWallet.map(c=>({...c,shared:false}))]}
function walletCard(w,full){
  return `<button class="wcard ${full?"full":""}" data-act="openCard" data-id="${w.id}" style="background:${esc(w.bg||"#22325A")};color:#fff">
  <div class="row between"><span class="wk">${esc(w.kind||"Card")}${w.shared?"":" · Private"}</span><span class="wh">${dot(w.holder??meId())}</span></div>
  <div class="wn">${esc(w.name)}</div>${full?`${w.num?`<div class="wnum">${esc(w.num)}</div>`:""}${w.extra?`<div class="wx">${esc(w.extra)}</div>`:""}`:""}</button>`;
}
function viewWallet(){
  const cards=allCards();
  return `${backBar}${cards.length?`<div class="wstack">${cards.map(w=>walletCard(w,false)).join("")}</div>`:`<section class="card empty">No cards yet. Add loyalty cards, memberships, tickets or a boarding pass.</section>`}
  <section class="card stack" style="gap:8px"><h2>Add to Wallet</h2><div class="sub">Type in the card number to make a scannable barcode or QR code, and add a photo of the card if you like. Shared cards show for the whole family; private ones only for you.</div>
  <button class="primary" data-act="addCard">Add a card or pass</button></section>`;
}
function cardSheet(id){
  const w=allCards().find(x=>x.id===id); if(!w)return;
  const code=w.code==="qr"?Codes.qrSVG(w.num):w.code==="bar"?Codes.barcodeSVG(w.num):"";
  openSheet(`${sheetHead(esc(w.kind||"Card"))}${walletCard(w,true)}
   ${code?`<div class="codebox">${code}<div class="num" style="text-align:center;margin-top:6px;color:#111;letter-spacing:.08em">${esc(w.num)}</div></div><div class="sub">Turn your screen brightness up if a scanner has trouble reading it.</div>`:""}
   ${w.photo?`<img class="photo" src="${w.photo}" alt="Photo of ${esc(w.name)}">`:""}
   <div class="sub">Belongs to ${esc(pname(w.holder??meId()))} · ${w.shared?"Shared with the family":"Only you can see this"}</div>
   <div class="two"><button class="ghost" data-act="editCard" data-id="${w.id}">Edit</button><button class="ghost" id="c_del">Delete</button></div>`,sh=>{
    const d=sh.querySelector("#c_del");d.onclick=()=>{if(d.dataset.arm){ST.del(w.shared?"wallet":"myWallet",w.id);closeSheet();toast("Card deleted")}else{d.dataset.arm=1;d.textContent="Tap again to delete";d.style.color="var(--bad)"}};
  });
}
function cardForm(id){
  const w=id?allCards().find(x=>x.id===id):{kind:"Loyalty card",name:"",num:"",extra:"",code:"bar",bg:CARD_COLORS[0],holder:meId(),shared:true};
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
   <label class="checkrow" for="w_shared"><input type="checkbox" id="w_shared" ${w.shared?"checked":""}> Share with the family</label>
   <button class="primary" type="submit">Save card</button></form>`,sh=>{
    sh.querySelectorAll(".colors button").forEach(b=>b.onclick=()=>{bg=b.dataset.c;sh.querySelectorAll(".colors button").forEach(x=>x.classList.toggle("on",x===b))});
    sh.querySelector("#w_photo").onchange=async e=>{const f=e.target.files[0];if(!f)return;photo=await shrinkImage(f,900,.72);toast("Photo added")};
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const v=k=>sh.querySelector("#"+k).value.trim();
      const rec={kind:v("w_kind"),holder:+v("w_holder"),name:v("w_name"),num:v("w_num"),code:v("w_code"),extra:v("w_extra"),bg,photo};
      const shared=sh.querySelector("#w_shared").checked;
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
  return `<div class="reqbar"><b>${esc(pname(s.starter))} wants to do a 5-minute family mood check</b><span class="sub">${esc(pname(s.starter))}'s phone will listen to the room. Nothing is recorded or saved. The result goes to everyone who takes part.</span>
  <div class="two"><button class="ghost" data-act="moodDecline" data-id="${s.id}">No thanks</button><button class="primary" data-act="moodAgree" data-id="${s.id}">I agree</button></div></div>`;
}
function viewMood(){
  const s=activeSession();
  if(s&&s.state==="asking")return `${backBar}${moodRequestBanner()}
   <section class="card stack" style="gap:12px"><h2>Family mood check</h2><p style="margin:0">It starts only when everyone below has said yes on their own phone.</p>
    <div class="list">${(s.people||[]).map(id=>{const ok=(s.agreed||{})[id],no=(s.declined||{})[id];return `<div class="item">${dot(id)}<div class="grow"><div class="t">${esc(pname(id))}</div><div class="m">${id===s.starter?"Started this":ok?"Agreed":no?"Said no":"Waiting for an answer"}</div></div><span class="pill ${ok?"today":no?"late":""}">${ok?"Agreed":no?"No":"Waiting"}</span></div>`}).join("")}</div>
    <div class="sub">If anyone says no, or doesn't answer within 2 minutes, it won't start.</div>
    <button class="ghost" data-act="moodCancel" data-id="${s.id}">Cancel</button></section>`;
  if(s&&s.state==="ready"){
    const mine=s.starter===meId();
    return `${backBar}<section class="card stack" style="gap:14px;text-align:center;align-items:center"><h2>Everyone agreed</h2>
     <div class="row" style="justify-content:center;gap:14px;flex-wrap:wrap">${(s.people||[]).map(i=>`<span class="row" style="gap:6px">${dot(i)}<span class="sub">${esc(pname(i))}</span></span>`).join("")}</div>
     ${mine?`<p class="sub" style="margin:0">Your phone will listen for 5 minutes. Keep Happy Home open and the phone in the middle of the room.</p><button class="primary" style="width:100%" data-act="moodListen" data-id="${s.id}">Start listening</button>`:`<p class="sub" style="margin:0">Waiting for ${esc(pname(s.starter))} to start it.</p>`}
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
  const res=lastResultForMe();
  const t=TODAY();
  const todays=people().map(p=>{const c=S().moods.filter(m=>m.person===p.id&&m.date===t).sort((a,b)=>b.at-a.at)[0];
    return `<div class="item">${dot(p.id)}<div class="grow"><div class="t">${esc(p.name)}${p.id===meId()?" (you)":""}</div><div class="m">${c?`Checked in ${new Date(c.at).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})}${c.note?` · "${esc(c.note)}"`:""}`:"Hasn't shared today"}</div></div>${c?moodBadge(c.mood):`<span class="pill">Private</span>`}</div>`}).join("");
  const week=[...Array(7)].map((_,i)=>addDays(t,i-6));
  return `${backBar}${res?resultCard(res):""}
  <section class="card stack" style="gap:10px"><div class="row between"><h2>How's everyone today?</h2><span class="sub">${nice(t)}</span></div><div class="list">${todays}</div><div class="sub">You only see what each person chooses to share.</div></section>
  <section class="card stack" style="gap:10px"><h2>How are you feeling?</h2>
   <div class="moodpick">${MOODS.map(([k,n,c])=>`<button class="${k===pickMood?"on":""}" style="--m:${c}" data-act="pickMood" data-k="${k}"><i></i>${n}</button>`).join("")}</div>
   <input class="noteinput" id="moodNote" placeholder="Add a few words (optional)" aria-label="Mood note" maxlength="80">
   <div class="two"><button class="ghost" data-act="moodPrivate">Keep private</button><button class="primary" data-act="moodShare">Share with family</button></div></section>
  <section class="card stack" style="gap:8px"><h2>5-minute family mood check</h2>
   <div class="sub">Your phone listens to the room for 5 minutes and gives a rough read of how calm or loud it was. Everyone in the room agrees on their own phone first, anyone can stop it, and nothing is recorded or saved.</div>
   <button class="primary" data-act="moodStart">Start a mood check</button></section>
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
  if(ST.mfaResolver)return `<div class="auth"><div class="logo">H</div><h1>Enter your code</h1><p class="sub" style="margin:0">Open your authenticator app and type the 6-digit code for Happy Home.</p>
  <form id="mfaForm" class="stack" style="gap:12px"><div class="field"><label for="m_code">Code</label><input id="m_code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" required style="font-size:24px;letter-spacing:.3em;text-align:center"></div>
   ${authErr?`<div class="err">${esc(authErr)}</div>`:""}<button class="primary" type="submit" ${busy?"disabled":""}>Sign in</button></form>
  <button class="link" data-act="mfaCancel">Back</button><p class="sub" style="text-align:center">Lost your phone? Ask whoever set up the family to switch off two-step sign-in for you.</p></div>`;
  return `<div class="auth"><div class="logo">H</div><h1>Happy Home</h1><p class="sub" style="margin:0">One place for your family's money, plans, lists and more.</p>
  <div class="seg"><button class="${authMode==="signin"?"on":""}" data-act="authMode" data-k="signin">Sign in</button><button class="${authMode==="signup"?"on":""}" data-act="authMode" data-k="signup">Create account</button></div>
  <form id="authForm" class="stack" style="gap:12px">
   <div class="field"><label for="a_email">Email</label><input id="a_email" type="email" autocomplete="email" required></div>
   <div class="field"><label for="a_pw">Password</label><input id="a_pw" type="password" autocomplete="${authMode==="signup"?"new-password":"current-password"}" minlength="6" required></div>
   ${authErr?`<div class="err">${esc(authErr)}</div>`:""}
   <button class="primary" type="submit" ${busy?"disabled":""}>${authMode==="signup"?"Create account":"Sign in"}</button></form>
  ${authMode==="signin"?`<button class="link" data-act="forgot">Forgot password?</button>`:""}</div>`;
}
function viewFamilySetup(){
  return `<div class="auth"><h1>Set up your family</h1>
  <section class="card stack" style="gap:12px"><h2>Start a new family</h2>
   <form id="newFam" class="stack" style="gap:10px">
    <div class="field"><label for="n_me">Your name</label><input id="n_me" required placeholder="Your first name"></div>
    <div class="two"><div class="field"><label for="n_2">Family member</label><input id="n_2" value="Akiyo"></div><div class="field"><label for="n_3">Family member</label><input id="n_3" value="Jugo"></div></div>
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
const EVENTISH=/\b(appointment|appt|dentist|doctor|gp|vet|party|meeting|training|practice|lesson|class|dinner|lunch|breakfast|brunch|birthday|game|match|flight|pickup|pick up|drop off|visit|concert|movie|cinema|swimming|soccer|football|footy|netball|cricket|basketball|tennis|piano|guitar|tutor|haircut|interview|wedding|bbq|church|temple|excursion|camp|holiday|recital|assembly|parent teacher)\b/i;
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function parseQuick(txt){
  let s=" "+txt.trim()+" ";const out={kind:null,title:"",who:null,date:null,time:null,amount:null,items:null,subject:null};
  const cut=re=>{const m=s.match(re);if(m){s=s.replace(re," ");}return m};
  // shopping: "buy milk, eggs and bread"
  let m=s.match(/^\s*(buy|get|shop|shopping)\s*:?\s+(.+)$/i);
  if(m){out.kind="shop";out.items=m[2].split(/\s*(?:,|\band\b|&|\+)\s*/i).map(x=>x.trim()).filter(Boolean);return out}
  // money: "$45 petrol", "spent 12.50 on lunch", "paid 80 electricity"
  m=s.match(/\$\s?(\d+(?:\.\d{1,2})?)/)||s.match(/\b(?:spent|paid)\s+\$?(\d+(?:\.\d{1,2})?)/i);
  if(m){out.kind="money";out.amount=+m[1];s=s.replace(m[0]," ").replace(/\b(spent|paid|on|for)\b/gi," ");}
  // person
  for(const p of people()){const re=new RegExp("\\s(?:for\\s+|with\\s+)?"+reEsc(p.name)+"(?:'s)?(?=\\s)","i");if(re.test(s)){out.who=p.id;s=s.replace(re," ");break}}
  // time
  const tmm=cut(/\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=\s)/i)||cut(/\s(?:at\s+|@\s*)(\d{1,2})(?:[:.](\d{2}))?(?=\s)/i)||cut(/\s(\d{1,2})[:](\d{2})(?=\s)/);
  if(tmm){let h=+tmm[1];const mi=+(tmm[2]||0),ap=(tmm[3]||"").toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;if(!ap&&h>=1&&h<=7)h+=12;if(h<24&&mi<60)out.time=String(h).padStart(2,"0")+":"+String(mi).padStart(2,"0")}
  if(cut(/\s(?:this\s+)?(morning)(?=\s)/i)&&!out.time)out.time="09:00";
  if(cut(/\s(?:this\s+)?(tonight|evening)(?=\s)/i)){out.date=out.date||TODAY();if(!out.time)out.time="18:00"}
  // weekly: "swimming every tuesday and thursday 4pm"
  const t=TODAY();
  const DW="(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*";
  if((m=cut(new RegExp("\\s(?:on\\s+)?every\\s+("+DW+"(?:\\s*(?:,|and|&)\\s*"+DW+")*)(?=\\s)","i")))){
    out.days=[...new Set(m[1].split(/\s*(?:,|and|&)\s*/i).map(w=>WEEKDAYS.findIndex(x=>x.startsWith(w.toLowerCase().slice(0,3)))).filter(i=>i>=0))];
    if(out.days.length){out.kind="event";let d=t;while(!out.days.includes(dow(d)))d=addDays(d,1);out.date=d}}
  if(cut(/\s(?:on\s+)?today(?=\s)/i))out.date=t;
  else if(cut(/\s(?:on\s+)?(?:tomorrow|tmr|tmrw|tomoz)(?=\s)/i))out.date=addDays(t,1);
  else if((m=cut(/\s(?:on\s+)?(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?(?=\s)/i))){
    const want=WEEKDAYS.findIndex(w=>w.startsWith(m[2].toLowerCase().slice(0,3)));const now=new Date(t+"T12:00:00").getDay();let diff=(want-now+7)%7;if(diff===0)diff=7;if(m[1])diff+=diff<7?7:0;out.date=addDays(t,diff)}
  else if((m=cut(/\sin\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks)(?=\s)/i))){const n={a:1,an:1,one:1,two:2,three:3}[m[1].toLowerCase()]||+m[1];out.date=addDays(t,n*(m[2].startsWith("week")?7:1))}
  else if(cut(/\snext\s+week(?=\s)/i))out.date=addDays(t,7);
  else if((m=cut(/\s(?:on\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?(?=\s)/))){let y=m[3]?+m[3]:+t.slice(0,4);if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1],12);if(!m[3]&&iso(d)<t)d.setFullYear(y+1);out.date=iso(d)}
  else if((m=cut(new RegExp("\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+("+MONTHS.join("|")+")[a-z]*(?=\\s)","i"))||cut(new RegExp("\\s(?:on\\s+)?("+MONTHS.join("|")+")[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)","i")))){
    const a=isNaN(+m[1])?[m[2],m[1]]:[m[1],m[2]];const mo=MONTHS.indexOf(a[1].slice(0,3).toLowerCase());const y=+t.slice(0,4);const d=new Date(y,mo,+a[0],12);if(iso(d)<t)d.setFullYear(y+1);out.date=iso(d)}
  // homework
  if(!out.kind&&/\bhomework\b|\bassignment\b|\bworksheet\b/i.test(s)){out.kind="homework";s=s.replace(/\bhomework\b/i," ");
    const subj=["Maths","Math","English","Science","HASS","History","Geography","Art","Music","Japanese","PE","Spelling","Reading"].find(x=>new RegExp("\\b"+x+"\\b","i").test(s));if(subj){out.subject=subj==="Math"?"Maths":subj;s=s.replace(new RegExp("\\b"+subj+"\\b","i")," ")}}
  if(!out.kind&&/\b(remind me to|todo|to do|task)\b/i.test(s)){out.kind="task";s=s.replace(/\b(remind me to|todo|to do|task)\b:?/i," ")}
  if(!out.kind)out.kind=(out.time||EVENTISH.test(s))?"event":"task";
  out.title=s.replace(/\s+(on|at|by|for|in|the)\s*$/i,"").replace(/^\s*(on|at|by|for)\s+/i,"").replace(/\s+/g," ").trim();
  out.title=out.title.charAt(0).toUpperCase()+out.title.slice(1);
  return out;
}
function quickPreview(q){
  if(!q||(!q.title&&!q.items))return"";
  const bits={shop:()=>`Shopping: ${q.items.map(esc).join(", ")}`,
    money:()=>`Spending ${money(q.amount||0)}${q.title?" · "+esc(q.title):""} · ${pname(q.who||meId())}`,
    event:()=>q.days?`Weekly activity: ${esc(q.title||"Untitled")} · ${repText({repeat:"weekly",days:q.days})}${q.time?" · "+tm(q.time):""} · ${pname(q.who??0)}`:`Event: ${esc(q.title||"Untitled")} · ${nice(q.date||TODAY())}${q.time?" · "+tm(q.time):""} · ${pname(q.who??0)}`,
    task:()=>`Task: ${esc(q.title||"Untitled")} · ${pname(q.who||meId())} · ${nice(q.date||TODAY())}${q.time?" · "+tm(q.time):""}`,
    homework:()=>`Homework: ${esc(q.subject||"Homework")} · ${esc(q.title||"")} · due ${nice(q.date||addDays(TODAY(),1))}`}[q.kind];
  return bits?bits():"";
}
function saveQuick(q){
  if(q.kind==="shop"){q.items.forEach(n=>addShopItem(n));toast(q.items.length>1?q.items.length+" items added to shopping":"Added to shopping");return}
  if(!q.title&&q.kind!=="money")return toast("Type what it is, e.g. Dentist Friday 3pm");
  if(q.kind==="money"){if(!(q.amount>0))return;const cat=guessCat(q.title);ST.add("tx",{type:"out",amount:Math.round(q.amount*100)/100,cat,who:q.who||meId(),date:q.date||TODAY(),note:q.title});toast("Spending added to "+cat);return}
  if(q.kind==="event"){const d=q.date||TODAY();if(q.days){ST.add("events",{title:q.title,who:q.who??0,date:d,time:q.time||"",place:"",repeat:"weekly",days:q.days.sort(),until:"",skip:[]});toast(q.title+": "+repText({repeat:"weekly",days:q.days}));return}ST.add("events",{title:q.title,who:q.who??0,date:d,time:q.time||"",place:""});toast("Added to the calendar for "+nice(d));return}
  if(q.kind==="homework"){ST.add("homework",{subject:q.subject||"Homework",title:q.title||q.subject||"Homework",who:q.who||kidId(),due:q.date||addDays(TODAY(),1),time:q.time||"",done:false});toast("Homework added");return}
  ST.add("tasks",{title:q.title,who:q.who||meId(),due:q.date||TODAY(),time:q.time||"",repeat:"none",done:false});toast("Task added for "+nice(q.date||TODAY()));
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
  ST.add("shopping",{name,qty,done:false,who:meId(),aisle:aisleOf(name)});
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
  return row("bills",b.id,`<div class="billic">${esc((b.name||"?").slice(0,1).toUpperCase())}</div><div class="grow tap" data-act="editBill" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m">${EVERY[b.every]?.[0]||""}${b.auto?" · paid automatically":""}</div></div>
   <div style="text-align:right"><div class="num" style="font-weight:600">${money(+b.amount||0)}</div><span class="pill ${late?"late":soon?"today":""}">${late?"Overdue · ":""}${nice(b.next)}</span></div>
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
   <div class="field"><label for="b_who">Who pays</label><select id="b_who">${whoOptions(b?.who||meId())}</select></div>
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
  return `${backBar}<div class="row between"><button class="iconbtn" data-act="mealPrev" aria-label="Previous week">‹</button><h2>${label}</h2><button class="iconbtn" data-act="mealNext" aria-label="Next week">›</button></div>
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
   <div class="field"><label for="c_t">What</label><input id="c_t" required placeholder="e.g. Jugo's birthday, Japan trip" value="${esc(c?.title||"")}"></div>
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
  const clean=s=>String(s||"").replace(/[\\;,]/g,m=>"\\"+m).replace(/\n/g,"\\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Happy Home//EN\r\nBEGIN:VEVENT\r\nUID:${e.id}@happyhome\r\nDTSTAMP:${stamp}\r\n${when}\r\nSUMMARY:${clean(e.title)}\r\n${isRep(e)?"RRULE:FREQ=WEEKLY;BYDAY="+e.days.map(i=>["SU","MO","TU","WE","TH","FR","SA"][i]).join(",")+(e.until?";UNTIL="+e.until.replace(/-/g,"")+"T235959":"")+"\r\n":""}${e.place?"LOCATION:"+clean(e.place)+"\r\n":""}BEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\nDESCRIPTION:${clean(e.title)}\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}
function exportEvent(e){
  const blob=new Blob([icsFor(e)],{type:"text/calendar"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=(e.title||"event").replace(/[^\w\- ]+/g,"").slice(0,40)+".ics";a.rel="noopener";a.style.display="none";document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000);
}

/* ---------- weekly activities per person ---------- */
function viewActivities(){
  const reps=S().events.filter(e=>isRep(e)&&(!e.until||e.until>=TODAY()));
  const card=p=>{const mine=reps.filter(e=>+e.who===p.id||(p.id===0&&+e.who===0));const cnt=mine.reduce((a,e)=>a+e.days.length,0);
    return `<section class="card"><div class="row between"><div class="row" style="gap:8px">${dot(p.id)}<h2>${esc(p.name)}</h2></div><button class="link" data-act="addActivity" data-k="${p.id}">+ Add</button></div>
     ${mine.length?`<div class="sub" style="margin-top:2px">${cnt} session${cnt===1?"":"s"} a week</div><div class="wkgrid">${[1,2,3,4,5,6,0].map(d=>{const on=mine.filter(e=>e.days.includes(d)).sort((a,b)=>(a.time||"").localeCompare(b.time||""));return `<div class="wkday ${dow(TODAY())===d?"is-today":""}"><b>${DAYN[d]}</b>${on.map(e=>`<button class="wkev" data-act="edit" data-col="events" data-id="${e.id}"><span>${esc(e.title)}</span>${e.time?`<i>${tm(e.time)}</i>`:""}</button>`).join("")}</div>`}).join("")}</div>
      <div class="list" style="margin-top:8px">${mine.map(e=>`<div class="item"><div class="grow tap" data-act="edit" data-col="events" data-id="${e.id}"><div class="t">${esc(e.title)}</div><div class="m">${repText(e)}${e.time?" · "+tm(e.time):""}${e.place?" · "+esc(placeTxt(e.place)):""}</div></div>${joinBtn(e)}</div>`).join("")}</div>`
     :`<div class="empty">No weekly activities yet. Add classes, sport, lessons or practice that happen on the same days each week.</div>`}</section>`};
  return `${backBar}${people().map(card).join("")}${reps.some(e=>+e.who===0)?card({id:0,name:"Whole family"}):""}`;
}
/* ---------- important dates view ---------- */
function viewDates(){
  const list=S().countdowns.map(c=>({...c,nd:cdNext(c)})).sort((a,b)=>(a.nd||"").localeCompare(b.nd||""));
  const up=list.filter(c=>c.nd>=TODAY()),past=list.filter(c=>c.nd<TODAY());
  const item=c=>`<button class="item cdrow" data-act="editCountdown" data-id="${c.id}"><span class="cdnum"><b>${c.nd>=TODAY()?daysUntil(c.nd):"✓"}</b><span>${c.nd>=TODAY()?(daysUntil(c.nd)===1?"day":"days"):"past"}</span></span><div class="grow" style="text-align:left"><div class="t">${esc(c.title)}</div><div class="m">${nice(c.nd)}${c.yearly?" · every year":""}${c.yearly&&c.kind==="birthday"&&+c.date.slice(0,4)>1900&&c.nd>=TODAY()?" · turns "+(+c.nd.slice(0,4)-+c.date.slice(0,4)):""}</div></div></button>`;
  return `${backBar}<section class="card"><div class="row between"><h2>Coming up</h2><button class="link" data-act="addCountdown">+ Add</button></div>
   <div class="list" style="margin-top:6px">${up.length?up.map(item).join(""):`<div class="empty">Add birthdays, anniversaries, holidays and trips. The next ones show on Today with a countdown.</div>`}</div></section>
  ${past.length?`<section class="card"><h2>Past</h2><div class="list" style="margin-top:6px">${past.map(item).join("")}</div></section>`:""}`;
}

/* ---------- render ---------- */
const TITLES={home:"Today",calendar:"Calendar",lists:"Lists",money:"Money",more:"More",notes:"Notes",calc:"Calculator",location:"Location",wallet:"Wallet",mood:"Mood",bills:"Bills",meals:"Dinner plan",dates:"Dates",activities:"Activities"};
let rendering=false;
function render(){
  if(rendering)return;rendering=true;
  try{
    const nav=$("nav.tabs"),head=$("header.top");
    if(ST.phase!=="ready"||(ST.mode==="cloud"&&!ST.me.personId)){
      nav.hidden=true;head.hidden=true;
      $("#view").innerHTML=ST.phase==="loading"?`<div class="auth"><div class="logo">H</div><p class="sub">Loading your family…</p></div>`:ST.phase==="signedOut"?viewAuth():ST.phase==="needsFamily"?viewFamilySetup():viewClaim();
      bindForms();return;
    }
    nav.hidden=false;head.hidden=false;
    const keepShop=$("#shopInput"),shopVal=keepShop&&keepShop.value,shopFocus=keepShop&&document.activeElement===keepShop;
    const keepNote=$("#moodNote"),noteVal=keepNote&&keepNote.value;const keepQ=$("#qa"),qVal=keepQ&&keepQ.value,qFocus=keepQ&&document.activeElement===keepQ;
    $("#title").textContent=TITLES[tab];
    const me=person(meId());
    $("#subtitle").textContent=tab==="home"?(me?"Hello, "+me.name:""):"";
    $("#view").innerHTML={home:viewHome,calendar:viewCalendar,lists:viewLists,money:viewMoney,more:viewMore,notes:viewNotes,calc:viewCalc,location:viewLocation,wallet:viewWallet,mood:viewMood,bills:viewBills,meals:viewMeals,dates:viewDates,activities:viewActivities}[tab]();
    const active=parentTab[tab]||tab;
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.tab===active));
    if(shopVal&&$("#shopInput"))$("#shopInput").value=shopVal; if(shopFocus&&$("#shopInput"))$("#shopInput").focus();
    if(noteVal&&$("#moodNote"))$("#moodNote").value=noteVal;if(qVal&&$("#qa")){$("#qa").value=qVal;showQuick()}if(qFocus&&$("#qa"))$("#qa").focus();
    bindForms();
  }finally{rendering=false}
}
function bindForms(){
  const sf=$("#shopForm");if(sf)sf.onsubmit=e=>{e.preventDefault();const v=$("#shopInput").value.trim();if(!v)return;
    $("#shopInput").value="";v.split(/\s*,\s*/).filter(Boolean).forEach(addShopItem);$("#shopInput").focus()};
  const qf=$("#qaForm");if(qf){const q=$("#qa");q.oninput=showQuick;qf.onsubmit=e=>{e.preventDefault();const v=q.value.trim();if(!v){q.focus();return}
    saveQuick(parseQuick(v));try{ST._localPref("qaUses",String(+(ST._localPref("qaUses")||0)+1))}catch(_){}q.value="";showQuick();q.blur()}}
  const af=$("#authForm");if(af)af.onsubmit=async e=>{e.preventDefault();busy=true;authErr="";const em=$("#a_email").value.trim(),pw=$("#a_pw").value;
    try{authMode==="signup"?await ST.signUp(em,pw):await ST.signIn(em,pw)}catch(err){authErr=err&&err.code==="hh/mfa-needed"?"":authErrorText(err)}busy=false;render();const mc=$("#m_code");mc&&mc.focus()};
  const mf=$("#mfaForm");if(mf)mf.onsubmit=async e=>{e.preventDefault();busy=true;authErr="";try{await ST.finishMfaSignIn($("#m_code").value)}catch(err){authErr=authErrorText(err)}busy=false;render()};
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
function go(t){tab=t;try{history.replaceState(null,"","#"+t)}catch(e){location.hash=t}render();scrollTo(0,0)}

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
  const kid=kidId(), me=meId(), cats=SET().categories||[];
  let body="";
  if(kind==="task")body=`<div class="field"><label for="f_title">What needs doing?</label><input id="f_title" required placeholder="e.g. Take bins out"></div>
   <div class="two"><div class="field"><label for="f_who">Who</label><select id="f_who">${whoOptions(me)}</select></div><div class="field"><label for="f_due">Date</label><input id="f_due" type="date" value="${TODAY()}"></div></div>
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
  openSheet(`${sheetHead(edit?{task:"Edit task",homework:"Edit homework",event:"Edit event"}[kind]:"Add")}${edit?"":pick}<form id="f" class="stack" style="gap:12px">${body}<button class="primary" type="submit">Save</button>${edit?`<button type="button" class="link" id="f_del" style="color:var(--bad);align-self:center">Delete</button>`:""}</form>`,sh=>{
    sh.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>addSheet(b.dataset.kind,preset));
    if(edit){const set=(id,val)=>{const el=sh.querySelector("#"+id);if(el&&val!=null)el.value=val};
      set("f_title",edit.title);set("f_who",edit.who);set("f_due",edit.due);set("f_time",edit.time||"");set("f_rep",kind==="event"?"0":(edit.repeat||"none"));set("f_subj",edit.subject);set("f_date",edit.date);set("f_place",edit.place||"");set("f_pts",String(+edit.points||0));
      if(kind==="event"){const b=document.createElement("button");b.type="button";b.className="ghost";b.textContent="Add to iPhone Calendar";b.onclick=()=>{exportEvent(edit);toast("Opening Calendar…")};sh.querySelector("#f_del").before(b);
        if(isRep(edit)&&preset.occ){const o=document.createElement("button");o.type="button";o.className="link";o.style.alignSelf="center";o.textContent="Skip just "+nice(preset.occ);o.onclick=()=>{ST.patch("events",edit.id,{skip:[...(edit.skip||[]),preset.occ]});closeSheet();toast("Skipped "+nice(preset.occ))};sh.querySelector("#f_del").before(o);sh.querySelector("#f_del").textContent="Delete every week"}}
      const col={task:"tasks",homework:"homework",event:"events"}[kind],d=sh.querySelector("#f_del");
      d.onclick=()=>{if(d.dataset.arm){closeSheet();delUndo(col,edit.id);render()}else{d.dataset.arm=1;d.textContent="Tap again to delete"}};}
    if(kind==="event"){const rs=sh.querySelector("#f_erep"),df=sh.querySelector("#f_daysf"),uf=sh.querySelector("#f_untilf"),dp=sh.querySelectorAll("[data-day]");
      const on=new Set(edit&&isRep(edit)?edit.days:[]);const paint=()=>dp.forEach(b=>b.classList.toggle("on",on.has(+b.dataset.day)));
      const sync=()=>{const w=rs.value==="weekly";df.hidden=!w;uf.hidden=!w;if(w&&!on.size){auto=dow(sh.querySelector("#f_date").value||TODAY());on.add(auto);paint()}};
      let auto=null;dp.forEach(b=>b.onclick=()=>{const d=+b.dataset.day;if(auto!==null&&auto!==d&&on.size===1&&on.has(auto))on.delete(auto);auto=null;on.has(d)?on.delete(d):on.add(d);paint()});rs.onchange=sync;
      if(edit&&isRep(edit)){rs.value="weekly";sh.querySelector("#f_until").value=edit.until||""}else if(preset.days){rs.value="weekly"}
      paint();sync();sh._days=on}
    let type="out";
    sh.querySelectorAll("#f_type button").forEach(b=>b.onclick=()=>{type=b.dataset.t;sh.querySelectorAll("#f_type button").forEach(x=>x.classList.toggle("on",x===b));sh.querySelector("#f_cat").value=type==="in"?"Salary":cats[0]});
    const first=sh.querySelector("#f_subj,#f_title,#f_amt");if(!edit&&first)first.focus();
    sh.querySelector("#f").onsubmit=e=>{e.preventDefault();const v=id=>(sh.querySelector("#"+id)?.value??"");
      if(kind==="task"){if(!v("f_title").trim())return;const rec={title:v("f_title").trim(),who:+v("f_who"),due:v("f_due"),time:v("f_time"),repeat:v("f_rep"),points:+v("f_pts")||0};if(edit){ST.patch("tasks",edit.id,rec);toast("Task updated")}else{ST.add("tasks",{...rec,done:false});toast("Task added")}}
      if(kind==="money"){const a=parseFloat(v("f_amt"));if(!(a>0))return;ST.add("tx",{type,amount:Math.round(a*100)/100,cat:v("f_cat"),who:+v("f_who"),date:v("f_date")||TODAY(),note:v("f_note").trim()});moneyMonth=monthKey(v("f_date")||TODAY());toast(type==="in"?"Income added":"Spending added")}
      if(kind==="event"){if(!v("f_title").trim())return;const d0=v("f_date")||TODAY(),wk=v("f_erep")==="weekly"&&sh._days.size;
        const rec={title:v("f_title").trim(),who:+v("f_who"),date:d0,time:v("f_time"),place:v("f_place").trim(),repeat:wk?"weekly":"none",days:wk?[...sh._days].sort():[],until:wk?v("f_until"):""};
        if(edit){ST.patch("events",edit.id,rec);toast(wk?"Activity updated":"Event updated")}else{ST.add("events",{...rec,skip:[]});toast(wk?repText(rec)+(rec.time?" at "+tm(rec.time):""):"Event added")}
        if(!edit||!wk){calDay=d0;calMonth=monthKey(d0)}}
      if(kind==="shop"){if(!v("f_title").trim())return;addShopItem(v("f_title").trim()+(v("f_qty").trim()?" "+v("f_qty").trim():""));toast("Added to shopping")}
      if(kind==="homework"){if(!v("f_title").trim())return;const rec={subject:v("f_subj").trim()||"Homework",title:v("f_title").trim(),who:+v("f_who"),due:v("f_due"),time:v("f_time")};if(edit){ST.patch("homework",edit.id,rec);toast("Homework updated")}else{ST.add("homework",{...rec,done:false});toast("Homework added")}}
      if(kind==="note"){if(!v("f_title").trim()&&!v("f_body").trim())return;ST.add("notes",{title:v("f_title").trim(),body:v("f_body"),who:meId(),updated:Date.now(),pinned:false});toast("Note saved")}
      closeSheet();
      if(edit){render();return}
      const dest={task:["lists","tasks"],shop:["lists","shopping"],homework:["lists","homework"],note:["notes"],money:["money"],event:["calendar"]}[kind];
      if(dest[1])listTab=dest[1];
      if(tab!=="home"&&tab!==dest[0])go(dest[0]);else render();
    };
  });
}
function noteSheet(id){
  const n=S().notes.find(x=>x.id===id);if(!n)return;
  openSheet(`${sheetHead("Note")}<form id="f" class="stack" style="gap:12px">
   <div class="field"><label for="n_title">Title</label><input id="n_title" value="${esc(n.title)}"></div>
   <div class="field"><label for="n_body">Note</label><textarea id="n_body" class="body" rows="9">${esc(n.body)}</textarea></div>
   <label class="checkrow" for="n_pin"><input type="checkbox" id="n_pin" ${n.pinned?"checked":""}> Pin to top</label>
   <button class="primary" type="submit">Save</button></form><button class="ghost" id="n_del" type="button">Delete note</button>`,sh=>{
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
    <div class="sub">Akiyo and Jugo enter this code after creating their own account to join. Keep it within the family.</div>
    <button class="ghost" type="button" id="s_copy">Copy code</button>
    <div class="label" style="margin-top:6px">Two-step sign-in</div><div class="sub">${ST.twoStepOn()?"On. You'll need a code from your authenticator app when you sign in.":"Off. Turn it on to need a code from an authenticator app as well as your password."}</div>
    <button class="ghost" type="button" data-act="twoStep">${ST.twoStepOn()?"Turn off two-step sign-in":"Turn on two-step sign-in"}</button>
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
    if(!st.dir){if(Math.abs(dx)<10&&Math.abs(dy)<10)return;st.dir=Math.abs(dx)>Math.abs(dy)?"x":"y";if(st.dir==="x"){try{st.sw.setPointerCapture(e.pointerId)}catch(_){}st.it.style.transition="none"}}
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
    s.sw.classList.toggle("open",!!target);
    s.sw.dataset.justSwiped="1";setTimeout(()=>delete s.sw.dataset.justSwiped,50);
  };
  document.addEventListener("pointerup",end);document.addEventListener("pointercancel",end);
})();

/* ---------- clicks ---------- */
document.addEventListener("click",e=>{
  const sw=e.target.closest(".swipe");if(sw&&sw.dataset.justSwiped){e.preventDefault();return}
  const g=e.target.closest("[data-go]");if(g){if(g.closest("#sheetHost"))closeSheet();if(g.dataset.list)listTab=g.dataset.list;go(g.dataset.go);return}
  const tb=e.target.closest(".tab");if(tb){go(tb.dataset.tab);return}
  const a=e.target.closest("[data-act]");if(!a)return;const id=a.dataset.id,act=a.dataset.act;
  const flip=(col,msg)=>{const t=S()[col].find(x=>x.id===id);if(!t)return;ST.patch(col,id,{done:!t.done});if(!t.done&&msg)toast(msg);return t};
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
    case"addActivity":return addSheet("event",{who:+a.dataset.k,days:[dow(TODAY())]});
    case"editCountdown":closeSheet();return countdownSheet(id);
    case"reAdd":addShopItem(a.dataset.k);toast(a.dataset.k+" added");return;
    case"twoStep":return twoStepSheet();
    case"mfaCancel":ST.cancelMfa();authErr="";return render();
    case"edit":{closeSheet();const col=a.dataset.col,r=S()[col].find(x=>x.id===id);if(r)addSheet({tasks:"task",homework:"homework",events:"event"}[col],{occ:a.dataset.d},r);return}
    case"swipeDel":{const w=a.closest(".swipe");if(w.dataset.occ){const e=S().events.find(x=>x.id===w.dataset.id);if(e){const d=w.dataset.occ,old=e.skip||[];ST.patch("events",e.id,{skip:[...old,d]});toast("Removed for "+nice(d),"Undo",()=>ST.patch("events",e.id,{skip:old}))}return}delUndo(w.dataset.col,w.dataset.id);return}
    case"toggle":{const t=S().tasks.find(x=>x.id===id);if(!t)return;const was=!!t.done,snap={...t};ST.patch("tasks",id,{done:!was});if(was)takeStars(snap);if(!was){giveStars(snap);toast(+snap.points>0?`Done! ★ ${+snap.points} for ${pname(snap.who)}`:"Done!");if(snap.repeat&&snap.repeat!=="none"&&!snap.rolled){ST.patch("tasks",id,{rolled:true});rollRepeat(snap)}}return}
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
    case"openNote":closeSheet();return noteSheet(id);
    case"openCard":closeSheet();return cardSheet(id);
    case"addCard":return cardForm();
    case"editCard":closeSheet();return cardForm(id);
    case"key":return calcKey(a.dataset.k);
    case"calcSpend":{const v=calcPreview();return addSheet("money",{amount:v&&v>0?Math.round(v*100)/100:""})}
    case"toggleLoc":if(mySharing()||geoWatch!==null){ST._localPref("shareLoc","0");stopGeo(true);toast("Stopped sharing your location")}else{ST._localPref("shareLoc","1");startGeo();toast("Sharing your location")}break;
    case"pickMood":pickMood=a.dataset.k;break;
    case"moodShare":case"moodPrivate":{const note=($("#moodNote")?.value||"").trim();
      if(act==="moodShare")ST.add("moods",{person:meId(),mood:pickMood,note,date:TODAY(),at:Date.now()});
      else ST.add("myMoodResults",{kind:"checkin",mood:pickMood,note,date:TODAY(),at:Date.now()});
      if($("#moodNote"))$("#moodNote").value="";toast(act==="moodShare"?"Shared with the family":"Saved just for you");return}
    case"moodStart":return moodStartSheet();
    case"moodAgree":setMapKey("moodSessions",id,"agreed",meId(),true);go("mood");return;
    case"moodDecline":setMapKey("moodSessions",id,"declined",meId(),true);toast("You said no. It won't start.");return;
    case"moodListen":{const s=S().moodSessions.find(x=>x.id===id);if(s)startListening(s);return}
    case"moodCancel":ST.patch("moodSessions",id,{state:"cancelled",reason:"cancelled"});return;
    case"moodStop":ST.patch("moodSessions",id,{state:"stopped",stoppedBy:meId()});if(listener.sid===id)finishListening();toast("Stopped");return;
    case"moodSeen":setMapKey("moodSessions",id,"seen",meId(),true);return;
    case"moodShareResult":{const s=S().moodSessions.find(x=>x.id===id);if(!s)return;const m=s.result.level===1?"good":s.result.level===2?"okay":"stressed";
      ST.add("moods",{person:meId(),mood:m,note:"Family check: "+s.result.label,date:TODAY(),at:Date.now()});setMapKey("moodSessions",id,"seen",meId(),true);toast("Shared");return}
    case"authMode":authMode=a.dataset.k;authErr="";break;
    case"forgot":{const em=$("#a_email")?.value.trim();if(!em){authErr="Type your email above first, then tap Forgot password.";break}ST.resetPassword(em).then(()=>toast("Check your email for a reset link"),err=>{authErr=authErrorText(err);render()});return}
    case"signOut":closeSheet();stopGeo(false);ST.signOut();return;
    case"claim":ST.claimPerson(a.dataset.k);return;
    default:return;
  }
  render();
});
$("#fab").onclick=()=>addSheet();
$("#btnSettings").onclick=settingsSheet;
$("#btnSearch").onclick=searchSheet;
addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(routes.includes(h)&&h!==tab){tab=h;render()}});
addEventListener("online",render);addEventListener("offline",render);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")return closeSheet();
  if(tab==="calc"&&!$("#sheetHost").innerHTML&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){
    const map={"*":"×","/":"÷","Enter":"=","Backspace":"⌫","Delete":"C"};const k=map[e.key]||e.key;
    if(/^[\d.+\-×÷%()=⌫C]$/.test(k)){e.preventDefault();calcKey(k)}
  }
});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&listener.sid){/* keep listening only while the app is open */ }});

/* ---------- start ---------- */
let lastErr=null, prevPhase=null;
ST.onChange(()=>{
  if(ST.error&&ST.error!==lastErr){toast(ST.error);lastErr=ST.error;setTimeout(()=>{ST.error=null;lastErr=null},4000)}
  if(ST.phase==="ready"&&prevPhase!=="ready"){if(ST._localPref("shareLoc")==="1")startGeo();cleanupMoodSessions()}
  prevPhase=ST.phase;
  moodTick();render();
});
setInterval(()=>{if(tab==="mood"&&activeSession())render();moodTick()},1000);
let autoPayDay=null;setInterval(()=>{if(ST.phase==="ready"&&autoPayDay!==TODAY()&&Date.now()-bootAt>6000){autoPayDay=TODAY();try{autoPayBills()}catch(e){}}},3000);
const bootAt=Date.now();
ST.init();
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
