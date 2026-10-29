"use strict";
/**
 * LINE attendance V2: ISOLATED rules and normalization, not a deployed endpoint.
 * This code has NO Sheets, LINE, GPS, token, clock-write, or network calls.
 *
 * TRUST BOUNDARY: employee, schedule, work calendars, exception & approval rows
 * MUST come from HR-authorized backend state, NEVER from untrusted LIFF form fields.
 *
 * Workday configuration: Mon-Fri base; approved date overrides for holidays,
 * make-up Saturdays, company rest days, etc. Per-(company,workplace,month) signoff
 * is required before an actual request can be accepted (no guessed holidays).
 *
 * Disaster rules: A government announcement alone does not automatically make
 * every worker eligible. HR-approved employee applicability is mandatory.
 */
(function(root) {
  const MS_DAY=86400000, OFF="OFF", WORK="WORK", APPROVED="APPROVED";
  function isoDay(value) {
    if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const y=+value.slice(0,4),m=+value.slice(5,7),d=+value.slice(8,10);
    if(y<1900||y>2100||m<1||m>12)return null;
    const date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d?date:null;
  }
  function fmt(date) {
    return date.getUTCFullYear()+"-"+String(date.getUTCMonth()+1).padStart(2,"0")+"-"+String(date.getUTCDate()).padStart(2,"0");
  }
  function err(code,more={}) {return {ok:false,code,...more};}
  function validEmployee(e){
    return e&&typeof e.employeeId==="string"&&e.employeeId.trim()
      &&typeof e.company==="string"&&e.company.trim()
      &&typeof e.workplace==="string"&&e.workplace.trim();
  }
  function dayList(start,end){
    const s=isoDay(start),e=isoDay(end);
    if(!s||!e)return err("BAD_DATE");
    const n=Math.round((e-s)/MS_DAY)+1;
    if(n<1)return err("END_BEFORE_START");
    if(n>366)return err("RANGE_TOO_LONG");
    return {ok:true,days:Array.from({length:n},(_,i)=>fmt(new Date(s.getTime()+i*MS_DAY)))};
  }
  function approvedMonth(employee,month,monthApprovals){
    // Scope is explicitly tied to a specific location. No other location
    // can approve a month for this worker.
    const found=(monthApprovals||[]).filter(x=>x.company===employee.company&&
      x.workplace===employee.workplace&&x.month===month);
    if(found.length!==1)return err(found.length?"MONTH_APPROVAL_CONFLICT":"MONTH_UNVERIFIED",{month});
    if(found[0].status!==APPROVED||!found[0].approvedBy||!found[0].approvedAt)
      return err("MONTH_UNVERIFIED",{month});
    return {ok:true};
  }
  function workday(employee,day,calendar,monthApprovals) {
    if(!validEmployee(employee))return err("EMPLOYEE_SCOPE_MISSING");
    const d=isoDay(day);
    if(!d)return err("BAD_DATE",{date:day});
    const approval=approvedMonth(employee,day.slice(0,7),monthApprovals);
    if(!approval.ok)return {...approval,date:day};
    const candidates=(calendar||[]).filter(x=>x.date===day&&x.company===employee.company&&
      (x.workplace===employee.workplace||x.workplace==="*"));
    if(candidates.some(x=>x.status!==APPROVED||!x.approvedBy||!x.approvedAt))
      return err("DAY_OVERRIDE_UNAPPROVED",{date:day});
    if(candidates.some(x=>x.dayType!==WORK&&x.dayType!==OFF))
      return err("DAY_OVERRIDE_INVALID",{date:day});
    const precise=candidates.filter(x=>x.workplace===employee.workplace);
    const selected=precise.length?precise:candidates.filter(x=>x.workplace==="*");
    // Fail closed if two override rows exist at the same specificity, even if
    // their values happen to agree: these are duplicate HR decisions.
    if(selected.length>1)return err("DAY_OVERRIDE_CONFLICT",{date:day});
    const weekday=d.getUTCDay(),defaultWork=weekday>=1&&weekday<=5;
    const o=selected[0]||null;
    return {ok:true,date:day,workday:o?o.dayType===WORK:defaultWork,
      reason:o?(o.reason||"核定調整"):defaultWork?"一般上班日":weekday===6?"星期六":"星期日",
      source:o?"APPROVED_OVERRIDE":"BASE_WEEK"};
  }
  function eventDecision(employee,date,events,employeeReviews,scheduledMinutes){
    if(!validEmployee(employee))return err("EMPLOYEE_SCOPE_MISSING");
    const relevant=(events||[]).filter(x=>x.date===date&&x.company===employee.company&&
      (x.workplace===employee.workplace||x.workplace==="*"));
    if(relevant.some(x=>x.status!==APPROVED||!x.reviewedBy||!x.reviewedAt||!x.reference))
      return err("EVENT_NOT_VERIFIED",{date});
    const selected=[];
    for(const event of relevant){
      if(!event.eventId)return err("EVENT_INVALID",{date});
      const reviews=(employeeReviews||[]).filter(x=>x.eventId===event.eventId&&x.employeeId===employee.employeeId);
      if(reviews.length!==1)return err(reviews.length?"PERSON_EVENT_REVIEW_CONFLICT":"PERSON_EVENT_REVIEW_PENDING",{date,eventId:event.eventId});
      const review=reviews[0];
      if(review.status!==APPROVED||!review.reviewedBy||!review.reviewedAt)
        return err("PERSON_EVENT_REVIEW_PENDING",{date,eventId:event.eventId});
      if(review.applies===false)continue;
      if(review.applies!==true)return err("PERSON_EVENT_REVIEW_PENDING",{date,eventId:event.eventId});
      if(!Number.isInteger(review.protectedMinutes)||review.protectedMinutes<0||review.protectedMinutes>scheduledMinutes)
        return err("PERSON_EVENT_MINUTES_INVALID",{date,eventId:event.eventId});
      selected.push({eventId:event.eventId,protectedMinutes:review.protectedMinutes,
        paid:review.paid===true});
    }
    if(selected.length>1)return err("MULTIPLE_APPLICABLE_EVENTS_REVIEW",{date});
    return {ok:true,event:selected[0]||null};
  }
  function validateLeave(request,context){
    // Caller is the server after LINE auth and employee mapping. The UI
    // may pass only dates, type and reason; never trust client 'employee'.
    const employee=context&&context.employee;
    if(!validEmployee(employee))return err("EMPLOYEE_SCOPE_MISSING");
    const range=dayList(request&&request.startDate,request&&request.endDate);
    if(!range.ok)return range;
    if(request.mode==="HOURS"&&range.days.length!==1)return err("HOURS_MULTI_DAY");
    if(!["DAY","HOURS"].includes(request.mode))return err("LEAVE_MODE_INVALID");
    if(request.mode==="HOURS"){
      const a=request.startTime,b=request.endTime;
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a||"")||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b||"")||a>=b)
        return err("LEAVE_HOURS_INVALID");
    }
    if(context.today && request.startDate<context.today)return err("PAST_DATE");
    const blocked=[],unverified=[];
    for(const date of range.days){
      const day=workday(employee,date,context.calendar,context.monthApprovals);
      if(!day.ok){unverified.push({date,code:day.code});continue;}
      if(!day.workday){blocked.push({date,reason:day.reason});continue;}
      const relevantEvents=(context.events||[]).filter(x=>x.date===date&&x.company===employee.company&&
        (x.workplace===employee.workplace||x.workplace==="*"));
      const plannedMinutes=context.scheduledMinutesPerDay&&context.scheduledMinutesPerDay[date];
      if(relevantEvents.length&&(!Number.isInteger(plannedMinutes)||plannedMinutes<=0)){
        unverified.push({date,code:"SCHEDULE_UNVERIFIED"});
        continue;
      }
      const events=eventDecision(employee,date,context.events,context.employeeReviews,
        relevantEvents.length?plannedMinutes:0);
      // If an eligible event is known, a previously approved leave may need
      // manual reconciliation; NEVER auto-cancel. New requests should not
      // automatically be accepted without an HR review of the overlap.
      if(!events.ok){unverified.push({date,code:events.code});continue;}
      if(events.event&&events.event.protectedMinutes>0)
        unverified.push({date,code:"EVENT_OVERLAP_NEEDS_HR_REVIEW"});
    }
    if(unverified.length)return err("CALENDAR_OR_EVENT_REVIEW_REQUIRED",{blocked,unverified});
    if(blocked.length)return err("NON_WORKDAY_IN_RANGE",{blocked});
    return {ok:true,code:"OK",days:range.days,workdayCount:range.days.length,
      note:"Acceptable by calendar rules only; identity, leave quota and duplicate-application checks remain server requirements."};
  }
  function resolveAttendance(input,context,payrollRules) {
    const employee=context&&context.employee;
    const day=workday(employee,input.date,context.calendar,context.monthApprovals);
    if(!day.ok)return {...day,needsHRReview:true};
    if(!day.workday)return {ok:true,code:"NON_WORKDAY",date:input.date,
      noClockIsAbsence:false,actualWorkedMinutes:input.actualWorkedMinutes??null,
      needsHRReview:Number(input.actualWorkedMinutes||0)>0};
    const scheduled=input.scheduledWorkMinutes;
    if(!Number.isInteger(scheduled)||scheduled<=0)return err("SCHEDULE_UNVERIFIED",{needsHRReview:true});
    const ev=eventDecision(employee,input.date,context.events,context.employeeReviews,scheduled);
    if(!ev.ok)return {...ev,needsHRReview:true,noClockIsAbsence:false};
    // If an event applies, work minutes need independent verification.
    // No fabricated 8h actual work, and no automatic punch creation.
    if(ev.event && (!Number.isInteger(input.actualWorkedMinutes)||input.actualWorkedMinutes<0))
      return err("WORK_MINUTES_UNVERIFIED",{needsHRReview:true,noClockIsAbsence:false});
    if(typeof payrollRules!=="function")return err("PAYROLL_RULES_MISSING",{needsHRReview:true});
    const p=payrollRules({scheduledWorkMinutes:scheduled,
      actualWorkedMinutes:input.actualWorkedMinutes??null,
      stopEvent:ev.event?{eventId:ev.event.eventId,hrConfirmed:true,
        appliesToEmployee:true,protectedMinutes:ev.event.protectedMinutes}:null,
      companyPaysStopMinutes:ev.event?ev.event.paid:false,
      approvedLeaveOverlaps:input.approvedLeaveOverlaps===true});
    return {ok:true,code:p.status,date:input.date,noClockIsAbsence:false,
      attendance:p,needsHRReview:p.requiresHumanReview,
      note:"Payroll candidate, never auto-post salary or overwrite original punches."};
  }
  const api=Object.freeze({isoDay,dayList,workday,eventDecision,validateLeave,resolveAttendance});
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.AttendanceV2CalendarService=api;
})(typeof window!=="undefined"?window:this);
