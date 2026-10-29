"use strict";
/* node staging/AttendanceV2_LeaveStatusAudit_TEST_ONLY.test.js
 * All calls below are mocks. No Google/LINE access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatusAudit_TEST_ONLY.gs"),"utf8");
let hasRow=true,validRow=true,approved=false,blocked=false,extraRow=false,extraCol=false;
const logs=[];
const sheet={
 getLastRow:()=>extraRow?3:2,
 getLastColumn:()=>extraCol?13:12
};
const api=new Function("v2hrReadSyntheticLeaveStatus_TEST_ONLY","v2hrGuardTestSheet_",
  "V2HR_LEAVE_TEMP_TITLE","v2hrLeaveTempCheckSheet_","Logger",
  source+"\nreturn v2hrAuditSyntheticLeaveStatus_TEST_ONLY;")(
  ()=>({ok:true,synthetic:true,readOnly:true,present:hasRow,
    requestId:"LEAVEV2_TEST_20261110_0001"}),
  ()=>{if(blocked)throw Error("sandbox guard refused");return {getSheetByName:()=>sheet};},
  "V2請假寫入測試",
  ()=>validRow?["LEAVEV2_TEST_20261110_0001","TEST001","","事假","","","","",
    approved?"已核准":"待審核（測試）","","",""]:null,
  {log:x=>logs.push(JSON.parse(x))}
);
const tests=[
 ["correct row returns one read-only result",()=>{
   const x=api();assert.equal(x.ok,true);assert.equal(x.present,true);
   assert.equal(x.readOnly,true);assert.equal(x.applicationCount,1);
 }],
 ["no duplicate write implied by row count",()=>{
   assert.equal(api().applicationCount,1);
 }],
 ["absence of existing request rejected",()=>{
   hasRow=false;assert.throws(api,/未確認存在/);hasRow=true;
 }],
 ["wrong status rejected",()=>{
   approved=true;assert.throws(api,/狀態不一致/);approved=false;
 }],
 ["corrupt row rejected",()=>{
   validRow=false;assert.throws(api,/狀態不一致/);validRow=true;
 }],
 ["unexpected third row rejected",()=>{
   extraRow=true;assert.throws(api,/筆數/);extraRow=false;
 }],
 ["unexpected extra column rejected",()=>{
   extraCol=true;assert.throws(api,/欄數/);extraCol=false;
 }],
 ["sandbox guard denial rejected",()=>{
   blocked=true;assert.throws(api,/sandbox guard/);blocked=false;
 }],
 ["no write or public endpoint",()=>{
   assert(!/\.(?:setValues|setValue|appendRow|clearContents|insertSheet)\s*\(/.test(source));
   assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(source));
 }],
 ["log contains only mock request and status",()=>{
   assert(logs.length>=1);assert(!JSON.stringify(logs).includes("idToken"));
 }]
];
let passed=0;
for(const [name,fn] of tests){
 try{fn();passed++;console.log("PASS",name);}
 catch(err){console.error("FAIL",name,err.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
