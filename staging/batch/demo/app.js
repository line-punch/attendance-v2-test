"use strict";
/* Completely offline; all records in memory and synthetic. */
(function(){
const $=id=>document.getElementById(id);
const rules=window.V2BatchRules, db=window.V2BatchDemo.create();
const config={calendarConfirmed:true,offDays:["2026-11-11"],
  stormDays:["2026-11-12"]};
const show=(id,msg)=>{$(id).textContent=msg;};
const createId=prefix=>{
 const input=prefix+["leaveFrom","leaveTo","leaveType","leaveUnit",
   "missDate","missTime"].map(id=>$(id).value).join("_");
 let n=0;for(let i=0;i<input.length;i++)n=((n*31)+input.charCodeAt(i))>>>0;
 return prefix+"-"+n.toString(36).toUpperCase();
};
function details(r){
 return r.ok?(r.duplicate?"模擬資料已存在，沒有重複新增。":"模擬操作完成；不會寫入真實系統。"):
  "無法執行（"+String(r.code||"UNKNOWN")+"）。";
}
async function act(buttonId,statusId,fn){
 const btn=$(buttonId);if(btn.disabled)return;
 btn.disabled=true;const orig=btn.textContent;btn.textContent="執行中…";
 show(statusId,rules.feedback("WORKING"));
 try{await Promise.resolve();show(statusId,details(fn()));}
 catch(_){show(statusId,rules.feedback("UNKNOWN"))}
 finally{btn.disabled=false;btn.textContent=orig;}
}
const leaveForm=()=>({
 startDate:$("leaveFrom").value,endDate:$("leaveTo").value,
 leaveType:$("leaveType").value,unit:$("leaveUnit").value,
 fromTime:$("fromTime").value,toTime:$("toTime").value
});
function mockPunch(type){
 const all=db.snapshot().clock;
 const id="MOCKCLOCK-"+type;
 return db.add("clock",{id,type,day:"2026-10-30",
   time:type==="上班"?"08:30:00":"17:30:00",synthetic:true});
}
document.querySelectorAll("#tabs button").forEach(b=>{
 b.addEventListener("click",()=>{
  document.querySelectorAll("#tabs button").forEach(x=>x.removeAttribute("aria-current"));
  b.setAttribute("aria-current","page");
  ["clock","missing","history","leave"].forEach(id=>$(id).hidden=id!==b.dataset.tab);
 });
});
document.querySelector('#tabs button[data-tab="clock"]').setAttribute("aria-current","page");
$("clockIn").addEventListener("click",()=>act("clockIn","clockResult",()=>mockPunch("上班")));
$("clockOut").addEventListener("click",()=>act("clockOut","clockResult",()=>mockPunch("下班")));
$("clockCheck").addEventListener("click",()=>{
 const p=db.snapshot().clock;
 show("clockResult",p.length?p.map(x=>x.day+" "+x.time+"｜"+x.type+"（純模擬）").join("\n"):"尚無模擬打卡紀錄");
});
$("missSend").addEventListener("click",()=>act("missSend","missResult",()=>{
 if(!$("missReason").value.trim())return {ok:false,code:"MISSING_REASON"};
 const date=$("missDate").value,time=$("missTime").value,type=$("missType").value;
 return db.add("missed",{id:createId("SIMM"),date,time,type,synthetic:true});
}));
$("leaveCheck").addEventListener("click",()=>{
 const r=rules.leaveCheck(leaveForm(),config);
 show("leaveResult",r.ok?"預檢通過："+r.workingDays+" 個上班日（純模擬）":
  "預檢未通過："+r.code);
});
$("leaveSend").addEventListener("click",()=>act("leaveSend","leaveResult",()=>{
 const form=leaveForm(),check=rules.leaveCheck(form,config);
 if(!check.ok)return check;
 return db.add("leave",{id:createId("SIML"),startDate:form.startDate,
  endDate:form.endDate,type:form.leaveType,unit:form.unit,
  quantity:form.unit==="HOURS"?form.fromTime+"-"+form.toTime:check.workingDays+"天",
  employeeId:"TEST001",synthetic:true});
}));
function history(){
 const month=$("month").value,all=db.snapshot(),lines=[];
 all.clock.filter(x=>x.day.startsWith(month)).forEach(x=>lines.push("打卡："+x.day+" "+x.time+" "+x.type));
 all.missed.filter(x=>x.date.startsWith(month)).forEach(x=>lines.push("補卡："+x.date+" "+x.time+" "+x.type+"｜"+x.status));
 all.leave.filter(x=>x.startDate.slice(0,7)===month||x.endDate.slice(0,7)===month)
   .forEach(x=>lines.push("請假："+x.startDate+" 至 "+x.endDate+" "+x.type+"｜"+x.status));
 show("historyResult",lines.length?lines.join("\n"):"這個月份尚無模擬紀錄");
}
$("historyRefresh").addEventListener("click",history);
$("month").addEventListener("change",history);
function hr(){
 const items=$("hrItems");items.textContent="";
 const all=db.snapshot();
 const queues=[...all.leave.filter(x=>x.status==="PENDING").map(x=>({...x,kind:"leave"})),
  ...all.missed.filter(x=>x.status==="PENDING").map(x=>({...x,kind:"missed"}))];
 if(!queues.length){items.textContent="沒有模擬待審核案件";return;}
 queues.forEach(x=>{
  const line=document.createElement("div");line.className="entry";
  const title=document.createElement("div");
  title.textContent=(x.kind==="leave"?"請假":"補打卡")+"｜"+x.id+"｜"+x.status;
  line.appendChild(title);
  for(const [text,decision] of [["模擬核准","APPROVE"],["模擬駁回","REJECT"]]){
   const btn=document.createElement("button");
   btn.type="button";btn.textContent=text;
   btn.addEventListener("click",()=>{
    btn.disabled=true;
    const r=db.review(x.kind,x.id,decision);
    show("historyResult",details(r));hr();
   });
   line.appendChild(btn);
  }
  items.appendChild(line);
 });
}
$("hrRefresh").addEventListener("click",hr);
$("leaveSend").addEventListener("click",()=>Promise.resolve().then(hr));
$("missSend").addEventListener("click",()=>Promise.resolve().then(hr));
hr();
})();
