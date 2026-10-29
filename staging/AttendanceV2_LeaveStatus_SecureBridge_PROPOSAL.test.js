"use strict";
/* node staging/AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.test.js
 * Uses only fake TEST001 records; no deployed GAS or network calls.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.gs"),"utf8");
const ID="LEAVEV2_TEST_20261110_0001";
const sheet={exists:true,row:true};
const ss={getSheetByName:()=>sheet};
let testGuard=true,validSession=true,rowsRead=0;
const fn=new Function("v2hrGuardTestSheet_","v2dEmployee_",
  "V2HR_LEAVE_TEMP_REQUEST","V2HR_LEAVE_TEMP_TITLE","v2hrLeaveTempCheckSheet_",
  source+"\nreturn v2hrLeaveStatusForVerifiedTester_TEST_ONLY_;")(
  ()=>{if(!testGuard)throw Error("test guard disabled");return ss;},
  (_,lineUserId)=>validSession&&lineUserId==="MOCK-LINE"
    ?{bound:true,employeeId:"TEST001"}:{bound:false},
  ID,"V2請假寫入測試",
  sh=>{rowsRead++;return sh.row?["dummy row"]:null;}
);
const calls=[
 ["valid TEST001 authenticated query returns a read-only status",()=>{
   const x=fn(ss,"MOCK-LINE",{idToken:"TOKEN NEVER ECHOED",requestId:ID});
   assert.equal(x.found,true);assert.equal(x.readOnly,true);
   assert.equal(x.status,"PENDING_REVIEW_TEST");
   assert(!JSON.stringify(x).includes("TOKEN"));
 }],
 ["unknown request ID is rejected",()=>{
   assert.throws(()=>fn(ss,"MOCK-LINE",{requestId:"OTHER"}),/非此模擬/);
 }],
 ["client employeeId override is rejected",()=>{
   assert.throws(()=>fn(ss,"MOCK-LINE",{requestId:ID,employeeId:"TEST002"}),/未授權欄位/);
 }],
 ["client company override is rejected",()=>{
   assert.throws(()=>fn(ss,"MOCK-LINE",{requestId:ID,company:"TEST_OTHER"}),/未授權欄位/);
 }],
 ["client sheet ID override is rejected",()=>{
   assert.throws(()=>fn(ss,"MOCK-LINE",{requestId:ID,spreadsheetId:"REAL"}),/未授權欄位/);
 }],
 ["unbound LINE identity is rejected",()=>{
   const before=rowsRead;
   assert.throws(()=>fn(ss,"OTHER-LINE",{requestId:ID}),/身分驗證/);
   assert.equal(rowsRead,before);
 }],
 ["disabled sandbox guard rejects request",()=>{
   testGuard=false;assert.throws(()=>fn(ss,"MOCK-LINE",{requestId:ID}),/test guard disabled/);testGuard=true;
 }],
 ["foreign spreadsheet object is rejected",()=>{
   assert.throws(()=>fn({getSheetByName:()=>sheet},"MOCK-LINE",{requestId:ID}),/資料表權限/);
 }],
 ["not-yet-found result does not claim failed write",()=>{
   sheet.row=false;const x=fn(ss,"MOCK-LINE",{requestId:ID});
   assert.equal(x.status,"NOT_FOUND_YET");assert.equal(x.found,false);
   sheet.row=true;
 }],
 ["missing test sheet returns not found yet, not persisted-false",()=>{
   const old=ss.getSheetByName;ss.getSheetByName=()=>null;
   const x=fn(ss,"MOCK-LINE",{requestId:ID});assert.equal(x.found,false);
   ss.getSheetByName=old;
 }],
 ["bad payload is rejected",()=>{
   assert.throws(()=>fn(ss,"MOCK-LINE",null),/無效/);
 }],
 ["no new public routes, writes, notifications or token exposure",()=>{
   assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(source));
   assert(!/\.(?:appendRow|setValue|setValues|insertSheet|deleteRow|clearContents)\s*\(/.test(source));
   assert(!/\b(?:UrlFetchApp|pushMessage|replyMessage|SpreadsheetApp\.openById)\b/.test(source));
 }]
];
let passed=0;
for(const [name,call] of calls){
 try{call();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+calls.length+" PASSED");
