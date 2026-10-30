"use strict";
/** node staging/AttendanceV2_StandaloneLeaveStatus_READONLY_CANDIDATE.test.js
 * Fake LINE verification, fake owner permissions, fake TEST001 Sheet.
 * No actual network, no Google or LINE accounts, no real credentials.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"AttendanceV2_StandaloneLeaveStatus_DIAGNOSTIC_V4.gs"),"utf8");
const idToken="mockjwt.payload.signature-is-synthetic-never-real";
const sub="U"+"a".repeat(32),otherSub="U"+"b".repeat(32);
const requestId="LEAVEV2_TEST_20261110_0001",nonce="f".repeat(40);
const sheetID="ISOLATED_TEST_SHEET_ID_0000000000";
const headers=["申請單號","員工ID","姓名","假別","開始日期","結束日期",
 "天數/時數","原因","狀態","申請時間","審核人","審核時間"];
const row=[requestId,"TEST001","模擬員工甲","事假",
  "2026-11-10","2026-11-10","1天","純測試：正常上班日事假",
  "待審核（測試）","SYNTHETIC_TEST_ONLY","",""];
const employeeRow=["TEST001","模擬員工甲","000000",sub,
  "TEST_CO","測試部門","在職","TESTSITE"];
const state={enabled:false,claimsOK:true,claim:"",who:sub,linked:sub,
   opens:0,fetches:0,tempReads:0,writes:0,present:true,badRow:false,badHeaders:false,
   extraRows:false,otherBook:false,unknownSub:false,wrongCompany:false};
const employees={getLastRow:()=>2,getRange:()=>({getValues:()=>[[
  ...employeeRow.slice(0,3),state.linked,
  state.wrongCompany?"OTHER_COMPANY":employeeRow[4],...employeeRow.slice(5)
 ]]})};
const temp={
 getLastRow:()=>!state.present?1:state.extraRows?3:2,
 getLastColumn:()=>12,
 getRange:(r,c,h,w)=>{
   if(r===1)return {getDisplayValues:()=>[
     state.badHeaders?["BAD_HEADER",...headers.slice(1)]:headers.slice()
   ]};
   if(r===2)return {getValues:()=>{
     state.tempReads++;
     const actual=row.slice();if(state.badRow)actual[7]="UNEXPECTED CONTENT";
     return [actual];
   }};
   throw Error("unexpected mock row range");
 }
};
const book={
 getId:()=>sheetID,
 getName:()=>state.otherBook?"NOT_TEST_ONLY":"YC_ATTENDANCE_V2_TEST_ONLY",
 getSheetByName:name=>{
   if(name==="員工資料")return employees;
   if(name==="V2請假寫入測試")return temp;
   throw Error("unexpected or unsafe sheet: "+name);
 }
};
const logs=[];let currentActiveEmail="owner@example.invalid";
const cached=new Map();let cacheWrites=0;
const fake={
 CacheService:{getScriptCache:()=>({put:(key,value,ttl)=>{cacheWrites++;assert.equal(ttl,600);cached.set(key,value);},get:key=>cached.get(key)||null})},
 Session:{getActiveUser:()=>({getEmail:()=>currentActiveEmail}),getEffectiveUser:()=>({getEmail:()=>"owner@example.invalid"})},
 Logger:{log:value=>logs.push(String(value))},
 PropertiesService:{getScriptProperties:()=>({getProperty:name=>{
   if(name==="V2HR_READONLY_TEST_ENABLED")return state.enabled?"enabled":"disabled";
   if(name==="LINE_LOGIN_CHANNEL_ID")return "2012136707";
   if(name==="V2HR_TEST_SHEET_ID")return sheetID;
   return null;
 }})},
 SpreadsheetApp:{openById:id=>{
  state.opens++;assert.equal(id,sheetID);return book;
 }},
 UrlFetchApp:{fetch:(url,options)=>{
  state.fetches++;assert.equal(url,"https://api.line.me/oauth2/v2.1/verify");
  assert.equal(options.payload.client_id,"2012136707");
  const now=Math.floor(Date.now()/1000);
  const claim={iss:"https://access.line.me",aud:"2012136707",
   sub:state.who,iat:now-60,exp:now+3600};
  if(state.claim==="aud")claim.aud="OTHER";
  if(state.claim==="expired")claim.exp=now-2;
  if(state.claim==="issuer")claim.iss="https://attacker.example";
  return {
   getResponseCode:()=>state.claimsOK&&options.payload.id_token===idToken?200:401,
   getContentText:()=>JSON.stringify(claim)
  };
 }},
 Utilities:{formatDate:(d,tz,format)=>{assert.equal(tz,"Asia/Taipei");return d.toISOString().slice(0,10);}},
 HtmlService:{
  XFrameOptionsMode:{ALLOWALL:"ALLOWALL"},
  createHtmlOutput:html=>({html,setXFrameOptionsMode(mode){this.mode=mode;return this;}})
 },
 ContentService:{MimeType:{TEXT:"text"},createTextOutput:text=>({
  text,setMimeType(type){this.mime=type;return this;}
 })}
};
const api=new Function(...Object.keys(fake),code+"\nreturn {doPost,doGet,v2hrReadLastSafeStage_TEST_ONLY};")(...Object.values(fake));
function response(operation="leaveStatus",body={idToken,requestId},params={}){
 const out=api.doPost({parameter:{operation,nonce,payload:JSON.stringify(body),...params}});
 const intro="window.top.postMessage(";
 const from=out.html.indexOf(intro),end=out.html.indexOf(',"https://line-punch.github.io");',from);
 assert(from>=0&&end>from);
 return {body:JSON.parse(out.html.slice(from+intro.length,end)),html:out.html,mode:out.mode};
}
function reset(){Object.assign(state,{enabled:false,claimsOK:true,claim:"",who:sub,linked:sub,
  present:true,badRow:false,badHeaders:false,extraRows:false,otherBook:false,wrongCompany:false});}
const tests=[
 ["default disabled: no LINE or Sheet call",()=>{
  reset();const f=state.fetches,o=state.opens;
  const r=response();assert.equal(r.body.ok,false);
  assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["enabled: bound TEST001 may see fixed mock leave status",()=>{
  reset();state.enabled=true;const r=response();
  assert.equal(r.body.ok,true);assert.equal(r.body.result.readOnly,true);
  assert.equal(r.body.result.found,true);
  assert.equal(r.body.result.status,"PENDING_REVIEW_TEST");
 }],
 ["response never reveals LINE token, LINE user ID or Sheet ID",()=>{
  const r=response();assert(!r.html.includes(idToken));
  assert(!r.html.includes(sub));assert(!r.html.includes(sheetID));
 }],
 ["repeat readonly request does not write",()=>{
  const before=state.writes;const r=response();
  assert.equal(r.body.result.found,true);assert.equal(state.writes,before);
 }],
 ["invalid nonce rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken,requestId},{nonce:"NOT_VALID"});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["unrecognized action rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("deleteEverything");
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["employeeId injection rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken,requestId,employeeId:"TEST002"});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["company injection rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken,requestId,company:"REAL"});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["sheet ID injection rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken,requestId,spreadsheetId:sheetID});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["different request ID rejected before LINE and Sheets",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken,requestId:"OTHER"});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["malformed bearer token rejected before LINE",()=>{
  const f=state.fetches,o=state.opens;
  const r=response("leaveStatus",{idToken:"MALFORMED",requestId});
  assert.equal(r.body.ok,false);assert.equal(state.fetches,f);assert.equal(state.opens,o);
 }],
 ["LINE rejects bearer token: cannot access Sheet",()=>{
  reset();state.enabled=true;state.claimsOK=false;
  const o=state.opens,r=response();
  assert.equal(r.body.code,"AUTH");assert.equal(state.opens,o);
 }],
 ["wrong OAuth audience rejects before Sheet access",()=>{
  reset();state.enabled=true;state.claim="aud";
  const o=state.opens,r=response();
  assert.equal(r.body.code,"AUTH");assert.equal(state.opens,o);
 }],
 ["expired LINE token rejected before Sheet access",()=>{
  reset();state.enabled=true;state.claim="expired";
  const o=state.opens,r=response();
  assert.equal(r.body.code,"AUTH");assert.equal(state.opens,o);
 }],
 ["untrusted OAuth issuer rejected",()=>{
  reset();state.enabled=true;state.claim="issuer";
  const o=state.opens,r=response();
  assert.equal(r.body.code,"AUTH");assert.equal(state.opens,o);
 }],
 ["other LINE account cannot see test leave",()=>{
  reset();state.enabled=true;state.who=otherSub;
  const before=state.tempReads,r=response();
  assert.equal(r.body.ok,false);assert.equal(state.tempReads,before);
 }],
 ["TEST001 no longer bound cannot read",()=>{
  reset();state.enabled=true;state.linked="";
  const before=state.tempReads,r=response();
  assert.equal(r.body.ok,false);assert.equal(state.tempReads,before);
 }],
 ["wrong TEST001 company blocked",()=>{
  reset();state.enabled=true;state.wrongCompany=true;
  const before=state.tempReads,r=response();
  assert.equal(r.body.ok,false);assert.equal(state.tempReads,before);
 }],
 ["wrong spreadsheet name blocked",()=>{
  reset();state.enabled=true;state.otherBook=true;
  const r=response();assert.equal(r.body.ok,false);
 }],
 ["malformed mock row fails closed",()=>{
  reset();state.enabled=true;state.badRow=true;
  const r=response();assert.equal(r.body.ok,false);
 }],
 ["malformed column headers fail closed",()=>{
  reset();state.enabled=true;state.badHeaders=true;
  const r=response();assert.equal(r.body.ok,false);
 }],
 ["extra mock rows fail closed",()=>{
  reset();state.enabled=true;state.extraRows=true;
  const r=response();assert.equal(r.body.ok,false);
 }],
 ["HTML does not inject malicious nonce",()=>{
  reset();const attack="<script>alert('X')</script>";
  const r=response("leaveStatus",{idToken,requestId},{nonce:attack});
  assert(!r.html.includes(attack));
  assert(!r.html.includes("<script>alert"));
 }],
 ["doGet reveals only generic banner",()=>{
  const x=api.doGet();
  assert(x.text.includes("唯讀"));
  assert(!x.text.includes(sheetID));
 }],

 ["disabled service logs only the SETTINGS stage",()=>{
  reset();const before=logs.length;const x=response();
  assert.equal(x.body.code,"UNKNOWN");
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=SETTINGS");
  assert.equal(logs.length,before+1);
 }],
 ["authorized matching TEST001 only logs MOCK_FOUND",()=>{
  reset();state.enabled=true;const x=response();
  assert.equal(x.body.ok,true);
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=MOCK_FOUND");
 }],
 ["invalid LINE token logs LINE_VERIFY only",()=>{
  reset();state.enabled=true;state.claimsOK=false;
  const x=response();assert.equal(x.body.code,"AUTH");
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=LINE_VERIFY");
 }],
 ["LINE verified but different account logs a safe BOUND_ACCOUNT_DENIED",()=>{
  reset();state.enabled=true;state.who=otherSub;
  const x=response();assert.equal(x.body.code,"UNKNOWN");
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=IDENTITY_BOUND_ACCOUNT_DENIED");
 }],
 ["wrong synthetic leave details logs MOCK_LEAVE",()=>{
  reset();state.enabled=true;state.badRow=true;
  const x=response();assert.equal(x.body.code,"UNKNOWN");
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=MOCK_LEAVE");
 }],
 ["public reply stays opaque while internal logs identify stage",()=>{
  reset();state.enabled=true;state.wrongCompany=true;
  const x=response();
  assert.equal(x.body.code,"UNKNOWN");
  assert(!x.html.includes("V2HR_DIAGNOSTIC"));
  assert(!x.html.includes("TEST001 員工資料不符"));
  assert.equal(logs.at(-1),"V2HR_DIAGNOSTIC=IDENTITY_BOUND_ACCOUNT_DENIED");
 }],
 ["sanitized diagnostic logs never include token, LINE ID or test Sheet ID",()=>{
  assert(logs.length>=6);
  const full=logs.join("\n");
  for(const x of [idToken,sub,otherSub,sheetID])assert(!full.includes(x));
  assert(logs.every(x=>/^V2HR_DIAGNOSTIC=(?:INPUT|SETTINGS|LINE_VERIFY|IDENTITY(?:_BOUND_ACCOUNT_DENIED|_TEST_EMPLOYEE_SHAPE|_SHEET_WRONG_NAME|_SHEET_CONFIG_INVALID)?|MOCK_LEAVE|UNCLASSIFIED|MOCK_FOUND|MOCK_NOT_FOUND)$/.test(x)));
 }],

 ["cache only stores safe stage and ISO time, never a raw ID",()=>{
  reset();state.enabled=true;response();
  const data=JSON.parse(cached.get("V2HR_LAST_SAFE_STAGE_V4"));
  assert.equal(data.stage,"MOCK_FOUND");
  assert(/^\d{4}-\d{2}-\d{2}T/.test(data.at));
  assert(!JSON.stringify(data).includes(sub));
  assert(!JSON.stringify(data).includes(idToken));
  assert(!JSON.stringify(data).includes(sheetID));
 }],
 ["owner read after flag disabled reveals only last stage",()=>{
  reset();state.enabled=true;response();
  state.enabled=false;
  const summary=api.v2hrReadLastSafeStage_TEST_ONLY();
  assert.equal(summary.ok,true);assert.equal(summary.found,true);
  assert.equal(summary.stage,"MOCK_FOUND");
  assert.equal(summary.cacheOnly,true);
 }],
 ["owner reader refuses running while feature enabled",()=>{
  reset();state.enabled=true;
  assert.throws(()=>api.v2hrReadLastSafeStage_TEST_ONLY(),/disabled/);
 }],
 ["owner reader rejects unauthenticated public visitor",()=>{
  reset();currentActiveEmail="";
  assert.throws(()=>api.v2hrReadLastSafeStage_TEST_ONLY(),/僅限管理者/);
  currentActiveEmail="owner@example.invalid";
 }],
 ["owner reader rejects a different Google account",()=>{
  reset();currentActiveEmail="another@example.invalid";
  assert.throws(()=>api.v2hrReadLastSafeStage_TEST_ONLY(),/僅限管理者/);
  currentActiveEmail="owner@example.invalid";
 }],
 ["missing diagnostic trace is not interpreted as missing leave",()=>{
  reset();const old=cached.get("V2HR_LAST_SAFE_STAGE_V4");
  cached.delete("V2HR_LAST_SAFE_STAGE_V4");
  const res=api.v2hrReadLastSafeStage_TEST_ONLY();
  assert.equal(res.found,false);assert.equal(res.stage,"NONE");
  if(old)cached.set("V2HR_LAST_SAFE_STAGE_V4",old);
 }],
 ["malformed input cannot overwrite prior diagnostic cache",()=>{
  reset();state.enabled=true;response();
  const old=cached.get("V2HR_LAST_SAFE_STAGE_V4");
  response("bogusOperation");
  assert.equal(cached.get("V2HR_LAST_SAFE_STAGE_V4"),old);
 }],
 ["V4 cache access has no Google Sheet writes or external trace endpoint",()=>{
   assert(cacheWrites>=1);
   assert(!/SpreadsheetApp\.[^;]*setValues?\s*\(/.test(code));
   assert(!/\.(?:setValue|setValues|appendRow|insertSheet|clearContents|setProperty)\s*\(/.test(code));
 }]
 ["only doPost/doGet public, no admin or write functions",()=>{
  const names=[...code.matchAll(/function\s+(\w+)\s*\(/g)].map(x=>x[1]);
  assert.deepEqual(names.filter(x=>!x.endsWith("_")),["doPost","doGet"]);
  assert(!/\.(?:setValue|setValues|appendRow|insertSheet|deleteRows|clearContents|setProperty)\s*\(/.test(code));
  assert(!/\b(?:pushMessage|replyMessage)\s*\(/.test(code));
 }]
];
let passed=0;
for(const [name,fn] of tests){
 try{fn();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
