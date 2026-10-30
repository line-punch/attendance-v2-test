"use strict";
/* Entirely offline synthetic TEST001 journal tests. Google Sheets NOT touched. */
const assert=require("node:assert/strict");
const Journal=require("./V2_BatchAppendJournal.js");
const Core=require("./V2_BatchWorkflowCore.js");
const STAFF={source:"VERIFIED_SERVER_BINDING",active:true,
 employeeId:"TEST001",company:"TEST_CO",role:"STAFF"};
const HR={...STAFF,employeeId:"HR_TEST",role:"HR_OWNER"};
const FROM="2026-10-30T04:30:00.000Z";
const req={
 requestId:"TEST_LEAVE_JOURNAL_20261030_AA",leaveType:"事假",
 startDate:"2026-11-09",endDate:"2026-11-10",unit:"DAY",
 reason:"虛構測試資料"
};
function setup(){
 let rows=[],activeLock=false,queue=Promise.resolve();
 let pendingFault=null,reads=0,appends=0;
 let counter=0;
 const io={
  withExclusive:fn=>{
   const next=queue.then(async()=>{
     if(activeLock)throw Error("SIMULATED_LOCK_CONFLICT");
     activeLock=true;
     try{return await fn()}finally{activeLock=false}
   });
   queue=next.then(()=>{},()=>{});
   return next;
  },
  readRows:async()=>{reads++;return JSON.parse(JSON.stringify(rows));},
  appendRow:async row=>{
   appends++;
   if(pendingFault==="BEFORE_WRITE"){pendingFault=null;throw Error("NET_BEFORE_WRITE")}
   rows.push(JSON.parse(JSON.stringify(row)));
   if(pendingFault==="AFTER_WRITE"){pendingFault=null;throw Error("NET_AFTER_WRITE")}
   if(pendingFault==="READBACK_BAD"){pendingFault="BAD_READ_NEXT"}
  },
  utcNow:()=>new Date(Date.parse(FROM)+counter++*1000).toISOString()
 };
 const store=Journal.make({
  ...io,
  readRows:async()=>{
   if(pendingFault==="BAD_READ_NEXT"){
     pendingFault=null;throw Error("READBACK_NETWORK_UNKNOWN");
   }
   return io.readRows();
  }
 });
 const flags=Object.fromEntries(Core.OPERATIONS.map(x=>[x,true]));
 const core=Core.create({
  flags,store,
  identity:{verify:async token=>token==="STAFF"?STAFF:
    token==="HR"?HR:Promise.reject(Error("NO_LINE_IDENTITY"))},
  calendar:{validateLeave:async()=>({ok:true,workingDays:2})},
  clock:{today:()=>"2026-10-30"}
 });
 const run=(operation,payload={},credential="STAFF")=>
  core.handle({operation,payload,credential});
 return {store,run,raw:()=>rows,addRaw:r=>rows.push(r),
  fail:kind=>{pendingFault=kind},stats:()=>({reads,appends}),
  reset:()=>{rows=[]},io};
}
const tests=[
 ["initial journal decodes empty history",async()=>{
  assert.equal(Journal.decode([]).entries,0);
 }],
 ["first leave and outbox persisted together in ONE ledger row",async()=>{
  const f=setup();const r=await f.run("LEAVE_REQUEST",req);
  assert.equal(r.ok,true);assert.equal(f.raw().length,1);
  assert.equal(f.raw()[0].length,8);
  assert.equal(f.stats().appends,1);
  const decoded=Journal.decode(f.raw());
  assert.equal(decoded.latest.get(req.requestId).status,"PENDING");
  assert.equal(decoded.events.length,1);
  assert.equal(decoded.events[0].type,"LEAVE_SUBMITTED");
 }],
 ["repeat same request is read-only and idempotent",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const r=await f.run("LEAVE_REQUEST",req);
  assert.equal(r.duplicate,true);assert.equal(f.stats().appends,1);
 }],
 ["changed reason with same ID refused",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const r=await f.run("LEAVE_REQUEST",{...req,reason:"NEW"});
  assert.equal(r.code,"REQUEST_ID_CONFLICT");
  assert.equal(f.raw().length,1);
 }],
 ["simultaneous twelve identical submissions create only one row",async()=>{
  const f=setup();const results=await Promise.all(
   Array.from({length:12},()=>f.run("LEAVE_REQUEST",req)));
  assert.equal(results.filter(x=>x.duplicate===false).length,1);
  assert.equal(results.filter(x=>x.duplicate===true).length,11);
  assert.equal(f.raw().length,1);
 }],
 ["review appends one new version and notification together",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const result=await f.run("HR_REVIEW",{requestId:req.requestId,decision:"APPROVE"},"HR");
  assert.equal(result.ok,true);assert.equal(f.raw().length,2);
  assert.equal(f.raw()[1][2],2);
  const parsed=Journal.decode(f.raw());
  assert.equal(parsed.latest.get(req.requestId).status,"APPROVED");
  assert.equal(parsed.events[1].type,"REVIEWED");
 }],
 ["review idempotency does not append second event",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  await f.run("HR_REVIEW",{requestId:req.requestId,decision:"APPROVE"},"HR");
  const r=await f.run("HR_REVIEW",{requestId:req.requestId,decision:"APPROVE"},"HR");
  assert.equal(r.duplicate,true);assert.equal(f.raw().length,2);
 }],
 ["opposing review decisions do not both commit",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const x=await Promise.all([
   f.run("HR_REVIEW",{requestId:req.requestId,decision:"REJECT"},"HR"),
   f.run("HR_REVIEW",{requestId:req.requestId,decision:"APPROVE"},"HR")
  ]);
  assert.equal(x.filter(v=>v.ok).length,1);
  assert.equal(x.filter(v=>v.code==="REVIEW_CONFLICT").length,1);
  assert.equal(f.raw().length,2);
 }],
 ["failure BEFORE write returns UNKNOWN, then same request succeeds",async()=>{
  const f=setup();f.fail("BEFORE_WRITE");
  await assert.rejects(()=>f.run("LEAVE_REQUEST",req),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(f.raw().length,0);
  const after=await f.run("LEAVE_REQUEST",req);
  assert.equal(after.ok,true);assert.equal(f.raw().length,1);
 }],
 ["failure AFTER write returns UNKNOWN but retry detects original row",async()=>{
  const f=setup();f.fail("AFTER_WRITE");
  await assert.rejects(()=>f.run("LEAVE_REQUEST",req),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(f.raw().length,1);
  const after=await f.run("LEAVE_REQUEST",req);
  assert.equal(after.duplicate,true);assert.equal(f.raw().length,1);
 }],
 ["readback failure returns unknown; subsequent read confirms stored row",async()=>{
  const f=setup();f.fail("READBACK_BAD");
  await assert.rejects(()=>f.run("LEAVE_REQUEST",req),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(f.raw().length,1);
  const x=await f.run("LEAVE_STATUS",{requestId:req.requestId});
  assert.equal(x.ok,true);assert.equal(x.request.status,"PENDING");
 }],
 ["malformed journal row blocks status queries",async()=>{
  const f=setup();f.addRaw(["bad"]);await assert.rejects(
    ()=>f.run("LEAVE_STATUS",{requestId:req.requestId}),/LEDGER_FORMAT_UNSAFE/);
 }],
 ["corrupted content hash detected",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  f.raw()[0][4]="tampered";
  await assert.rejects(()=>f.run("LEAVE_STATUS",{requestId:req.requestId}),/LEDGER_CONTENT_MISMATCH/);
 }],
 ["old transaction rows never silently overwritten",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const old=JSON.stringify(f.raw()[0]);
  await f.run("HR_REVIEW",{requestId:req.requestId,decision:"REJECT"},"HR");
  assert.equal(JSON.stringify(f.raw()[0]),old);
 }],
 ["other verified employee cannot query original request",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const status=await f.run("LEAVE_STATUS",{requestId:req.requestId},"BAD");
  assert.equal(status.code,"AUTH_REQUIRED");
 }],
 ["read-only journal transaction forbids data writes",async()=>{
  const f=setup();await assert.rejects(()=>f.store.read(tx=>tx.create({
    kind:"LEAVE",employeeId:"TEST001",company:"TEST_CO",
    status:"PENDING",requestId:req.requestId
  })),/READ_ONLY/);
 }],
 ["orphan outbox alone cannot commit",async()=>{
  const f=setup();await assert.rejects(()=>f.store.transaction(
    tx=>tx.outbox({type:"LEAVE_SUBMITTED",requestId:req.requestId})
  ),/ORPHAN_OUTBOX/);
 }],
 ["row without pending event refuses commit",async()=>{
  const f=setup();const row={kind:"LEAVE",employeeId:"TEST001",
    company:"TEST_CO",requestId:req.requestId,status:"PENDING"};
  await assert.rejects(()=>f.store.transaction(tx=>tx.create(row)),/MULTI_CHANGE_UNSUPPORTED/);
 }],
 ["unknown event kind refuses atomic commit",async()=>{
  const f=setup();await assert.rejects(()=>f.store.transaction(async tx=>{
   await tx.create({kind:"LEAVE",employeeId:"TEST001",company:"TEST_CO",
    requestId:req.requestId,status:"PENDING"});
   await tx.outbox({type:"DELETE_EMPLOYEE",requestId:req.requestId});
  }),/OUTBOX_REQUIRED/);
  assert.equal(f.raw().length,0);
 }],
 ["single-request read never returns another employee",async()=>{
  const f=setup();await f.run("LEAVE_REQUEST",req);
  const list=await f.run("MY_LEAVES",{month:"2026-11"});
  assert.equal(list.total,1);
 }],
 ["no public endpoint and no direct Google/LINE/network operations",async()=>{
  const s=require("node:fs").readFileSync(
   require("node:path").join(__dirname,"V2_BatchAppendJournal.js"),"utf8");
  assert(!/\b(?:doGet|doPost|SpreadsheetApp|UrlFetchApp|liff|fetch)\b/.test(s));
  assert(!/\.(?:setValue|setValues|appendRow)\s*\(/.test(s.replace("await io.appendRow(data)","")));
 }]
];
(async()=>{let passed=0;
 for(const [name,fn] of tests){
  try{await fn();passed++;console.log("PASS",name)}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
 }
 console.log(passed+"/"+tests.length+" PASSED");
})();
