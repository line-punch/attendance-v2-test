"use strict";
const assert=require("node:assert/strict");
const api=require("./V2_BatchLegacyRows_READONLY.js");
const p={source:"VERIFIED_SERVER_BINDING",active:true,
 employeeId:"TEST001",company:"TEST_CO",displayName:"模擬員工甲"};
const req="REQ_PROJECTION_TEST_001";
const leave={kind:"LEAVE",requestId:req,employeeId:"TEST001",company:"TEST_CO",
 status:"PENDING",submittedAt:"2026-10-30 08:30:00",
 body:{leaveType:"事假",startDate:"2026-11-09",endDate:"2026-11-10",
  unit:"DAY",workingDays:2,reason:"合成資料"}};
const missed={kind:"MISSING",requestId:"REQ_MISSING_TEST_0001",
 employeeId:"TEST001",company:"TEST_CO",status:"PENDING",
 body:{date:"2026-10-30",type:"上班",time:"08:30",reason:"合成忘記打卡"}};
const tests=[
 ["original leave 12 columns preserved",()=>{
  const r=api.transform(leave,p);assert.equal(r.ok,true);
  assert.equal(r.targetSchema,"LEAVE_12");assert.equal(r.values.length,12);
 }],
 ["leave type and quantity mapped to D/G",()=>{
  const r=api.transform(leave,p);
  assert.equal(r.values[3],"事假");assert.equal(r.values[6],"2天");
 }],
 ["leave review status is I, not J",()=>{
  assert.equal(api.transform(leave,p).values[8],"待審核");
 }],
 ["approved and rejected statuses mapped",()=>{
  assert.equal(api.transform({...leave,status:"APPROVED"},p).values[8],"已核准");
  assert.equal(api.transform({...leave,status:"REJECTED"},p).values[8],"已駁回");
 }],
 ["hourly leave stores range G, not a whole day",()=>{
  const r=api.transform({...leave,body:{...leave.body,
   startDate:"2026-11-10",unit:"HOURS",fromTime:"09:00",toTime:"11:00"}},p);
  assert.equal(r.ok,true);assert.equal(r.values[6],"09:00-11:00");
 }],
 ["invalid hourly range refused",()=>{
  const r=api.transform({...leave,body:{...leave.body,
   unit:"HOURS",fromTime:"17:00",toTime:"09:00"}},p);
  assert.equal(r.code,"LEAVE_HOURS_INVALID");
 }],
 ["lack of server-confirmed days stops day leave",()=>{
  const b={...leave.body};delete b.workingDays;
  assert.equal(api.transform({...leave,body:b},p).code,"LEAVE_DAYS_UNVERIFIED");
 }],
 ["missing punch original 11 columns preserved",()=>{
  const r=api.transform(missed,p);
  assert.equal(r.ok,true);assert.equal(r.values.length,11);
  assert.equal(r.targetSchema,"MISSING_11");
 }],
 ["missing punch company is E, shift/type F",()=>{
  const r=api.transform(missed,p);
  assert.equal(r.values[4],"TEST_CO");assert.equal(r.values[5],"上班");
 }],
 ["missing time is G and reason H",()=>{
  const r=api.transform(missed,p);
  assert.equal(r.values[6],"08:30");assert.equal(r.values[7],"合成忘記打卡");
 }],
 ["missing status and reviewer are I/J/K",()=>{
  const row={...missed,status:"APPROVED",reviewedBy:"HR_TEST",
   reviewedAt:"2026-10-30 09:00:00"};
  const r=api.transform(row,p);
  assert.equal(r.values[8],"已核准");
  assert.equal(r.values[9],"HR_TEST");assert.equal(r.values[10],row.reviewedAt);
 }],
 ["other employee identity cannot project",()=>{
  assert.equal(api.transform(leave,{...p,employeeId:"TEST002"}).code,"SERVER_SCOPE_UNVERIFIED");
 }],
 ["different company cannot project",()=>{
  assert.equal(api.transform(leave,{...p,company:"OTHER_CO"}).code,"SERVER_SCOPE_UNVERIFIED");
 }],
 ["browser unverified principal refused",()=>{
  assert.equal(api.transform(leave,{...p,source:"CLIENT_SUPPLIED"}).code,"SERVER_SCOPE_UNVERIFIED");
 }],
 ["lack of display name stops rather than guesses identity",()=>{
  assert.equal(api.transform(leave,{...p,displayName:""}).code,"SERVER_SCOPE_UNVERIFIED");
 }],
 ["unrecognized status not converted to approval",()=>{
  assert.equal(api.transform({...leave,status:"UNKNOWN"},p).code,"JOURNAL_ROW_INVALID");
 }],
 ["invalid missing punch type refused",()=>{
  assert.equal(api.transform({...missed,body:{...missed.body,type:"午休"}},p).code,"MISSING_FIELDS_INVALID");
 }],
 ["no actual data writes or external API in projection",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const s=fs.readFileSync(path.join(__dirname,"V2_BatchLegacyRows_READONLY.js"),"utf8");
  assert(!/SpreadsheetApp|UrlFetchApp|doPost|doGet/.test(s));
  assert(!/\.(?:setValues?|appendRow|insertSheet)\s*\(/.test(s));
 }]
];
let pass=0;for(const [name,fn] of tests)try{fn();pass++;console.log("PASS",name)}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
console.log(pass+"/"+tests.length+" PASSED");
