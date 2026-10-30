"use strict";
/* Offline mock TEST001 adapter; no LINE calls and no real Sheets. */
const assert=require("node:assert/strict");
const model=require("./AttendanceV2_SelfLeaveHistory_READONLY_CANDIDATE.js");
const fs=require("node:fs"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"AttendanceV2_SelfLeaveHistory_SandboxBridge_NOT_DEPLOYED.gs"),"utf8");
const lineId="U"+"a".repeat(32),otherLine="U"+"b".repeat(32);
const data=[
 ["LEAVEV2_TEST_20261030_0001","TEST001","假員工","事假","2026-10-30",
 "2026-10-30","1天","秘密理由","待審核","2026/10/20","",""],
 ["LEAVEV2_TEST_20260930_0002","TEST001","假員工","病假","2026-09-30",
 "2026-10-01","2天","秘密理由","已核准","2026/09/20","主管名字","2026/09/22"],
 ["LEAVEV2_TEST_20261015_OTHER","TEST002","假員工B","事假","2026-10-15",
 "2026-10-15","1天","不同員工秘密","已駁回","2026/10/11","主管名字",""]
];
const headers=model.H.slice();
let enabled=true,modifiedRows=data,sheetName="YC_ATTENDANCE_V2_TEST_ONLY",readCalls=0;
const sheet={
 getLastRow:()=>modifiedRows.length+1,
 getLastColumn:()=>12,
 getRange:(r,c,height,width)=>{
  readCalls++;
  return r===1?{getDisplayValues:()=>[headers.slice()]}:
    {getValues:()=>modifiedRows.slice()};
 }
};
const book={getName:()=>sheetName,getSheetByName:name=>name==="請假申請"?sheet:null};
const DateFrozen=class extends Date{
 constructor(...args){super(...(args.length?args:["2026-10-30T04:15:00Z"]))}
};
const deps={
 AttendanceV2SelfLeaveHistory:model,
 v2hrOnlyProps_:()=>{if(!enabled)throw Error("FEATURE_DISABLED");return {testOnly:true}},
 v2hrOnlySheet_:(_p,sub)=>{
  if(sub!==lineId)throw Error("UNBOUND_LINE_ACCOUNT");return book;
 },
 Utilities:{formatDate:(d,tz,fmt)=>{
  assert.equal(tz,"Asia/Taipei");assert.equal(fmt,"yyyy-MM-dd");
  return d instanceof Date?d.toISOString().slice(0,10):"2026-10-30";
 }},
 Date:DateFrozen
};
const api=new Function(...Object.keys(deps),src+"\nreturn v2hrSelfLeaveHistorySandboxCandidate_;")(...Object.values(deps));
const tests=[
 ["verified TEST001 can query own October rows",()=>{
  const r=api(lineId,{month:"2026-10"});
  assert.equal(r.ok,true);assert.equal(r.total,2);assert.equal(r.readOnly,true);
 }],
 ["no other worker, reason, reviewer or LINE identifiers are returned",()=>{
  const text=JSON.stringify(api(lineId,{month:"2026-10"}));
  for(const forbidden of ["TEST002","不同員工秘密","秘密理由","主管名字",lineId])
   assert(!text.includes(forbidden));
 }],
 ["September overlap is included in both months",()=>{
  const r=api(lineId,{month:"2026-09"});
  assert.equal(r.total,1);assert.equal(r.records[0].status,"APPROVED");
 }],
 ["unbound verified LINE user cannot read",()=>{
  const before=readCalls;
  assert.throws(()=>api(otherLine,{month:"2026-10"}),/UNBOUND/);
  assert.equal(readCalls,before);
 }],
 ["client cannot supply employee ID",()=>{
  const before=readCalls;
  assert.throws(()=>api(lineId,{month:"2026-10",employeeId:"TEST002"}),/未授權/);
  assert.equal(before,readCalls);
 }],
 ["client cannot supply company or spreadsheet ID",()=>{
  assert.throws(()=>api(lineId,{month:"2026-10",company:"OTHER"}),/未授權/);
  assert.throws(()=>api(lineId,{month:"2026-10",spreadsheetId:"X"}),/未授權/);
 }],
 ["disabled service cannot read employees",()=>{
  enabled=false;const before=readCalls;
  assert.throws(()=>api(lineId,{month:"2026-10"}),/FEATURE_DISABLED/);
  assert.equal(readCalls,before);enabled=true;
 }],
 ["malformed or missing month blocked",()=>{
  assert.throws(()=>api(lineId,{month:"2026/10"}),/期間未通過核對/);
  assert.throws(()=>api(lineId,{}),/未授權/);
 }],
 ["extra older month blocked",()=>{
  assert.throws(()=>api(lineId,{month:"2026-05"}),/期間未通過核對/);
 }],
 ["wrong test book name rejected",()=>{
  sheetName="PRODUCTION";assert.throws(()=>api(lineId,{month:"2026-10"}),/測試資料來源/);
  sheetName="YC_ATTENDANCE_V2_TEST_ONLY";
 }],
 ["empty original leave Sheet gives valid empty response",()=>{
  const old=modifiedRows;modifiedRows=[];const r=api(lineId,{month:"2026-10"});
  assert.equal(r.ok,true);assert.equal(r.total,0);modifiedRows=old;
 }],
 ["no writes, new endpoint or notifications",()=>{
  assert(!/\.(?:appendRow|setValues?|insertSheet|clearContents|deleteRows)\s*\(/.test(src));
  assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(src));
  assert(!/UrlFetchApp|pushMessage|replyMessage/.test(src));
 }]
];
let pass=0;
for(const [name,fn] of tests){
 try{fn();pass++;console.log("PASS",name);}
 catch(err){console.error("FAIL",name,err.stack);process.exitCode=1;}
}
console.log(pass+"/"+tests.length+" PASSED");
