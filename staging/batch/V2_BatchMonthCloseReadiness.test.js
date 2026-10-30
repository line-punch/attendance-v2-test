"use strict";
/* All times/minutes are synthetic and audited, no payroll rate calculation. */
const assert=require("node:assert/strict");
const m=require("./V2_BatchMonthCloseReadiness.js");
const hr={verified:true,role:"HR_OWNER",employeeId:"HR_TEST"};
const day=(date,scheduledMinutes=480,actualWorkedMinutes=480,paidDisasterMinutes=0,more={})=>({
 employeeId:"TEST001",date,scheduledMinutes,actualWorkedMinutes,paidDisasterMinutes,
 confirmed:true,missingPunchUnresolved:false,...more
});
const base={
 principal:hr,month:"2026-09",today:"2026-10-30",
 calendarConfirmed:true,specialEventsConfirmed:true,pendingApprovals:0,backupReady:true,
 employeeDays:[day("2026-09-29"),day("2026-09-30",480,0,480)]
};
const check=(overrides={})=>m.evaluate({...base,...overrides});
const cases=[
 ["default confirmed historical month ready",()=>{
  const r=check();assert.equal(r.ok,true);assert.equal(r.canClose,true);
 }],
 ["disaster paid minutes not counted as actual hours",()=>{
  const s=check().summary;assert.equal(s.actualWorkedMinutes,480);
  assert.equal(s.paidDisasterMinutes,480);assert.equal(s.scheduledMinutes,960);
 }],
 ["absence never inferred from missing punches",()=>{
  const r=check({employeeDays:[day("2026-09-30",480,0,0,{missingPunchUnresolved:true})]});
  assert.equal(r.canClose,false);assert(r.issues.includes("DAY_RECONCILIATION_PENDING"));
 }],
 ["unconfirmed special event requires review",()=>{
  const r=check({specialEventsConfirmed:false});assert.equal(r.canClose,false);
  assert(r.issues.includes("SPECIAL_EVENTS_NOT_CONFIRMED"));
 }],
 ["unconfirmed annual company calendar blocks closing",()=>{
  assert(check({calendarConfirmed:false}).issues.includes("CALENDAR_NOT_CONFIRMED"));
 }],
 ["pending HR approvals block closing",()=>{
  assert(check({pendingApprovals:1}).issues.includes("PENDING_APPROVALS"));
 }],
 ["negative pending count rejected",()=>{
  assert(check({pendingApprovals:-1}).issues.includes("PENDING_COUNT_UNVERIFIED"));
 }],
 ["no local backup confirmation blocks closing",()=>{
  assert(check({backupReady:false}).issues.includes("BACKUP_NOT_CONFIRMED"));
 }],
 ["current month cannot close yet",()=>{
  assert(check({month:"2026-10",employeeDays:[]}).issues.includes("MONTH_NOT_FINISHED"));
 }],
 ["future month also blocked",()=>{
  assert(check({month:"2026-11",employeeDays:[]}).issues.includes("MONTH_NOT_FINISHED"));
 }],
 ["non HR cannot see close readiness",()=>{
  assert.equal(check({principal:{verified:true,role:"STAFF"}}).code,"HR_ONLY");
 }],
 ["unverified HR cannot close",()=>{
  assert.equal(check({principal:{verified:false,role:"HR_OWNER"}}).code,"HR_ONLY");
 }],
 ["wrong month format blocked",()=>{
  assert.equal(check({month:"2026/09"}).code,"MONTH_INVALID");
 }],
 ["duplicate same employee-day prevented",()=>{
  assert.equal(check({employeeDays:[day("2026-09-30"),day("2026-09-30")]}).code,"DUPLICATE_DAY_ROW");
 }],
 ["another company's rows need independent authoritative scope",()=>{
  const r=check({employeeDays:[day("2026-09-30",480,0,480,{employeeId:"TEST_OTHER"})]});
  assert.equal(r.ok,true);
 }],
 ["incompatible disaster and actual minutes blocked",()=>{
  assert.equal(check({employeeDays:[day("2026-09-30",480,300,300)]}).code,"MINUTE_CONFLICT");
 }],
 ["unconfirmed individual day blocks close without totals",()=>{
  const r=check({employeeDays:[day("2026-09-30",480,480,0,{confirmed:false})]});
  assert.equal(r.canClose,false);assert.equal(r.summary.actualWorkedMinutes,0);
 }],
 ["negative minutes rejected",()=>{
  assert.equal(check({employeeDays:[day("2026-09-30",480,-5,0)]}).code,"MINUTE_CONFLICT");
 }],
 ["actual hours above schedule permitted only as separately verified extra time",()=>{
  const r=check({employeeDays:[day("2026-09-30",480,600,0)]});
  assert.equal(r.ok,true);assert.equal(r.summary.actualWorkedMinutes,600);
 }],
 ["empty month with confirmed preconditions returns zero readiness",()=>{
  const r=check({employeeDays:[]});assert.equal(r.canClose,true);
  assert.equal(r.summary.confirmedDayCount,0);
 }],
 ["invalid date rejected",()=>{
  assert.equal(check({employeeDays:[day("2026-09-31")]}).code,"INVALID_DAY_ROW");
 }],
 ["no Google Sheets write, LINE push or payroll salary calculation",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const s=fs.readFileSync(path.join(__dirname,"V2_BatchMonthCloseReadiness.js"),"utf8");
  assert(!/SpreadsheetApp|UrlFetchApp|google\.script\.run|pushMessage/.test(s));
  assert(!/\.(?:setValues?|appendRow|clearContents|insertSheet)\s*\(/.test(s));
 }]
];
let passed=0;for(const [name,fn] of cases){
 try{fn();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+cases.length+" PASSED");
