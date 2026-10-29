"use strict";
/* Offline sandbox regression suite:
 * node staging/AttendanceV2_CalendarAndEventService.test.js
 * This does not contact LINE, Google, payroll, employees, or live Sheets.
 */
const assert=require("node:assert/strict");
const svc=require("./AttendanceV2_CalendarAndEventService.js");
const {evaluateAttendanceException:pay}=require("./AttendanceV2_PayrollExceptionRules.js");

const yc=Object.freeze({employeeId:"TEST001",company:"TEST-詠晨",workplace:"TEST-新莊"});
const yt=Object.freeze({employeeId:"TEST002",company:"TEST-昱鈦",workplace:"TEST-楊梅"});
const approval=(month,employee=yc,status="APPROVED")=>({
  month,company:employee.company,workplace:employee.workplace,status,
  approvedBy:"TEST-HR",approvedAt:"2026-10-01T08:00:00+08:00"});
const override=(date,employee=yc,dayType="OFF",reason="示例公司休假",workplace=employee.workplace)=>({
  date,company:employee.company,workplace,dayType,reason,status:"APPROVED",
  approvedBy:"TEST-HR",approvedAt:"2026-10-01T08:00:00+08:00"});
const event=(date,employee=yc,eventId="TEST-E1",workplace=employee.workplace)=>({
  date,company:employee.company,workplace,eventId,type:"TYPHOON",status:"APPROVED",
  reference:"TEST-NOT-A-REAL-ANNOUNCEMENT",reviewedBy:"TEST-HR",reviewedAt:"2026-10-28T18:00:00+08:00"});
const review=(employee=yc,eventId="TEST-E1",applies=true,protectedMinutes=480,paid=true)=>({
  eventId,employeeId:employee.employeeId,applies,protectedMinutes,paid,status:"APPROVED",
  reviewedBy:"TEST-HR",reviewedAt:"2026-10-28T18:00:00+08:00"});
function ctx(employee=yc){
  return {employee,monthApprovals:[approval("2026-10",employee),approval("2026-11",employee)],
    calendar:[],events:[],employeeReviews:[],today:"2026-10-29",scheduledMinutesPerDay:{"2026-11-02":480}};
}
function leave(a="2026-10-30",b="2026-11-02",mode="DAY"){
  return {startDate:a,endDate:b,mode,leaveType:"事假",reason:"測試"};
}
const cases=[
  ["valid ISO leap year",()=>{
    assert(svc.isoDay("2028-02-29"));assert.equal(svc.isoDay("2027-02-29"),null);
  }],
  ["reject malformed date",()=>{
    assert.equal(svc.validateLeave(leave("2026-02-30","2026-03-01"),ctx()).code,"BAD_DATE");
  }],
  ["reject reversed dates",()=>{
    assert.equal(svc.validateLeave(leave("2026-11-05","2026-11-04"),ctx()).code,"END_BEFORE_START");
  }],
  ["reject unbounded long ranges",()=>{
    assert.equal(svc.validateLeave(leave("2026-11-02","2028-05-02"),ctx()).code,"RANGE_TOO_LONG");
  }],
  ["Friday to Monday blocked on weekend",()=>{
    const x=svc.validateLeave(leave(),ctx());
    assert.equal(x.code,"NON_WORKDAY_IN_RANGE");
    assert.deepEqual(x.blocked.map(z=>z.date),["2026-10-31","2026-11-01"]);
  }],
  ["weekday only leave accepted when both months verified",()=>{
    const x=svc.validateLeave(leave("2026-11-02","2026-11-04"),ctx());
    assert.equal(x.ok,true);assert.equal(x.workdayCount,3);
  }],
  ["no inferred month approval",()=>{
    const x=ctx();x.monthApprovals=x.monthApprovals.filter(r=>r.month!=="2026-11");
    assert.equal(svc.validateLeave(leave("2026-11-02","2026-11-03"),x).code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
  }],
  ["unknown work location does not inherit another location signoff",()=>{
    const x=ctx(yt);x.monthApprovals=[approval("2026-10",yc)];
    assert.equal(svc.workday(yt,"2026-10-30",x.calendar,x.monthApprovals).code,"MONTH_UNVERIFIED");
  }],
  ["duplicate monthly signoffs block",()=>{
    const x=ctx();x.monthApprovals.push(approval("2026-11"));
    assert.equal(svc.workday(yc,"2026-11-02",x.calendar,x.monthApprovals).code,"MONTH_APPROVAL_CONFLICT");
  }],
  ["pending month signoff blocks",()=>{
    const x=ctx();x.monthApprovals=[approval("2026-11",yc,"PENDING")];
    assert.equal(svc.workday(yc,"2026-11-02",x.calendar,x.monthApprovals).code,"MONTH_UNVERIFIED");
  }],
  ["weekend make-up work accepted if HR-approved override",()=>{
    const x=ctx();x.calendar=[override("2026-10-31",yc,"WORK","示例補班")];
    assert.equal(svc.validateLeave(leave("2026-10-31","2026-10-31"),x).ok,true);
  }],
  ["approved holiday on Monday blocks leave",()=>{
    const x=ctx();x.calendar=[override("2026-11-02")];
    const y=svc.validateLeave(leave("2026-11-02","2026-11-02"),x);
    assert.equal(y.code,"NON_WORKDAY_IN_RANGE");assert.equal(y.blocked[0].reason,"示例公司休假");
  }],
  ["company global override applies, but site override wins",()=>{
    const x=ctx();x.calendar=[override("2026-11-02",yc,"OFF","全公司", "*"),override("2026-11-02",yc,"WORK","據點覆寫")];
    assert.equal(svc.workday(yc,"2026-11-02",x.calendar,x.monthApprovals).workday,true);
  }],
  ["duplicate same-location daily override blocks",()=>{
    const x=ctx();x.calendar=[override("2026-11-02"),override("2026-11-02")];
    assert.equal(svc.workday(yc,"2026-11-02",x.calendar,x.monthApprovals).code,"DAY_OVERRIDE_CONFLICT");
  }],
  ["draft day override fails closed",()=>{
    const x=ctx();const o=override("2026-11-02");o.status="PENDING";x.calendar=[o];
    assert.equal(svc.workday(yc,"2026-11-02",x.calendar,x.monthApprovals).code,"DAY_OVERRIDE_UNAPPROVED");
  }],
  ["future workday leave cannot start in past",()=>{
    assert.equal(svc.validateLeave(leave("2026-10-26","2026-10-26"),ctx()).code,"PAST_DATE");
  }],
  ["hours mode only one day",()=>{
    assert.equal(svc.validateLeave(leave("2026-11-02","2026-11-03","HOURS"),ctx()).code,"HOURS_MULTI_DAY");
  }],
  ["hours mode invalid clock range rejected",()=>{
    const x=leave("2026-11-02","2026-11-02","HOURS");x.startTime="17:00";x.endTime="09:00";
    assert.equal(svc.validateLeave(x,ctx()).code,"LEAVE_HOURS_INVALID");
  }],
  ["hours same day permitted with valid time",()=>{
    const x=leave("2026-11-02","2026-11-02","HOURS");x.startTime="09:00";x.endTime="11:00";
    assert.equal(svc.validateLeave(x,ctx()).ok,true);
  }],
  ["suspension event with missing HR individual review blocks",()=>{
    const x=ctx();x.events=[event("2026-11-02")];
    assert.equal(svc.validateLeave(leave("2026-11-02","2026-11-02"),x).code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
  }],
  ["unapproved event blocks even if month calendar approved",()=>{
    const x=ctx(),e=event("2026-11-02");e.status="DRAFT";x.events=[e];
    assert.equal(svc.eventDecision(yc,"2026-11-02",x.events,x.employeeReviews,480).code,"EVENT_NOT_VERIFIED");
  }],
  ["future leave overlapping disaster requires known work schedule",()=>{
    const x=ctx();delete x.scheduledMinutesPerDay["2026-11-02"];
    x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    const y=svc.validateLeave(leave("2026-11-02","2026-11-02"),x);
    assert.equal(y.code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
    assert.equal(y.unverified[0].code,"SCHEDULE_UNVERIFIED");
  }],
  ["HR explicitly excludes employee from event",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review(yc,"TEST-E1",false)];
    assert.equal(svc.validateLeave(leave("2026-11-02","2026-11-02"),x).ok,true);
  }],
  ["HR approved applicable event blocks new leave without reconciliation",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    const y=svc.validateLeave(leave("2026-11-02","2026-11-02"),x);
    assert.equal(y.code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
    assert.equal(y.unverified[0].code,"EVENT_OVERLAP_NEEDS_HR_REVIEW");
  }],
  ["different company is not automatically eligible for disaster",()=>{
    const x=ctx(yt);x.events=[event("2026-11-02",yc)];
    const y=svc.eventDecision(yt,"2026-11-02",x.events,x.employeeReviews,480);
    assert.equal(y.ok,true);assert.equal(y.event,null);
  }],
  ["approved full day disaster is no absence and paid by company",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},x,pay);
    assert.equal(y.code,"DISASTER_NO_WORK");assert.equal(y.attendance.actualWorkedMinutes,0);
    assert.equal(y.attendance.paidStopMinutes,480);assert.equal(y.attendance.absenceMinutes,0);
    assert.equal(y.attendance.fullAttendanceProtected,true);
  }],
  ["do not synthesize hours for unverified work minutes",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    assert.equal(svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480},x,pay).code,"WORK_MINUTES_UNVERIFIED");
  }],
  ["disaster day worker attendance is preserved not multiplied",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:300},x,pay);
    assert.equal(y.code,"DISASTER_ACTUAL_WORK_REVIEW");assert.equal(y.attendance.actualWorkedMinutes,300);
    assert.equal(y.attendance.paidStopMinutes,0);assert.equal(y.needsHRReview,true);
  }],
  ["partial day: unresolved remainder is not automatic absence",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review(yc,"TEST-E1",true,240)];
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},x,pay);
    assert.equal(y.code,"DISASTER_PARTIAL_SUSPENSION_REVIEW");
    assert.equal(y.attendance.unresolvedScheduledMinutes,240);assert.equal(y.attendance.absenceMinutes,0);
    assert.equal(y.attendance.fullAttendanceProtected,false);
  }],
  ["approved leave overlap requires human action, not auto cancellation",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0,approvedLeaveOverlaps:true},x,pay);
    assert.equal(y.code,"DISASTER_APPROVED_LEAVE_CONFLICT");assert.equal(y.needsHRReview,true);
  }],
  ["unconfirmed event never becomes automatic absence",()=>{
    const x=ctx();x.events=[event("2026-11-02")];
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:0},x,pay);
    assert.equal(y.code,"PERSON_EVENT_REVIEW_PENDING");assert.equal(y.noClockIsAbsence,false);
  }],
  ["two overlapping events must be manually reconciled",()=>{
    const x=ctx();x.events=[event("2026-11-02"),event("2026-11-02",yc,"TEST-E2")];
    x.employeeReviews=[review(),review(yc,"TEST-E2",true,480)];
    assert.equal(svc.eventDecision(yc,"2026-11-02",x.events,x.employeeReviews,480).code,"MULTIPLE_APPLICABLE_EVENTS_REVIEW");
  }],
  ["missing schedule should not fabricate an 8-hour wage",()=>{
    const x=ctx();x.events=[event("2026-11-02")];x.employeeReviews=[review()];
    assert.equal(svc.resolveAttendance({date:"2026-11-02",actualWorkedMinutes:0},x,pay).code,"SCHEDULE_UNVERIFIED");
  }],
  ["missing punch on normal workday needs HR review, not immediate absence",()=>{
    const y=svc.resolveAttendance({date:"2026-11-02",scheduledWorkMinutes:480,actualWorkedMinutes:null},ctx(),pay);
    assert.equal(y.code,"MISSING_PUNCH_REVIEW");assert.equal(y.noClockIsAbsence,false);
  }],
  ["weekend with no work is not absence or paid stop day",()=>{
    const y=svc.resolveAttendance({date:"2026-10-31",scheduledWorkMinutes:0,actualWorkedMinutes:0},ctx(),pay);
    assert.equal(y.code,"NON_WORKDAY");assert.equal(y.noClockIsAbsence,false);
  }]
];
let passed=0;
for(const [name,fn] of cases){
  try{fn();passed++;console.log("PASS",name);}
  catch(e){console.error("FAIL",name,e);process.exitCode=1;}
}
console.log(passed+"/"+cases.length+" PASSED");
