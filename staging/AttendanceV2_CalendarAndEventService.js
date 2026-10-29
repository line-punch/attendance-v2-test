"use strict";
/**
 * V2 SME simplified (TWO-SHEET) calendar and absence-exception rules.
 * Pure JS, NOT a deployed Apps Script endpoint. No network/Sheets/LINE writes.
 *
 * 1. 公司工作日曆: annualChecks in a settings area + date override rows.
 * 2. 特殊出勤事件: company-wide by default; optional worksite only.
 * Individual legal exceptions are handled manually by HR outside this
 * automated event model; missing punches never become auto-absence.
 *
 * Inputs must be assembled by an authenticated server from trusted HR records,
 * not from the employee browser. The server must repeat all checks before writes.
 */
(function(root){
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
  const api=Object.freeze({parseDate,dateRange,calendarDay,eventFor,validateLeave,evaluateAttendance});
  if(typeof module==="object"&&module.exports)module.exports=api; else root.AttendanceV2CalendarService=api;
})(typeof window!=="undefined"?window:this);
