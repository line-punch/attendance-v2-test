"use strict";
/* node staging/AttendanceV2_LeaveStatus_DispatchCandidate_TEST_ONLY.test.js
 * Offline fake-server suite. Does NOT call LINE/Google or change Apps Script.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const proposal=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.gs"),"utf8");
const router=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_DispatchCandidate_TEST_ONLY.gs"),"utf8");
const nonce="a".repeat(40),requestId="LEAVEV2_TEST_20261110_0001";
const bookId="TEST_BOOK_FIXED_ID_NOT_REAL",testTitle="YC_ATTENDANCE_V2_TEST_ONLY";
const sheet={rowPresent:true};
const book={getId:()=>bookId,getName:()=>testTitle,getSheetByName:()=>sheet};
let verifiedCalls=0,allowed=true,bind=true,lookupCalls=0,guardCalls=0;
const helpers={
  v2hrGuardTestSheet_:()=>{
    guardCalls++;
    if(!allowed)throw Error("TEST001 access disabled");
    return {getId:()=>bookId,getName:()=>testTitle,getSheetByName:()=>sheet};
  },
  v2dLineClaims_:token=>{
    verifiedCalls++;
    if(token!=="mockjwt.syntheticclaims.not-a-real-signature")throw Error("LINE invalid");
    return "MOCK-LINE";
  },
  v2dEmployee_:(_,userId)=>bind && userId==="MOCK-LINE"?
    {bound:true,employeeId:"TEST001"}:{bound:false},
  V2HR_LEAVE_TEMP_REQUEST:requestId,
  V2HR_LEAVE_TEMP_TITLE:"V2請假寫入測試",
  v2hrLeaveTempCheckSheet_:()=>{
    lookupCalls++;
    return sheet.rowPresent?["MOCK DATA"]:null;
  }
};
const api=new Function(...Object.keys(helpers),proposal+"\n"+router+
  "\nreturn v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_;")(...Object.values(helpers));
const input=(overrides={})=>({
  nonce,operation:"leaveStatus",
  payload:JSON.stringify({idToken:"mockjwt.syntheticclaims.not-a-real-signature",requestId}),
  ...overrides
});
const cases=[
 ["valid LINE verified TEST001 returns status",()=>{
  const x=api(input());assert.equal(x.nonce,nonce);assert.equal(x.result.found,true);
  assert.equal(x.result.readOnly,true);assert.equal(x.result.status,"PENDING_REVIEW_TEST");
  assert(!JSON.stringify(x).includes("TEST-ID-TOKEN"));
 }],
 ["same sheet ID with fresh wrapper works",()=>{
  assert.equal(api(input()).result.found,true);
 }],
 ["missing/nonexistent request returns unconfirmed rather than failed",()=>{
  sheet.rowPresent=false;const x=api(input());assert.equal(x.result.found,false);
  assert.equal(x.result.status,"NOT_FOUND_YET");sheet.rowPresent=true;
 }],
 ["unknown operation blocked before token verification",()=>{
  const before=verifiedCalls;assert.throws(()=>api(input({operation:"clock"})),/不支援/);
  assert.equal(verifiedCalls,before);
 }],
 ["invalid nonce blocked before token verification",()=>{
  const before=verifiedCalls;assert.throws(()=>api(input({nonce:"bad"})),/回覆編號/);
  assert.equal(verifiedCalls,before);
 }],
 ["missing JSON rejects",()=>{
  assert.throws(()=>api(input({payload:"{}"})),/長度/);
 }],
 ["malformed JSON rejects",()=>{
  assert.throws(()=>api(input({payload:"Z".repeat(40)})),/JSON/);
 }],
 ["invalid nonce does not open privileged Google Sheet",()=>{
  const before=guardCalls;
  assert.throws(()=>api(input({nonce:"NOT_A_NONCE"})),/回覆編號/);
  assert.equal(guardCalls,before);
 }],
 ["unknown simulated request ID does not open privileged Google Sheet",()=>{
  const before=guardCalls;
  assert.throws(()=>api(input({payload:JSON.stringify({
   idToken:"mockjwt.syntheticclaims.not-a-real-signature",requestId:"OTHER"
  })})),/非此模擬/);
  assert.equal(guardCalls,before);
 }],
 ["malformed token fails before Google Sheet and remote LINE verification",()=>{
  const before=guardCalls,verified=verifiedCalls;
  assert.throws(()=>api(input({payload:JSON.stringify({idToken:"BAD",requestId})})),/LINE 登入資訊無效/);
  assert.equal(guardCalls,before);assert.equal(verifiedCalls,verified);
 }],
 ["invalid LINE token never reaches row read",()=>{
  const before=lookupCalls;
  assert.throws(()=>api(input({payload:JSON.stringify({idToken:"BAD",requestId})})),/LINE 登入資訊無效/);
  assert.equal(lookupCalls,before);
 }],
 ["unbound caller cannot query",()=>{
  bind=false;const before=lookupCalls;assert.throws(()=>api(input()),/身分驗證/);
  assert.equal(lookupCalls,before);bind=true;
 }],
 ["caller employeeId injection rejected before token read",()=>{
  const before=verifiedCalls;
  assert.throws(()=>api(input({payload:JSON.stringify({
    idToken:"mockjwt.syntheticclaims.not-a-real-signature",requestId,employeeId:"TEST002"
  })})),/未授權/);
  assert.equal(before,verifiedCalls);
 }],
 ["caller company injection rejected",()=>{
  assert.throws(()=>api(input({payload:JSON.stringify({
    idToken:"mockjwt.syntheticclaims.not-a-real-signature",requestId,company:"OTHER"
  })})),/未授權/);
 }],
 ["different request ID rejected",()=>{
  assert.throws(()=>api(input({payload:JSON.stringify({
    idToken:"mockjwt.syntheticclaims.not-a-real-signature",requestId:"OTHER_REQUEST"
  })})),/非此模擬/);
 }],
 ["guard disabled blocks before auth",()=>{
  allowed=false;const before=verifiedCalls;assert.throws(()=>api(input()),/disabled/);
  assert.equal(before,verifiedCalls);allowed=true;
 }],
 ["no public handler/write/notification introduced",()=>{
  for(const code of [proposal,router]){
   assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(code));
   assert(!/\.(?:setValue|setValues|appendRow|insertSheet|deleteRows|clearContents)\s*\(/.test(code));
   assert(!/\b(?:pushMessage|replyMessage|HtmlService)\b/.test(code));
  }
 }]
];
let passed=0;
for(const [name,fn] of cases){
 try{fn();passed++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
}
console.log(passed+"/"+cases.length+" PASSED");
