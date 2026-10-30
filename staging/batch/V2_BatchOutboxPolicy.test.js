"use strict";
const assert=require("node:assert/strict");
const m=require("./V2_BatchOutboxPolicy.js");
const T="2026-10-30T04:00:00.000Z";
const id="TEST_NOTIFICATION_REQ_0001";
function first(kind="LEAVE_SUBMITTED",status=null){
 return m.make({type:kind,requestId:id,status},T).event;
}
const tests=[
 ["consistent leave idempotency key",()=>assert.equal(m.idempotencyKey({type:"LEAVE_SUBMITTED",requestId:id}),"LEAVE_SUBMITTED|"+id+"|PENDING")],
 ["reviewed approved and rejected have distinct keys",()=>{
  const a=m.idempotencyKey({type:"REVIEWED",requestId:id,status:"APPROVED"});
  const b=m.idempotencyKey({type:"REVIEWED",requestId:id,status:"REJECTED"});
  assert.notEqual(a,b);
 }],
 ["invalid ID rejected",()=>assert.equal(m.make({type:"LEAVE_SUBMITTED",requestId:"X"},T).code,"EVENT_INVALID")],
 ["unknown event rejected",()=>assert.equal(m.make({type:"DELETE_ALL",requestId:id},T).code,"EVENT_INVALID")],
 ["new event initially pending",()=>assert.equal(first().state,"PENDING")],
 ["request claim leases for 2 minutes",()=>{
  const r=m.claim(first(),T);assert.equal(r.ok,true);assert.equal(r.event.state,"CLAIMED");
  assert.equal(r.event.attempts,1);assert.equal(r.event.leaseUntil,"2026-10-30T04:02:00.000Z");
 }],
 ["claimed event cannot be claimed concurrently before lease end",()=>{
  const e=m.claim(first(),T).event;
  assert.equal(m.claim(e,"2026-10-30T04:01:00.000Z").code,"LEASE_ACTIVE");
 }],
 ["expired lease allows reclaim only with same event key",()=>{
  const e=m.claim(first(),T).event;
  const r=m.claim(e,"2026-10-30T04:02:01.000Z");assert.equal(r.event.attempts,2);
 }],
 ["wrong event key rejected",()=>{
  const e=first();e.eventKey="FORGED";
  assert.equal(m.claim(e,T).code,"IDEMPOTENCY_KEY_MISMATCH");
 }],
 ["marked SENT does not retry",()=>{
  const e=m.claim(first(),T).event;
  const done=m.complete(e,"2026-10-30T04:00:30.000Z","SENT").event;
  assert.equal(done.state,"SENT");
  assert.equal(m.claim(done,T).code,"NOT_RETRYABLE");
 }],
 ["uncertain network response blocks automatic retry",()=>{
  const e=m.claim(first(),T).event;
  const uncertain=m.complete(e,"2026-10-30T04:00:15.000Z","UNKNOWN").event;
  assert.equal(uncertain.state,"UNCERTAIN");
  assert.equal(m.claim(uncertain,"2026-10-31T04:00:00Z").code,"NOT_RETRYABLE");
 }],
 ["uncertain reconciliation confirmed delivered",()=>{
  const e=m.complete(m.claim(first(),T).event,T,"UNKNOWN").event;
  const r=m.reconcile(e,true);
  assert.equal(r.event.state,"SENT");
 }],
 ["uncertain reconciliation confirmed not delivered",()=>{
  const e=m.complete(m.claim(first(),T).event,T,"UNKNOWN").event;
  const r=m.reconcile(e,false);assert.equal(r.event.state,"PENDING");
 }],
 ["missing reconciliation evidence is blocked",()=>{
  const e=m.complete(m.claim(first(),T).event,T,"UNKNOWN").event;
  assert.equal(m.reconcile(e,null).code,"RECONCILIATION_REQUIRED");
 }],
 ["first known failure delays 30 seconds",()=>{
  const e=m.claim(first(),T).event;
  const r=m.complete(e,T,"CONFIRMED_FAILURE");
  assert.equal(r.event.state,"PENDING");
  assert.equal(r.event.dueAt,"2026-10-30T04:00:30.000Z");
  assert.equal(m.claim(r.event,T).code,"NOT_DUE");
 }],
 ["second known failure backs off 60 seconds",()=>{
  let e=m.claim(first(),T).event;
  e=m.complete(e,T,"CONFIRMED_FAILURE").event;
  e=m.claim(e,"2026-10-30T04:00:30.000Z").event;
  e=m.complete(e,"2026-10-30T04:00:30.000Z","CONFIRMED_FAILURE").event;
  assert.equal(e.dueAt,"2026-10-30T04:01:30.000Z");
 }],
 ["after max attempts known failure moves to DEAD",()=>{
  let e=first();
  let now=Date.parse(T);
  for(let k=0;k<5;k++){
   const iso=new Date(now).toISOString();
   e=m.claim(e,iso).event;
   e=m.complete(e,iso,"CONFIRMED_FAILURE").event;
   if(e.state!=="DEAD")now=Date.parse(e.dueAt);
  }
  assert.equal(e.state,"DEAD");assert.equal(e.attempts,5);
 }],
 ["reviewed event preserves approval idempotency during lease",()=>{
  const e=first("REVIEWED","APPROVED");
  assert.equal(m.claim(e,T).ok,true);
 }],
 ["reviewed event cannot have unknown status",()=>{
  assert.equal(m.make({type:"REVIEWED",requestId:id,status:"OTHER"},T).code,"EVENT_INVALID");
 }],
 ["cannot complete event that has not been leased",()=>{
  assert.equal(m.complete(first(),T,"SENT").code,"NOT_CLAIMED");
 }],
 ["cannot mutate event with invalid outcome",()=>{
  const e=m.claim(first(),T).event;
  assert.equal(m.complete(e,T,"SOMETHING_ELSE").code,"RESULT_INVALID");
 }],
 ["invalid due and lease values fail closed",()=>{
  assert.equal(m.claim({...first(),dueAt:"BAD"},T).code,"INVALID_EVENT");
  const e=m.claim(first(),T).event;
  assert.equal(m.claim({...e,leaseUntil:"BAD"},T).code,"INVALID_EVENT");
 }],
 ["no real LINE push, apps script, credentials or network functions",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const source=fs.readFileSync(path.join(__dirname,"V2_BatchOutboxPolicy.js"),"utf8");
  assert(!/UrlFetchApp|SpreadsheetApp|google\.script|liff\.|pushMessage|fetch\(/.test(source));
  assert(!/\.(?:setValues?|appendRow|insertSheet)\s*\(/.test(source));
 }]
];
let passed=0;
for(const [label,fn] of tests){
 try{fn();passed++;console.log("PASS",label);}
 catch(e){console.error("FAIL",label,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
