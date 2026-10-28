"use strict";
/*
 * Workday / leave-day validation. Pure JavaScript, safe for STATIC PREVIEW.
 * This is not a complete Taiwan holiday calendar.
 * Production: obtain an approved calendar from server, validate again on server.
 */
(function(root) {
  function parseIsoDate(iso) {
    if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const y=Number(iso.slice(0,4)),m=Number(iso.slice(5,7)),d=Number(iso.slice(8,10));
    if (y<1900 || y>2100 || m<1 || m>12 || d<1 || d>31) return null;
    const utc=new Date(Date.UTC(y,m-1,d));
    if (utc.getUTCFullYear()!==y || utc.getUTCMonth()!==m-1 || utc.getUTCDate()!==d) return null;
    return utc;
  }
  function formatIso(d){
    return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
  }
  function classify(date, overrides) {
    const d=parseIsoDate(date);
    if (!d) return {ok:false,code:"BAD_DATE",date};
    const override=(overrides&&Object.prototype.hasOwnProperty.call(overrides,date))?overrides[date]:null;
    if(override){
      if(override.kind!=="work" && override.kind!=="off")return {ok:false,code:"BAD_OVERRIDE",date};
      return {ok:true,date,isWorkday:override.kind==="work",reason:override.reason|| (override.kind==="work"?"公告補班":"公司休假"),source:"calendar-override"};
    }
    const dow=d.getUTCDay();
    return {ok:true,date,isWorkday:dow>=1&&dow<=5,reason:dow===0?"星期日":dow===6?"星期六":"一般工作日",source:"weekly-pattern-only"};
  }
  function validateRange(start,end,options) {
    const o=options||{},s=parseIsoDate(start),e=parseIsoDate(end);
    if(!s||!e)return {ok:false,code:"BAD_DATE",blocked:[],calendarDays:0,workDays:0};
    if(s>e)return {ok:false,code:"END_BEFORE_START",blocked:[],calendarDays:0,workDays:0};
    const days=Math.floor((e-s)/86400000)+1;
    if(days>366)return {ok:false,code:"TOO_LONG",blocked:[],calendarDays:days,workDays:0};
    // An actual submission requires an independently confirmed calendar for every month.
    const calendarMonths=o.verifiedMonths||[];
    const blocked=[];
    let workDays=0,unverified=[];
    for(let i=0;i<days;i++){
      const d=new Date(s.getTime()+i*86400000);
      const date=formatIso(d);
      const month=date.slice(0,7);
      if(o.requireVerifiedCalendar && !calendarMonths.includes(month) && !unverified.includes(month))unverified.push(month);
      const c=classify(date,o.overrides);
      if(!c.ok)return {ok:false,code:c.code,blocked:[],calendarDays:days,workDays:0};
      if(c.isWorkday)workDays++;
      else blocked.push({date,reason:c.reason});
    }
    if(unverified.length)return {ok:false,code:"CALENDAR_UNVERIFIED",blocked,calendarDays:days,workDays,unverifiedMonths:unverified};
    return {ok:blocked.length===0,code:blocked.length?"NON_WORKDAY_IN_RANGE":"OK",blocked,calendarDays:days,workDays,unverifiedMonths:[]};
  }
  const api=Object.freeze({parseIsoDate,formatIso,classify,validateRange});
  if(typeof module==="object" && module.exports)module.exports=api;
  else root.V2WorkdayRules=api;
})(typeof window!=="undefined"?window:this);
