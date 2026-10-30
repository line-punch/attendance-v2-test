"use strict";
/**
 * Offline full GAS bundle simulation with REAL synchronous doPost contract.
 * No real Google, LINE, NFC or payroll calls are executed.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,
 "V2_BatchQA_SYNC_FULL_BUNDLE_NOT_DEPLOYED.gs"),"utf8");
const sourceId="MOCK_TEST001_ISOLATED_SOURCE_20261030";
const qaId="MOCK_BATCH_QA_DISTINCT_LEDGER_20261030";
const staffSub="U"+"a".repeat(32),hrSub="U"+"b".repeat(32);
const staffToken="a".repeat(33)+".synthetic.signature";
const hrToken="b".repeat(33)+".synthetic.signature";
const badToken="z".repeat(33)+".synthetic.signature";
const requestId="TEST_BATCH_SYNC_LEAVE_20261030";
const request={requestId,leaveType:"事假",startDate:"2026-11-09",
 endDate:"2026-11-10",unit:"DAY",reason:"合成資料"};
const nonce="f".repeat(40);
function make(opts={}){
 let config={enabled:"enabled",writeEnabled:"disabled",sourceId,qaId,
  hrSub,calendarValid:true,failAfterWrite:false,wrongQa:false,...opts};
 let fetches=0,reads=0,writes=0,locked=false;
 const hcal=["日期","公司","指定打卡地點","日別","原因","核對依據","備註","確認紀錄"];
 const hann=["年度","公司","核對狀態","確認人","確認時間"];
 const hev=["事件單號","日期","類型","適用範圍","指定打卡地點",
  "全日／部分","給薪處理","公告或佐證","核對狀態",
  "確認人","確認時間","核定停班分鐘數","備註"];
 const qaHead=["TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
  "UTC_TIME","PREV_HASH","CONTENT_HASH"];
 const calHead=Array(14).fill("");
 hcal.forEach((v,i)=>calHead[i]=config.calendarValid?v:i?"BAD":"BAD");
 hann.forEach((v,i)=>calHead[i+9]=v);
 const calRow=Array(14).fill("");
 ["2026-11-11","TEST_CO","","休假","虛構休假","SYNTHETIC_TEST_ONLY",
  "","QA|2026-10-29"].forEach((v,i)=>calRow[i]=v);
 ["2026","TEST_CO","已確認","QA","2026-10-29 14:00"]
  .forEach((v,i)=>calRow[i+9]=v);
 const events=[hev,["MOCKSTOP","2026-11-12","虛構停班","全公司",
  "","全日","照常給薪","SYNTHETIC_TEST_ONLY",
  "已確認","QA","2026-10-29",480,""]];
 const employees=[Array(8).fill(""),["TEST001","模擬員工甲","000000",
  staffSub,"TEST_CO","QA","在職","TESTSITE"]];
 const qaRows=[qaHead.slice()];
 function sheet(rows){
  return {
   getLastRow:()=>rows.length,
   getLastColumn:()=>rows[0].length,
   getRange:(row,col,height=1,width=1)=>({
    getValues:()=>{reads++;return rows.slice(row-1,row-1+height)
      .map(x=>x.slice(col-1,col-1+width));},
    getDisplayValues:()=>{reads++;return rows.slice(row-1,row-1+height)
      .map(x=>x.slice(col-1,col-1+width).map(String));},
    setValues:arr=>{
      writes++;
      rows[row-1]=arr[0].slice();
      if(config.failAfterWrite){
       config.failAfterWrite=false;throw Error("POST_COMMIT_SIMULATED_TIMEOUT");
      }
    }
   })
  };
 }
 const source={
  getId:()=>sourceId,getName:()=>"YC_ATTENDANCE_V2_TEST_ONLY",
  getSheetByName:name=>name==="員工資料"?sheet(employees):
    name==="公司工作日曆"?sheet([calHead,calRow]):
    name==="特殊出勤事件"?sheet(events):null
 };
 const qa={
  getId:()=>qaId,
  getName:()=>config.wrongQa?"OTHER":"YC_ATTENDANCE_V2_BATCH_QA_ONLY",
  getSheetByName:name=>name==="V2_交易流水_QA"?sheet(qaRows):null
 };
 const props={
  V2_BATCH_QA_ENABLED:config.enabled,
  V2_BATCH_QA_WRITE_ENABLED:config.writeEnabled,
  V2_BATCH_QA_SOURCE_BOOK_ID:config.sourceId,
  V2_BATCH_QA_BOOK_ID:config.qaId,
  LINE_LOGIN_CHANNEL_ID:"2012136707",
  V2_BATCH_QA_HR_LINE_SUB:config.hrSub
 };
 const deps={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??""})},
  SpreadsheetApp:{openById:id=>id===sourceId?source:id===qaId?qa:(()=>{throw Error("bad ID")})(),
    flush:()=>{}},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked)return false;locked=true;return true},
   releaseLock:()=>{locked=false}
  })},
  Utilities:{formatDate:()=>"2026-10-30"},
  UrlFetchApp:{fetch:(_url,p)=>{
    fetches++;
    const token=p.payload.id_token;
    const sub=token===staffToken?staffSub:token===hrToken?hrSub:null;
    const now=Math.floor(Date.now()/1000);
    return {getResponseCode:()=>sub?200:401,
     getContentText:()=>JSON.stringify({iss:"https://access.line.me",
      aud:"2012136707",sub,iat:now-60,exp:now+3600})};
  }},
  HtmlService:{XFrameOptionsMode:{ALLOWALL:"ALLOWALL"},
   createHtmlOutput:html=>({html,
    setXFrameOptionsMode(){return this}})},
  ContentService:{MimeType:{TEXT:"text"},
   createTextOutput:text=>({text,setMimeType(){return this}})}
 };
 const api=new Function(...Object.keys(deps),code+
  "\nreturn {doPost,doGet};")(...Object.values(deps));
 function post(operation,args={},token=staffToken){
  const result=api.doPost({parameter:{
   nonce,operation,payload:JSON.stringify({idToken:token,args})
  }});
  assert.equal(typeof result.html,"string");
  const m=result.html.match(/window\.top\.postMessage\((\{.*\}),"https:\/\/line-punch\.github\.io"\)/);
  assert(m,"missing safe HTML message bridge");
  return {reply:JSON.parse(m[1]),html:result.html};
 }
 return {api,post,qaRows,counts:()=>({fetches,reads,writes,locked})};
}
const tests=[
 ["future and cross-month leave reads keep one original and expose server submission date",()=>{
  const x=make({writeEnabled:"enabled"});
  const sent=x.post("LEAVE_REQUEST",{...request,startDate:"2026-11-30",endDate:"2026-12-01"}).reply;
  assert.equal(sent.ok,true);
  const before=x.counts().writes;
  for(const month of ["2026-11","2026-12"]){
   const r=x.post("MY_LEAVES",{month}).reply;
   assert.equal(r.ok,true);assert.equal(r.result.total,1);
   assert.equal(r.result.requests[0].requestId,requestId);
   assert.equal(r.result.requests[0].submittedAt,"2026-10-30");
  }
  assert.equal(x.counts().writes,before);assert.equal(x.qaRows.length,2);
 }],
 ["invalid multi-day hourly leave gives a safe actionable reason without writing",()=>{
  const x=make();const r=x.post("LEAVE_PREVIEW",{...request,unit:"HOURS",fromTime:"09:00",toTime:"11:00"}).reply;
  assert.equal(r.ok,false);assert.equal(r.reason,"LEAVE_HOURS_INVALID");
  assert.equal(r.persisted,false);assert.equal(x.counts().writes,0);
 }],
 ["synchronous monthly missed query includes approved requests and excludes leave",()=>{
  const x=make({writeEnabled:"enabled"});
  const id="QA_MISSING_MONTH_20261030";
  x.post("MISSING_REQUEST",{requestId:id,date:"2026-10-30",time:"08:30",type:"上班",reason:"synthetic"});
  x.post("LEAVE_REQUEST",request);
  x.post("HR_REVIEW",{requestId:id,decision:"APPROVE"},hrToken);
  const before=x.counts().writes;
  const r=x.post("MY_MISSING",{month:"2026-10"}).reply;
  assert.equal(r.ok,true);assert.equal(r.result.total,1);
  assert.equal(r.result.requests[0].kind,"MISSING");
  assert.equal(r.result.requests[0].status,"APPROVED");
  assert.equal(x.counts().writes,before);
 }],
 ["HR original status is read-only and returns the reviewed original",()=>{
  const x=make({writeEnabled:"enabled"});x.post("LEAVE_REQUEST",request);
  x.post("HR_REVIEW",{requestId,decision:"APPROVE"},hrToken);
  const before=x.counts().writes;
  const r=x.post("HR_STATUS",{requestId},hrToken).reply;
  assert.equal(r.ok,true);assert.equal(r.result.request.requestId,requestId);
  assert.equal(r.result.request.status,"APPROVED");assert.equal(x.counts().writes,before);
 }],
 ["ordinary staff cannot use HR original status",()=>{
  const x=make({writeEnabled:"enabled"});x.post("LEAVE_REQUEST",request);
  assert.equal(x.post("HR_STATUS",{requestId}).reply.ok,false);
  assert.equal(x.qaRows.length,2);
 }],
 ["HR original status rejects extra fields and unknown original IDs",()=>{
  const x=make();
  assert.equal(x.post("HR_STATUS",{requestId,decision:"APPROVE"},hrToken).reply.ok,false);
  assert.equal(x.post("HR_STATUS",{requestId},hrToken).reply.ok,false);
  assert.equal(x.counts().writes,0);
 }],
 ["Web App doPost returns synchronous HtmlOutput not Promise",()=>{
  const x=make();const r=x.post("LEAVE_PREVIEW",request);
  assert(!("then" in r));assert.equal(r.reply.ok,true);
 }],
 ["disabled QA rejects without LINE or workbook access",()=>{
  const x=make({enabled:"disabled"});
  const r=x.post("LEAVE_PREVIEW",request);
  assert.equal(r.reply.code,"UNKNOWN");assert.equal(x.counts().fetches,0);
 }],
 ["invalid LINE token fails with AUTH and no journal mutation",()=>{
  const x=make({writeEnabled:"enabled"});
  assert.equal(x.post("LEAVE_REQUEST",request,badToken).reply.code,"AUTH");
  assert.equal(x.counts().writes,0);
 }],
 ["read-only preview returns working days",()=>{
  const x=make();
  const r=x.post("LEAVE_PREVIEW",request).reply;
  assert.equal(r.ok,true);assert.equal(r.result.days,2);
  assert.equal(x.counts().writes,0);
 }],
 ["staff cannot write when QA write flag disabled",()=>{
  const x=make();assert.equal(x.post("LEAVE_REQUEST",request).reply.code,"DISABLED");
  assert.equal(x.counts().writes,0);
 }],
 ["writable QA test creates one durable entry + one outbox event",()=>{
  const x=make({writeEnabled:"enabled"});
  const r=x.post("LEAVE_REQUEST",request).reply;
  assert.equal(r.ok,true);assert.equal(x.qaRows.length,2);
  assert.equal(JSON.parse(x.qaRows[1][4]).type,"LEAVE_SUBMITTED");
 }],
 ["duplicate submission returns original, not second row",()=>{
  const x=make({writeEnabled:"enabled"});
  x.post("LEAVE_REQUEST",request);
  const r=x.post("LEAVE_REQUEST",request).reply;
  assert.equal(r.result.duplicate,true);assert.equal(x.qaRows.length,2);
 }],
 ["lost write reply gets UNKNOWN, readback finds same request",()=>{
  const x=make({writeEnabled:"enabled",failAfterWrite:true});
  const r=x.post("LEAVE_REQUEST",request).reply;
  assert.equal(r.code,"UNKNOWN");assert.equal(r.persisted,null);
  const found=x.post("LEAVE_STATUS",{requestId}).reply;
  assert.equal(found.ok,true);assert.equal(found.result.request.status,"PENDING");
  assert.equal(x.qaRows.length,2);
 }],
 ["HR test identity can approve pending leave once",()=>{
  const x=make({writeEnabled:"enabled"});
  x.post("LEAVE_REQUEST",request);
  const review=x.post("HR_REVIEW",{requestId,decision:"APPROVE"},hrToken).reply;
  assert.equal(review.ok,true);
  assert.equal(x.qaRows.length,3);
  const r=x.post("LEAVE_STATUS",{requestId}).reply;
  assert.equal(r.result.request.status,"APPROVED");
 }],
 ["ordinary TEST001 cannot become HR by submitting review input",()=>{
  const x=make({writeEnabled:"enabled"});
  x.post("LEAVE_REQUEST",request);
  const r=x.post("HR_REVIEW",{requestId,decision:"APPROVE"}).reply;
  assert.equal(r.code,"REJECTED");assert.equal(x.qaRows.length,2);
 }],
 ["unverified holiday is not accepted",()=>{
  const x=make({writeEnabled:"enabled",calendarValid:false});
  const r=x.post("LEAVE_REQUEST",request).reply;
  assert.equal(r.code,"UNKNOWN");assert.equal(x.counts().writes,0);
 }],
 ["no secret LINE token or full QA sheet ID leaks into HTML",()=>{
  const x=make();const r=x.post("LEAVE_PREVIEW",request).html;
  assert(!r.includes(staffToken));assert(!r.includes(sourceId));assert(!r.includes(qaId));
 }],
 ["doGet only reports QA banner",()=>{
  const x=make();const r=x.api.doGet();
  assert(r.text.includes("QA Web App"));assert.equal(x.counts().writes,0);
 }]
];
let passed=0;
for(const [name,fn] of tests)try{fn();passed++;console.log("PASS",name)}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
console.log(passed+"/"+tests.length+" PASSED");


