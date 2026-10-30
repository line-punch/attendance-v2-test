/**
 * GENERATED QA-ONLY GAS CANDIDATE, 2026-10-30. NOT DEPLOYED.
 * Compiled synchronously from versioned staging libraries; no secrets.
 * TEST001 only; V2_BATCH_QA_ENABLED and V2_BATCH_QA_WRITE_ENABLED
 * default to disabled. DO NOT install in formal/GPS/V4 projects.
 * Every real deployment needs an independent QA workbook, correct account,
 * verified LINE test channel and a complete PHONE+GAS test before enable.
 */

// ===== staging/batch/V2_BatchWorkflowCore.js =====
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
var V2BatchWorkflowCore=(function(){
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
 function handle({operation,payload,credential}={}){
  if(!OPERATIONS.includes(operation))return err("OPERATION_DENIED");
  if(flags[operation]!==true)return err("FEATURE_DISABLED");
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||
     Object.keys(payload).some(k=>CLIENT_SCOPE.has(k)))return err("CLIENT_SCOPE_DENIED");
  let p;
  try{p=identity.verify(credential);}catch(_){return err("AUTH_REQUIRED");}
  if(!person(p))return err("AUTH_REQUIRED");
  if(HR_ONLY.has(operation)&&p.role!=="HR_OWNER")return err("HR_ONLY");
  if(operation==="LEAVE_PREVIEW"||operation==="LEAVE_REQUEST"){
   const parsed=cleanLeave(payload);if(!parsed.ok)return parsed;
   if(operation==="LEAVE_PREVIEW"){
    try{
     const r=calendar.validateLeave(parsed.data,p,clock.today());
     return r.ok?{ok:true,readOnly:true,days:r.workingDays}:err(r.code||"CALENDAR_UNVERIFIED");
    }catch(_){return err("CALENDAR_UNVERIFIED");}
   }
   // Repeat identical calendar validation under the actual write lock.
   return store.transaction(tx=>{
    const old=tx.find(parsed.data.requestId);
    const fp=fingerprint("LEAVE",p.employeeId,p.company,parsed.data);
    if(old)return old.fingerprint===fp&&old.employeeId===p.employeeId&&
      old.company===p.company?
      {ok:true,duplicate:true,request:summary(old)}:err("REQUEST_ID_CONFLICT");
    let v;
    try{v=calendar.validateLeave(parsed.data,p,clock.today());}
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
    tx.create(row);
    tx.outbox({type:"LEAVE_SUBMITTED",requestId:row.requestId});
    return {ok:true,duplicate:false,request:summary(row),notification:"QUEUED"};
   });
  }
  if(operation==="MISSING_REQUEST"){
   const parsed=cleanMissed(payload);if(!parsed.ok)return parsed;
   return store.transaction(tx=>{
    const old=tx.find(parsed.data.requestId);
    const fp=fingerprint("MISSING",p.employeeId,p.company,parsed.data);
    if(old)return old.fingerprint===fp&&old.employeeId===p.employeeId&&
      old.company===p.company?
      {ok:true,duplicate:true,request:summary(old)}:err("REQUEST_ID_CONFLICT");
    const row={kind:"MISSING",employeeId:p.employeeId,company:p.company,
      requestId:parsed.data.requestId,body:parsed.data,fingerprint:fp,
      status:"PENDING",submittedAt:clock.today()};
    tx.create(row);
    tx.outbox({type:"MISSING_SUBMITTED",requestId:row.requestId});
    return {ok:true,duplicate:false,request:summary(row),notification:"QUEUED"};
   });
  }
  if(operation==="LEAVE_STATUS"||operation==="MISSING_STATUS"){
   if(Object.keys(payload).length!==1||!REQ.test(String(payload.requestId||"")))
    return err("REQUEST_ID_INVALID");
   const kind=operation==="LEAVE_STATUS"?"LEAVE":"MISSING";
   const row=store.read(tx=>tx.find(payload.requestId));
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
   const rows=store.read(tx=>tx.list());
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
   const row=store.read(tx=>tx.find(payload.requestId));
   if(!row||row.company!==p.company)return err("NOT_FOUND");
   return {ok:true,readOnly:true,request:summary(row)};
  }
  if(operation==="HR_PENDING"){
   if(Object.keys(payload).length!==0)return err("INVALID_FORM_FIELDS");
   const rows=store.read(tx=>tx.list());
   return {ok:true,readOnly:true,
    pending:rows.filter(x=>x.status==="PENDING"&&x.company===p.company).map(summary)};
  }
  if(operation==="HR_REVIEW"){
   if(Object.keys(payload).some(k=>!["requestId","decision"].includes(k))||
      Object.keys(payload).length!==2||
      !REQ.test(String(payload.requestId||""))||
      !["APPROVE","REJECT"].includes(payload.decision))
    return err("REVIEW_INPUT_INVALID");
   return store.transaction(tx=>{
    const row=tx.find(payload.requestId);
    if(!row||row.company!==p.company)return err("NOT_FOUND");
    const to=payload.decision==="APPROVE"?"APPROVED":"REJECTED";
    if(row.status===to)return {ok:true,duplicate:true,request:summary(row)};
    if(row.status!=="PENDING")return err("REVIEW_CONFLICT");
    const updated={...row,status:to,reviewedAt:clock.today(),
      reviewedBy:p.employeeId};
    tx.replace(updated);
    tx.outbox({type:"REVIEWED",requestId:row.requestId,status:to});
    return {ok:true,duplicate:false,request:summary(updated),notification:"QUEUED"};
   });
  }
  return err("OPERATION_DENIED");
 }
 return Object.freeze({handle});
}
const api=Object.freeze({create,cleanLeave,cleanMissed,person,months,OPERATIONS});
return api;
})();

// ===== staging/batch/V2_BatchAppendJournal.js =====
"use strict";
/**
 * TEST001 durable-journal CONTRACT, pure JS, NOT DEPLOYED.
 *
 * Only one exact-purpose ledger sheet in a SEPARATE isolated QA workbook.
 * Its 8 columns:
 * TX_ID | REQUEST_ID | VERSION | ROW_JSON | OUTBOX_JSON | UTC_TIME |
 * PREV_HASH | CONTENT_HASH
 *
 * Each new or revised request + its pending notification occupies ONE row,
 * not two. One journal row is the only mutation per transaction. A failure
 * during/after an append is ambiguous and MUST be re-queried by requestId.
 *
 * Real Google Sheets is NOT an ACID database; ScriptLock, durable journal
 * verification and explicit exception states are required. This model
 * simulates those invariants but cannot certify real Google behavior.
 *
 * IO must provide:
 *   withExclusive(()=>...)
 *   readRows() => 2D array of exactly 8-column journal records
 *   appendRow(8-element array) => may throw
 *   utcNow() => ISO string
 * No real Google calls or credentials here. No notification delivery.
 */
var V2BatchAppendJournal=(function(){
const HEADERS=Object.freeze([
 "TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
 "UTC_TIME","PREV_HASH","CONTENT_HASH"
]);
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const deep=x=>JSON.parse(JSON.stringify(x));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const ERROR=(code)=>{const e=Error(code);e.code=code;return e;};
const MAX_ENTRIES=10000;
function strHash(s){
 // Noncryptographic integrity signal only; NOT a signature.
 let n=2166136261;
 for(let i=0;i<s.length;i++){
  n^=s.charCodeAt(i);n=Math.imul(n,16777619)>>>0;
 }
 return n.toString(16).padStart(8,"0");
}
function ensureRow(row){
 if(!row||typeof row!=="object"||!REQUEST.test(String(row.requestId||""))||
    !["LEAVE","MISSING"].includes(row.kind)||
    !/^[A-Za-z0-9_-]{2,40}$/.test(String(row.employeeId||""))||
    !/^[A-Za-z0-9_-]{2,40}$/.test(String(row.company||""))||
    !["PENDING","APPROVED","REJECTED"].includes(row.status))
  throw ERROR("INVALID_MUTATION");
}
function ensureEvent(event,row){
 if(!event||!["LEAVE_SUBMITTED","MISSING_SUBMITTED","REVIEWED"].includes(event.type)||
    event.requestId!==row.requestId)throw ERROR("OUTBOX_REQUIRED");
 if(event.type==="REVIEWED"&&event.status!==row.status)
  throw ERROR("OUTBOX_STATUS_MISMATCH");
 if(event.type!=="REVIEWED"&&row.status!=="PENDING")
  throw ERROR("OUTBOX_STATUS_MISMATCH");
 if(row.kind==="LEAVE"&&event.type==="MISSING_SUBMITTED"||
    row.kind==="MISSING"&&event.type==="LEAVE_SUBMITTED")
  throw ERROR("OUTBOX_KIND_MISMATCH");
}
function decode(lines){
 if(!Array.isArray(lines)||lines.length>MAX_ENTRIES)throw ERROR("LEDGER_SIZE_UNSAFE");
 let latest=new Map(),versions=new Map(),txSeen=new Set(),lastHash="ROOT";
 let events=[];
 for(const r of lines){
  if(!Array.isArray(r)||r.length!==HEADERS.length)
   throw ERROR("LEDGER_FORMAT_UNSAFE");
  const [txId,requestId,ver,rowText,eventText,utcTime,prevHash,hash]=r;
  if(typeof txId!=="string"||!REQUEST.test(String(requestId))||
     !Number.isInteger(ver)||ver<1||txSeen.has(txId)||
     typeof rowText!=="string"||typeof eventText!=="string"||
     typeof utcTime!=="string"||!Number.isFinite(Date.parse(utcTime))||
     prevHash!==lastHash)throw ERROR("LEDGER_CHAIN_INVALID");
  const base=[txId,requestId,ver,rowText,eventText,utcTime,prevHash].join("\u001f");
  if(strHash(base)!==hash)throw ERROR("LEDGER_CONTENT_MISMATCH");
  let item,evt;
  try{item=JSON.parse(rowText);evt=JSON.parse(eventText);}
  catch(_){throw ERROR("LEDGER_JSON_INVALID")}
  ensureRow(item);ensureEvent(evt,item);
  if(item.requestId!==requestId||ver!==(versions.get(requestId)||0)+1)
   throw ERROR("LEDGER_VERSION_CONFLICT");
  const expectedId=requestId+"__V"+ver;
  if(txId!==expectedId)throw ERROR("LEDGER_TX_ID_INVALID");
  if(ver>1){
   const old=latest.get(requestId);
   if(!old||old.employeeId!==item.employeeId||
      old.company!==item.company||old.kind!==item.kind||
      old.fingerprint!==item.fingerprint||
      !["PENDING","APPROVED","REJECTED"].includes(old.status)||
      old.status!=="PENDING"||!["APPROVED","REJECTED"].includes(item.status)||
      evt.type!=="REVIEWED")
    throw ERROR("LEDGER_REVIEW_CONFLICT");
  } else if(evt.type==="REVIEWED")throw ERROR("LEDGER_FIRST_EVENT_INVALID");
  txSeen.add(txId);versions.set(requestId,ver);
  latest.set(requestId,deep(item));
  events.push({...deep(evt),eventKey:txId,delivery:"PENDING"});
  lastHash=hash;
 }
 return {latest,versions,txSeen,lastHash,events,entries:lines.length};
}
function safeReader(state,readonly,changes,events){
 const find=id=>deep(state.latest.get(id)||null);
 return Object.freeze({
  find,list:()=>Array.from(state.latest.values()).map(deep),
  create:readonly?()=>{throw ERROR("READ_ONLY");}:row=>{
   ensureRow(row);
   if(state.latest.has(row.requestId))throw ERROR("DUPLICATE_REQUEST");
   changes.push({kind:"CREATE",row:deep(row)});
  },
  replace:readonly?()=>{throw ERROR("READ_ONLY");}:row=>{
   ensureRow(row);
   if(!state.latest.has(row.requestId))throw ERROR("UNKNOWN_REQUEST");
   changes.push({kind:"REPLACE",row:deep(row)});
  },
  outbox:readonly?()=>{throw ERROR("READ_ONLY");}:event=>{
   if(!event||typeof event!=="object")throw ERROR("OUTBOX_REQUIRED");
   events.push(deep(event));
  }
 });
}
function make(io){
 if(!io||typeof io.withExclusive!=="function"||
    typeof io.readRows!=="function"||typeof io.appendRow!=="function"||
    typeof io.utcNow!=="function")throw ERROR("IO_ADAPTER_MISSING");
 function read(fn){
  if(typeof fn!=="function")throw ERROR("BAD_CALLBACK");
  // Read consistent snapshot under same exclusive lock, fail-closed.
  return io.withExclusive(()=>{
   const state=decode(io.readRows());
   return fn(safeReader(state,true,[],[]));
  });
 }
 function transaction(fn){
  if(typeof fn!=="function")throw ERROR("BAD_CALLBACK");
  return io.withExclusive(()=>{
   const state=decode(io.readRows());
   const changes=[],pendingEvents=[];
   const result=fn(safeReader(state,false,changes,pendingEvents));
   if(!changes.length){
    if(pendingEvents.length)throw ERROR("ORPHAN_OUTBOX");
    return result; // duplicate status/review -> no second write
   }
   // WorkflowCore currently commits exactly one changed request with exactly
   // one matching event. Anything else is unsafe for the one-row journal.
   if(changes.length!==1||pendingEvents.length!==1)
    throw ERROR("MULTI_CHANGE_UNSUPPORTED");
   const mutation=changes[0],row=mutation.row;
   const current=state.latest.get(row.requestId);
   if(mutation.kind==="CREATE"&&current||
      mutation.kind==="REPLACE"&&!current)
    throw ERROR("STALE_MUTATION");
   if(mutation.kind==="REPLACE"&&
      (row.employeeId!==current.employeeId||
       row.company!==current.company||
       row.kind!==current.kind||
       row.fingerprint!==current.fingerprint||
       current.status!=="PENDING"||
       !["APPROVED","REJECTED"].includes(row.status)))
    throw ERROR("IMMUTABLE_REQUEST_SCOPE");
   const event=pendingEvents[0];ensureEvent(event,row);
   if(mutation.kind==="CREATE"&&event.type==="REVIEWED")
    throw ERROR("INITIAL_EVENT_INVALID");
   if(mutation.kind==="REPLACE"&&event.type!=="REVIEWED")
    throw ERROR("REVIEW_EVENT_REQUIRED");
   const version=(state.versions.get(row.requestId)||0)+1;
   const txId=row.requestId+"__V"+version;
   const utcTime=String(io.utcNow());
   if(!Number.isFinite(Date.parse(utcTime)))throw ERROR("TRUSTED_TIME_INVALID");
   const base=[txId,row.requestId,version,JSON.stringify(row),
     JSON.stringify(event),utcTime,state.lastHash];
   const data=[...base,strHash(base.join("\u001f"))];
   // Every write has an uncertain window: Sheets may persist then throw.
   try{
    io.appendRow(data);
   }catch(_){
    throw ERROR("WRITE_OUTCOME_UNKNOWN");
   }
   try{
    const actual=decode(io.readRows());
    if(!actual.txSeen.has(txId)||
       actual.versions.get(row.requestId)!==version||
       actual.entries!==state.entries+1)
     throw ERROR("READBACK_UNCONFIRMED");
   }catch(_){
    throw ERROR("WRITE_OUTCOME_UNKNOWN");
   }
   return result;
  });
 }
 return Object.freeze({transaction,read,HEADERS});
}
const api=Object.freeze({make,decode,HEADERS});
return api;
})();

// ===== staging/AttendanceV2_TwoSheetAdapter.js =====
"use strict";
/* V2 isolated Sheet-to-rule mapper. Pure JS; NO spreadsheet access.
 * All real range reads must be performed by an authorized server.
 * Inputs are headerless row arrays from verified sheets (never public files).
 */
var AttendanceV2TwoSheetAdapter=(function(){
  function required(v){return typeof v==="string" && v.trim()!=="";}
  function str(v){return v===null||v===undefined?"":String(v).trim();}
  function date(v){return str(v).replaceAll("/","-");}
  function status(v){return str(v)==="已確認"?"CONFIRMED":"PENDING";}
  function toScope(v){
    return {"全公司":"ALL","指定打卡地點":"WORKPLACE"}[str(v)]||"UNKNOWN";
  }
  // 「公司工作日曆」A:H - only date exceptions need rows.
  function calendarRows(rows, fallbackCompany){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>{
      const raw=str(r[3]);const dayType=raw==="上班"?"WORK":raw==="休假"?"OFF":"UNKNOWN";
      const audit=str(r[7]); // read-only audit stamp: "人名|ISO timestamp"; no write by this adapter
      const parts=audit.split("|");
      return {date:date(r[0]),company:str(r[1])||fallbackCompany,
        workplace:str(r[2]),dayType,reason:str(r[4]),reference:str(r[5]),
        status:parts.length===2&&required(parts[0])&&required(parts[1])?"CONFIRMED":"PENDING",
        confirmedBy:parts[0]||"",confirmedAt:parts[1]||""};
    });
  }
  // 「公司工作日曆」J:N - annual approval in SAME sheet (not monthly).
  // J year, K company, L approval status, M confirmer, N confirmation time.
  function annualChecks(rows){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>({
      year:str(r[0]),company:str(r[1]),status:status(r[2]),
      confirmedBy:str(r[3]),confirmedAt:str(r[4])
    }));
  }
  // 「特殊出勤事件」A:M
  // A event ID, B date, C type, D scope, E optional workplace code,
  // F FULL/PARTIAL, G paid/review, H evidence, I confirmation, J confirmer,
  // K confirmed at, L partial approved minutes, M note.
  function eventRows(rows,activeCompany){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>{
      const requestedScope=toScope(r[3]),target=str(r[4]),period=str(r[5]);
      // Fail closed: old personal IDs or unintended values in E must not
      // silently change a supposed whole-company event into broad coverage.
      const scope=requestedScope==="ALL"&&target?"UNKNOWN":requestedScope;
      return {eventId:str(r[0]),date:date(r[1]),company:activeCompany,type:str(r[2]),
        scope,workplace:scope==="WORKPLACE"?target:"",
        period:period==="全日"?"FULL":period==="部分"?"PARTIAL":"UNKNOWN",
        payPolicy:str(r[6])==="照常給薪"?"PAID":str(r[6])==="另行核對"?"REVIEW":"UNKNOWN",
        reference:str(r[7]),status:status(r[8]),confirmedBy:str(r[9]),
        confirmedAt:str(r[10]),protectedMinutes:Number(str(r[11])||0),note:str(r[12])};
    });
  }
  const api=Object.freeze({calendarRows,annualChecks,eventRows});
  return api;
})();

// ===== staging/AttendanceV2_CalendarAndEventService.js =====
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
var AttendanceV2CalendarService=(function(){
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
  const api=Object.freeze({parseDate,dateRange,calendarDay,eventFor,validateLeave,evaluateAttendance});
  return api;
})();

// ===== staging/batch/V2_BatchGASJournalPort_QA_NOT_DEPLOYED.gs =====
/**
 * TEST001-only Google Apps Script port for V2_BatchAppendJournal.js.
 *
 * STAGING ONLY / NOT INSTALLED / NOT DEPLOYED.
 * Do NOT paste into an existing DATA_TEST_ONLY or formal clock-in project.
 * This code is for a *separate* QA technical workbook that already exists,
 * with a test-only sheet named V2_交易流水_QA and exact 8 headers. No tabs
 * created, no Sheet cleared, no existing row edited.
 *
 * ScriptProperties (all required; values NOT included in this source):
 *   V2_BATCH_QA_ENABLED = enabled
 *   V2_BATCH_QA_BOOK_ID = exact separate QA workbook ID
 *
 * Danger: a Google Sheet is not an ACID database. Append may persist then
 * fail; caller must query by the ORIGINAL request ID before trying again.
 * Must never place this port on a public doPost without server-side TEST001
 * binding and HR authorization already proven.
 *
 * Interface returned:
 *   withExclusive(fn) => Promise result (script lock)
 *   readRows()       => Promise 2D journal rows
 *   appendRow(row)   => Promise write after verifying exactly 8 fields
 *   utcNow()         => UTC ISO string
 */
function v2BatchGASTestPort_(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty("V2_BATCH_QA_ENABLED")!=="enabled")
    throw Error("V2_BATCH_QA_DISABLED");
  var id=String(props.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id))
    throw Error("V2_BATCH_QA_BOOK_NOT_CONFIGURED");
  // All mutation in this port is deliberately bound to a new QA workbook.
  var ss=SpreadsheetApp.openById(id);
  if(!ss||ss.getId()!==id||ss.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY")
    throw Error("V2_BATCH_QA_WRONG_WORKBOOK");
  var sh=ss.getSheetByName("V2_交易流水_QA");
  if(!sh)throw Error("V2_BATCH_QA_LEDGER_TAB_MISSING");
  var required=["TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
    "UTC_TIME","PREV_HASH","CONTENT_HASH"];
  function verify(){
    if(sh.getLastColumn()!==8||sh.getLastRow()<1||
       sh.getLastRow()>10001)
      throw Error("V2_BATCH_QA_SHAPE_INVALID");
    var head=sh.getRange(1,1,1,8).getDisplayValues()[0];
    for(var i=0;i<8;i++){
      if(head[i]!==required[i])throw Error("V2_BATCH_QA_HEADER_MISMATCH");
    }
  }
  verify();
  var lock=null;
  return {
    withExclusive:function(fn){
      // When public API is introduced, use an exclusive lock that covers
      // the entire read->validate->append->readback transaction.
      var acquired=LockService.getScriptLock();
      if(!acquired.tryLock(20000))throw Error("V2_BATCH_QA_BUSY");
      lock=acquired;
      try{
        verify();
        return fn();
      } finally {
        lock=null;
        acquired.releaseLock();
      }
    },
    readRows:function(){
      if(!lock)throw Error("V2_BATCH_QA_LOCK_REQUIRED");
      verify();
      var count=sh.getLastRow()-1;
      if(count===0)return [];
      return sh.getRange(2,1,count,8).getValues().map(function(row){
        var v=row.slice();
        // Column C version is a number. Other journal fields are text.
        for(var i=0;i<8;i++){
          if(i!==2)v[i]=String(v[i]===null||v[i]===undefined?"":v[i]);
        }
        return v;
      });
    },
    appendRow:function(row){
      if(!lock)throw Error("V2_BATCH_QA_LOCK_REQUIRED");
      verify();
      if(!Array.isArray(row)||row.length!==8||
         typeof row[0]!=="string"||!Number.isInteger(row[2])||
         row.some(function(v,i){return i!==2&&typeof v!=="string"}))
        throw Error("V2_BATCH_QA_APPEND_INVALID");
      // Large JSON cells are not safely within Google Sheet cell limits.
      if(row.some(function(v){return String(v).length>30000}))
        throw Error("V2_BATCH_QA_CELL_TOO_LONG");
      var dest=sh.getLastRow()+1;
      if(dest>10001)throw Error("V2_BATCH_QA_MAX_ROWS");
      // Exactly ONE new row contains both request state and outbox event.
      // If Sheets writes then fails, no cleanup or blind retry is allowed.
      sh.getRange(dest,1,1,8).setValues([row]);
      SpreadsheetApp.flush();
    },
    utcNow:function(){return new Date().toISOString()}
  };
}

// ===== staging/batch/V2_BatchGASCalendarQA_NOT_DEPLOYED.gs =====
/**
 * V2 BATCH QA Calendar: TEST001 source workbook READ-ONLY adapter.
 * NOT INSTALLED / NOT DEPLOYED / NO PUBLIC WEB ENDPOINTS.
 *
 * Dependencies in the future standalone QA Apps Script bundle:
 *   AttendanceV2TwoSheetAdapter
 *   AttendanceV2CalendarService
 *
 * Properties (do not put IDs in GitHub or client payload):
 *   V2_BATCH_QA_ENABLED = enabled
 *   V2_BATCH_QA_SOURCE_BOOK_ID = already-existing TEST001 source spreadsheet
 *   V2_BATCH_QA_BOOK_ID = NEW, distinct QA technical ledger workbook
 *
 * Source columns as verified against existing V2 staged schema:
 * 公司工作日曆: A:H date overrides, J:N annual confirmations
 * 特殊出勤事件: A:M disaster exceptions
 * No writes to either sheet. No employee identity or secret in logs.
 */
function v2BatchCalendarQA_(){
  if(typeof AttendanceV2TwoSheetAdapter==="undefined"||
     typeof AttendanceV2CalendarService==="undefined")
    throw Error("QA_CALENDAR_DEPENDENCIES_MISSING");
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty("V2_BATCH_QA_ENABLED")!=="enabled")
    throw Error("QA_CALENDAR_DISABLED");
  var sourceId=String(props.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID")||"").trim();
  var ledgerId=String(props.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId)||
     !/^[A-Za-z0-9_-]{20,}$/.test(ledgerId)||
     sourceId===ledgerId)
    throw Error("QA_CALENDAR_SOURCE_NOT_ISOLATED");
  var book=SpreadsheetApp.openById(sourceId);
  if(!book||book.getId()!==sourceId||
     book.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("QA_CALENDAR_WRONG_SOURCE_BOOK");
  var employeeSheet=book.getSheetByName("員工資料");
  if(!employeeSheet||employeeSheet.getLastRow()!==2)
    throw Error("QA_CALENDAR_EMPLOYEE_SHAPE");
  var fixture=employeeSheet.getRange(2,1,1,8).getValues()[0];
  if(String(fixture[0])!=="TEST001"||String(fixture[4])!=="TEST_CO"||
     String(fixture[6])!=="在職"||String(fixture[7])!=="TESTSITE")
    throw Error("QA_CALENDAR_EMPLOYEE_MISMATCH");
  var calendar=book.getSheetByName("公司工作日曆");
  var events=book.getSheetByName("特殊出勤事件");
  if(!calendar||!events)throw Error("QA_CALENDAR_TEST_TABS_MISSING");
  var overrideHead=["日期","公司","指定打卡地點","日別","原因",
    "核對依據","備註","確認紀錄"];
  var annualHead=["年度","公司","核對狀態","確認人","確認時間"];
  var eventHead=["事件單號","日期","類型","適用範圍","指定打卡地點",
    "全日／部分","給薪處理","公告或佐證","核對狀態","確認人",
    "確認時間","核定停班分鐘數","備註"];
  function guardHeaders(sh,col,expected){
    var found=sh.getRange(1,col,1,expected.length).getDisplayValues()[0];
    if(found.length!==expected.length||
       expected.some(function(v,i){return found[i]!==v}))
      throw Error("QA_CALENDAR_HEADERS_UNVERIFIED");
  }
  guardHeaders(calendar,1,overrideHead);
  guardHeaders(calendar,10,annualHead);
  guardHeaders(events,1,eventHead);
  // The annual section J:N can legitimately make the sheet taller than A:H.
  // Read each area separately, reject malformed partial rows, never edit.
  function readArea(sh,col,width,maxNonempty){
    var last=sh.getLastRow();
    if(last>501||last<1)throw Error("QA_CALENDAR_ROW_LIMIT");
    if(last===1)return [];
    var data=sh.getRange(2,col,last-1,width).getValues();
    var nonempty=data.filter(function(row){
      var occupied=row.some(function(value){
        return value!==null&&value!==undefined&&String(value).trim()!=="";
      });
      if(occupied&&!String(row[0]===null||row[0]===undefined?"":row[0]).trim())
        throw Error("QA_CALENDAR_PARTIAL_ROW");
      return occupied;
    });
    if(nonempty.length>maxNonempty)throw Error("QA_CALENDAR_SECTION_LIMIT");
    return nonempty;
  }
  function asDate(v){
    return v instanceof Date?Utilities.formatDate(v,"Asia/Taipei","yyyy-MM-dd"):
      String(v===undefined||v===null?"":v).trim().replace(/\//g,"-");
  }
  function normalize(rows,idx){
    return rows.map(function(row){var copy=row.slice();copy[idx]=asDate(copy[idx]);return copy;});
  }
  var model=AttendanceV2TwoSheetAdapter;
  var exceptions=model.calendarRows(normalize(readArea(calendar,1,8,250),0),"TEST_CO");
  var annual=model.annualChecks(readArea(calendar,10,5,20));
  var special=model.eventRows(normalize(readArea(events,1,13,100),1),"TEST_CO");
  function validateLeave(data,principal,today){
    if(!data||!principal||
       principal.source!=="VERIFIED_SERVER_BINDING"||
       principal.active!==true||principal.employeeId!=="TEST001"||
       principal.company!=="TEST_CO"||
       !["STAFF","HR_OWNER"].includes(principal.role))
      return {ok:false,code:"QA_CALENDAR_IDENTITY_UNVERIFIED"};
    if(typeof today!=="string"||
       !AttendanceV2CalendarService.parseDate(today))
      return {ok:false,code:"QA_CALENDAR_TODAY_INVALID"};
    // Server-side month/day validation does not trust browser-prechecked values.
    var days=AttendanceV2CalendarService.dateRange(data.startDate,data.endDate);
    if(!days.ok)return {ok:false,code:days.code};
    if(days.days.length>31)return {ok:false,code:"RANGE_TOO_LONG"};
    var request={startDate:data.startDate,endDate:data.endDate,
      mode:data.unit,startTime:data.fromTime,endTime:data.toTime};
    var ctx={employee:{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"},
      annualChecks:annual,calendarOverrides:exceptions,events:special,today:today};
    var result=AttendanceV2CalendarService.validateLeave(request,ctx);
    // Never return raw exceptions or other HR details to the client.
    return result.ok?
      {ok:true,workingDays:result.days.length}:
      {ok:false,code:result.code||"CALENDAR_UNVERIFIED"};
  }
  return Object.freeze({validateLeave:validateLeave});
}

// ===== staging/batch/V2_BatchQAProtectedRouter_NOT_DEPLOYED.gs =====
/**
 * LINE attendance V2 BATCH — TEST001 QA protected operation router.
 *
 * NOT DEPLOYED. THERE IS NO PUBLIC doPost/doGet.
 * The original router was async; this bundle is synchronously adapted:
 * Google's Web App handlers must return HtmlOutput/TextOutput directly;
 * async Promise-to-HtmlOutput delivery needs independent runtime testing.
 *
 * Dependencies in the same future stand-alone QA GAS project:
 *   V2BatchWorkflowCore, V2BatchAppendJournal
 *   v2BatchGASTestPort_(), v2BatchCalendarQA_()
 *
 * NEVER install in formal "打卡系統" or the GPS v2 or V4 projects.
 * QA properties all server-side:
 * V2_BATCH_QA_ENABLED = disabled|enabled
 * V2_BATCH_QA_WRITE_ENABLED = disabled|enabled
 * V2_BATCH_QA_SOURCE_BOOK_ID = isolated TEST001 Sheet ID
 * V2_BATCH_QA_BOOK_ID = separate technical QA-only workbook ID
 * LINE_LOGIN_CHANNEL_ID = 2012136707
 * V2_BATCH_QA_HR_LINE_SUB = private TEST-only verified owner LINE sub
 *
 * HR's LINE sub must differ from the TEST001 employee binding. No real
 * employee account or official HR roster is read/modified by this router.
 */
var V2_BATCH_QA_CHANNEL_="2012136707";
var V2_BATCH_QA_OPS_=[
 "LEAVE_PREVIEW","LEAVE_REQUEST","LEAVE_STATUS","MY_LEAVES",
 "MISSING_REQUEST","MISSING_STATUS","HR_PENDING","HR_STATUS","HR_REVIEW"
];
var V2_BATCH_QA_WRITES_=["LEAVE_REQUEST","MISSING_REQUEST","HR_REVIEW"];
function v2BatchQASettings_(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_BATCH_QA_ENABLED")!=="enabled"||
    p.getProperty("LINE_LOGIN_CHANNEL_ID")!==V2_BATCH_QA_CHANNEL_)
  throw Error("QA_DISABLED");
 var sourceId=String(p.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID")||"").trim();
 var ledgerId=String(p.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
 if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId)||
    !/^[A-Za-z0-9_-]{20,}$/.test(ledgerId)||
    ledgerId===sourceId)throw Error("QA_SCOPE_UNVERIFIED");
 var owner=String(p.getProperty("V2_BATCH_QA_HR_LINE_SUB")||"").trim();
 if(owner&&!/^U[0-9a-f]{32}$/i.test(owner))throw Error("QA_OWNER_CONFIG_INVALID");
 return {sourceId:sourceId,ledgerId:ledgerId,
  writeEnabled:p.getProperty("V2_BATCH_QA_WRITE_ENABLED")==="enabled",
  owner:owner};
}
function v2BatchQAParse_(params){
 if(!params||typeof params!=="object"||Array.isArray(params)||
    Object.keys(params).some(function(k){
      return ["nonce","operation","payload"].indexOf(k)<0;
    }))throw Error("QA_INPUT_INVALID");
 var nonce=String(params.nonce||"");
 var op=String(params.operation||"");
 if(!/^[0-9a-f]{40}$/.test(nonce)||V2_BATCH_QA_OPS_.indexOf(op)<0)
  throw Error("QA_INPUT_INVALID");
 if(typeof params.payload!=="string"||params.payload.length>12000||
    params.payload.length<35)throw Error("QA_PAYLOAD_INVALID");
 var input;
 try{input=JSON.parse(params.payload)}catch(_){throw Error("QA_PAYLOAD_INVALID")}
 if(!input||Array.isArray(input)||typeof input!=="object"||
    Object.keys(input).length!==2||
    !Object.prototype.hasOwnProperty.call(input,"idToken")||
    !Object.prototype.hasOwnProperty.call(input,"args"))
  throw Error("QA_PAYLOAD_INVALID");
 if(typeof input.idToken!=="string"||input.idToken.length<30||
    input.idToken.length>8192||input.idToken.split(".").length!==3||
    !input.args||typeof input.args!=="object"||Array.isArray(input.args)||
    JSON.stringify(input.args).length>3500)
  throw Error("QA_PAYLOAD_INVALID");
 return {nonce:nonce,operation:op,token:input.idToken,args:input.args};
}
function v2BatchQALineClaims_(token){
 var response=UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify",{
  method:"post",contentType:"application/x-www-form-urlencoded",
  payload:{id_token:token,client_id:V2_BATCH_QA_CHANNEL_},
  muteHttpExceptions:true
 });
 if(response.getResponseCode()!==200)throw Error("QA_LINE_AUTH_FAILED");
 var claims;
 try{claims=JSON.parse(response.getContentText())}
 catch(_){throw Error("QA_LINE_AUTH_FAILED")}
 var now=Math.floor(Date.now()/1000);
 if(!claims||claims.iss!=="https://access.line.me"||
    String(claims.aud)!==V2_BATCH_QA_CHANNEL_||
    !/^U[0-9a-f]{32}$/i.test(String(claims.sub||""))||
    !Number.isFinite(Number(claims.exp))||Number(claims.exp)<=now||
    !Number.isFinite(Number(claims.iat))||Number(claims.iat)>now+300)
  throw Error("QA_LINE_AUTH_FAILED");
 return String(claims.sub);
}
function v2BatchQAIdentity_(settings){
 return {verify:function(token){
  var sub=v2BatchQALineClaims_(token);
  var book=SpreadsheetApp.openById(settings.sourceId);
  if(!book||book.getId()!==settings.sourceId||
     book.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("QA_ROSTER_WRONG_BOOK");
  var staff=book.getSheetByName("員工資料");
  if(!staff||staff.getLastRow()!==2)throw Error("QA_ROSTER_INVALID");
  var row=staff.getRange(2,1,1,8).getValues()[0];
  if(String(row[0])!=="TEST001"||String(row[4])!=="TEST_CO"||
     String(row[6])!=="在職"||String(row[7])!=="TESTSITE"||
     !/^U[0-9a-f]{32}$/i.test(String(row[3]||"")))
    throw Error("QA_ROSTER_INVALID");
  // Never give the test employee account HR rights by accidental overlap.
  if(settings.owner&&String(row[3])===settings.owner)
    throw Error("QA_ROLE_OVERLAP");
  if(sub===String(row[3]))
   return {source:"VERIFIED_SERVER_BINDING",active:true,
     employeeId:"TEST001",company:"TEST_CO",role:"STAFF"};
  if(settings.owner&&sub===settings.owner)
   return {source:"VERIFIED_SERVER_BINDING",active:true,
     employeeId:"QA_HR_TEST",company:"TEST_CO",role:"HR_OWNER"};
  throw Error("QA_LINE_BINDING_MISSING");
 }};
}
/**
 * This method returns a synchronous result in this QA-only bundle.
 * Do not publish or enable this standalone Web App until a separate, tested
 * synchronous HtmlOutput bridge is available. The async runtime is not a
 * guarantee that an Apps Script doPost will a Promise.
 */
function v2BatchQAHandleCandidate_(params){
 var nonce=String(params&&params.nonce||"");
 try{
  if(typeof V2BatchWorkflowCore==="undefined"||
     typeof V2BatchAppendJournal==="undefined"||
     typeof v2BatchGASTestPort_!=="function"||
     typeof v2BatchCalendarQA_!=="function")
    throw Error("QA_DEPENDENCIES_MISSING");
  var config=v2BatchQASettings_();
  var request=v2BatchQAParse_(params);
  var flags={};
  V2_BATCH_QA_OPS_.forEach(function(op){
    flags[op]=V2_BATCH_QA_WRITES_.indexOf(op)<0||config.writeEnabled;
  });
  // Lazily open durable QA workbook only after LINE identity checks in Core;
  // the port also independently checks the test-only feature flag and book.
  var ledger={
    read:function(callback){
      return V2BatchAppendJournal.make(v2BatchGASTestPort_()).read(callback);
    },
    transaction:function(callback){
      return V2BatchAppendJournal.make(v2BatchGASTestPort_()).transaction(callback);
    }
  };
  var calendar=v2BatchCalendarQA_(); // isolated source, read only
  var service=V2BatchWorkflowCore.create({
    identity:v2BatchQAIdentity_(config),
    store:ledger,calendar:calendar,
    clock:{today:function(){
      return Utilities.formatDate(new Date(),"Asia/Taipei","yyyy-MM-dd");
    }},
    flags:flags
  });
  var result=service.handle({
    operation:request.operation,payload:request.args,credential:request.token
  });
  if(result&&result.ok===true)
    return {bridge:"YC_V2_BATCH_QA_V1",nonce:request.nonce,
      ok:true,result:result};
  return {bridge:"YC_V2_BATCH_QA_V1",nonce:request.nonce,
    ok:false,code:result&&result.code==="AUTH_REQUIRED"?"AUTH":
      result&&result.code==="FEATURE_DISABLED"?"DISABLED":"REJECTED",
    persisted:false};
 }catch(_){
  // In particular, the write may already have committed before an exception.
  // Public callers must always check original requestId; never claim false.
  return {bridge:"YC_V2_BATCH_QA_V1",nonce:/^[0-9a-f]{40}$/.test(nonce)?nonce:"",
    ok:false,code:"UNKNOWN",persisted:null};
 }
}

/**
 * Synchronous TEST001 QA WebApp entry only. NOT DEPLOYED.
 * Any real deployment must use a NEW independent QA Apps Script project
 * and distinct QA-only technical workbook. Never replace GPS/V4/formal.
 */
function doPost(e){
 var params=e&&e.parameter||{};
 var reply=v2BatchQAHandleCandidate_(params);
 var js=JSON.stringify(reply).replace(/</g,"\\u003c")
   .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 var html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
  '<script>window.top.postMessage('+js+',"https://line-punch.github.io");</script>'+
  '</body></html>';
 return HtmlService.createHtmlOutput(html)
   .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet(){
 return ContentService.createTextOutput(
  "TEST001 批次獨立 QA Web App；沒有網頁操作入口。")
  .setMimeType(ContentService.MimeType.TEXT);
}
