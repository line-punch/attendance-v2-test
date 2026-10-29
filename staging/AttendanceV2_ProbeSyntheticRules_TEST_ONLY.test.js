"use strict";
/* Run: node staging/AttendanceV2_ProbeSyntheticRules_TEST_ONLY.test.js
 * In-memory mock context. No Apps Script project, Google or LINE access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_ProbeSyntheticRules_TEST_ONLY.gs"),"utf8");
const expected={
  employee:{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"},
  annualChecks:[{year:"2026",company:"TEST_CO",status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29 13:40:00"}],
  calendarOverrides:[{date:"2026-11-11",company:"TEST_CO",workplace:"",dayType:"OFF",
    reason:"虛構測試休假",reference:"SYNTHETIC_TEST_ONLY",status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29"}],
  events:[{eventId:"MOCK-STOP-20261112",date:"2026-11-12",company:"TEST_CO",
    type:"虛構颱風停班",scope:"ALL",workplace:"",period:"FULL",payPolicy:"PAID",
    reference:"SYNTHETIC_TEST_ONLY",status:"CONFIRMED",confirmedBy:"TEST-HR",
    confirmedAt:"2026-10-29",protectedMinutes:0}]
};
let logs=[],reads=0;
function evaluate(ctx=expected,allowed=true){
  const run=new Function("v2hrGuardTestSheet_","v2hrReadTestCalendarContext_","Logger",
    source+"\nreturn v2hrVerifySyntheticRules_TEST_ONLY;")(
    ()=>{if(!allowed)throw Error("Blocked by TEST001 security guard");return {mock:true};},
    (_,employee)=>{reads++;assert.equal(employee.employeeId,"TEST001");return ctx;},
    {log:v=>logs.push(JSON.parse(v))}
  );
  return run();
}
const cases=[
  ["six live-shaped rule assertions pass",()=>assert.equal(evaluate().checksPassed,6)],
  ["leave on 2026-11-11 blocked",()=>assert.equal(evaluate().leaveOnMockHoliday,"BLOCKED")],
  ["storm on 2026-11-12 is a scheduled workday with special stop",()=>{
    assert.equal(evaluate().scheduledStormDay,"WORKDAY_WITH_APPROVED_STOP");
  }],
  ["unworked storm scheduled minutes paid with no absence",()=>{
    const r=evaluate();
    assert.equal(r.mockPaidStopMinutes,480);
    assert.equal(r.mockActualWorkedMinutes,0);
    assert.equal(r.mockAbsenceMinutes,0);
  }],
  ["new leave overlapping stop requires HR review",()=>{
    assert.equal(evaluate().newLeaveOnStorm,"HR_REVIEW_REQUIRED");
  }],
  ["unauthorized access cannot read",()=>{
    const before=reads;assert.throws(()=>evaluate(expected,false),/Blocked by TEST001/);
    assert.equal(reads,before);
  }],
  ["missing annual confirmation refused",()=>{
    assert.throws(()=>evaluate({...expected,annualChecks:[]}),/FIXTURE_YEAR/);
  }],
  ["non-synthetic holiday refused",()=>{
    assert.throws(()=>evaluate({...expected,
      calendarOverrides:[{...expected.calendarOverrides[0],reference:"UNVERIFIED"}]}),/FIXTURE_HOLIDAY/);
  }],
  ["unconfirmed storm refused",()=>{
    assert.throws(()=>evaluate({...expected,events:[{...expected.events[0],status:"PENDING"}]}),/FIXTURE_STORM/);
  }],
  ["unexpected extra event refused",()=>{
    assert.throws(()=>evaluate({...expected,events:[...expected.events,{...expected.events[0],eventId:"E2"}]}),/FIXTURE_STORM/);
  }],
  ["no Apps Script write calls or public web endpoints in probe",()=>{
    assert(!/\.(?:setValues|appendRow|setValue|deleteRows|insertSheet)\s*\(/.test(source));
    assert(!/\b(?:doPost|doGet|UrlFetchApp|HtmlService)\b/.test(source));
  }]
];
let passed=0;
for(const [name,fn] of cases)try{fn();passed++;console.log("PASS",name);}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
console.log(passed+"/"+cases.length+" PASSED");
