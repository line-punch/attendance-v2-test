"use strict";
/* node staging/AttendanceV2_LeaveStatus_UIFlag.test.js
 * Static feature flag + offline UI simulation. No LINE/Google/network calls.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const script=html.split("<script>")[1].split("</script>")[0];
const start=script.indexOf("async function queryTestLeaveStatus(){");
const stop=script.indexOf("async function refreshSandbox(){");
assert(start>=0&&stop>start,"UI query function missing");
const queryCode=script.slice(start,stop);
function instance({enabled=false,verified=false,result=null,error=null,delay=null,apiReady=true}={}){
 const elements={leaveStatusQueryBtn:{disabled:false,textContent:"查詢原模擬假單"},
  leaveStatusResult:{textContent:"尚未查詢"},leaveStatusPane:{hidden:false}};
 const document={getElementById:id=>{if(!elements[id])throw Error("missing mock "+id);return elements[id];}};
 const calls=[];
 const make=new Function("document","query","enabled","verified","apiReady",
  'const $=id=>document.getElementById(id);'+
  'const CONFIG={enableLeaveStatus:enabled,leaveStatusApi:apiReady?"https://script.google.com/macros/s/FAKE_READONLY/exec":"__NOT_CONFIGURED__"};'+
  'const LEAVE_TEST_REQUEST_ID="LEAVEV2_TEST_20261110_0001";'+
  'let leaveStatusBusy=false,leaveTestIdentityVerified=verified;'+
  'const idTokenForTest=()=>"MOCK_ID_TOKEN_NOT_REAL";'+
  'const postForm=query;'+queryCode+
  'return {queryTestLeaveStatus,getBusy:()=>leaveStatusBusy};');
 const fn=make(document,async(operation,payload,endpoint)=>{
   calls.push({operation,payload,endpoint});
   if(delay)await delay;
   if(error)throw error;
   return result;
 },enabled,verified,apiReady);
 return {elements,calls,...fn};
}
const fixedId="LEAVEV2_TEST_20261110_0001";
const reply={ok:true,synthetic:true,readOnly:true,found:true,
 requestId:fixedId,status:"PENDING_REVIEW_TEST"};
const tests=[
 ["existing GPS test remains enabled in candidate branch",async()=>{
   assert(script.includes("enableClock:true"));
   assert(script.includes("enableTodayQuery:true"));
 }],
 ["new leave query remains disabled by default",async()=>{
   assert(script.includes("enableLeaveStatus:false"));
   assert(html.includes('id="leaveStatusPane" class="section" hidden'));
 }],
 ["identity refresh hides any stale leave query before server confirmation",async()=>{
   assert(script.includes('async function refreshSandbox(){'));
   assert(script.includes('leaveTestIdentityVerified=false;\n  $("leaveStatusPane").hidden=true;'));
   assert(script.includes('leaveTestIdentityVerified=false;\n    $("leaveStatusPane").hidden=true;'));
 }],
 ["no backend request when flag disabled",async()=>{
   const ui=instance({enabled:false,verified:true,result:reply});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,0);
   assert(ui.elements.leaveStatusResult.textContent.includes("尚未開放"));
 }],
 ["independent service URL remains unconfigured in GitHub candidate",async()=>{
   assert(script.includes('leaveStatusApi:"__NOT_CONFIGURED__"'));
 }],
 ["flag on, but no standalone API URL: no backend request",async()=>{
   const ui=instance({enabled:true,verified:true,result:reply,apiReady:false});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,0);
   assert(ui.elements.leaveStatusResult.textContent.includes("尚未配置"));
 }],
 ["leave query never uses original GPS data service",async()=>{
   const ui=instance({enabled:true,verified:true,result:reply});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,1);
   assert(!ui.calls[0].endpoint.includes("AKfycbwifAR8K"));
 }],
 ["identity not verified prevents query even if enabled",async()=>{
   const ui=instance({enabled:true,verified:false,result:reply});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,0);
   assert(ui.elements.leaveStatusResult.textContent.includes("先完成"));
 }],
 ["verified TEST001 query returns found message",async()=>{
   const ui=instance({enabled:true,verified:true,result:reply});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,1);
   assert.deepEqual(ui.calls[0],{operation:"leaveStatus",payload:{idToken:"MOCK_ID_TOKEN_NOT_REAL",requestId:fixedId},endpoint:"https://script.google.com/macros/s/FAKE_READONLY/exec"});
   assert(ui.elements.leaveStatusResult.textContent.includes("已確認"));
   assert.equal(ui.getBusy(),false);
   assert.equal(ui.elements.leaveStatusQueryBtn.disabled,false);
 }],
 ["not found response never asserts failure",async()=>{
   const ui=instance({enabled:true,verified:true,result:{...reply,found:false,status:"NOT_FOUND_YET"}});
   await ui.queryTestLeaveStatus();
   assert(ui.elements.leaveStatusResult.textContent.includes("不等於送單失敗"));
 }],
 ["mismatched request ID rejects server response",async()=>{
   const ui=instance({enabled:true,verified:true,result:{...reply,requestId:"WRONG"}});
   await ui.queryTestLeaveStatus();
   assert(ui.elements.leaveStatusResult.textContent.includes("未確認"));
 }],
 ["non-readonly response not accepted",async()=>{
   const ui=instance({enabled:true,verified:true,result:{...reply,readOnly:false}});
   await ui.queryTestLeaveStatus();
   assert(ui.elements.leaveStatusResult.textContent.includes("未確認"));
 }],
 ["timeout leaves original request safe",async()=>{
   const ui=instance({enabled:true,verified:true,error:new Error("TIMEOUT")});
   await ui.queryTestLeaveStatus();
   assert(ui.elements.leaveStatusResult.textContent.includes("結果不明"));
   assert.equal(ui.calls.length,1);
 }],
 ["auth failure hides TEST001 panel",async()=>{
   const ui=instance({enabled:true,verified:true,error:Object.assign(new Error("AUTH"),{code:"AUTH"})});
   await ui.queryTestLeaveStatus();
   assert.equal(ui.elements.leaveStatusPane.hidden,true);
 }],
 ["clicks while running cannot dispatch a second query",async()=>{
   let release;const hold=new Promise(done=>{release=done;});
   const ui=instance({enabled:true,verified:true,result:reply,delay:hold});
   const first=ui.queryTestLeaveStatus();
   assert.equal(ui.getBusy(),true);
   assert.equal(ui.elements.leaveStatusQueryBtn.disabled,true);
   await ui.queryTestLeaveStatus();
   assert.equal(ui.calls.length,1);
   release();await first;
   assert.equal(ui.getBusy(),false);
 }],
 ["candidate UI sends only bearer ID Token and fixed mock requestId",async()=>{
   const ui=instance({enabled:true,verified:true,result:reply});
   await ui.queryTestLeaveStatus();
   const keys=Object.keys(ui.calls[0].payload);
   assert.deepEqual(keys,["idToken","requestId"]);
 }]
];
(async()=>{
 let passed=0;
 for(const [label,run] of tests){
  try{await run();passed++;console.log("PASS",label);}
  catch(err){console.error("FAIL",label,err.stack);process.exitCode=1;}
 }
 console.log(passed+"/"+tests.length+" PASSED");
})();
