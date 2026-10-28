"use strict";
/* Run locally: node staging/AttendanceV2_WorkdayAndPayroll.test.js
 * This file does not access GAS, Google Sheet, LINE or production data.
 */
const assert=require("node:assert/strict");
const calendar=require("../employee-center-preview/workday-rules.js");
const {evaluateAttendanceException:evaluate}=require("./AttendanceV2_PayrollExceptionRules.js");
const tests=[
 ["Fri-to-Mon includes weekend; reject",()=>{
   const r=calendar.validateRange("2026-10-30","2026-11-02");
   assert.equal(r.ok,false);assert.equal(r.code,"NON_WORKDAY_IN_RANGE");
   assert.deepEqual(r.blocked.map(x=>x.date),["2026-10-31","2026-11-01"]);
 }],
 ["Mon-to-Wed accepted in weekly demo",()=>{
   assert.equal(calendar.validateRange("2026-11-02","2026-11-04").ok,true);
 }],
 ["Saturday single-day rejected",()=>{
   assert.equal(calendar.validateRange("2026-10-31","2026-10-31").ok,false);
 }],
 ["Approved make-up Saturday is workday",()=>{
   assert.equal(calendar.validateRange("2026-10-31","2026-10-31",
     {overrides:{"2026-10-31":{kind:"work",reason:"test replacement working day"}}}).ok,true);
 }],
 ["An approved off-day overrides weekdays",()=>{
   assert.equal(calendar.validateRange("2026-11-02","2026-11-02",
     {overrides:{"2026-11-02":{kind:"off",reason:"test holiday"}}}).code,"NON_WORKDAY_IN_RANGE");
 }],
 ["Impossible date rejected",()=>{
   assert.equal(calendar.validateRange("2026-02-30","2026-03-01").code,"BAD_DATE");
 }],
 ["Reverse dates rejected",()=>{
   assert.equal(calendar.validateRange("2026-11-03","2026-11-02").code,"END_BEFORE_START");
 }],
 ["Verified calendar is mandatory for real writes",()=>{
   assert.equal(calendar.validateRange("2026-11-02","2026-11-04",
     {requireVerifiedCalendar:true}).code,"CALENDAR_UNVERIFIED");
   assert.equal(calendar.validateRange("2026-11-02","2026-11-04",
     {requireVerifiedCalendar:true,verifiedMonths:["2026-11"]}).ok,true);
 }],
 ["Approved disaster no work, employer pays",()=>{
   const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:0,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:480},companyPaysStopMinutes:true});
   assert.equal(x.status,"DISASTER_NO_WORK");assert.equal(x.absenceMinutes,0);
   assert.equal(x.actualWorkedMinutes,0);assert.equal(x.paidStopMinutes,480);
   assert.equal(x.fullAttendanceProtected,true);
 }],
 ["Not applicable / unapproved events do not auto-mark absence",()=>{
   for(const stopEvent of [{hrConfirmed:true,appliesToEmployee:false,protectedMinutes:480},
      {hrConfirmed:false,appliesToEmployee:true,protectedMinutes:480}]){
     const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:0,stopEvent,companyPaysStopMinutes:true});
     assert.equal(x.status,"MISSING_PUNCH_REVIEW");assert.equal(x.absenceMinutes,null);
   }
 }],
 ["Working in disaster retains actual hours and needs payroll review",()=>{
   const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:300,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:480},companyPaysStopMinutes:true});
   assert.equal(x.status,"DISASTER_ACTUAL_WORK_REVIEW");
   assert.equal(x.actualWorkedMinutes,300);assert.equal(x.paidStopMinutes,0);
   assert.equal(x.requiresHumanReview,true);
 }],
 ["Existing approved leave is never auto-cancelled",()=>{
   const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:0,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:480},
     approvedLeaveOverlaps:true,companyPaysStopMinutes:true});
   assert.equal(x.status,"DISASTER_APPROVED_LEAVE_CONFLICT");
   assert(x.flags.includes("DO_NOT_AUTO_CANCEL_APPROVED_LEAVE"));
 }],
 ["Partial stop protects only event hours",()=>{
   const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:0,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:240},companyPaysStopMinutes:true});
   assert.equal(x.status,"DISASTER_PARTIAL_SUSPENSION_REVIEW");
   assert.equal(x.paidStopMinutes,240);
   assert.equal(x.unresolvedScheduledMinutes,240);
   assert.equal(x.absenceMinutes,0);
   assert.equal(x.requiresHumanReview,true);
 }],
 ["Unscheduled day has no automatic payable suspension time",()=>{
   const x=evaluate({scheduledWorkMinutes:0,actualWorkedMinutes:0,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:480},companyPaysStopMinutes:true});
   assert.equal(x.status,"NONWORKDAY");assert.equal(x.paidStopMinutes,0);
 }],
 ["If company does not choose pay, wage treatment requires review",()=>{
   const x=evaluate({scheduledWorkMinutes:480,actualWorkedMinutes:0,
     stopEvent:{hrConfirmed:true,appliesToEmployee:true,protectedMinutes:480},companyPaysStopMinutes:false});
   assert.equal(x.requiresHumanReview,true);
 }]
];
let passed=0;
for(const [label,fn] of tests){
 try{fn();passed++;console.log("PASS",label);}
 catch(err){console.error("FAIL",label,err);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" passed");
