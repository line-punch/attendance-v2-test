"use strict";
/* Two-sheet V2 rules regression. All test names/IDs are fictional.
 * Run: node staging/AttendanceV2_CalendarAndEventService.test.js
 */
const assert=require("node:assert/strict");
const service=require("./AttendanceV2_CalendarAndEventService.js");
const {evaluateAttendanceException:pay}=require("./AttendanceV2_PayrollExceptionRules.js");
const A={employeeId:"TEST001",company:"TEST-ONE",workplace:"W1"};
const B={employeeId:"TEST002",company:"TEST-ONE",workplace:"W2"};
const C={employeeId:"TEST003",company:"TEST-OTHER",workplace:"W9"};
const check=(year="2026",company="TEST-ONE",status="CONFIRMED")=>
  ({year,company,status,confirmedBy:"TEST-HR",confirmedAt:"2026-10-29"});
const override=(date,dayType="OFF",extras={})=>({date,company:"TEST-ONE",dayType,
  status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29",reason:"測試",...extras});
const event=(date,extras={})=>({
  date,company:"TEST-ONE",eventId:"TEST-E1",scope:"ALL",period:"FULL",type:"TYPHOON",
  payPolicy:"PAID",status:"CONFIRMED",confirmedBy:"TEST-HR",confirmedAt:"2026-10-29",
  reference:"MOCK-NOT-OFFICIAL",...extras
});
const ctx=(employee=A)=>({employee,today:"2026-10-29",annualChecks:[check()],
  calendarOverrides:[],events:[],scheduledMinutesByDate:{}});
const leave=(startDate="2026-10-30",endDate="2026-11-02",mode="DAY")=>
  ({startDate,endDate,mode});
const tests=[
 ["calendar does not require monthly approval",()=>{
   const c=ctx();assert.equal(service.calendarDay("2026-10-30",c).ok,true);
   assert.equal(service.calendarDay("2026-11-02",c).ok,true);
 }],
 ["missing annual signoff blocks",()=>{
   const c=ctx();c.annualChecks=[];
   assert.equal(service.calendarDay("2026-11-02",c).code,"YEAR_UNVERIFIED");
 }],
 ["pending annual signoff blocks",()=>{
   const c=ctx();c.annualChecks=[check("2026","TEST-ONE","PENDING")];
   assert.equal(service.calendarDay("2026-11-02",c).code,"YEAR_UNVERIFIED");
 }],
 ["duplicate annual checks block",()=>{
   const c=ctx();c.annualChecks.push(check());
   assert.equal(service.calendarDay("2026-11-02",c).code,"YEAR_CHECK_CONFLICT");
 }],
 ["cross-year requires next-year annual check",()=>{
   const c=ctx();assert.equal(service.validateLeave(leave("2026-12-31","2027-01-01"),c).code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
   c.annualChecks.push(check("2027"));assert.equal(service.validateLeave(leave("2026-12-31","2027-01-01"),c).ok,true);
 }],
 ["Friday to Monday cannot cross nonwork days",()=>{
   const x=service.validateLeave(leave(),ctx());
   assert.equal(x.code,"NON_WORKDAY_IN_RANGE");
   assert.deepEqual(x.off.map(a=>a.date),["2026-10-31","2026-11-01"]);
 }],
 ["same weekday range is permitted",()=>{
   assert.equal(service.validateLeave(leave("2026-11-02","2026-11-04"),ctx()).ok,true);
 }],
 ["work Saturday exception can be requested",()=>{
   const c=ctx();c.calendarOverrides=[override("2026-10-31","WORK")];
   assert.equal(service.validateLeave(leave("2026-10-31","2026-10-31"),c).ok,true);
 }],
 ["holiday Monday exception blocks",()=>{
   const c=ctx();c.calendarOverrides=[override("2026-11-02")];
   assert.equal(service.validateLeave(leave("2026-11-02","2026-11-02"),c).code,"NON_WORKDAY_IN_RANGE");
 }],
 ["site-specific calendar overrides default for other site only",()=>{
   const c=ctx();c.calendarOverrides=[
     override("2026-11-02","OFF"),
     override("2026-11-02","WORK",{workplace:"W1"})];
   assert.equal(service.calendarDay("2026-11-02",c).isWorkday,true);
   c.employee=B;assert.equal(service.calendarDay("2026-11-02",c).isWorkday,false);
 }],
 ["unconfirmed day override blocks",()=>{
   const c=ctx();c.calendarOverrides=[override("2026-11-02","OFF",{status:"DRAFT"})];
   assert.equal(service.calendarDay("2026-11-02",c).code,"DAY_OVERRIDE_UNCONFIRMED");
 }],
 ["duplicate day overrides block",()=>{
   const c=ctx();c.calendarOverrides=[override("2026-11-02"),override("2026-11-02")];
   assert.equal(service.calendarDay("2026-11-02",c).code,"DAY_OVERRIDE_CONFLICT");
 }],
 ["invalid date blocked",()=>{
   assert.equal(service.validateLeave(leave("2026-02-30","2026-03-01"),ctx()).code,"BAD_DATE");
 }],
 ["reverse date blocked",()=>{
   assert.equal(service.validateLeave(leave("2026-11-04","2026-11-02"),ctx()).code,"END_BEFORE_START");
 }],
 ["past date blocked",()=>{
   assert.equal(service.validateLeave(leave("2026-10-27","2026-10-27"),ctx()).code,"PAST_DATE");
 }],
 ["hours mode single day only",()=>{
   assert.equal(service.validateLeave(leave("2026-11-02","2026-11-03","HOURS"),ctx()).code,"HOURS_MULTI_DAY");
 }],
 ["hour time range validated",()=>{
   const r=leave("2026-11-02","2026-11-02","HOURS");r.startTime="17:30";r.endTime="08:30";
   assert.equal(service.validateLeave(r,ctx()).code,"LEAVE_HOURS_INVALID");
   r.startTime="08:30";r.endTime="09:30";assert.equal(service.validateLeave(r,ctx()).ok,true);
 }],
 ["event absent normal employee not automatically absent",()=>{
   const x=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:null},ctx(),pay);
   assert.equal(x.code,"MISSING_PUNCH_REVIEW");assert.equal(x.noClockIsAbsence,false);
 }],
 ["company-wide full day event one row protects both local employees",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   const first=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},c,pay);
   assert.equal(first.code,"DISASTER_NO_WORK");
   assert.equal(first.attendance.actualWorkedMinutes,0);
   assert.equal(first.attendance.paidStopMinutes,480);
   assert.equal(first.attendance.absenceMinutes,0);
   assert.equal(first.attendance.fullAttendanceProtected,true);
   c.employee=B;
   assert.equal(service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:420,actualWorkedMinutes:0},c,pay).attendance.paidStopMinutes,420);
 }],
 ["other company not automatically covered by first company event",()=>{
   const c=ctx(C);c.annualChecks=[check("2026","TEST-OTHER")];c.events=[event("2026-11-02")];
   const r=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:null},c,pay);
   assert.equal(r.code,"MISSING_PUNCH_REVIEW");
 }],
 ["employee-specific stop scope is unsupported and cannot auto-reclassify attendance",()=>{
   const c=ctx();c.events=[event("2026-11-02",{scope:"EMPLOYEES",employeeIds:["TEST002"]})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_SCOPE_UNVERIFIED");
   c.employee=B;
   assert.equal(service.evaluateAttendance(
     {date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},c,pay
   ).code,"EVENT_SCOPE_UNVERIFIED");
 }],
 ["misconfigured company-wide stop with obsolete personal IDs is rejected",()=>{
   const c=ctx();c.events=[event("2026-11-02",{scope:"ALL",employeeIds:["TEST002"]})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_SCOPE_CONFLICT");
 }],
 ["site-only event limited to that workplace",()=>{
   const c=ctx();c.events=[event("2026-11-02",{scope:"WORKPLACE",workplace:"W1"})];
   assert(service.eventFor("2026-11-02",c,480).event);
   c.employee=B;assert.equal(service.eventFor("2026-11-02",c,480).event,null);
 }],
 ["pending whole-company event is not silently accepted",()=>{
   const c=ctx();c.events=[event("2026-11-02",{status:"DRAFT"})];
   assert.equal(service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},c,pay).code,"EVENT_UNCONFIRMED");
 }],
 ["site-specific stop with missing site fails closed",()=>{
   const c=ctx();c.events=[event("2026-11-02",{scope:"WORKPLACE",workplace:""})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_WORKPLACE_UNVERIFIED");
 }],
 ["individual exception is handled by HR without creating personal stop rows",()=>{
   const c=ctx(); // no confirmed company-wide event for this date
   const result=service.evaluateAttendance(
     {date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:null},c,pay);
   assert.equal(result.code,"MISSING_PUNCH_REVIEW");
   assert.equal(result.noClockIsAbsence,false);
 }],
 ["event without a type fails closed",()=>{
   const c=ctx();c.events=[event("2026-11-02",{type:""})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_TYPE_UNVERIFIED");
 }],
 ["scope missing is not inferred as all employees",()=>{
   const c=ctx();c.events=[event("2026-11-02",{scope:""})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_SCOPE_UNVERIFIED");
 }],
 ["stop event needs evidence",()=>{
   const c=ctx();c.events=[event("2026-11-02",{reference:""})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_UNCONFIRMED");
 }],
 ["unknown actual work minutes not treated as 0",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   assert.equal(service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:null},c,pay).code,"ACTUAL_WORK_MINUTES_UNVERIFIED");
 }],
 ["actual storm day work remains actual work and needs HR review",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   const x=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:300},c,pay);
   assert.equal(x.code,"DISASTER_ACTUAL_WORK_REVIEW");
   assert.equal(x.attendance.actualWorkedMinutes,300);assert.equal(x.needsHRReview,true);
 }],
 ["partial stop is not a full day attendance approval",()=>{
   const c=ctx();c.events=[event("2026-11-02",{period:"PARTIAL",protectedMinutes:240})];
   const x=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},c,pay);
   assert.equal(x.code,"DISASTER_PARTIAL_SUSPENSION_REVIEW");
   assert.equal(x.attendance.fullAttendanceProtected,false);
   assert.equal(x.attendance.paidStopMinutes,240);
   assert.equal(x.attendance.unresolvedScheduledMinutes,240);
 }],
 ["partial without verified minutes blocks",()=>{
   const c=ctx();c.events=[event("2026-11-02",{period:"PARTIAL"})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"STOP_MINUTES_UNVERIFIED");
 }],
 ["multiple same-day applicable events require review",()=>{
   const c=ctx();c.events=[event("2026-11-02"),event("2026-11-02",{eventId:"TEST-E2"})];
   assert.equal(service.eventFor("2026-11-02",c,480).code,"EVENT_OVERLAP_REVIEW");
 }],
 ["event overlaps requested leave needs HR review",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   c.scheduledMinutesByDate["2026-11-02"]=480;
   const x=service.validateLeave(leave("2026-11-02","2026-11-02"),c);
   assert.equal(x.code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
   assert.equal(x.review[0].code,"STOP_EVENT_NEEDS_HR_REVIEW");
 }],
 ["event overlap with missing schedule needs manual review",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   assert.equal(service.validateLeave(leave("2026-11-02","2026-11-02"),c).review[0].code,"SCHEDULE_UNVERIFIED");
 }],
 ["already approved leave overlapping storm not auto cancelled",()=>{
   const c=ctx();c.events=[event("2026-11-02")];
   const x=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0,approvedLeaveOverlaps:true},c,pay);
   assert.equal(x.code,"DISASTER_APPROVED_LEAVE_CONFLICT");assert.equal(x.needsHRReview,true);
 }],
 ["weekend storm does not fabricate scheduled work or wages",()=>{
   const c=ctx();c.events=[event("2026-10-31")];
   const x=service.evaluateAttendance({date:"2026-10-31",scheduledWorkMinutes:0,actualWorkedMinutes:0},c,pay);
   assert.equal(x.code,"NON_WORKDAY");assert.equal(x.noClockIsAbsence,false);
 }],
 ["stop event marked for salary review not auto paid",()=>{
   const c=ctx();c.events=[event("2026-11-02",{payPolicy:"REVIEW"})];
   const x=service.evaluateAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},c,pay);
   assert.equal(x.attendance.paidStopMinutes,0);assert.equal(x.needsHRReview,true);
 }]
];
let ok=0;
for(const [name,fn] of tests)try{fn();ok++;console.log("PASS",name);}
catch(e){console.error("FAIL",name,e.message);process.exitCode=1;}
console.log(ok+"/"+tests.length+" PASSED");
