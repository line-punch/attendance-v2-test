"use strict";
const assert=require("node:assert/strict");
const ui=require("./AttendanceV2_SelfLeaveHistory_UIController_NOT_DEPLOYED.js");
const row={requestId:"LEAVEV2_TEST_20261030_0001",leaveType:"事假",
 startDate:"2026-10-30",endDate:"2026-10-30",quantity:"1天",status:"PENDING"};
function mk({enabled=true,auth=true,reply=null,error=null,hold=null}={}){
 let calls=[],views=[];
 const model=ui.create({enabled,isAuthenticated:()=>auth,
  query:async args=>{calls.push(args);if(hold)await hold;if(error)throw error;return reply;},
  onChange:v=>views.push(v)
 });
 return {model,calls,views};
}
const response=(records=[row])=>({
 ok:true,readOnly:true,month:"2026-10",
 availableMonths:["2026-10","2026-09","2026-08"],
 total:records.length,records
});
const checks=[
 ["disabled by default",async()=>{
  const c=mk({enabled:false,reply:response()});
  assert.equal((await c.model.load("2026-10")).phase,"DISABLED");assert.equal(c.calls.length,0);
 }],
 ["unauthenticated user never sends query",async()=>{
  const c=mk({auth:false,reply:response()});
  assert.equal((await c.model.load("2026-10")).phase,"AUTH_REQUIRED");
  assert.equal(c.calls.length,0);
 }],
 ["bad month stops before backend",async()=>{
  const c=mk({reply:response()});assert.equal((await c.model.load("2026/10")).phase,"INVALID_MONTH");
  assert.equal(c.calls.length,0);
 }],
 ["found monthly record shows only safe fields",async()=>{
  const c=mk({reply:response()});const x=await c.model.load("2026-10");
  assert.equal(x.phase,"FOUND");assert.equal(x.rows.length,1);
  assert.deepEqual(Object.keys(x.rows[0]).sort(),["endDate","leaveType","quantity","requestId","startDate","status"]);
 }],
 ["request body only includes month",async()=>{
  const c=mk({reply:response()});await c.model.load("2026-10");
  assert.deepEqual(c.calls,[{month:"2026-10"}]);
 }],
 ["empty month is displayed as empty, not error",async()=>{
  const c=mk({reply:response([])});assert.equal((await c.model.load("2026-10")).phase,"EMPTY");
 }],
 ["unexpected server month cannot be used",async()=>{
  const c=mk({reply:{...response(),month:"2026-09"}});
  assert.equal((await c.model.load("2026-10")).phase,"UNKNOWN");
 }],
 ["month must be in server allowed range",async()=>{
  const c=mk({reply:{...response(),availableMonths:["2026-09","2026-08"]}});
  assert.equal((await c.model.load("2026-10")).phase,"UNKNOWN");
 }],
 ["approval unknown never displayed as approved",async()=>{
  const c=mk({reply:response([{...row,status:"WEIRD"}])});
  assert.equal((await c.model.load("2026-10")).phase,"UNKNOWN");
 }],
 ["count mismatch fails closed",async()=>{
  const c=mk({reply:{...response(),total:7}});
  assert.equal((await c.model.load("2026-10")).phase,"UNKNOWN");
 }],
 ["only allows server known safe summary values",async()=>{
  const c=mk({reply:response([{...row,reason:"confidential",reviewer:"boss",lineUserId:"secret"}])});
  const x=await c.model.load("2026-10");
  assert.equal(x.phase,"FOUND");
  assert(!JSON.stringify(x).includes("confidential"));
  assert(!JSON.stringify(x).includes("secret"));
 }],
 ["transport error never says submission failed",async()=>{
  const c=mk({error:new Error("timeout")});
  assert.equal((await c.model.load("2026-10")).phase,"UNKNOWN");
 }],
 ["authentication failure re-prompts login",async()=>{
  const c=mk({error:Object.assign(new Error("auth"),{code:"AUTH"})});
  assert.equal((await c.model.load("2026-10")).phase,"AUTH_REQUIRED");
 }],
 ["double-click only starts one request",async()=>{
  let release;const hold=new Promise(res=>release=res);
  const c=mk({reply:response(),hold});
  const first=c.model.load("2026-10");
  assert.equal(c.model.isBusy(),true);
  assert.equal((await c.model.load("2026-10")).phase,"BUSY");
  assert.equal(c.calls.length,1);
  release();await first;assert.equal(c.model.isBusy(),false);
 }],
 ["offline module has no network or sheet writes",async()=>{
  const fs=require("node:fs"),path=require("node:path");
  const src=fs.readFileSync(path.join(__dirname,"AttendanceV2_SelfLeaveHistory_UIController_NOT_DEPLOYED.js"),"utf8");
  assert(!/UrlFetchApp|SpreadsheetApp|XMLHttpRequest|doPost|doGet/.test(src));
  assert(!/\.(?:setValue|setValues|appendRow)\s*\(/.test(src));
 }]
];
(async()=>{let pass=0;
 for(const [name,test] of checks){
  try{await test();pass++;console.log("PASS",name);}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
 }
 console.log(pass+"/"+checks.length+" PASSED");
})();
