"use strict";
/* Offline: node staging/AttendanceV2_SelfLeaveHistory_READONLY_CANDIDATE.test.js */
const assert=require("node:assert/strict");
const api=require("./AttendanceV2_SelfLeaveHistory_READONLY_CANDIDATE.js");
const H=api.H.slice();
const row=(id,emp,start,end,status="待審核",type="事假",qty="1天")=>
 [id,emp,"假姓名-"+emp,type,start,end,qty,"私人原因機密",
  status,"2026/10/30 12:00:00","人資甲","2026/10/31"];
const base=[
 row("LEAVEV2_TEST_20261030_0001","TEST001","2026-10-30","2026-10-30","待審核"),
 row("LEAVEV2_TEST_20261010_0002","TEST001","2026-10-10","2026-10-10","已核准"),
 row("LEAVEV2_TEST_20260930_0003","TEST001","2026-09-30","2026-10-02","已駁回","病假","3天"),
 row("LEAVEV2_TEST_20260920_0004","TEST001","2026-09-20","2026-09-20","核准"),
 row("LEAVEV2_TEST_20260815_0005","TEST001","2026-08-15","2026-08-15","駁回"),
 row("LEAVEV2_TEST_OTHER_0001","TEST002","2026-10-30","2026-10-30","待審核"),
 row("LEAVEV2_TEST_OTHER_0002","TEST009","2026-10-30","2026-10-30","已核准")
];
function ask(overrides={}){
 return api.readOwnHistory({
  trustedEmployeeId:"TEST001",trustedToday:"2026-10-30",
  requestedMonth:"2026-10",headers:H,rows:base,...overrides
 });
}
const cases=[
 ["original 12 column header contract",()=>assert.equal(H.length,12)],
 ["October shows pending, approved and cross-month rejected leave",()=>{
  const r=ask();assert.equal(r.ok,true);assert.equal(r.total,3);
  assert.deepEqual(r.records.map(x=>x.status).sort(),["APPROVED","PENDING","REJECTED"]);
 }],
 ["crossing month boundary appears in both months",()=>{
  assert(ask({requestedMonth:"2026-09"}).records.some(x=>x.requestId==="LEAVEV2_TEST_20260930_0003"));
 }],
 ["August is last allowed month",()=>{
  const r=ask({requestedMonth:"2026-08"});assert.equal(r.ok,true);
  assert.equal(r.total,1);
 }],
 ["July hidden from employee lookback",()=>{
  assert.equal(ask({requestedMonth:"2026-07"}).code,"MONTH_OUT_OF_RANGE");
 }],
 ["next month cannot be requested",()=>{
  assert.equal(ask({requestedMonth:"2026-11"}).code,"MONTH_OUT_OF_RANGE");
 }],
 ["other employees are never included in response",()=>{
  const x=JSON.stringify(ask());assert(!x.includes("TEST002"));
  assert(!x.includes("TEST009"));assert(!x.includes("假姓名-"));
 }],
 ["free-form reason and review person never returned",()=>{
  const x=JSON.stringify(ask());assert(!x.includes("私人原因機密"));
  assert(!x.includes("人資甲"));
 }],
 ["dates sorted newest first",()=>{
  const r=ask();assert.equal(r.records[0].startDate,"2026-10-30");
  assert.equal(r.records.at(-1).startDate,"2026-09-30");
 }],
 ["missing trusted employee identity blocked",()=>{
  assert.equal(ask({trustedEmployeeId:""}).code,"SERVER_IDENTITY_UNVERIFIED");
 }],
 ["missing trusted current date blocked",()=>{
  assert.equal(ask({trustedToday:""}).code,"TRUSTED_TODAY_MISSING");
 }],
 ["invalid month format rejected",()=>{
  assert.equal(ask({requestedMonth:"2026/10"}).code,"MONTH_OUT_OF_RANGE");
 }],
 ["year boundary current and previous two months works",()=>{
  const r=ask({trustedToday:"2027-01-05",requestedMonth:"2026-11",rows:[
    row("LEAVEV2_TEST_20261130_0100","TEST001","2026-11-30","2026-12-01")
  ]});
  assert.equal(r.ok,true);assert.deepEqual(r.availableMonths,["2027-01","2026-12","2026-11"]);
 }],
 ["invalid Gregorian date rejected on own leave",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_INVALID0001","TEST001","2026-02-30","2026-10-30")]});
  assert.equal(r.code,"MALFORMED_OWN_DATES");
 }],
 ["end before start rejected on own leave",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_INVALID0001","TEST001","2026-10-31","2026-10-01")]});
  assert.equal(r.code,"MALFORMED_OWN_DATES");
 }],
 ["unknown approval status never guessed as approved",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_UNKNOWN_001","TEST001","2026-10-20","2026-10-20","其他狀態")]});
  assert.equal(r.code,"UNKNOWN_OWN_STATUS");
 }],
 ["same request duplicate cannot silently appear twice",()=>{
  const x=row("LEAVEV2_TEST_DUP_0001","TEST001","2026-10-09","2026-10-09");
  assert.equal(ask({rows:[x,x]}).code,"DUPLICATE_OWN_REQUEST");
 }],
 ["invalid 12-column schema rejected",()=>{
  const x=H.slice();x[9]="時間";
  assert.equal(ask({headers:x}).code,"SHEET_HEADERS_MISMATCH");
 }],
 ["malformed sheet row rejected",()=>{
  assert.equal(ask({rows:[["SHORT"]]}).code,"MALFORMED_ROW");
 }],
 ["large sheet scan stopped",()=>{
  assert.equal(ask({rows:Array(5001).fill(base[0])}).code,"SHEET_SCAN_LIMIT");
 }],
 ["empty month returns an honest empty result",()=>{
  const r=ask({rows:[]});assert.equal(r.ok,true);assert.equal(r.total,0);
  assert.equal(r.found,false);
 }],
 ["hourly quantity preserved without showing reason",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_HOUR_0001","TEST001","2026-10-15","2026-10-15","待審核","事假","09:00-11:00")]});
  assert.equal(r.records[0].quantity,"09:00-11:00");
 }],
 ["foreign employee malformed status not returned or reviewed",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_OTHER_0001","TEST002","2026-10-15","2026-10-15","未知")]});
  assert.equal(r.total,0);assert.equal(r.ok,true);
 }],
 ["same request in non-overlapping month not returned",()=>{
  const r=ask({rows:[row("LEAVEV2_TEST_SEPT0001","TEST001","2026-09-01","2026-09-01")]});
  assert.equal(r.total,0);
 }],
 ["historical approval status candidate synonyms normalized",()=>{
  assert.equal(api.state("核准"),"APPROVED");assert.equal(api.state("已駁回"),"REJECTED");
 }],
 ["no network/writes/identity from browser in source",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const s=fs.readFileSync(path.join(__dirname,"AttendanceV2_SelfLeaveHistory_READONLY_CANDIDATE.js"),"utf8");
  assert(!/UrlFetchApp|SpreadsheetApp|doPost|doGet/.test(s));
  assert(!/\.(?:setValues|appendRow|insertSheet|deleteRows)\s*\(/.test(s));
 }]
];
let passed=0;
for(const [name,fn] of cases){
 try{fn();passed++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
}
console.log(passed+"/"+cases.length+" PASSED");
