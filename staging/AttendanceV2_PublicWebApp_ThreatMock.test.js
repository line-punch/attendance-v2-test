"use strict";
/**
 * Run locally: node staging/AttendanceV2_PublicWebApp_ThreatMock.test.js
 * NO INTERNET, NO LIVE GOOGLE SHEETS, NO LINE DATA, NO REAL TOKEN.
 *
 * This uses an immutable snapshot of the published historical DATA_TEST
 * doPost / JSON iframe response + the current STAGING TEST001 proposal.
 * Snapshot is NOT confirmation of current Apps Script deployed revision.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const dir=__dirname;
function get(n){return fs.readFileSync(path.join(dir,n),"utf8");}
const snap=get("reference/AttendanceV2_PublicBridge_Reference_TEST.js");
const candidate=get("AttendanceV2_LeaveStatus_DispatchCandidate_TEST_ONLY.gs");
const bridge=get("AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.gs");
const adapter=get("AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.gs");
const helpers=get("reference/AttendanceV2_LeaveStatusSheetHelpers_TEST.js");

assert(snap.includes("function doPost(e)"));
assert(snap.includes("function v2dLineClaims_(tokenInput)"));
assert(snap.includes("window.top.postMessage"));
assert(snap.includes("function v2dPublicFailure_"));
const modifiedPost=snap.replace(
 "const data=v2dDispatch_(params);",
 "const data=v2hrRouteTestOnly_(params,v2dDispatch_);"
);
assert.notEqual(modifiedPost,snap);
const fullCode=modifiedPost+"\n"+helpers+"\n"+bridge+"\n"+candidate+"\n"+adapter+
 "\nreturn {doPost,v2dPublicFailure_};";

const nonce="b".repeat(40);
const requestId="LEAVEV2_TEST_20261110_0001";
const linkedId="U"+"a".repeat(32);
const otherId="U"+"b".repeat(32);
const idToken="mockheader.mockpayload.mock-signature-never-real-2026";
const sheetID="TEST_ONLY_SHEET_ID_000000000001";
const row=["LEAVEV2_TEST_20261110_0001","TEST001","模擬員工甲","事假",
  "2026-11-10","2026-11-10","1天","純測試：正常上班日事假",
  "待審核（測試）","SYNTHETIC_TEST_ONLY","",""];
const headers=[
 "申請單號","員工ID","姓名","假別","開始日期","結束日期",
 "天數/時數","原因","狀態","申請時間","審核人","審核時間"
];
let featureOn=false,validLINE=true,authUser=linkedId,claimIssue="",bound=true,
  openCount=0,readCount=0,sheetWrites=0,networkFetches=0,originalRouteCalls=[];
let expectedOrigin="https://line-punch.github.io";
const empRow=["TEST001","模擬員工甲","000000",linkedId,
 "TEST_CO","測試部門","在職","TESTSITE"];
const employees={
 getLastRow:()=>2,
 getRange:(r,c,h,w)=>({
  getValue:()=>empRow[c-1],
  getValues:()=>[empRow.slice(c-1,c-1+(w||1))]
 })
};
const temp={
 getLastRow:()=>2,
 getLastColumn:()=>12,
 getRange:(r,c,h,w)=>{
  if(r===1&&c===1&&w===12)return {getDisplayValues:()=>[headers.slice()]};
  if(r===2&&c===1&&w===12){
    return {getValues:()=>{readCount++;return [row.slice()];}};
  }
  throw Error("Unexpected temporary leave sheet range: "+[r,c,h,w]);
 }
};
const sheet={
 getId:()=>sheetID,getName:()=>"YC_ATTENDANCE_V2_TEST_ONLY",
 getSheetByName:name=>{
  if(name==="員工資料")return employees;
  if(name==="上班地點"||name==="打卡紀錄")return {};
  if(name==="V2請假寫入測試")return temp;
  throw Error("Unapproved sheet access "+name);
 }
};
const props={
 getProperty:name=>{
  if(name==="ATTENDANCE_V2_DATA_TEST")return "enabled";
  if(name==="LINE_LOGIN_CHANNEL_ID")return "2012136707";
  if(name==="ATTENDANCE_V2_TEST_SHEET_ID")return sheetID;
  if(name==="ATTENDANCE_V2_LEAVE_QUERY_TEST")return featureOn?"enabled":null;
  return null;
 }
};
const services={
 PropertiesService:{getScriptProperties:()=>props},
 SpreadsheetApp:{openById:id=>{
  openCount++;
  if(id!==sheetID)throw Error("foreign sheet blocked");
  return sheet;
 }},
 UrlFetchApp:{fetch:(url,options)=>{
  networkFetches++;
  assert.equal(url,"https://api.line.me/oauth2/v2.1/verify");
  assert.equal(options.payload.client_id,"2012136707");
  const token=options.payload.id_token;
  const user=authUser;
  const now=Math.floor(Date.now()/1000);
  const claims={iss:"https://access.line.me",aud:"2012136707",
   sub:user,exp:now+600,iat:now-60};
  if(claimIssue==="aud")claims.aud="OTHER";
  if(claimIssue==="expired")claims.exp=now-120;
  if(claimIssue==="issuer")claims.iss="https://evil.example";
  return {getResponseCode:()=>validLINE&&token===idToken?200:401,
   getContentText:()=>JSON.stringify(claims)};
 }},
 Utilities:{formatDate:()=>""},
 HtmlService:{
   XFrameOptionsMode:{ALLOWALL:"ALLOWALL"},
   createHtmlOutput:html=>({
     html,mode:"",
     setXFrameOptionsMode(value){this.mode=value;return this;}
   })
 },
 v2dWhoami_:()=>({ok:true,bound:false}),
 v2dBind_:()=>({ok:false}),
 v2dClock_:(_ss,_line,_params,status)=>{
    originalRouteCalls.push(status?"clockStatus":"clock");
    return {ok:true,found:true,type:status?"status":"clock"};
 },
 v2dTodayAttendance_:()=>{
    originalRouteCalls.push("todayAttendance");
    return {ok:true,total:2};
 }
};
const f=new Function(...Object.keys(services),fullCode)(...Object.values(services));
function post(operation="leaveStatus",body={idToken,requestId},params={}){
 const actual={nonce,operation,payload:JSON.stringify(body),...params};
 const rendered=f.doPost({parameter:actual});
 assert.equal(rendered.mode,"ALLOWALL");
 const prefix="window.top.postMessage(";
 const start=rendered.html.indexOf(prefix);
 assert(start>=0);
 const end=rendered.html.indexOf(","+JSON.stringify(expectedOrigin)+");",start);
 assert(end>start);
 const reply=JSON.parse(rendered.html.slice(start+prefix.length,end));
 return {reply,html:rendered.html};
}
function reset(){featureOn=false;validLINE=true;authUser=linkedId;claimIssue="";bound=true;}
const tests=[
 ["new route stays closed when public deployment property absent",()=>{
  reset();const before=readCount,network=networkFetches;
  const x=post();
  assert.equal(x.reply.ok,false);
  assert.equal(x.reply.code,"UNKNOWN");
  assert.equal(readCount,before);assert.equal(networkFetches,network);
 }],
 ["authorized TEST001 identity finds exactly the original synthetic leave",()=>{
  reset();featureOn=true;
  const x=post();
  assert.equal(x.reply.ok,true);assert.equal(x.reply.result.found,true);
  assert.equal(x.reply.result.requestId,requestId);
  assert.equal(x.reply.result.status,"PENDING_REVIEW_TEST");
  assert.equal(x.reply.result.readOnly,true);
 }],
 ["public response never exposes LINE ID Token or verified user ID",()=>{
  featureOn=true;const x=post();
  assert(!x.html.includes(idToken));assert(!x.html.includes(linkedId));
 }],
 ["identical query returns existing status, no second write",()=>{
  featureOn=true;const x=post();
  assert.equal(x.reply.result.found,true);assert.equal(sheetWrites,0);
 }],
 ["wrong test request ID rejected before opening spreadsheet",()=>{
  const before=openCount;
  const x=post("leaveStatus",{idToken,requestId:"NOT_OUR_TEST_REQUEST"});
  assert.equal(x.reply.ok,false);assert.equal(openCount,before);
 }],
 ["malformed bearer token rejected before Sheets or LINE verification",()=>{
  const before=openCount,fetches=networkFetches;
  const x=post("leaveStatus",{idToken:"invalid",requestId});
  assert.equal(x.reply.ok,false);
  assert.equal(openCount,before);assert.equal(networkFetches,fetches);
 }],
 ["malformed nonce never opens privileged test Sheet",()=>{
  const before=openCount;
  const x=post("leaveStatus",{idToken,requestId},{nonce:"bad"});
  assert.equal(x.reply.ok,false);assert.equal(openCount,before);
 }],
 ["employeeId injection blocked before Sheets access",()=>{
  const before=openCount;
  const x=post("leaveStatus",{idToken,requestId,employeeId:"TEST002"});
  assert.equal(x.reply.ok,false);assert.equal(openCount,before);
 }],
 ["company injection blocked before Sheets access",()=>{
  const before=openCount;
  const x=post("leaveStatus",{idToken,requestId,company:"REAL_COMPANY"});
  assert.equal(x.reply.ok,false);assert.equal(openCount,before);
 }],
 ["spreadsheetId injection blocked before Sheets access",()=>{
  const before=openCount;
  const x=post("leaveStatus",{idToken,requestId,spreadsheetId:"REAL_SHEET"});
  assert.equal(x.reply.ok,false);assert.equal(openCount,before);
 }],
 ["LINE verify endpoint 401 refuses request",()=>{
  reset();featureOn=true;validLINE=false;const before=readCount;
  const x=post();assert.equal(x.reply.ok,false);assert.equal(x.reply.code,"AUTH");
  assert.equal(readCount,before);
 }],
 ["valid LINE token with wrong OAuth audience rejected",()=>{
  reset();featureOn=true;claimIssue="aud";const before=readCount;
  const x=post();assert.equal(x.reply.ok,false);assert.equal(x.reply.code,"AUTH");
  assert.equal(readCount,before);
 }],
 ["expired verified LINE token rejected",()=>{
  reset();featureOn=true;claimIssue="expired";const before=readCount;
  const x=post();assert.equal(x.reply.ok,false);assert.equal(x.reply.code,"AUTH");
  assert.equal(readCount,before);
 }],
 ["forged LINE issuer rejected",()=>{
  reset();featureOn=true;claimIssue="issuer";const before=readCount;
  const x=post();assert.equal(x.reply.ok,false);assert.equal(x.reply.code,"AUTH");
  assert.equal(readCount,before);
 }],
 ["other real-shaped LINE account cannot read TEST001 leave",()=>{
  reset();featureOn=true;authUser=otherId;const before=readCount;
  const x=post();assert.equal(x.reply.ok,false);assert.equal(readCount,before);
 }],
 ["unrecognized operation not granted by new adapter",()=>{
  reset();featureOn=true;const x=post("deleteAll",{idToken,requestId});
  assert.equal(x.reply.ok,false);assert.equal(x.reply.code,"UNKNOWN");
 }],
 ["legacy todayAttendance still uses pre-existing route",()=>{
  reset();const x=post("todayAttendance",{idToken,requestId});
  assert.equal(x.reply.ok,true);assert.equal(x.reply.result.total,2);
 }],
 ["legacy clock still uses pre-existing route",()=>{
  reset();const x=post("clock",{idToken,requestId,type:"上班"});
  assert.equal(x.reply.ok,true);assert.equal(x.reply.result.type,"clock");
 }],
 ["unsafe HTML/error nonce is escaped in response source",()=>{
  reset();const attack="<script>alert(1)</script>";
  const x=post("leaveStatus",{idToken,requestId},{nonce:attack});
  assert(!x.html.includes(attack));
  assert(!x.html.includes("<script>alert"));
 }],
 ["origin-restricted postMessage and no new public handler",()=>{
  assert(modifiedPost.includes('window.top.postMessage'));
  assert(modifiedPost.includes('JSON.stringify(V2D_REPLY_ORIGIN)'));
  for(const s of [candidate,bridge,adapter]){
    assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(s));
    assert(!/\.(?:setValues|setValue|appendRow|insertSheet|clearContents)\s*\(/.test(s));
  }
 }]
];
let passed=0;
for(const [name,run] of tests){
 try{run();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
