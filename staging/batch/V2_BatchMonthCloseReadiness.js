"use strict";
/** V2 TEST-only monthly-close READINESS report, no actual payroll amounts.
 * Requires already reconciled HR minutes. Never writes or changes punches.
 * No automatic absence from missing punches; disaster paid time stays distinct
 * from actual worked time. Calendar and approved cases must be verified first.
 */
(function(root){
function parseDay(s){
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const [y,m,d]=s.split("-").map(Number);
 const x=new Date(Date.UTC(y,m-1,d));
 return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d?x:null;
}
function evaluate({month,today,principal,calendarConfirmed=false,
 specialEventsConfirmed=false,pendingApprovals=0,
 backupReady=false,employeeDays=[]}={}){
 const issues=[];
 if(!principal||principal.verified!==true||principal.role!=="HR_OWNER")
  return {ok:false,code:"HR_ONLY"};
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||""))||
    !parseDay(month+"-01")||!parseDay(today))
  return {ok:false,code:"MONTH_INVALID"};
 if(month>=today.slice(0,7))issues.push("MONTH_NOT_FINISHED");
 if(!calendarConfirmed)issues.push("CALENDAR_NOT_CONFIRMED");
 if(!specialEventsConfirmed)issues.push("SPECIAL_EVENTS_NOT_CONFIRMED");
 if(!Number.isInteger(pendingApprovals)||pendingApprovals<0)
  issues.push("PENDING_COUNT_UNVERIFIED");
 else if(pendingApprovals>0)issues.push("PENDING_APPROVALS");
 if(backupReady!==true)issues.push("BACKUP_NOT_CONFIRMED");
 if(!Array.isArray(employeeDays)||employeeDays.length>10000)
  return {ok:false,code:"SCANNED_ROWS_INVALID"};
 let totals={scheduled:0,actualWorked:0,paidDisaster:0,
  daysRequiringHR:0,confirmedDays:0};
 const found=new Set();
 for(const d of employeeDays){
  if(!d||typeof d.employeeId!=="string"||
     !/^[A-Za-z0-9_-]{2,40}$/.test(d.employeeId)||
     !parseDay(d.date)||d.date.slice(0,7)!==month)
   return {ok:false,code:"INVALID_DAY_ROW"};
  const key=d.employeeId+"|"+d.date;
  if(found.has(key))return {ok:false,code:"DUPLICATE_DAY_ROW"};
  found.add(key);
  if(d.confirmed!==true){
   totals.daysRequiringHR++;
   continue;
  }
  const a=d.actualWorkedMinutes,b=d.paidDisasterMinutes,n=d.scheduledMinutes;
  if(![a,b,n].every(x=>Number.isInteger(x)&&x>=0&&x<=1440)||
     b>n||b+Math.min(a,n)>n)
   return {ok:false,code:"MINUTE_CONFLICT"};
  if(d.missingPunchUnresolved===true){
   totals.daysRequiringHR++;
   continue;
  }
  totals.confirmedDays++;
  totals.scheduled+=n;
  totals.actualWorked+=a;
  totals.paidDisaster+=b;
 }
 if(totals.daysRequiringHR>0)issues.push("DAY_RECONCILIATION_PENDING");
 return {ok:true,readOnly:true,month,
  canClose:issues.length===0,issues,
  summary:{
   scheduledMinutes:totals.scheduled,
   actualWorkedMinutes:totals.actualWorked,
   paidDisasterMinutes:totals.paidDisaster,
   confirmedDayCount:totals.confirmedDays,
   daysRequiringHR:totals.daysRequiringHR
  },
  note:"僅月結準備度及分鐘對照，不代表薪資計算或實際月結寫入"};
}
const api=Object.freeze({evaluate});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchMonthClose=api;
})(typeof window!=="undefined"?window:this);
