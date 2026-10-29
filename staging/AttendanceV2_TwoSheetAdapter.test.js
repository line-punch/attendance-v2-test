"use strict";
/* Execute without network: node staging/AttendanceV2_TwoSheetAdapter.test.js */
const assert=require("node:assert/strict");
const adapter=require("./AttendanceV2_TwoSheetAdapter.js");
const svc=require("./AttendanceV2_CalendarAndEventService.js");
const {evaluateAttendanceException:pay}=require("./AttendanceV2_PayrollExceptionRules.js");
const employee={employeeId:"TEST001",company:"TEST-COMPANY",workplace:"W1"};
const ctx={
  employee,today:"2026-10-29",
  annualChecks:adapter.annualChecks([["2026","TEST-COMPANY","已確認","TEST-HR","2026-10-29"]]),
  calendarOverrides:adapter.calendarRows([["2026/11/02","","","休假","虛構休假","TEST","", "TEST-HR|2026-10-29"]],"TEST-COMPANY"),
  events:[],scheduledMinutesByDate:{}
};
const tests=[
["annual metadata in same sheet recognized",()=>{
  assert.equal(ctx.annualChecks.length,1);
  assert.equal(ctx.annualChecks[0].status,"CONFIRMED");
}],
["date override normalized and blocked",()=>{
  const x=svc.validateLeave({startDate:"2026-11-02",endDate:"2026-11-02",mode:"DAY"},ctx);
  assert.equal(x.code,"NON_WORKDAY_IN_RANGE");
}],
["normal week after holiday can be requested",()=>{
  assert.equal(svc.validateLeave({startDate:"2026-11-03",endDate:"2026-11-04",mode:"DAY"},ctx).ok,true);
}],
["missing date approval rejects calendar exception",()=>{
  const x={...ctx,calendarOverrides:adapter.calendarRows([["2026/11/02","","","休假"]],"TEST-COMPANY")};
  assert.equal(svc.calendarDay("2026-11-02",x).code,"DAY_OVERRIDE_UNCONFIRMED");
}],
["all-company full stop one row covers employee",()=>{
  const row=["TEST-E","2026/11/03","颱風","全公司","","全日","照常給薪",
    "TEST-ANNOUNCEMENT","已確認","TEST-HR","2026-10-29","", "假資料"];
  const ev=adapter.eventRows([row],employee.company);
  assert.equal(ev.length,1);assert.equal(ev[0].scope,"ALL");
  const x=svc.evaluateAttendance({date:"2026-11-03",scheduledWorkMinutes:480,actualWorkedMinutes:0},
    {...ctx,events:ev},pay);
  assert.equal(x.code,"DISASTER_NO_WORK");
  assert.equal(x.attendance.paidStopMinutes,480);
  assert.equal(x.attendance.actualWorkedMinutes,0);
}],
["legacy employee-specific input no longer accepted",()=>{
  const row=["TEST-E","2026/11/03","颱風","指定員工","TEST002;TEST003","全日",
    "照常給薪","TEST-EVIDENCE","已確認","TEST-HR","2026-10-29"];
  const ev=adapter.eventRows([row],employee.company);
  assert.equal(ev[0].scope,"UNKNOWN");
  assert.equal(Object.prototype.hasOwnProperty.call(ev[0],"employeeIds"),false);
  assert.equal(svc.eventFor("2026-11-03",{...ctx,events:ev},480).code,"EVENT_SCOPE_UNVERIFIED");
}],
["site-level exception remains supported without individual employee IDs",()=>{
  const ev=adapter.eventRows([["TEST-E","2026/11/03","颱風","指定打卡地點","W2","全日",
    "照常給薪","TEST-EVIDENCE","已確認","TEST-HR","2026-10-29"]],employee.company);
  assert.equal(ev[0].scope,"WORKPLACE");
  assert.equal(ev[0].workplace,"W2");
  assert.equal(svc.eventFor("2026-11-03",{...ctx,events:ev},480).event,null);
}],
["unconfirmed event never counted as confirmed",()=>{
  const ev=adapter.eventRows([["TEST-E","2026/11/03","颱風","全公司","","全日",
    "照常給薪","TEST-EVIDENCE","待確認"]],employee.company);
  assert.equal(svc.eventFor("2026-11-03",{...ctx,events:ev},480).code,"EVENT_UNCONFIRMED");
}],
["partial stop with approved minutes never protects whole workday",()=>{
  const ev=adapter.eventRows([["TEST-E","2026/11/03","颱風","全公司","","部分",
    "照常給薪","TEST-EVIDENCE","已確認","TEST-HR","2026-10-29",240]],employee.company);
  const x=svc.evaluateAttendance({date:"2026-11-03",scheduledWorkMinutes:480,actualWorkedMinutes:0},
    {...ctx,events:ev},pay);
  assert.equal(x.code,"DISASTER_PARTIAL_SUSPENSION_REVIEW");
  assert.equal(x.attendance.fullAttendanceProtected,false);
}],
["invalid event scope fails closed",()=>{
  const ev=adapter.eventRows([["TEST-E","2026/11/03","颱風","不明範圍","","全日",
    "照常給薪","TEST-EVIDENCE","已確認","TEST-HR","2026-10-29"]],employee.company);
  assert.equal(svc.eventFor("2026-11-03",{...ctx,events:ev},480).code,"EVENT_SCOPE_UNVERIFIED");
}],
["pending annual check blocks new leave",()=>{
  const c={...ctx,annualChecks:adapter.annualChecks([["2026","TEST-COMPANY","待確認","TEST-HR","2026-10-29"]])};
  assert.equal(svc.validateLeave({startDate:"2026-11-03",endDate:"2026-11-03",mode:"DAY"},c).code,
    "CALENDAR_OR_EVENT_REVIEW_REQUIRED");
}]
];
let passed=0;
for(const [label,fn] of tests){
 try{fn();passed++;console.log("PASS",label);}
 catch(e){console.error("FAIL",label,e.message);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
