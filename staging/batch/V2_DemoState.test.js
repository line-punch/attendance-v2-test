"use strict";
/* Offline synthetic store. Never connects to attendance production data. */
const assert=require("node:assert/strict");
const api=require("./V2_DemoState.js"),db=api.create();
function row(kind,id,detail={}){return db.add(kind,{id,...detail});}
const tests=[
 ["initial state is synthetic",()=>assert.equal(db.snapshot().synthetic,true)],
 ["initial leave and missed queues empty",()=>{assert.equal(db.snapshot().leave.length,0);assert.equal(db.snapshot().missed.length,0)}],
 ["invalid ID blocked",()=>assert.equal(row("leave","X").code,"INVALID_ID")],
 ["first leave recorded pending",()=>{const r=row("leave","SIML-20261030",{employeeId:"TEST001"});assert.equal(r.item.status,"PENDING");assert.equal(r.duplicate,false)}],
 ["same leave ID idempotent",()=>{const r=row("leave","SIML-20261030");assert.equal(r.duplicate,true);assert.equal(db.snapshot().leave.length,1)}],
 ["another synthetic leave allowed",()=>{row("leave","SIML-20261031");assert.equal(db.snapshot().leave.length,2)}],
 ["synthetic missed punch recorded",()=>{const r=row("missed","SIMM-20261030");assert.equal(r.ok,true);assert.equal(db.snapshot().missed.length,1)}],
 ["synthetic clock supports one record only per fake ID",()=>{row("clock","MOCKCLOCK-上班");assert.equal(row("clock","MOCKCLOCK-上班").duplicate,true)}],
 ["HR approval changes pending to approved",()=>{const r=db.review("leave","SIML-20261030","APPROVE");assert.equal(r.ok,true);assert.equal(db.snapshot().leave[0].status,"APPROVED")}],
 ["duplicate approval does not change record",()=>assert.equal(db.review("leave","SIML-20261030","APPROVE").duplicate,true)],
 ["reject after approval blocked",()=>assert.equal(db.review("leave","SIML-20261030","REJECT").code,"ALREADY_REVIEWED")],
 ["HR can reject second pending leave",()=>{const r=db.review("leave","SIML-20261031","REJECT");assert.equal(r.ok,true);assert.equal(db.snapshot().leave[1].status,"REJECTED")}],
 ["missing-punch approval supported",()=>{const r=db.review("missed","SIMM-20261030","APPROVE");assert.equal(r.ok,true)}],
 ["invalid review type blocked",()=>assert.equal(db.review("clock","MOCKCLOCK-上班","APPROVE").code,"INVALID_COLLECTION")],
 ["unknown request review blocked",()=>assert.equal(db.review("leave","MISSING","APPROVE").code,"NOT_FOUND")],
 ["invalid decision blocked",()=>assert.equal(db.review("leave","SIML-20261030","HACK").code,"INVALID_CHOICE")],
 ["snapshot is separate object (no shared mutable state)",()=>{const before=db.snapshot();before.leave.length=0;assert.equal(db.snapshot().leave.length,2)}],
 ["no actual credentials, GPS, LINE or spreadsheet methods",()=>{
  const src=require("node:fs").readFileSync(require("node:path").join(__dirname,"V2_DemoState.js"),"utf8");
  assert(!/UrlFetchApp|SpreadsheetApp|navigator\.geolocation|liff\.|google\.script\.run/.test(src));
  assert(!/\.(?:setValue|setValues|appendRow)\s*\(/.test(src));
 }]
];
let passed=0;for(const [name,fn] of tests)try{fn();passed++;console.log("PASS",name)}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
console.log(passed+"/"+tests.length+" PASSED");
