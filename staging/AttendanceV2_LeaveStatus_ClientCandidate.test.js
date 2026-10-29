"use strict";
/* node staging/AttendanceV2_LeaveStatus_ClientCandidate.test.js
 * No browser network, storage, LINE or real Google Apps Script.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const api=require("./AttendanceV2_LeaveStatus_ClientCandidate.js");
const id="LEAVEV2_TEST_20261110_0001";
let authenticated=true,response=null,error=null,calls=[],messages=[],delay=null;
function controller(){
 return api.create({
   isAuthenticated:()=>authenticated,
   query:async input=>{
     calls.push(input);if(delay)await delay;
     if(error)throw error;
     return response;
   },
   onChange:state=>messages.push(state)
 });
}
const found=()=>({ok:true,synthetic:true,readOnly:true,found:true,requestId:id,status:"PENDING_REVIEW_TEST"});
const notYet=()=>({ok:true,synthetic:true,readOnly:true,found:false,requestId:id,status:"NOT_FOUND_YET"});
const tests=[
 ["found result shows confirmed record",async()=>{
   response=found();const c=controller(),r=await c.queryLeave(id);
   assert.equal(r.state,"FOUND");assert.equal(c.getState().state,"FOUND");
   assert.equal(messages.at(-1).state,"FOUND");
 }],
 ["query sends only request ID, no client-supplied identity",async()=>{
   assert.deepEqual(calls.at(-1),{requestId:id});
 }],
 ["not yet found never implies submission failure",async()=>{
   response=notYet();const r=await controller().queryLeave(id);
   assert.equal(r.state,"NOT_FOUND_YET");
   assert(r.message.includes("不表示送單失敗"));
 }],
 ["unexpected mismatched request ID means unknown",async()=>{
   response={...found(),requestId:"LEAVEV2_TEST_OTHER"};
   assert.equal((await controller().queryLeave(id)).state,"UNKNOWN");
 }],
 ["non-readonly response means unknown",async()=>{
   response={...found(),readOnly:false};
   assert.equal((await controller().queryLeave(id)).state,"UNKNOWN");
 }],
 ["server errors do not tell user to re-submit",async()=>{
   response=null;error=new Error("NETWORK");
   const state=await controller().queryLeave(id);
   assert.equal(state.state,"UNKNOWN");
   assert(state.message.includes("結果不明"));
   error=null;
 }],
 ["auth failures request re-authentication",async()=>{
   error=Object.assign(new Error("auth"),{code:"AUTH"});
   assert.equal((await controller().queryLeave(id)).state,"AUTH_REQUIRED");
   error=null;
 }],
 ["no auth prevents request dispatch",async()=>{
   authenticated=false;const before=calls.length;
   assert.equal((await controller().queryLeave(id)).state,"AUTH_REQUIRED");
   assert.equal(calls.length,before);
   authenticated=true;
 }],
 ["invalid test ID prevents request dispatch",async()=>{
   const before=calls.length;
   assert.equal((await controller().queryLeave("BAD_ID")).state,"INVALID_ID");
   assert.equal(calls.length,before);
 }],
 ["busy button cannot issue two concurrent requests",async()=>{
   response=found();let release;
   delay=new Promise(resolve=>release=resolve);
   const c=controller();const pending=c.queryLeave(id);
   assert.equal(c.isBusy(),true);
   const busy=await c.queryLeave(id);
   assert.equal(busy.state,"BUSY");
   release();await pending;delay=null;
   assert.equal(c.isBusy(),false);
 }],
 ["invalid payload result remains unknown",async()=>{
   response={ok:false};
   assert.equal((await controller().queryLeave(id)).state,"UNKNOWN");
 }],
 ["controller has no network/secret/storage calls",async()=>{
   const s=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_ClientCandidate.js"),"utf8");
   assert(!/\b(?:fetch|XMLHttpRequest|sessionStorage|localStorage|navigator\.geolocation)\b/.test(s));
   assert(!/\b(?:idToken|spreadsheetId|accessToken|secret)\s*:/.test(s));
 }]
];
(async()=>{let passed=0;
  for(const [name,fn] of tests)try{await fn();passed++;console.log("PASS",name);}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
  console.log(passed+"/"+tests.length+" PASSED");
})();
