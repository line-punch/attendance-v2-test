"use strict";
/* Isolated V2 batch workflow rules, NEVER a live LINE/Sheets endpoint.
 * No network, storage, sheet writes or actual punch operations.
 */
(function(root){
 const TILE_NAMES=["我要打卡","忘記打卡","人資查詢","我要請假"];
 const STATUS=["PENDING","APPROVED","REJECTED"];
 const REQUIRE_HR=["HR_PENDING","HR_REVIEW","HR_CALENDAR","HR_DISASTER","HR_MONTH_CLOSE"];
 const OPS=["CLOCK_IN","CLOCK_OUT","CLOCK_STATUS","TODAY_ATTENDANCE","MY_ATTENDANCE",
  "MISSING_REQUEST","MISSING_STATUS","LEAVE_PREVIEW","LEAVE_REQUEST","LEAVE_STATUS",
  "MY_LEAVES","HR_PENDING","HR_REVIEW","HR_CALENDAR","HR_DISASTER","HR_MONTH_CLOSE"];
 function fail(code){return {ok:false,code};}
 function trusted(p){return !!p&&p.verified===true&&p.active===true&&
   typeof p.employeeId==="string"&&p.employeeId.length>0}
 function authorize(op,p,enabled){
  if(!OPS.includes(op))return fail("UNKNOWN_OPERATION");
  if(!trusted(p))return fail("LOGIN_REQUIRED");
  if(REQUIRE_HR.includes(op)&&p.role!=="HR_OWNER")return fail("HR_ONLY");
  if(!enabled||enabled[op]!==true)return fail("FEATURE_NOT_ENABLED");
  return {ok:true,employeeId:p.employeeId};
 }
 function reviewed(current,action,role){
  if(role!=="HR_OWNER")return fail("HR_ONLY");
  if(!["APPROVE","REJECT"].includes(action))return fail("DECISION_INVALID");
  if(!STATUS.includes(current))return fail("CURRENT_STATE_INVALID");
  const target=action==="APPROVE"?"APPROVED":"REJECTED";
  if(current===target)return {ok:true,status:target,changed:false,duplicate:true};
  if(current!=="PENDING")return fail("ALREADY_REVIEWED");
  return {ok:true,status:target,changed:true,duplicate:false};
 }
 function date(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return null;
  const y=+s.slice(0,4),m=+s.slice(5,7),d=+s.slice(8,10);
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d?t:null;
 }
 function days(a,b){
  let first=date(a),last=date(b);if(!first||!last||first>last)return null;
  let out=[];
  for(let t=first.getTime();t<=last.getTime();t+=86400000){
   if(out.length>31)return null;
   out.push(new Date(t).toISOString().slice(0,10));
  }
  return out;
 }
 function leaveCheck(form,{calendarConfirmed=false,offDays=[],workDays=[],stormDays=[]}={}){
  if(!form||typeof form!=="object")return fail("MISSING_FORM");
  if(!calendarConfirmed)return fail("CALENDAR_NOT_APPROVED");
  const span=days(form.startDate,form.endDate);
  if(!span)return fail("DATES_INVALID_OR_OVER_31_DAYS");
  const unit=form.unit;
  if(!["DAY","HOURS"].includes(unit))return fail("UNIT_INVALID");
  if(unit==="HOURS"){
   if(span.length!==1)return fail("HOURS_ONLY_ONE_DAY");
   const re=/^([01]\d|2[0-3]):[0-5]\d$/;
   if(!re.test(String(form.fromTime||""))||!re.test(String(form.toTime||""))||
      form.fromTime>=form.toTime)return fail("HOURS_INVALID");
  }
  if(span.some(x=>offDays.includes(x)&&workDays.includes(x)))
   return fail("DAY_OVERRIDE_CONFLICT");
  // HR-approved makeup workdays may fall on Saturday or Sunday.
  if(span.some(x=>offDays.includes(x)||
    (!workDays.includes(x)&&[0,6].includes(date(x).getUTCDay()))))
   return fail("NON_WORKDAY_REQUIRES_SPLIT");
  if(span.some(x=>stormDays.includes(x)))return fail("NEEDS_HR_REVIEW");
  return {ok:true,workingDays:span.length,requiresHumanReview:false};
 }
 function feedback(phase){
  const text={
    IDLE:"尚未送出",WORKING:"執行中，請勿重複點擊",
    SUCCESS:"已完成，請查詢紀錄",BLOCKED:"未送出，請查看原因",
    UNKNOWN:"結果尚未確認，請保留原單號查詢"
  };
  return text[phase]||text.UNKNOWN;
 }
 function nfcPermitted({cryptogramVerified=false,replayChecked=false,deviceConfirmed=false}={}){
  return cryptogramVerified===true&&replayChecked===true&&deviceConfirmed===true;
 }
 const api=Object.freeze({TILE_NAMES,OPS,authorize,reviewed,leaveCheck,
   feedback,nfcPermitted,days});
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.V2BatchRules=api;
})(typeof window!=="undefined"?window:this);
