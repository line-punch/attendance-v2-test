/**
 * LINE V2: read-only full rule verification against exactly three SYNTHETIC
 * rows in TEST001's isolated HR tabs. DO NOT use in production.
 *
 * Dependencies already pasted:
 *  - v2hrGuardTestSheet_
 *  - v2hrReadTestCalendarContext_
 *
 * This file contains frozen copies of the two previously unit-tested
 * pure rule functions. It does NOT call any write, send, deployment, or UI API.
 * The author should run ONLY v2hrVerifySyntheticRules_TEST_ONLY in editor.
 * Does not modify actual punches, leave, salaries, or either HR sheet.
 *
 * The dates below are MOCK 2026-11-11 and MOCK 2026-11-12 — NOT real holidays
 * or government typhoon closures.
 */

var V2HR_TEST_RULES = (function(){

  const DAY=86400000, APPROVED="CONFIRMED";
  const resultError=(code,details={})=>({ok:false,code,...details});
  function parseDate(s){
    if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
    const y=+s.slice(0,4),m=+s.slice(5,7),d=+s.slice(8,10);
    if(y<1900||y>2100||m<1||m>12)return null;
    const v=new Date(Date.UTC(y,m-1,d));
    return v.getUTCFullYear()===y&&v.getUTCMonth()+1===m&&v.getUTCDate()===d?v:null;
  }
  function formatDate(d){
    return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
  }
  function dateRange(start,end){
    const a=parseDate(start),b=parseDate(end);
    if(!a||!b)return resultError("BAD_DATE");
    const count=Math.round((b.getTime()-a.getTime())/DAY)+1;
    if(count<1)return resultError("END_BEFORE_START");
    if(count>366)return resultError("RANGE_TOO_LONG");
    return {ok:true,days:Array.from({length:count},(_,i)=>formatDate(new Date(a.getTime()+i*DAY)))};
  }
  function validEmployee(e){
    return !!(e&&typeof e.employeeId==="string"&&e.employeeId.trim()&&
      typeof e.company==="string"&&e.company.trim());
  }
  function confirmed(row){
    return row&&row.status===APPROVED&&!!row.confirmedBy&&!!row.confirmedAt;
  }
  function calendarDay(date,ctx){
    if(!parseDate(date))return resultError("BAD_DATE");
    const emp=ctx&&ctx.employee;
    if(!validEmployee(emp))return resultError("EMPLOYEE_SCOPE_MISSING");
    // annualChecks is a setting/header section of 公司工作日曆,
    // NOT a separate sheet and NOT a monthly HR approval.
    const checks=(ctx.annualChecks||[]).filter(x=>x.year===date.slice(0,4)&&x.company===emp.company);
    if(checks.length!==1)return resultError(checks.length?"YEAR_CHECK_CONFLICT":"YEAR_UNVERIFIED",{date});
    if(!confirmed(checks[0]))return resultError("YEAR_UNVERIFIED",{date});
    const changes=(ctx.calendarOverrides||[]).filter(x=>x.date===date&&x.company===emp.company&&
      (!x.workplace||x.workplace===emp.workplace));
    if(changes.some(x=>!confirmed(x)))return resultError("DAY_OVERRIDE_UNCONFIRMED",{date});
    if(changes.some(x=>!["WORK","OFF"].includes(x.dayType)))return resultError("DAY_OVERRIDE_INVALID",{date});
    const exact=changes.filter(x=>x.workplace&&x.workplace===emp.workplace);
    const generic=changes.filter(x=>!x.workplace);
    const selected=exact.length?exact:generic;
    if(selected.length>1)return resultError("DAY_OVERRIDE_CONFLICT",{date});
    const weekday=parseDate(date).getUTCDay();
    const work=weekday>=1&&weekday<=5;
    return {ok:true,date,isWorkday:selected.length?selected[0].dayType==="WORK":work,
      reason:selected.length?(selected[0].reason||"公司已核對的日曆異動"):work?"一般上班日":weekday===6?"星期六":"星期日",
      source:selected.length?"APPROVED_OVERRIDE":"WEEKLY_BASE"};
  }
  function eventFor(date,ctx,scheduledMinutes){
    if(!parseDate(date))return resultError("BAD_DATE");
    const emp=ctx&&ctx.employee;
    if(!validEmployee(emp))return resultError("EMPLOYEE_SCOPE_MISSING");
    const candidates=(ctx.events||[]).filter(x=>x.date===date&&x.company===emp.company);
    const applicable=[];
    for(const e of candidates){
      // No silent broadening of eligibility when scope or confirmation is missing.
      // Explicitly disallow per-employee automated scope. An exceptional
      // employee situation must be reviewed manually; never infer absence.
      if(!["ALL","WORKPLACE"].includes(e.scope))
        return resultError("EVENT_SCOPE_UNVERIFIED",{date});
      if(e.scope==="ALL"&&(e.workplace||
         (Array.isArray(e.employeeIds)&&e.employeeIds.length)))
        return resultError("EVENT_SCOPE_CONFLICT",{date});
      if(e.scope==="WORKPLACE"&&Array.isArray(e.employeeIds)&&e.employeeIds.length)
        return resultError("EVENT_SCOPE_CONFLICT",{date});
      if(!e.type)return resultError("EVENT_TYPE_UNVERIFIED",{date});
      if(e.scope==="WORKPLACE"&&!e.workplace)
        return resultError("EVENT_WORKPLACE_UNVERIFIED",{date});
      if(e.scope==="WORKPLACE"&&e.workplace!==emp.workplace)continue;
      if(!confirmed(e)||!e.eventId||!e.reference||!["FULL","PARTIAL"].includes(e.period)||
        !["PAID","REVIEW"].includes(e.payPolicy))return resultError("EVENT_UNCONFIRMED",{date});
      applicable.push(e);
    }
    if(applicable.length>1)return resultError("EVENT_OVERLAP_REVIEW",{date});
    if(!applicable.length)return {ok:true,event:null};
    const e=applicable[0];
    if(!Number.isInteger(scheduledMinutes)||scheduledMinutes<=0)
      return resultError("SCHEDULE_UNVERIFIED",{date});
    const protectedMinutes=e.period==="FULL"?scheduledMinutes:e.protectedMinutes;
    if(!Number.isInteger(protectedMinutes)||protectedMinutes<=0||protectedMinutes>scheduledMinutes)
      return resultError("STOP_MINUTES_UNVERIFIED",{date});
    return {ok:true,event:{eventId:e.eventId,protectedMinutes,
      payPolicy:e.payPolicy,period:e.period,reference:e.reference}};
  }
  function validateLeave(request,ctx){
    if(!ctx||!validEmployee(ctx.employee))return resultError("EMPLOYEE_SCOPE_MISSING");
    const dates=dateRange(request&&request.startDate,request&&request.endDate);
    if(!dates.ok)return dates;
    if(ctx.today&&request.startDate<ctx.today)return resultError("PAST_DATE");
    if(!["DAY","HOURS"].includes(request.mode))return resultError("LEAVE_MODE_INVALID");
    if(request.mode==="HOURS"){
      if(dates.days.length!==1)return resultError("HOURS_MULTI_DAY");
      const pattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if(!pattern.test(request.startTime||"")||!pattern.test(request.endTime||"")||
        request.startTime>=request.endTime)return resultError("LEAVE_HOURS_INVALID");
    }
    const off=[],review=[];
    for(const date of dates.days){
      const day=calendarDay(date,ctx);
      if(!day.ok){review.push({date,code:day.code});continue;}
      if(!day.isWorkday){off.push({date,reason:day.reason});continue;}
      // If there is a known suspension, let HR resolve an overlapping leave.
      // Do not auto-cancel approved leave or automatically grant new leave.
      const sameDay=(ctx.events||[]).some(e=>e.date===date&&e.company===ctx.employee.company);
      if(sameDay){
        const ev=eventFor(date,ctx,(ctx.scheduledMinutesByDate||{})[date]);
        if(!ev.ok)review.push({date,code:ev.code});
        else if(ev.event)review.push({date,code:"STOP_EVENT_NEEDS_HR_REVIEW"});
      }
    }
    if(review.length)return resultError("CALENDAR_OR_EVENT_REVIEW_REQUIRED",{off,review});
    if(off.length)return resultError("NON_WORKDAY_IN_RANGE",{off});
    return {ok:true,code:"DATE_RULES_PASSED",days:dates.days,
      note:"Still requires authenticated employee, leave quota, conflicts and write-time recheck."};
  }
  function evaluateAttendance(input,ctx,payrollRules){
    const day=calendarDay(input&&input.date,ctx);
    if(!day.ok)return {...day,needsHRReview:true,noClockIsAbsence:false};
    if(!day.isWorkday)return {ok:true,code:"NON_WORKDAY",actualWorkedMinutes:input.actualWorkedMinutes??null,
      noClockIsAbsence:false,needsHRReview:Number(input.actualWorkedMinutes||0)>0};
    const minutes=input.scheduledWorkMinutes;
    if(!Number.isInteger(minutes)||minutes<=0)return resultError("SCHEDULE_UNVERIFIED",{needsHRReview:true});
    const ev=eventFor(input.date,ctx,minutes);
    if(!ev.ok)return {...ev,needsHRReview:true,noClockIsAbsence:false};
    if(ev.event&&(!Number.isInteger(input.actualWorkedMinutes)||input.actualWorkedMinutes<0))
      return resultError("ACTUAL_WORK_MINUTES_UNVERIFIED",{needsHRReview:true,noClockIsAbsence:false});
    if(typeof payrollRules!=="function")return resultError("PAYROLL_RULES_MISSING");
    const p=payrollRules({scheduledWorkMinutes:minutes,actualWorkedMinutes:input.actualWorkedMinutes??null,
      stopEvent:ev.event?{eventId:ev.event.eventId,hrConfirmed:true,appliesToEmployee:true,
        protectedMinutes:ev.event.protectedMinutes}:null,
      companyPaysStopMinutes:ev.event?ev.event.payPolicy==="PAID":false,
      approvedLeaveOverlaps:input.approvedLeaveOverlaps===true});
    return {ok:true,code:p.status,noClockIsAbsence:false,attendance:p,needsHRReview:p.requiresHumanReview,
      note:"This is a reviewable payroll candidate; never write salary or fabricate original punches."};
  }
  return Object.freeze({parseDate,dateRange,calendarDay,eventFor,validateLeave,evaluateAttendance});
})();

var V2HR_TEST_PAYROLL = (function(){
function evaluateAttendanceException(p) {
  if(!p || !Number.isInteger(p.scheduledWorkMinutes) || p.scheduledWorkMinutes<0)
    throw new Error("scheduledWorkMinutes must be a nonnegative integer");
  const scheduled=p.scheduledWorkMinutes;
  const actual=p.actualWorkedMinutes;
  if(actual!==null && actual!==undefined && (!Number.isInteger(actual)||actual<0))
    throw new Error("actualWorkedMinutes must be a nonnegative integer or null");
  const hasActualWork=Number.isInteger(actual)&&actual>0;
  const event=p.stopEvent;
  const applicable=!!(event&&event.hrConfirmed===true&&event.appliesToEmployee===true);
  const covered=applicable&&scheduled>0?
    Math.min(scheduled,Math.max(0,Number.isInteger(event.protectedMinutes)?event.protectedMinutes:0)):0;
  const flags=[];
  const common={
    actualWorkedMinutes:actual===undefined?null:actual,
    scheduledWorkMinutes:scheduled,
    protectedNoWorkMinutes:0,
    paidStopMinutes:0,
    unresolvedScheduledMinutes:scheduled,
    absenceMinutes:null,
    fullAttendanceProtected:false,
    requiresHumanReview:false,
    eventId:applicable?String(event.eventId||""):""
  };

  if(scheduled===0){
    return {...common,status:hasActualWork?"WORK_ON_NONWORKDAY_REVIEW":"NONWORKDAY",
      unresolvedScheduledMinutes:0,requiresHumanReview:hasActualWork,
      flags:hasActualWork?["WORK_ON_UNSCHEDULED_DAY_REVIEW"]:[]};
  }
  if(!applicable||covered===0){
    return {...common,status:hasActualWork?"ACTUAL_WORK":"MISSING_PUNCH_REVIEW",
      requiresHumanReview:!hasActualWork||!!p.approvedLeaveOverlaps,
      flags:!hasActualWork?["NEVER_AUTO_MARK_ABSENT_BEFORE_HR_REVIEW"]:[]};
  }

  // Preserve actual work; do not equate typhoon work with overtime or auto-pay doubles.
  if(hasActualWork){
    flags.push("REVIEW_ACTUAL_WORK_AND_ANY_ADDITIONAL_PAYMENT");
    if(p.approvedLeaveOverlaps)flags.push("PREEXISTING_APPROVED_LEAVE_HR_REVIEW");
    return {...common,status:"DISASTER_ACTUAL_WORK_REVIEW",
      protectedNoWorkMinutes:0,unresolvedScheduledMinutes:Math.max(0,scheduled-actual),
      fullAttendanceProtected:true,requiresHumanReview:true,flags};
  }

  if(p.approvedLeaveOverlaps){
    return {...common,status:"DISASTER_APPROVED_LEAVE_CONFLICT",
      protectedNoWorkMinutes:covered,unresolvedScheduledMinutes:scheduled-covered,
      fullAttendanceProtected:true,requiresHumanReview:true,
      flags:["DO_NOT_AUTO_CANCEL_APPROVED_LEAVE","PAY_AND_LEAVE_RECONCILIATION_REQUIRED"]};
  }

  const partial=covered<scheduled;
  if(partial)flags.push("PARTIAL_SUSPENSION_REMAINING_TIME_NEEDS_REVIEW");
  if(!p.companyPaysStopMinutes)flags.push("WAGE_TREATMENT_HR_REVIEW");
  return {...common,
    status:partial?"DISASTER_PARTIAL_SUSPENSION_REVIEW":"DISASTER_NO_WORK",
    protectedNoWorkMinutes:covered,
    paidStopMinutes:p.companyPaysStopMinutes?covered:0,
    unresolvedScheduledMinutes:scheduled-covered,
    absenceMinutes:0,  // Only the protected portion is not absence; unprotected remainder is unresolved.
    fullAttendanceProtected:!partial, // Do not protect an unresolved partial-day remainder by mistake.
    requiresHumanReview:partial||!p.companyPaysStopMinutes,
    flags};
}
  return evaluateAttendanceException;
})();

function v2hrAssertSynthetic_(condition,code) {
  if(!condition)throw Error("模擬規則驗證失敗："+code);
}
function v2hrVerifySyntheticRules_TEST_ONLY() {
  // This guard is bound to the existing standalone DATA_TEST_ONLY service,
  // exact spreadsheet name, properties, and TEST001 synthetic employee.
  var ss=v2hrGuardTestSheet_();
  var ctx=v2hrReadTestCalendarContext_(ss,{
    employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"
  });
  ctx.today="2026-10-29"; // fixed MOCK fixture reference date, not today's date
  ctx.scheduledMinutesByDate={"2026-11-12":480}; // MOCK 8-hour workday

  // Fail closed if an unexpected/real row was added to these test tables.
  v2hrAssertSynthetic_(ctx.annualChecks.length===1 &&
    ctx.annualChecks[0].year==="2026" &&
    ctx.annualChecks[0].status==="CONFIRMED" &&
    ctx.annualChecks[0].company==="TEST_CO" &&
    ctx.annualChecks[0].confirmedBy==="TEST-HR","FIXTURE_YEAR");
  v2hrAssertSynthetic_(ctx.calendarOverrides.length===1 &&
    ctx.calendarOverrides[0].date==="2026-11-11" &&
    ctx.calendarOverrides[0].company==="TEST_CO" &&
    ctx.calendarOverrides[0].dayType==="OFF" &&
    ctx.calendarOverrides[0].reference==="SYNTHETIC_TEST_ONLY","FIXTURE_HOLIDAY");
  v2hrAssertSynthetic_(ctx.events.length===1 &&
    ctx.events[0].eventId==="MOCK-STOP-20261112" &&
    ctx.events[0].date==="2026-11-12" &&
    ctx.events[0].type==="虛構颱風停班" &&
    ctx.events[0].scope==="ALL" &&
    ctx.events[0].period==="FULL" &&
    ctx.events[0].status==="CONFIRMED" &&
    ctx.events[0].payPolicy==="PAID" &&
    ctx.events[0].reference==="SYNTHETIC_TEST_ONLY","FIXTURE_STORM");

  var holiday=V2HR_TEST_RULES.calendarDay("2026-11-11",ctx);
  v2hrAssertSynthetic_(holiday.ok && holiday.isWorkday===false,"HOLIDAY_OFF");
  var leave=V2HR_TEST_RULES.validateLeave({
    startDate:"2026-11-11",endDate:"2026-11-11",mode:"DAY"
  },ctx);
  v2hrAssertSynthetic_(leave.code==="NON_WORKDAY_IN_RANGE" &&
    leave.off.length===1&&leave.off[0].date==="2026-11-11","LEAVE_BLOCKED");

  var normal=V2HR_TEST_RULES.calendarDay("2026-11-12",ctx);
  v2hrAssertSynthetic_(normal.ok&&normal.isWorkday===true,"STORM_IS_SCHEDULED_WORKDAY");

  var reviewed=V2HR_TEST_RULES.eventFor("2026-11-12",ctx,480);
  v2hrAssertSynthetic_(reviewed.ok&&reviewed.event&&
    reviewed.event.protectedMinutes===480&&reviewed.event.payPolicy==="PAID","EVENT_APPLIED");

  var leaveStorm=V2HR_TEST_RULES.validateLeave({
    startDate:"2026-11-12",endDate:"2026-11-12",mode:"DAY"
  },ctx);
  v2hrAssertSynthetic_(leaveStorm.code==="CALENDAR_OR_EVENT_REVIEW_REQUIRED" &&
    leaveStorm.review.length===1 &&
    leaveStorm.review[0].code==="STOP_EVENT_NEEDS_HR_REVIEW","STORM_LEAVE_REVIEW");

  var payroll=V2HR_TEST_RULES.evaluateAttendance({
    date:"2026-11-12",
    scheduledWorkMinutes:480,
    actualWorkedMinutes:0,
    approvedLeaveOverlaps:false
  },ctx,V2HR_TEST_PAYROLL);
  v2hrAssertSynthetic_(payroll.ok&&payroll.code==="DISASTER_NO_WORK" &&
    payroll.attendance.actualWorkedMinutes===0 &&
    payroll.attendance.paidStopMinutes===480 &&
    payroll.attendance.absenceMinutes===0 &&
    payroll.attendance.fullAttendanceProtected===true,"DISASTER_PAYROLL");

  var report={
    ok:true,synthetic:true,readOnly:true,checksPassed:6,
    leaveOnMockHoliday:"BLOCKED",
    scheduledStormDay:"WORKDAY_WITH_APPROVED_STOP",
    newLeaveOnStorm:"HR_REVIEW_REQUIRED",
    mockActualWorkedMinutes:0,
    mockPaidStopMinutes:480,
    mockAbsenceMinutes:0,
    payrollStatus:"DISASTER_NO_WORK",
    message:"僅 TEST001 隔離資料的唯讀規則測試；無真實請假、打卡或薪資寫入"
  };
  Logger.log(JSON.stringify(report));
  return report;
}
