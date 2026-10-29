"use strict";
/* node staging/AttendanceV2_LeaveDryRun_TEST_ONLY.test.js
 * All fixtures are fictional; tests run only in memory.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const probe=fs.readFileSync(path.join(__dirname,"AttendanceV2_ProbeSyntheticRules_TEST_ONLY.gs"),"utf8");
const file=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveDryRun_TEST_ONLY.gs"),"utf8");
const ctx={
 employee:{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"},
 annualChecks:[{year:"2026",company:"TEST_CO",status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29"}],
 calendarOverrides:[{date:"2026-11-11",company:"TEST_CO",workplace:"",dayType:"OFF",
  reason:"虛構測試休假",reference:"SYNTHETIC_TEST_ONLY",status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29"}],
 events:[{eventId:"MOCK-STOP-20261112",date:"2026-11-12",company:"TEST_CO",
  type:"虛構颱風停班",scope:"ALL",workplace:"",period:"FULL",
  payPolicy:"PAID",reference:"SYNTHETIC_TEST_ONLY",status:"CONFIRMED",
  confirmedBy:"TEST-HR",confirmedAt:"2026-10-29",protectedMinutes:0}]
};
const log=[];
let block=false, readCount=0,writeCount=0;
const context=new Function("v2hrGuardTestSheet_","v2hrReadTestCalendarContext_","Logger",
  probe+"\n"+file+"\nreturn {run:v2hrRunLeaveDryRun_TEST_ONLY,check:v2hrValidateSyntheticLeaveRequest_};")(
  ()=>{if(block)throw Error("No access to sandbox");return {testBook:true};},
  (_ss,_emp)=>{readCount++;return {...ctx};},
  {log:v=>log.push(JSON.parse(v))}
);
const tests=[
 ["matrix 14 test cases pass",()=>{const x=context.run();assert.equal(x.leaveCasesPassed,14);assert.equal(x.readOnly,true);}],
 ["mock holiday blocks",()=>{const x=context.run();assert.equal(x.statuses[1].code,"NON_WORKDAY_IN_RANGE");}],
 ["mock storm requires HR",()=>{const x=context.run();assert.equal(x.statuses[3].code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");}],
 ["crossing weekend blocks",()=>{const x=context.run();assert.equal(x.statuses[4].code,"NON_WORKDAY_IN_RANGE");}],
 ["hourly single day accepted",()=>{const x=context.run();assert.equal(x.statuses[6].code,"DATE_RULES_PASSED");}],
 ["invalid unit rejected",()=>{assert.equal(context.check({leaveType:"事假",unit:"週",startDate:"2026-11-10",endDate:"2026-11-10"},ctx).code,"LEAVE_MODE_INVALID");}],
 ["unsupported leave category rejected",()=>{assert.equal(context.check({leaveType:"補休",unit:"全天",startDate:"2026-11-10",endDate:"2026-11-10"},ctx).code,"LEAVE_TYPE_INVALID");}],
 ["untrusted client employee ID refused",()=>{assert.equal(context.check({leaveType:"事假",unit:"全天",startDate:"2026-11-10",endDate:"2026-11-10",employeeId:"TEST002"},ctx).code,"UNTRUSTED_IDENTITY_FIELD");}],
 ["untrusted client company refused",()=>{assert.equal(context.check({leaveType:"事假",unit:"全天",startDate:"2026-11-10",endDate:"2026-11-10",company:"OTHER"},ctx).code,"UNTRUSTED_IDENTITY_FIELD");}],
 ["missing request rejected",()=>{assert.equal(context.check(null,ctx).code,"INVALID_FORM");}],
 ["disabled TEST001 guard blocks before reads",()=>{const before=readCount;block=true;assert.throws(()=>context.run(),/No access to sandbox/);block=false;assert.equal(readCount,before);}],
 ["no write calls or public service functions",()=>{assert(!/\.(?:appendRow|setValue|setValues|clearContents|insertSheet)\s*\(/.test(file));assert(!/\bfunction\s+(?:doGet|doPost)\s*\(/.test(file));}],
 ["no original leave sheet or LINE notification touched",()=>{assert(!/SpreadsheetApp\.getActiveSpreadsheet|UrlFetchApp|pushMessage|replyMessage/.test(file));}],
 ["test log contains no sensitive LINE values",()=>{const x=context.run();assert.equal(x.ok,true);assert(!JSON.stringify(log).includes("idToken"));}]
];
let passed=0;
for(const [name,fn] of tests){
 try{fn();passed++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
