"use strict";
/* Offline test: serialized transaction semantics and secure workflow core. */
const assert=require("node:assert/strict");
const Store=require("./V2_BatchTestStore.js");
const Core=require("./V2_BatchWorkflowCore.js");
const testPrincipal={source:"VERIFIED_SERVER_BINDING",verified:true,
  active:true,employeeId:"TEST001",company:"TEST_CO",role:"STAFF"};
const reviewer={...testPrincipal,employeeId:"HR_TEST",role:"HR_OWNER"};
const request={
 requestId:"TESTREQ_LEAVE_20261030_0101",leaveType:"事假",
 startDate:"2026-11-09",endDate:"2026-11-10",unit:"DAY",reason:"模擬"
};
function make(){
 const store=Store.create();
 const flags=Object.fromEntries(Core.OPERATIONS.map(x=>[x,true]));
 const core=Core.create({
  flags,store,
  identity:{verify:async credential=>{
    if(credential==="STAFF")return testPrincipal;
    if(credential==="HR")return reviewer;
    throw Error("bad credential");
  }},
  calendar:{validateLeave:async()=>({ok:true,workingDays:2})},
  clock:{today:()=>"2026-10-30"}
 });
 return {store,core,call:(operation,payload,credential="STAFF")=>
  core.handle({operation,payload,credential})};
}
const wait=()=>new Promise(resolve=>Promise.resolve().then(resolve));
const tests=[
 ["initial TEST001 store empty",async()=>{
  const s=Store.create().testSnapshot();
  assert.equal(s.requests.length,0);assert.equal(s.outbox.length,0);
 }],
 ["core creates one leave plus outbox event",async()=>{
  const x=make();const r=await x.call("LEAVE_REQUEST",request);
  assert.equal(r.ok,true);assert.equal(x.store.testSnapshot().requests.length,1);
  assert.equal(x.store.testSnapshot().outbox.length,1);
 }],
 ["core leaves are idempotent even with simultaneous calls",async()=>{
  const x=make();const r=await Promise.all(
    Array.from({length:12},()=>x.call("LEAVE_REQUEST",request)));
  assert.equal(r.filter(x=>x.duplicate===false).length,1);
  assert.equal(r.filter(x=>x.duplicate===true).length,11);
  assert.equal(x.store.testSnapshot().requests.length,1);
  assert.equal(x.store.testSnapshot().outbox.length,1);
 }],
 ["conflicting parallel payloads cannot overwrite original",async()=>{
  const x=make();
  const variants=[request,{...request,reason:"DIFFERENT"}];
  const r=await Promise.all(variants.map(p=>x.call("LEAVE_REQUEST",p)));
  assert.equal(r.filter(z=>z.ok).length,1);
  assert.equal(r.filter(z=>z.code==="REQUEST_ID_CONFLICT").length,1);
  assert.equal(x.store.testSnapshot().requests.length,1);
 }],
 ["reviewing and querying in parallel leaves a coherent state",async()=>{
  const x=make();await x.call("LEAVE_REQUEST",request);
  const [r,s]=await Promise.all([
    x.call("HR_REVIEW",{requestId:request.requestId,decision:"APPROVE"},"HR"),
    x.call("LEAVE_STATUS",{requestId:request.requestId})
  ]);
  assert.equal(r.ok,true);assert(s.request.status==="APPROVED"||s.request.status==="PENDING");
  assert.equal(x.store.testSnapshot().requests[0].status,"APPROVED");
 }],
 ["same decision from two HR calls generates one reviewed event",async()=>{
  const x=make();await x.call("LEAVE_REQUEST",request);
  const results=await Promise.all(
   Array.from({length:4},()=>x.call("HR_REVIEW",
    {requestId:request.requestId,decision:"APPROVE"},"HR")));
  assert.equal(results.filter(z=>z.duplicate===false).length,1);
  assert.equal(x.store.testSnapshot().outbox.filter(z=>z.type==="REVIEWED").length,1);
 }],
 ["opposing review decisions never both commit",async()=>{
  const x=make();await x.call("LEAVE_REQUEST",request);
  const results=await Promise.all([
   x.call("HR_REVIEW",{requestId:request.requestId,decision:"APPROVE"},"HR"),
   x.call("HR_REVIEW",{requestId:request.requestId,decision:"REJECT"},"HR")
  ]);
  assert.equal(results.filter(z=>z.ok).length,1);
  assert.equal(results.filter(z=>z.code==="REVIEW_CONFLICT").length,1);
 }],
 ["all staff data remains scoped to current verified person",async()=>{
  const x=make();await x.call("LEAVE_REQUEST",request);
  const r=await x.call("LEAVE_STATUS",{requestId:request.requestId},"BAD");
  assert.equal(r.code,"AUTH_REQUIRED");
 }],
 ["transaction failure rolls back all changes",async()=>{
  const s=Store.create();
  await assert.rejects(()=>s.transaction(async tx=>{
   await tx.create({kind:"LEAVE",employeeId:"TEST001",requestId:"ROLLBACK_TEST_A"});
   await tx.outbox({type:"INVALID",requestId:"ROLLBACK_TEST_A"});
  }),/UNRECOGNIZED/);
  assert.equal(s.testSnapshot().requests.length,0);
  assert.equal(s.testSnapshot().outbox.length,0);
 }],
 ["transaction failure does not poison later transaction",async()=>{
  const s=Store.create();
  await assert.rejects(()=>s.transaction(async()=>{throw Error("bad")}),/bad/);
  await s.transaction(tx=>tx.create({
   kind:"MISSING",employeeId:"TEST001",requestId:"RECOVER_TEST_002"}));
  assert.equal(s.testSnapshot().requests.length,1);
 }],
 ["write is rejected from read-only snapshot",async()=>{
  const s=Store.create();
  await assert.rejects(()=>s.read(tx=>tx.create({
    kind:"LEAVE",employeeId:"TEST001",requestId:"FORBIDDEN_TEST_ID"})),/READ_ONLY/);
  assert.equal(s.testSnapshot().requests.length,0);
 }],
 ["read returns immutable clone of test state",async()=>{
  const s=Store.create();
  await s.transaction(tx=>tx.create({
    kind:"LEAVE",employeeId:"TEST001",requestId:"CLONE_TEST_0001"}));
  const rows=await s.read(tx=>tx.list());rows[0].employeeId="HACK";
  assert.equal(s.testSnapshot().requests[0].employeeId,"TEST001");
 }],
 ["cannot create same request twice in separate store call",async()=>{
  const s=Store.create(),r={kind:"LEAVE",employeeId:"TEST001",requestId:"SAME_TEST_0001"};
  await s.transaction(tx=>tx.create(r));
  await assert.rejects(()=>s.transaction(tx=>tx.create(r)),/DUPLICATE/);
  assert.equal(s.testSnapshot().requests.length,1);
 }],
 ["cannot change owner or type on update",async()=>{
  const s=Store.create();
  const item={kind:"LEAVE",employeeId:"TEST001",requestId:"LOCK_TEST_0001"};
  await s.transaction(tx=>tx.create(item));
  await assert.rejects(()=>s.transaction(tx=>tx.replace({...item,employeeId:"TEST002"})),/IMMUTABLE/);
  await assert.rejects(()=>s.transaction(tx=>tx.replace({...item,kind:"MISSING"})),/IMMUTABLE/);
  assert.equal(s.testSnapshot().requests[0].employeeId,"TEST001");
 }],
 ["request commit always includes pending outbox marker",async()=>{
  const x=make();await x.call("LEAVE_REQUEST",request);
  assert.equal(x.store.testSnapshot().outbox[0].delivery,"PENDING");
 }],
 ["stores remain isolated per invocation",async()=>{
  const a=Store.create(),b=Store.create();
  await a.transaction(tx=>tx.create({kind:"LEAVE",employeeId:"TEST001",requestId:"ISOLATED_001"}));
  assert.equal(b.testSnapshot().requests.length,0);
 }],
 ["no real Sheets, API or server endpoint methods",async()=>{
  const fs=require("node:fs"),path=require("node:path");
  const c=fs.readFileSync(path.join(__dirname,"V2_BatchTestStore.js"),"utf8");
  assert(!/\b(?:SpreadsheetApp|UrlFetchApp|doPost|doGet|fetch)\b/.test(c));
  assert(!/\.(?:appendRow|setValue|setValues|insertSheet)\s*\(/.test(c));
 }]
];
(async()=>{let pass=0;
for(const [name,fn] of tests)try{await fn();pass++;console.log("PASS",name);}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
console.log(pass+"/"+tests.length+" PASSED");
})();
