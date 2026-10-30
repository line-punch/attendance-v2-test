"use strict";
/** Entirely synthetic end-to-end integration:
 * verified TEST001 -> business Core -> append-only journal -> legacy rows,
 * without real Apps Script, LINE, Google Sheets or payroll data.
 */
const assert=require("node:assert/strict");
const Core=require("./V2_BatchWorkflowCore.js");
const Journal=require("./V2_BatchAppendJournal.js");
const Projection=require("./V2_BatchLegacyRows_READONLY.js");
const verified={
 source:"VERIFIED_SERVER_BINDING",active:true,employeeId:"TEST001",
 company:"TEST_CO",role:"STAFF",displayName:"模擬員工甲"
};
const reviewer={...verified,employeeId:"HR_TEST",role:"HR_OWNER",displayName:"虛構人資"};
const other={...verified,employeeId:"TEST002",displayName:"其他測試員工"};
const TEST_DATE="2026-10-30";
const leave={requestId:"TEST_BATCH_LEAVE_20261030_001",leaveType:"事假",
 startDate:"2026-11-09",endDate:"2026-11-10",unit:"DAY",reason:"純模擬原因"};
const missed={requestId:"TEST_BATCH_MISSED_20261030_001",date:"2026-10-30",
 time:"08:30",type:"上班",reason:"純模擬忘記打卡"};
function build(){
 const rows=[];let lock=Promise.resolve(),fault=null,writes=0;
 const port={
  withExclusive:fn=>{
   const p=lock.then(fn,fn);lock=p.then(()=>{},()=>{});
   return p;
  },
  readRows:async()=>rows.map(r=>r.slice()),
  appendRow:async r=>{
   writes++;if(fault==="BEFORE"){fault=null;throw Error("transport before write")}
   rows.push(r.slice());
   if(fault==="AFTER"){fault=null;throw Error("transport after write")}
  },
  utcNow:()=>"2026-10-30T07:00:00.000Z"
 };
 const store=Journal.make(port);
 const core=Core.create({
   identity:{verify:async credential=>credential==="STAFF"?verified:
     credential==="HR"?reviewer:credential==="OTHER"?other:
       Promise.reject(Error("NOT_AUTHENTICATED"))},
   store,
   calendar:{validateLeave:async data=>{
     if(data.startDate==="2026-11-11")return {ok:false,code:"NON_WORKDAY"};
     return {ok:true,workingDays:data.startDate===data.endDate?1:2};
   }},
   clock:{today:()=>TEST_DATE},
   flags:Object.fromEntries(Core.OPERATIONS.map(x=>[x,true]))
 });
 return {store,core,rows,writes:()=>writes,inject:v=>{fault=v},
  call:(operation,payload,credential="STAFF")=>
   core.handle({operation,payload,credential})};
}
const checks=[
 ["leave writes a single technical row and outbox event",async()=>{
  const f=build();const r=await f.call("LEAVE_REQUEST",leave);
  assert.equal(r.ok,true);assert.equal(f.rows.length,1);
  const j=Journal.decode(f.rows);
  assert.equal(j.events.length,1);
 }],
 ["server-validated two working days project to existing G column",async()=>{
  const f=build();await f.call("LEAVE_REQUEST",leave);
  const data=await f.store.read(tx=>tx.find(leave.requestId));
  const row=Projection.transform(data,verified);
  assert.equal(row.ok,true);assert.equal(row.targetSchema,"LEAVE_12");
  assert.equal(row.values[6],"2天");
 }],
 ["HR review projects approved status in legacy I column",async()=>{
  const f=build();await f.call("LEAVE_REQUEST",leave);
  await f.call("HR_REVIEW",{requestId:leave.requestId,decision:"APPROVE"},"HR");
  const x=await f.store.read(tx=>tx.find(leave.requestId));
  const result=Projection.transform(x,verified);
  assert.equal(result.values[8],"已核准");
  assert.equal(f.rows.length,2);
 }],
 ["same approval request repeated never generates third technical row",async()=>{
  const f=build();await f.call("LEAVE_REQUEST",leave);
  const args={requestId:leave.requestId,decision:"APPROVE"};
  await f.call("HR_REVIEW",args,"HR");
  const r=await f.call("HR_REVIEW",args,"HR");
  assert.equal(r.duplicate,true);assert.equal(f.rows.length,2);
 }],
 ["missing punch projects company at E and 上班 at F",async()=>{
  const f=build();await f.call("MISSING_REQUEST",missed);
  const r=await f.store.read(tx=>tx.find(missed.requestId));
  const x=Projection.transform(r,verified);
  assert.equal(x.targetSchema,"MISSING_11");
  assert.equal(x.values[4],"TEST_CO");assert.equal(x.values[5],"上班");
 }],
 ["other employee cannot query stored request",async()=>{
  const f=build();await f.call("LEAVE_REQUEST",leave);
  const r=await f.call("LEAVE_STATUS",{requestId:leave.requestId},"OTHER");
  assert.equal(r.code,"NOT_FOUND");
 }],
 ["unknown write outcome is resolved by original request lookup",async()=>{
  const f=build();f.inject("AFTER");
  await assert.rejects(()=>f.call("LEAVE_REQUEST",leave),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(f.rows.length,1);
  const found=await f.call("LEAVE_STATUS",{requestId:leave.requestId});
  assert.equal(found.ok,true);
  const again=await f.call("LEAVE_REQUEST",leave);
  assert.equal(again.duplicate,true);assert.equal(f.rows.length,1);
 }],
 ["changed leave data with same ID cannot overwrite original",async()=>{
  const f=build();await f.call("LEAVE_REQUEST",leave);
  const r=await f.call("LEAVE_REQUEST",{...leave,reason:"DIFFERENT_REASON"});
  assert.equal(r.code,"REQUEST_ID_CONFLICT");assert.equal(f.rows.length,1);
 }],
 ["no real LINE push or Google write in integrated source files",async()=>{
  const fs=require("node:fs"),path=require("node:path");
  for(const filename of ["V2_BatchWorkflowCore.js","V2_BatchAppendJournal.js",
    "V2_BatchLegacyRows_READONLY.js"]){
   const s=fs.readFileSync(path.join(__dirname,filename),"utf8");
   assert(!/\b(?:SpreadsheetApp|UrlFetchApp)\b/.test(s));
  }
 }]
];
(async()=>{let pass=0;
 for(const [name,fn] of checks)try{await fn();pass++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
 console.log(pass+"/"+checks.length+" PASSED");
})();
