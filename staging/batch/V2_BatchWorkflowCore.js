"use strict";
/**
 * V2 staged backend workflow CORE (pure JS). NOT A GAS WEB ENDPOINT.
 *
 * This is a contract for an independent TEST001 service; adapters must provide
 * verified LINE/HR identity, atomic durable DB transaction, approved calendar,
 * server time and an outbox. Flags default to OFF; no real service is called.
 *
 * LIVE GPS punch handling remains in its already tested separate service.
 * NFC is never accepted here; SUN validation/replay protection remains gated.
 */
(function(root){
const OPERATIONS=[
 "LEAVE_PREVIEW","LEAVE_REQUEST","LEAVE_STATUS","MY_LEAVES",
 "MISSING_REQUEST","MISSING_STATUS","HR_PENDING","HR_STATUS","HR_REVIEW"
];
const HR_ONLY=new Set(["HR_PENDING","HR_STATUS","HR_REVIEW"]);
const CLIENT_SCOPE=new Set(["employeeId","empid","userId","lineUserId",
 "company","workplace","role","managerId","approvedBy","sheetId",
 "spreadsheetId","trustedToday","verified","hrRole"]);
const LEAVE_TYPES=new Set(["事假","病假","特休","公假","婚假","喪假"]);
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const REQ=/^[A-Za-z0-9_-]{12,80}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const err=(code)=>({ok:false,code});
function validDay(s){
 if(typeof s!=="string"||!DATE.test(s))return false;
 const [y,m,d]=s.split("-").map(Number);
 const t=new Date(Date.UTC(y,m-1,d));
 return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d;
}
function months(today){
 if(!validDay(today))throw Error("TRUSTED_DATE_MISSING");
 const [y,m]=today.split("-").map(Number);
 return [0,-1,-2].map(d=>new Date(Date.UTC(y,m-1+d,1)).toISOString().slice(0,7));
}
function person(p){
 return !!p&&p.source==="VERIFIED_SERVER_BINDING"&&p.active===true&&
  typeof p.employeeId==="string"&&/^[A-Za-z0-9_-]{2,40}$/.test(p.employeeId)&&
  typeof p.company==="string"&&p.company.length>0&&
  ["STAFF","HR_OWNER"].includes(p.role);
}
function cleanLeave(form){
 if(!form||typeof form!=="object"||Array.isArray(form))return err("INVALID_FORM");
 const keys=Object.keys(form);
 if(keys.some(k=>!["requestId","leaveType","startDate","endDate","unit",
   "fromTime","toTime","reason"].includes(k)))return err("INVALID_FORM_FIELDS");
 if(!REQ.test(String(form.requestId||"")))return err("REQUEST_ID_INVALID");
 if(!LEAVE_TYPES.has(form.leaveType))return err("LEAVE_TYPE_INVALID");
 if(!validDay(form.startDate)||!validDay(form.endDate)||form.startDate>form.endDate)
   return err("LEAVE_DATES_INVALID");
 if(!["DAY","HOURS"].includes(form.unit))return err("LEAVE_UNIT_INVALID");
 if(form.unit==="HOURS"&&
    (form.startDate!==form.endDate||!TIME.test(String(form.fromTime||""))||
     !TIME.test(String(form.toTime||""))||form.fromTime>=form.toTime))
   return err("LEAVE_HOURS_INVALID");
 const reason=String(form.reason||"").trim();
 if(reason.length>500)return err("REASON_TOO_LONG");
 return {ok:true,data:{
  requestId:form.requestId,leaveType:form.leaveType,startDate:form.startDate,
  endDate:form.endDate,unit:form.unit,
  fromTime:form.unit==="HOURS"?form.fromTime:"",
  toTime:form.unit==="HOURS"?form.toTime:"",
  reason
 }};
}
function cleanMissed(form){
 if(!form||typeof form!=="object"||Array.isArray(form))return err("INVALID_FORM");
 if(Object.keys(form).some(k=>!["requestId","date","time","type","reason"].includes(k)))
  return err("INVALID_FORM_FIELDS");
 if(!REQ.test(String(form.requestId||"")))return err("REQUEST_ID_INVALID");
 if(!validDay(form.date)||!TIME.test(String(form.time||""))||
    !["上班","下班"].includes(form.type))return err("MISSING_PUNCH_INPUT_INVALID");
 const reason=String(form.reason||"").trim();
 if(!reason||reason.length>500)return err("MISSING_REASON_INVALID");
 return {ok:true,data:{
  requestId:form.requestId,date:form.date,time:form.time,type:form.type,reason
 }};
}
function summary(row){
 if(!row)return null;
 return {requestId:row.requestId,kind:row.kind,
  status:row.status,employeeId:row.employeeId,
  ...(row.kind==="LEAVE"?{
    leaveType:row.body.leaveType,startDate:row.body.startDate,
    endDate:row.body.endDate,unit:row.body.unit
  }:{date:row.body.date,type:row.body.type,time:row.body.time})};
}
function fingerprint(kind,employeeId,company,data){
 // Deterministic semantic comparison. This is NOT a cryptographic signature.
 return JSON.stringify([kind,employeeId,company,data]);
}
function create({identity,store,calendar,clock,flags={}}={}){
 if(!identity||typeof identity.verify!=="function"||
    !store||typeof store.read!=="function"||typeof store.transaction!=="function"||
    !calendar||typeof calendar.validateLeave!=="function"||
    !clock||typeof clock.today!=="function")throw Error("MISSING_SECURE_ADAPTERS");
 async function handle({operation,payload,credential}={}){
  if(!OPERATIONS.includes(operation))return err("OPERATION_DENIED");
  if(flags[operation]!==true)return err("FEATURE_DISABLED");
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||
     Object.keys(payload).some(k=>CLIENT_SCOPE.has(k)))return err("CLIENT_SCOPE_DENIED");
  let p;
  try{p=await identity.verify(credential);}catch(_){return err("AUTH_REQUIRED");}
  if(!person(p))return err("AUTH_REQUIRED");
  if(HR_ONLY.has(operation)&&p.role!=="HR_OWNER")return err("HR_ONLY");
  if(operation==="LEAVE_PREVIEW"||operation==="LEAVE_REQUEST"){
   const parsed=cleanLeave(payload);if(!parsed.ok)return parsed;
   if(operation==="LEAVE_PREVIEW"){
    try{
     const r=await calendar.validateLeave(parsed.data,p,clock.today());
     return r.ok?{ok:true,readOnly:true,days:r.workingDays}:err(r.code||"CALENDAR_UNVERIFIED");
    }catch(_){return err("CALENDAR_UNVERIFIED");}
   }
   // Repeat identical calendar validation under the actual write lock.
   return store.transaction(async tx=>{
    const old=await tx.find(parsed.data.requestId);
    const fp=fingerprint("LEAVE",p.employeeId,p.company,parsed.data);
    if(old)return old.fingerprint===fp&&old.employeeId===p.employeeId&&
      old.company===p.company?
      {ok:true,duplicate:true,request:summary(old)}:err("REQUEST_ID_CONFLICT");
    let v;
    try{v=await calendar.validateLeave(parsed.data,p,clock.today());}
    catch(_){return err("CALENDAR_UNVERIFIED");}
    if(!v.ok)return err(v.code||"CALENDAR_UNVERIFIED");
    // Calendar-verified days belong in the durable record, not guessed
    // from the browser or later inferred from the date range.
    if(!Number.isInteger(v.workingDays)||v.workingDays<1||v.workingDays>31)
      return err("CALENDAR_DAY_COUNT_UNVERIFIED");
    const row={kind:"LEAVE",employeeId:p.employeeId,company:p.company,
      requestId:parsed.data.requestId,
      body:{...parsed.data,workingDays:v.workingDays},fingerprint:fp,
      status:"PENDING",submittedAt:clock.today()};
    await tx.create(row);
    await tx.outbox({type:"LEAVE_SUBMITTED",requestId:row.requestId});
    return {ok:true,duplicate:false,request:summary(row),notification:"QUEUED"};
   });
  }
  if(operation==="MISSING_REQUEST"){
   const parsed=cleanMissed(payload);if(!parsed.ok)return parsed;
   return store.transaction(async tx=>{
    const old=await tx.find(parsed.data.requestId);
    const fp=fingerprint("MISSING",p.employeeId,p.company,parsed.data);
    if(old)return old.fingerprint===fp&&old.employeeId===p.employeeId&&
      old.company===p.company?
      {ok:true,duplicate:true,request:summary(old)}:err("REQUEST_ID_CONFLICT");
    const row={kind:"MISSING",employeeId:p.employeeId,company:p.company,
      requestId:parsed.data.requestId,body:parsed.data,fingerprint:fp,
      status:"PENDING",submittedAt:clock.today()};
    await tx.create(row);
    await tx.outbox({type:"MISSING_SUBMITTED",requestId:row.requestId});
    return {ok:true,duplicate:false,request:summary(row),notification:"QUEUED"};
   });
  }
  if(operation==="LEAVE_STATUS"||operation==="MISSING_STATUS"){
   if(Object.keys(payload).length!==1||!REQ.test(String(payload.requestId||"")))
    return err("REQUEST_ID_INVALID");
   const kind=operation==="LEAVE_STATUS"?"LEAVE":"MISSING";
   const row=await store.read(async tx=>tx.find(payload.requestId));
   if(!row||row.kind!==kind||row.employeeId!==p.employeeId||
      row.company!==p.company)
    return err("NOT_FOUND");
   return {ok:true,readOnly:true,request:summary(row)};
  }
  if(operation==="MY_LEAVES"){
   if(Object.keys(payload).length!==1||typeof payload.month!=="string"||
      !MONTH.test(payload.month))return err("MONTH_INVALID");
   const allowed=months(clock.today());
   if(!allowed.includes(payload.month))return err("MONTH_OUT_OF_RANGE");
   const rows=await store.read(async tx=>tx.list());
   const start=payload.month+"-01";
   const [yy,mm]=payload.month.split("-").map(Number);
   const end=new Date(Date.UTC(yy,mm,0)).toISOString().slice(0,10);
   const mine=rows.filter(x=>x.kind==="LEAVE"&&x.employeeId===p.employeeId&&
     x.company===p.company&&
     x.body.startDate<=end&&x.body.endDate>=start).map(summary);
   return {ok:true,readOnly:true,month:payload.month,
     total:mine.length,requests:mine};
  }
  if(operation==="HR_STATUS"){
   if(Object.keys(payload).length!==1||!REQ.test(String(payload.requestId||"")))
    return err("REQUEST_ID_INVALID");
   const row=await store.read(async tx=>tx.find(payload.requestId));
   if(!row||row.company!==p.company)return err("NOT_FOUND");
   return {ok:true,readOnly:true,request:summary(row)};
  }
  if(operation==="HR_PENDING"){
   if(Object.keys(payload).length!==0)return err("INVALID_FORM_FIELDS");
   const rows=await store.read(async tx=>tx.list());
   return {ok:true,readOnly:true,
    pending:rows.filter(x=>x.status==="PENDING"&&x.company===p.company).map(summary)};
  }
  if(operation==="HR_REVIEW"){
   if(Object.keys(payload).some(k=>!["requestId","decision"].includes(k))||
      Object.keys(payload).length!==2||
      !REQ.test(String(payload.requestId||""))||
      !["APPROVE","REJECT"].includes(payload.decision))
    return err("REVIEW_INPUT_INVALID");
   return store.transaction(async tx=>{
    const row=await tx.find(payload.requestId);
    if(!row||row.company!==p.company)return err("NOT_FOUND");
    const to=payload.decision==="APPROVE"?"APPROVED":"REJECTED";
    if(row.status===to)return {ok:true,duplicate:true,request:summary(row)};
    if(row.status!=="PENDING")return err("REVIEW_CONFLICT");
    const updated={...row,status:to,reviewedAt:clock.today(),
      reviewedBy:p.employeeId};
    await tx.replace(updated);
    await tx.outbox({type:"REVIEWED",requestId:row.requestId,status:to});
    return {ok:true,duplicate:false,request:summary(updated),notification:"QUEUED"};
   });
  }
  return err("OPERATION_DENIED");
 }
 return Object.freeze({handle});
}
const api=Object.freeze({create,cleanLeave,cleanMissed,person,months,OPERATIONS});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchWorkflowCore=api;
})(typeof window!=="undefined"?window:this);
