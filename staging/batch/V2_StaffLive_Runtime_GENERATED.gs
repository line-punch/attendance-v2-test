/** GENERATED separate YC/YT staff service; all activation flags default OFF. */
var V2StaffCore=(function(){var module={exports:{}};
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
 "MISSING_REQUEST","MISSING_STATUS","MY_MISSING","HR_PENDING","HR_STATUS","HR_REVIEW"
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
  status:row.status,legacyStatusLabel:row.legacyStatusLabel||"",employeeId:row.employeeId,submittedAt:row.submittedAt||"",
  ...(row.kind==="LEAVE"?{
    leaveType:row.body.leaveType,startDate:row.body.startDate,
    endDate:row.body.endDate,unit:row.body.unit,
    legacyUnitLabel:row.body.legacyUnitLabel||"",fromTime:row.body.fromTime||"",toTime:row.body.toTime||""
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
     return r.ok?{ok:true,readOnly:true,days:null,requestedCalendarDays:r.requestedCalendarDays,settlement:r.settlement}:err(r.code||"CALENDAR_UNVERIFIED");
    }catch(_){return err("CALENDAR_UNVERIFIED");}
   }
   // Repeat identical calendar validation under the actual write lock.
   return store.transaction( tx=>{
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
    if(v.settlement!=="OFFLINE_HR"||v.workingDays!==null||!Number.isInteger(v.requestedCalendarDays)||v.requestedCalendarDays<1||v.requestedCalendarDays>31)
      return err("CALENDAR_DAY_COUNT_UNVERIFIED");
    const row={kind:"LEAVE",employeeId:p.employeeId,company:p.company,
      requestId:parsed.data.requestId,
      body:{...parsed.data,workingDays:null,requestedCalendarDays:v.requestedCalendarDays,settlement:"OFFLINE_HR"},fingerprint:fp,
      status:"PENDING",submittedAt:clock.today()};
    tx.create(row);
    tx.outbox({type:"LEAVE_SUBMITTED",requestId:row.requestId});
    return {ok:true,duplicate:false,request:summary(row),notification:"QUEUED"};
   });
  }
  if(operation==="MISSING_REQUEST"){
   const parsed=cleanMissed(payload);if(!parsed.ok)return parsed;
   return store.transaction( tx=>{
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
   const row=store.read( tx=>tx.find(payload.requestId));
   if(!row||row.kind!==kind||row.employeeId!==p.employeeId||
      row.company!==p.company)
    return err("NOT_FOUND");
   return {ok:true,readOnly:true,request:summary(row)};
  }
  if(operation==="MY_LEAVES"||operation==="MY_MISSING"){
   if(Object.keys(payload).length!==1||typeof payload.month!=="string"||
      !MONTH.test(payload.month))return err("MONTH_INVALID");
   const allowed=months(clock.today());
   if(payload.month<allowed[2])return err("MONTH_OUT_OF_RANGE");
   const rows=store.read( tx=>tx.list());
   const start=payload.month+"-01";
   const [yy,mm]=payload.month.split("-").map(Number);
   const end=new Date(Date.UTC(yy,mm,0)).toISOString().slice(0,10);
   const kind=operation==="MY_LEAVES"?"LEAVE":"MISSING";
   const mine=rows.filter(x=>x.kind===kind&&x.employeeId===p.employeeId&&
     x.company===p.company&&
     (kind==="LEAVE"?x.body.startDate<=end&&x.body.endDate>=start:
       x.body.date>=start&&x.body.date<=end)).map(summary);
   return {ok:true,readOnly:true,month:payload.month,
     total:mine.length,requests:mine};
  }
  if(operation==="HR_STATUS"){
   if(Object.keys(payload).length!==1||!REQ.test(String(payload.requestId||"")))
    return err("REQUEST_ID_INVALID");
   const row=store.read( tx=>tx.find(payload.requestId));
   if(!row||row.company!==p.company)return err("NOT_FOUND");
   return {ok:true,readOnly:true,request:summary(row)};
  }
  if(operation==="HR_PENDING"){
   if(Object.keys(payload).length!==0)return err("INVALID_FORM_FIELDS");
   const rows=store.read( tx=>tx.list());
   return {ok:true,readOnly:true,
    pending:rows.filter(x=>x.status==="PENDING"&&x.company===p.company).map(summary)};
  }
  if(operation==="HR_REVIEW"){
   if(Object.keys(payload).some(k=>!["requestId","decision"].includes(k))||
      Object.keys(payload).length!==2||
      !REQ.test(String(payload.requestId||""))||
      !["APPROVE","REJECT"].includes(payload.decision))
    return err("REVIEW_INPUT_INVALID");
   return store.transaction( tx=>{
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
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchWorkflowCore=api;
})(typeof window!=="undefined"?window:this);


return module.exports;})();
var V2StaffJournal=(function(){var module={exports:{}};
/** GENERATED formal candidate journal; not deployed. QA journal remains unchanged. */
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
 *   withExclusive( ()=>...)
 *   readRows() => 2D array of exactly 8-column journal records
 *   appendRow(8-element array) => may throw
 *   utcNow() => ISO string
 * No real Google calls or credentials here. No notification delivery.
 */
(function(root){
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
    (typeof row.company!=="string"||row.company.length<1||row.company.length>80||row.company.trim()!==row.company||/[\u0000-\u001f\u007f]/.test(row.company))||
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
 const find= id=>deep(state.latest.get(id)||null);
 return Object.freeze({
  find,list:()=>Array.from(state.latest.values()).map(deep),
  create:readonly?()=>{throw ERROR("READ_ONLY");}: row=>{
   ensureRow(row);
   if(state.latest.has(row.requestId))throw ERROR("DUPLICATE_REQUEST");
   changes.push({kind:"CREATE",row:deep(row)});
  },
  replace:readonly?()=>{throw ERROR("READ_ONLY");}: row=>{
   ensureRow(row);
   if(!state.latest.has(row.requestId))throw ERROR("UNKNOWN_REQUEST");
   changes.push({kind:"REPLACE",row:deep(row)});
  },
  outbox:readonly?()=>{throw ERROR("READ_ONLY");}: event=>{
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
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchAppendJournal=api;
})(typeof window!=="undefined"?window:this);


return module.exports;})();
var V2StaffAccess=(function(){var module={exports:{}};
"use strict";
// Candidate only: no endpoint, real accounts, credentials, network or deployment.
// loadBindings and verifyLine must be trusted server adapters, never client fields.
const core=V2StaffCore;
const SUB=/^U[0-9a-f]{32}$/i,ID=/^[A-Za-z0-9_-]{2,40}$/;
const HR=new Set(['HR_PENDING','HR_STATUS','HR_REVIEW']);
function compile(data){
 if(!data||!Array.isArray(data.employees)||!Array.isArray(data.reviewers)||!Array.isArray(data.assignments))throw Error('BINDINGS_INVALID');
 const employees=new Map(),staffBySub=new Map(),reviewers=new Map(),reviewerIds=new Set(),assignments=new Map();
 for(const raw of data.employees){
  const e={...raw};
  if(!ID.test(e.employeeId||'')||typeof e.company!=='string'||!e.company.trim()||typeof e.lineSub!=='string'||e.lineSub!==''&&!SUB.test(e.lineSub)||typeof e.active!=='boolean'||employees.has(e.employeeId)||e.lineSub&&staffBySub.has(e.lineSub))throw Error('EMPLOYEE_BINDING_INVALID');
  employees.set(e.employeeId,e);if(e.lineSub)staffBySub.set(e.lineSub,e);
 }
 for(const raw of data.reviewers){
  const r={...raw};
  if(!ID.test(r.reviewerId||'')||!SUB.test(r.lineSub||'')||typeof r.active!=='boolean'||reviewers.has(r.lineSub)||reviewerIds.has(r.reviewerId)||
     employees.has(r.reviewerId)&&employees.get(r.reviewerId).lineSub!==r.lineSub)throw Error('REVIEWER_BINDING_INVALID');
  reviewers.set(r.lineSub,r);reviewerIds.add(r.reviewerId);
 }
 for(const raw of data.assignments){
  const a={...raw,noticeSubs:Array.isArray(raw.noticeSubs)?[...new Set(raw.noticeSubs)]:null};
  if(!employees.has(a.employeeId)||assignments.has(a.employeeId)||!reviewers.has(a.reviewerSub)||!a.noticeSubs||a.noticeSubs.length>2||a.noticeSubs.some(s=>!SUB.test(s))||employees.get(a.employeeId).lineSub===a.reviewerSub)throw Error('ASSIGNMENT_INVALID');
  assignments.set(a.employeeId,a);
 }
 function staff(sub){const e=staffBySub.get(sub);return e&&e.active?e:null;}
 function reviewer(sub){const r=reviewers.get(sub),e=staffBySub.get(sub);return r&&r.active&&(!e||e.active)?r:null;}
 function visible(sub,row,review){
  if(!row)return false;
  const e=employees.get(row.employeeId);
  if(!e||!e.active||e.company!==row.company)return false;
  if(!review)return !!staff(sub)&&e.lineSub===sub;
  const a=assignments.get(e.employeeId);
  return !!reviewer(sub)&&!!a&&a.reviewerSub===sub&&e.lineSub!==sub;
 }
 return {staff,reviewer,visible,reviewCompanies:sub=>[...new Set([...employees.values()].filter(e=>visible(sub,e,true)).map(e=>e.company))],
  notificationRecipients:row=>{
   const e=employees.get(row.employeeId),a=assignments.get(row.employeeId);
   if(!e||!e.active||e.company!==row.company||!a||!reviewer(a.reviewerSub))throw Error('RECIPIENT_BINDING_INVALID');
   return {employee:e.lineSub,reviewer:a.reviewerSub,noticeSubs:a.noticeSubs.slice()};
  }};
}
function create({verifyLine,loadBindings,store,calendar,clock,flags={}}){
 if(typeof verifyLine!=='function'||typeof loadBindings!=='function'||!store)throw Error('SERVER_ADAPTER_REQUIRED');
  function handle({operation,payload={},credential}={}){
  if(!core.OPERATIONS.includes(operation))return {ok:false,code:'OPERATION_DENIED'};
  if(flags[operation]!==true)return {ok:false,code:'FEATURE_DISABLED'};
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return {ok:false,code:'INVALID_FORM_FIELDS'};
  let verified,policy;
  try{verified=verifyLine(credential);if(!verified||verified.source!=='VERIFIED_LINE_ID_TOKEN'||!SUB.test(verified.sub||''))throw Error('AUTH');policy=compile(loadBindings());}
  catch(_){return {ok:false,code:'AUTH_REQUIRED'};}
  const review=HR.has(operation),actor=review?policy.reviewer(verified.sub):policy.staff(verified.sub);
  if(!actor)return {ok:false,code:review?'HR_ONLY':'AUTH_REQUIRED'};
  // Recheck bindings inside every storage transaction/read. Never cache an
  // employee's earlier authorization over a changed supervisor assignment.
  const scoped={};
  for(const mode of ['read','transaction'])scoped[mode]=fn=>store[mode]( tx=>{
   const fresh=compile(loadBindings());
   const allowed=row=>fresh.visible(verified.sub,row,review);
   const staged=new Map();
   const view={find: id=>{const row=staged.get(id)||tx.find(id);return allowed(row)?row:null;},
    list:()=> (tx.list()).filter(allowed)};
   if(mode==='transaction'){
    view.create= row=>{if(!allowed(row))throw Error('SCOPE_DENIED');if(staged.has(row.requestId)||tx.find(row.requestId))throw Error('REQUEST_ID_CONFLICT');const result=tx.create(row);staged.set(row.requestId,row);return result;};
    view.replace= row=>{if(!allowed(row)||!allowed(tx.find(row.requestId)))throw Error('SCOPE_DENIED');const result=tx.replace(row);staged.set(row.requestId,row);return result;};
    view.outbox= event=>{if(!allowed(staged.get(event.requestId)||tx.find(event.requestId)))throw Error('SCOPE_DENIED');return tx.outbox(event);};
   }
   return fn(view);
  });
  let companies=review?policy.reviewCompanies(verified.sub):[actor.company];
  if(review&&operation!=='HR_PENDING'){
   // Read only an authorized original; company is never taken from the phone.
   const row=scoped.read(tx=>tx.find(payload&&payload.requestId));
   if(!row)return {ok:false,code:'NOT_FOUND'};
   companies=[row.company];
  }
  const pending=[];
  for(const company of companies){
   const principal={source:'VERIFIED_SERVER_BINDING',active:true,company,
    employeeId:review?actor.reviewerId:actor.employeeId,role:review?'HR_OWNER':'STAFF'};
   const service=core.create({identity:{verify:()=>principal},store:scoped,calendar,clock,flags});
   const result=service.handle({operation,payload,credential});
   if(operation!=='HR_PENDING'||!result.ok)return result;
   pending.push(...result.pending);
  }
  if(operation==='HR_PENDING'){
   if(Object.keys(payload||{}).length)return {ok:false,code:'INVALID_FORM_FIELDS'};
   return {ok:true,readOnly:true,pending};
  }
  return {ok:false,code:'NOT_FOUND'};
 }
 return Object.freeze({handle});
}
module.exports={compile,create};

return module.exports;})();
var V2StaffTables=(function(){var module={exports:{}};
"use strict";
// Pure table adapter. No Sheets calls; only arrays supplied by a trusted server.
const access=V2StaffAccess;
const HEADERS={employees:['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點'],
 sites:['地點代碼','地點名稱','公司','GPS中心點','容許距離'],
 assignments:['員工ID','員工姓名','通知主管1（userId）','通知主管2（userId）','審核主管（userId)']};
const text=v=>String(v==null?'':v).trim(),SUB=/^U[0-9a-f]{32}$/i;
function rows(table,headers){
 if(!Array.isArray(table)||!Array.isArray(table[0])||JSON.stringify(table[0].map(text))!==JSON.stringify(headers))throw Error('TABLE_HEADERS_INVALID');
 return table.slice(1).filter(r=>r.some(v=>text(v)!==''));
}
function parse(tables,{externalReviewers=[]}={}){
 const employees=rows(tables.employees,HEADERS.employees).map(r=>({employeeId:text(r[0]),lineSub:text(r[3]),company:text(r[4]),
  active:text(r[6])===''||text(r[6])==='在職',allowedCodes:text(r[7]).split(/[,，、\/\s]+/).filter(Boolean)}));
 // Unbound employees are retained for uniqueness checks but cannot sign in.
 const bySub=new Map(employees.filter(e=>e.lineSub).map(e=>[e.lineSub,e]));
 const sites=[],codes=new Set();
 for(const r of rows(tables.sites,HEADERS.sites)){
  const code=text(r[0]),coord=text(r[3]).replace(/^\(/,'').replace(/\)$/,'').split(',').map(text);
  const numeric=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const lat=Number(coord[0]),lng=Number(coord[1]),rawRadius=text(r[4])===''?50:Number(r[4]);
  if(!code||codes.has(code)||coord.length!==2||!coord.every(s=>numeric.test(s))||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||lat===0&&lng===0||!Number.isFinite(rawRadius)||rawRadius<=0)throw Error('SITE_CONFIG_INVALID');
  codes.add(code);sites.push({code,name:text(r[1]),company:text(r[2]),lat,lng,radius:Math.min(rawRadius,50),configuredRadius:rawRadius});
 }
 for(const e of employees)if(e.active&&e.allowedCodes.some(c=>!codes.has(c)))throw Error('EMPLOYEE_SITE_UNKNOWN');
 const external=new Map();
 for(const r of externalReviewers){if(!SUB.test(r.lineSub||'')||external.has(r.lineSub))throw Error('EXTERNAL_REVIEWER_INVALID');external.set(r.lineSub,{...r});}
 const reviewers=new Map(),assignments=[];
 for(const r of rows(tables.assignments,HEADERS.assignments)){
  const reviewerSub=text(r[4]),employeeId=text(r[0]),noticeSubs=[text(r[2]),text(r[3])].filter(Boolean);
  // A missing approver stays unassigned, rather than granting broad HR access.
  if(!reviewerSub){if(noticeSubs.length)throw Error('APPROVER_MISSING');continue;}
  const e=bySub.get(reviewerSub),reviewer=e?{reviewerId:e.employeeId,lineSub:e.lineSub,active:e.active}:external.get(reviewerSub);
  if(!reviewer)throw Error('APPROVER_BINDING_MISSING');
  reviewers.set(reviewerSub,reviewer);assignments.push({employeeId,reviewerSub,noticeSubs});
 }
 const bindings={employees,reviewers:[...reviewers.values()],assignments};
 access.compile(bindings); // Includes global IDs, repeated bindings and self-review.
 return {bindings,sites};
}
function nearest(employee,sites,lat,lng){
 const allowed=employee.allowedCodes||[];
 const candidates=sites.filter(s=>allowed.length?allowed.includes(s.code):!s.company||s.company===employee.company);
 const rad=Math.PI/180;
 return candidates.map(s=>{const a=(lat-s.lat)*rad,b=(lng-s.lng)*rad;
  const h=Math.sin(a/2)**2+Math.cos(s.lat*rad)*Math.cos(lat*rad)*Math.sin(b/2)**2;
  return {...s,distance:6371000*2*Math.asin(Math.min(1,Math.sqrt(h)))};
 }).sort((a,b)=>a.distance-b.distance)[0]||null;
}
module.exports={HEADERS,parse,nearest};

return module.exports;})();
var V2StaffLegacyClocks=(function(){var module={exports:{}};
"use strict";
// Read-only legacy normal cards. Never consumes leave or missed applications.
const HEADERS=['時間戳記','日期','時間','員工ID','姓名','類型','地點代碼','地點名稱','GPS','備註','來源'];
function parse(tables,employees,month){
 const roster=new Map(employees.map(e=>[e.employeeId,e])),found=new Map();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('LEGACY_MONTH_INVALID');
 for(const table of tables){
  if(!Array.isArray(table)||JSON.stringify(table[0])!==JSON.stringify(HEADERS))throw Error('LEGACY_CLOCK_SCHEMA_INVALID');
  for(const r of table.slice(1)){
   const e=roster.get(String(r[3]||''));if(!e||String(r[10])!=='LINE')continue;
   const date=String(r[1]||'').replaceAll('/','-'),time=String(r[2]||'');if(date.slice(0,7)!==month)continue;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)||!['上班','下班'].includes(r[5])||!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(r[8]||'')))throw Error('LEGACY_CLOCK_ROW_INVALID');
   const coords=String(r[8]).split(',').map(Number);if(Math.abs(coords[0])>90||Math.abs(coords[1])>180)throw Error('LEGACY_CLOCK_ROW_INVALID');
   const id='V2_LEGACY_'+e.employeeId+'_'+date.replaceAll('-','')+'_'+time.replaceAll(':','')+'_'+(r[5]==='上班'?'IN':'OUT');
   const utc=String(r[0]||'');if(!Number.isFinite(Date.parse(utc)))throw Error('LEGACY_TIMESTAMP_INVALID');
   const m=String(r[9]||'').match(/距離[：:]\s*(\d+(?:\.\d+)?)\s*公尺/);
   const row={requestId:id,kind:'CLOCK',employeeId:e.employeeId,company:e.company,date,time,type:r[5],source:'LINE',legacy:true,siteCode:String(r[6]||''),siteName:String(r[7]||''),distanceMeters:m?Number(m[1]):null,accuracyMeters:null,utcTime:utc};
   const old=found.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('LEGACY_CLOCK_CONFLICT');found.set(id,row);
  }
 }
 return [...found.values()];
}
module.exports={HEADERS,parse};

return module.exports;})();
var V2StaffClock=(function(){var module={exports:{}};
"use strict";
// Candidate normal-clock service. No public route, GPS hardware or real storage.
const tables=V2StaffTables,access=V2StaffAccess;
const OPS=['GPS_CLOCK','GPS_STATUS','MY_CLOCKS'],TYPES=['上班','下班'],REQ=/^[A-Za-z0-9_-]{12,80}$/;
const error=code=>({ok:false,code});
const summary=r=>({requestId:r.requestId,kind:'CLOCK',date:r.date,time:r.time,type:r.type,source:r.source});
function create({verifyLine,loadTables,normalStore,clock,flags={}}){
  function handle({operation,args={},credential}={}){
  if(!OPS.includes(operation))return error('OPERATION_DENIED');
  if(flags[operation]!==true)return error('FEATURE_DISABLED');
  const allowed=operation==='MY_CLOCKS'?[]:operation==='GPS_STATUS'?['requestId','type']:['requestId','type','lat','lng','accuracy','capturedAt'];
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k)))return error('INVALID_FORM_FIELDS');
  if(operation!=='MY_CLOCKS'&&(!REQ.test(args.requestId||'')||!TYPES.includes(args.type)))return error('CLOCK_INPUT_INVALID');
  let identity;
  try{identity=verifyLine(credential);if(!identity||identity.source!=='VERIFIED_LINE_ID_TOKEN'||!/^U[0-9a-f]{32}$/i.test(identity.sub||''))throw Error('AUTH');}
  catch(_){return error('AUTH_REQUIRED');}
  try{return normalStore[operation==='GPS_CLOCK'?'transaction':'read']( tx=>{
   const data=loadTables(),policy=access.compile(data.bindings),employee=policy.staff(identity.sub);
   if(!employee)return error('AUTH_REQUIRED');
   const now=clock.now();
   if(!now||!Number.isFinite(now.epochMs)||!/^\d{4}-\d{2}-\d{2}$/.test(now.date)||!/^\d{2}:\d{2}:\d{2}$/.test(now.time)||!now.utc)throw Error('CLOCK_CONFIG_INVALID');
   const rows=tx.list();
   if(rows.some(r=>r.kind!=='CLOCK'||!['GPS','LINE'].includes(r.source)||!TYPES.includes(r.type)))throw Error('NORMAL_LEDGER_INVALID');
   const mine=rows.filter(r=>r.employeeId===employee.employeeId&&r.company===employee.company);
   if(operation==='MY_CLOCKS'){
    const month=now.date.slice(0,7),days=new Map();
    for(const row of mine.filter(r=>r.date.slice(0,7)===month)){
     const day=days.get(row.date)||{date:row.date,clockIn:'',clockOut:''},key=row.type==='上班'?'clockIn':'clockOut';
     if(day[key])throw Error('NORMAL_DUPLICATE');day[key]=row.time;days.set(row.date,day);
    }
    return {ok:true,readOnly:true,month,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
   }
   const originals=rows.filter(r=>r.requestId===args.requestId);
   if(originals.length>1)throw Error('NORMAL_DUPLICATE');
   if(originals.length){
    const original=originals[0];
    if(original.employeeId!==employee.employeeId||original.company!==employee.company)return error(operation==='GPS_STATUS'?'NOT_FOUND':'REQUEST_ID_CONFLICT');
    if(original.type!==args.type)return error('REQUEST_ID_CONFLICT');
    return {ok:true,readOnly:operation==='GPS_STATUS',duplicate:true,request:summary(original)};
   }
   if(operation==='GPS_STATUS')return error('NOT_FOUND');
   if(!Number.isFinite(args.capturedAt)||args.capturedAt<now.epochMs-120000||args.capturedAt>now.epochMs+15000)return error('GPS_EXPIRED');
   if(typeof args.lat!=='number'||typeof args.lng!=='number'||!Number.isFinite(args.lat)||!Number.isFinite(args.lng)||Math.abs(args.lat)>90||Math.abs(args.lng)>180)return error('GPS_INVALID');
   if(typeof args.accuracy!=='number'||!Number.isFinite(args.accuracy)||args.accuracy<=0||args.accuracy>150)return error('GPS_ACCURACY');
   const site=tables.nearest(employee,data.sites,args.lat,args.lng);
   if(!site)return error('SITE_NOT_FOUND');
   if(site.distance>site.radius)return error('OUT_OF_RANGE');
   if(mine.some(r=>r.date===now.date&&r.type===args.type))return error('ALREADY_CLOCKED');
   // Preserve the existing one-minute duplicate rule, even across punch types.
   if(mine.some(r=>r.date===now.date&&r.time.slice(0,5)===now.time.slice(0,5)))return error('SAME_MINUTE');
   const row={requestId:args.requestId,kind:'CLOCK',employeeId:employee.employeeId,company:employee.company,date:now.date,time:now.time,
    type:args.type,source:'GPS',siteCode:site.code,siteName:site.name,distanceMeters:Math.round(site.distance),accuracyMeters:Math.round(args.accuracy),utcTime:now.utc};
   tx.create(row);
   return {ok:true,duplicate:false,request:summary(row)};
  });}catch(_){return {ok:false,code:'UNKNOWN',persisted:null};}
 }
 return Object.freeze({handle});
}
module.exports={create};

return module.exports;})();
var V2StaffExport=(function(){var module={exports:{}};
"use strict";
// Offline administrator export only. No network, credentials, or source writes.
const journal=V2StaffJournal;
const layout={HEADERS:{"clock":["時間戳記","日期","時間","員工ID","姓名","類型","地點代碼","地點名稱","GPS","備註","來源"],"leaves":["申請單號","員工ID","姓名","假別","開始日期","結束日期","天數/時數","原因","狀態","申請時間","審核人","審核時間"],"missing":["申請單號","員工ID","姓名","日期","公司","班別","時間","原因","狀態","申請時間","審核人","審核時間","核定打卡時間"]},localTimestamp:function localTimestamp(utc){
 if(!/^\d{4}-\d{2}-\d{2}T/.test(String(utc))||!Number.isFinite(Date.parse(utc)))
  throw Error("TRUSTED_LEDGER_TIMESTAMP_REQUIRED");
 return new Date(Date.parse(utc)+8*3600000).toISOString().slice(0,19).replace("T"," ").replaceAll("-","/");
}};
const csv=function csv(table){
 return "\ufeff"+table.map(row=>row.map(value=>{
  let text=String(value??"");
  // Quoting alone does not stop Excel from evaluating employee-entered formulas.
  if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
 }).join(",")).join("\r\n")+"\r\n";
};
const STATUS={PENDING:'待審核',APPROVED:'核准',REJECTED:'駁回'};
function tables(snapshot,{employees,reviewers=[]}={}){
 if(!snapshot||!Array.isArray(snapshot.ledger)||JSON.stringify(snapshot.ledger[0])!==JSON.stringify(journal.HEADERS)||!Array.isArray(snapshot.normal)||!Array.isArray(employees))throw Error('EXPORT_INPUT_INVALID');
 const roster=new Map(),names=new Map();
 for(const e of employees){
  if(!e||!e.employeeId||!e.company||typeof e.name!=='string'||!e.name.trim()||roster.has(e.employeeId))throw Error('EXPORT_ROSTER_INVALID');
  roster.set(e.employeeId,e);names.set(e.employeeId,e.name);
 }
 for(const r of reviewers){if(!r||!r.reviewerId||!r.name||names.has(r.reviewerId)&&names.get(r.reviewerId)!==r.name)throw Error('EXPORT_REVIEWER_INVALID');names.set(r.reviewerId,r.name);}
 const state=journal.decode(snapshot.ledger.slice(1)),first=new Map(),last=new Map();
 for(const e of snapshot.ledger.slice(1)){if(!first.has(e[1]))first.set(e[1],e[5]);last.set(e[1],e[5]);}
 const result=Object.fromEntries(Object.entries(layout.HEADERS).map(([k,v])=>[k,[v.slice()]]));
 function employee(row){const e=roster.get(row.employeeId);if(!e||e.company!==row.company)throw Error('EXPORT_EMPLOYEE_COMPANY_MISMATCH');return e;}
 const used=new Set(),daily=new Set();
 for(const row of snapshot.normal){
  const e=employee(row),key=[row.employeeId,row.date,row.type].join('|');
  if(row.kind!=='CLOCK'||!(row.source==='GPS'||row.source==='LINE'&&row.legacy===true)||!['上班','下班'].includes(row.type)||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.time)||!row.requestId||used.has(row.requestId)||daily.has(key)||!(row.source==='LINE'&&row.legacy===true&&row.distanceMeters===null)&&(!Number.isFinite(row.distanceMeters)||row.distanceMeters<0))throw Error('EXPORT_NORMAL_INVALID');
  used.add(row.requestId);daily.add(key);
  result.clock.push([layout.localTimestamp(row.utcTime),row.date.replaceAll('-','/'),row.time,e.employeeId,e.name,row.type,row.siteCode||'',row.siteName||'','',row.distanceMeters===null?'':'距離：'+row.distanceMeters+'公尺',row.source]);
 }
 for(const row of state.latest.values()){
  const e=employee(row),body=row.body||{},status=STATUS[row.status];
  if(!status||!['LEAVE','MISSING'].includes(row.kind)||used.has(row.requestId))throw Error('EXPORT_REQUEST_INVALID');
  used.add(row.requestId);
  let reviewer='',reviewed='';
  if(row.status!=='PENDING'){reviewer=names.get(row.reviewedBy);if(!reviewer)throw Error('EXPORT_REVIEWER_UNMAPPED');reviewed=layout.localTimestamp(last.get(row.requestId));}
  const submitted=layout.localTimestamp(first.get(row.requestId));
  function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('EXPORT_DATE_INVALID');return s.replaceAll('-','/');}
  if(row.kind==='LEAVE'){
   let quantity;
   if(body.unit==='DAY'){
    if(body.settlement==='OFFLINE_HR'&&body.workingDays===null&&Number.isInteger(body.requestedCalendarDays)&&body.requestedCalendarDays>=1)quantity='全天';
    else{if(!Number.isInteger(body.workingDays)||body.workingDays<1)throw Error('EXPORT_WORKDAYS_UNVERIFIED');quantity=body.workingDays+'天';}
   }
   else if(body.unit==='HOURS'&&/^\d{2}:\d{2}$/.test(body.fromTime)&&/^\d{2}:\d{2}$/.test(body.toTime))quantity=body.fromTime+'-'+body.toTime;
   else throw Error('EXPORT_LEAVE_UNIT_INVALID');
   result.leaves.push([row.requestId,e.employeeId,e.name,body.leaveType,date(body.startDate),date(body.endDate),quantity,body.reason||'',status,submitted,reviewer,reviewed]);
  }else{
   if(!['上班','下班'].includes(body.type)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))throw Error('EXPORT_MISSING_INVALID');
   result.missing.push([row.requestId,e.employeeId,e.name,date(body.date),e.company,body.type,body.time,body.reason||'',status,submitted,reviewer,reviewed,row.status==='APPROVED'?date(body.date)+' '+body.time:'']);
  }
 }
 return {tables:result,normalCount:result.clock.length-1,leaveCount:result.leaves.length-1,missingCount:result.missing.length-1,excelProgramValidated:false};
}
module.exports={tables,csv};

return module.exports;})();
/** Separate staff release. Existing employee/site/approver workbook is read-only.
 * Writes stay OFF until private activation. No public setup or token functions.
 */
var STAFF_OPS_=['LEAVE_PREVIEW','LEAVE_REQUEST','LEAVE_STATUS','MY_LEAVES','MISSING_REQUEST','MISSING_STATUS','MY_MISSING','HR_PENDING','HR_STATUS','HR_REVIEW','GPS_CLOCK','GPS_STATUS','MY_CLOCKS'];
function staffSettings_(){
 var p=PropertiesService.getScriptProperties(),source=p.getProperty('STAFF_SOURCE_BOOK_ID'),target=p.getProperty('STAFF_DATA_BOOK_ID');
 if(!source||!target||source===target||p.getProperty('STAFF_CHANNEL_ID')!=='2009482137')throw Error('STAFF_CONFIG_INVALID');
 return {p:p,source:source,target:target,enabled:p.getProperty('STAFF_ENABLED')==='enabled',write:p.getProperty('STAFF_WRITE_ENABLED')==='enabled'};
}
function staffBook_(cfg){var b=SpreadsheetApp.openById(cfg.target);if(b.getName()!=='YC_ATTENDANCE_V2_STAFF_LIVE')throw Error('STAFF_DATA_BOOK_INVALID');return b;}
function staffSheet_(book,name,headers){var sh=book.getSheetByName(name);if(!sh||sh.getLastColumn()!==headers.length||JSON.stringify(sh.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error('STAFF_SCHEMA_INVALID');return sh;}
function staffTables_(cfg){
 var b=SpreadsheetApp.openById(cfg.source);if(b.getName()!=='LINE打卡系統')throw Error('STAFF_SOURCE_INVALID');
 var raw={};[['employees','員工資料'],['assignments','審核通知名單'],['sites','上班地點']].forEach(function(pair){raw[pair[0]]=staffSheet_(b,pair[1],V2StaffTables.HEADERS[pair[0]]).getDataRange().getValues();});
 var data=V2StaffTables.parse(raw);
 if(data.bindings.employees.some(function(e){return e.employeeId==='TEST001'||e.company==='TEST_CO';}))throw Error('STAFF_TEST_DATA_FORBIDDEN');
 return data;
}
function staffLock_(fn){var l=LockService.getScriptLock();if(!l.tryLock(15000))throw Error('STAFF_BUSY');try{return fn();}finally{l.releaseLock();}}
function staffCanWrite_(cfg){
 var p=PropertiesService.getScriptProperties(),start=Date.parse(p.getProperty('STAFF_START_UTC')||'');
 return cfg.enabled&&p.getProperty('STAFF_WRITE_ENABLED')==='enabled'&&Number.isFinite(start)&&Date.now()>=start&&p.getProperty('STAFF_LEGACY_CUTOVER_CONFIRMED')==='yes';
}
function staffCheckRow_(row,data){var e=data.bindings.employees.filter(function(x){return x.employeeId===row.employeeId;});if(e.length!==1||e[0].company!==row.company||row.employeeId==='TEST001'||!/^V2_[A-Za-z0-9_-]{8,76}$/.test(row.requestId||'')||/^V2_(OLD|LEGACY)_/.test(row.requestId))throw Error('STAFF_ROW_INVALID');}
function staffJournal_(cfg,book){
 var sh=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),locked=false;
 return V2StaffJournal.make({withExclusive:function(fn){return staffLock_(function(){locked=true;try{return fn();}finally{locked=false;}});},
 readRows:function(){var r=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];var d=staffTables_(cfg);V2StaffJournal.decode(r).latest.forEach(function(x){staffCheckRow_(x,d);});return r;},
 appendRow:function(r){if(!locked||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');var row=JSON.parse(r[3]);staffCheckRow_(row,staffTables_(cfg));if(r.length!==8||r[1]!==row.requestId||r.some(function(x){return String(x).length>30000;}))throw Error('STAFF_ROW_INVALID');sh.getRange(sh.getLastRow()+1,1,1,8).setValues([r]);SpreadsheetApp.flush();},utcNow:function(){return new Date().toISOString();}});
}
function staffNormal_(cfg,book){
 var sh=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 function read(){var d=staffTables_(cfg),fresh=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var x=JSON.parse(r[1]);staffCheckRow_(x,d);if(x.requestId!==r[0]||x.kind!=='CLOCK'||x.source!=='GPS')throw Error('STAFF_NORMAL_INVALID');return x;}):[];return fresh.concat(staffLegacyClocks_(cfg,d));}
 function run(write,fn){return staffLock_(function(){return fn({list:read,create:function(x){if(!write||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');staffCheckRow_(x,staffTables_(cfg));if(x.kind!=='CLOCK'||x.source!=='GPS'||read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_NORMAL_INVALID');sh.getRange(sh.getLastRow()+1,1,1,3).setValues([[x.requestId,JSON.stringify(x),new Date().toISOString()]]);SpreadsheetApp.flush();if(!read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_READBACK_UNKNOWN');}});});}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
function staffLegacyClocks_(cfg,data){
 var b=SpreadsheetApp.openById(cfg.source),month=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM'),tables=[];
 ['打卡紀錄','打卡紀錄_歷史'].forEach(function(name){var sh=b.getSheetByName(name);if(!sh){if(name==='打卡紀錄')throw Error('STAFF_LEGACY_CLOCK_MISSING');return;}
  var values=sh.getDataRange().getValues();values.slice(1).forEach(function(r){if(r[0] instanceof Date)r[0]=r[0].toISOString();if(r[1] instanceof Date)r[1]=Utilities.formatDate(r[1],'Asia/Taipei','yyyy-MM-dd');if(r[2] instanceof Date)r[2]=Utilities.formatDate(r[2],'Asia/Taipei','HH:mm:ss');});tables.push(values);});
 return V2StaffLegacyClocks.parse(tables,data.bindings.employees,month);
}
function staffLegacyApplications_(cfg){
 var source=SpreadsheetApp.openById(cfg.source),employees=staffTables_(cfg).bindings.employees,byId={};employees.forEach(function(e){byId[e.employeeId]=e;});var result=[];
 [['請假申請','LEAVE',['申請單號','員工ID','姓名','假別','開始日期','結束日期','天數/時數','原因','狀態','申請時間','審核人','審核時間']],['補打卡申請','MISSING',['申請單號','員工ID','姓名','日期','公司','班別','時間','原因','狀態','申請時間','審核人','審核時間','核定打卡時間']]].forEach(function(pair){
  var sh=staffSheet_(source,pair[0],pair[2]),values=sh.getDataRange().getValues();
  function date(v,optional){var s=v instanceof Date?Utilities.formatDate(v,'Asia/Taipei','yyyy-MM-dd'):String(v||'').trim(),m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:$|[ T])/);if(!m){if(optional)return '';throw Error('STAFF_LEGACY_DATE_INVALID');}var y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),d=new Date(Date.UTC(y,month-1,day));if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==month||d.getUTCDate()!==day){if(optional)return '';throw Error('STAFF_LEGACY_DATE_INVALID');}return m[1]+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  function time(v){var s=v instanceof Date?Utilities.formatDate(v,'Asia/Taipei','HH:mm'):String(v||'').trim(),m=s.match(/^([0-2]?\d):([0-5]\d)(?::[0-5]\d)?$/);if(!m||Number(m[1])>23)throw Error('STAFF_LEGACY_TIME_INVALID');return String(Number(m[1])).padStart(2,'0')+':'+m[2];}
  values.slice(1).forEach(function(r){var e=byId[String(r[1]||'')];if(!e)return;var originalStatus=String(r[8]||'').trim(),status={待審核:'PENDING',核准:'APPROVED',已核准:'APPROVED',審核通過:'APPROVED',駁回:'REJECTED',已駁回:'REJECTED'}[originalStatus]||'LEGACY_REVIEW_REQUIRED';
   var id='V2_OLD_'+e.employeeId+'_'+String(r[0]);if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))throw Error('STAFF_LEGACY_ID_INVALID');var body;
   if(pair[1]==='LEAVE'){var qty=String(r[6]||''),h=qty.match(/^([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/);body={startDate:date(r[4]),endDate:date(r[5]),leaveType:String(r[3]||''),unit:h?'HOURS':'LEGACY',fromTime:h?h[1]:'',toTime:h?h[2]:'',legacyUnitLabel:qty,reason:String(r[7]||'')};}
   else{if(!['上班','下班'].includes(String(r[5])))throw Error('STAFF_LEGACY_MISSING_TYPE');body={date:date(r[3]),type:String(r[5]),time:time(r[6]),reason:String(r[7]||'')};}
   result.push({requestId:id,kind:pair[1],employeeId:e.employeeId,company:e.company,body:body,status:status,legacyStatusLabel:originalStatus||'舊狀態待核對',submittedAt:date(r[9],true),reviewedAt:date(r[11],true),fingerprint:'LEGACY_READONLY:'+id});
  });
 });return result;
}
function staffWorkflowStore_(cfg,book,operation){
 var base=staffJournal_(cfg,book);if(['MY_LEAVES','MY_MISSING','LEAVE_STATUS','MISSING_STATUS'].indexOf(operation)<0)return base;
 return {transaction:base.transaction,read:function(fn){return base.read(function(tx){var old=staffLegacyApplications_(cfg);return fn({find:function(id){return tx.find(id)||old.filter(function(r){return r.requestId===id;})[0]||null;},list:function(){return tx.list().concat(old);}});});}};
}
function staffClaims_(token){
 var r=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{method:'post',contentType:'application/x-www-form-urlencoded',payload:{id_token:token,client_id:'2009482137'},muteHttpExceptions:true}),c;
 if(r.getResponseCode()!==200)throw Error('STAFF_AUTH');try{c=JSON.parse(r.getContentText());}catch(_){throw Error('STAFF_AUTH');}
 var now=Math.floor(Date.now()/1000);if(c.iss!=='https://access.line.me'||String(c.aud)!=='2009482137'||!/^U[0-9a-f]{32}$/i.test(c.sub||'')||!Number.isFinite(Number(c.exp))||Number(c.exp)<=now||!Number.isFinite(Number(c.iat))||Number(c.iat)>now+300)throw Error('STAFF_AUTH');return {source:'VERIFIED_LINE_ID_TOKEN',sub:c.sub};
}
function staffCalendar_(){return {validateLeave:function(body){
 // The user settles HR offline. Store requested dates, never invent paid/working days.
 var days=(Date.parse(body.endDate+'T00:00:00Z')-Date.parse(body.startDate+'T00:00:00Z'))/86400000+1;
 return Number.isInteger(days)&&days>=1&&days<=31?{ok:true,workingDays:null,requestedCalendarDays:days,settlement:'OFFLINE_HR'}:{ok:false,code:'LEAVE_DATES_INVALID'};
}};}
function staffProjectViews_(cfg,book){
 return staffLock_(function(){if(!staffCanWrite_(cfg))throw Error('STAFF_PROJECTION_DISABLED');var source=SpreadsheetApp.openById(cfg.source),data=staffTables_(cfg),roster=source.getSheetByName('員工資料').getDataRange().getValues().slice(1).filter(function(r){return String(r[0]||'').trim();}).map(function(r){return {employeeId:String(r[0]).trim(),company:String(r[4]).trim(),name:String(r[1]).trim()};});
  var j=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),n=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
  var snapshot={ledger:j.getDataRange().getValues(),normal:n.getLastRow()>1?n.getRange(2,1,n.getLastRow()-1,3).getValues().map(function(r){return JSON.parse(r[1]);}):[]};
  // These downloadable views cover NEW service records. Legacy stays read-only
  // in its original file and is queried by the employee bridge, never copied.
  var result=V2StaffExport.tables(snapshot,{employees:roster});
  [['clock','打卡紀錄'],['leaves','請假申請'],['missing','補打卡申請']].forEach(function(pair){var rows=result.tables[pair[0]],sh=book.getSheetByName(pair[1]);if(!sh)sh=book.insertSheet(pair[1]);if(sh.getLastRow()>rows.length)throw Error('STAFF_PROJECTION_SHRINK_REQUIRES_REVIEW');if(sh.getLastRow()&&JSON.stringify(sh.getRange(1,1,1,rows[0].length).getValues()[0])!==JSON.stringify(rows[0]))throw Error('STAFF_PROJECTION_SCHEMA_INVALID');sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);});SpreadsheetApp.flush();return {normal:result.normalCount,leaves:result.leaveCount,missing:result.missingCount};
 });
}
function staffRequest_(params){
 if(!params||Object.keys(params).some(function(k){return ['nonce','operation','payload','candidateRoute'].indexOf(k)<0;})||params.candidateRoute!=='staff-v1'||!/^[0-9a-f]{40}$/.test(params.nonce||'')||STAFF_OPS_.indexOf(params.operation)<0||typeof params.payload!=='string'||params.payload.length>12000)throw Error('STAFF_FORM');
 var x=JSON.parse(params.payload);if(!x||Object.keys(x).sort().join(',')!=='args,idToken'||typeof x.idToken!=='string'||x.idToken.length<30||x.idToken.length>8192||x.idToken.split('.').length!==3||!x.args||typeof x.args!=='object'||Array.isArray(x.args)||JSON.stringify(x.args).length>3500)throw Error('STAFF_FORM');return {op:params.operation,token:x.idToken,args:x.args};
}
function staffHandle_(params){
 var nonce=/^[0-9a-f]{40}$/.test(String(params&&params.nonce||''))?params.nonce:'';
 function fail(code,reason,persisted){return {bridge:'YC_V2_STAFF_V1',nonce:nonce,ok:false,code:code,reason:reason||'',persisted:persisted};}
 var req,cfg;try{cfg=staffSettings_();if(!cfg.enabled)return fail('DISABLED','',false);req=staffRequest_(params);}catch(_){return fail('REJECTED','CONFIG_OR_FORM',false);}
 var write=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(req.op)>=0;if(write&&!staffCanWrite_(cfg))return fail('DISABLED','',false);
 try{
  var book=staffBook_(cfg),flags={};STAFF_OPS_.forEach(function(op){flags[op]=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(op)<0||staffCanWrite_(cfg);});
  var result;
  if(['GPS_CLOCK','GPS_STATUS','MY_CLOCKS'].indexOf(req.op)>=0){var now=new Date();result=V2StaffClock.create({verifyLine:staffClaims_,loadTables:function(){return staffTables_(cfg);},normalStore:staffNormal_(cfg,book),flags:flags,clock:{now:function(){return {epochMs:now.getTime(),date:Utilities.formatDate(now,'Asia/Taipei','yyyy-MM-dd'),time:Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss'),utc:now.toISOString()};}}}).handle({operation:req.op,args:req.args,credential:req.token});}
  else result=V2StaffAccess.create({verifyLine:staffClaims_,loadBindings:function(){return staffTables_(cfg).bindings;},store:staffWorkflowStore_(cfg,book,req.op),calendar:staffCalendar_(),flags:flags,clock:{today:function(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');}}}).handle({operation:req.op,payload:req.args,credential:req.token});
  if(result&&result.ok){if(write){try{staffProjectViews_(cfg,book);result.exportProjection='CURRENT';}catch(_){result.exportProjection='PENDING';}if(req.op!=='GPS_CLOCK'){try{result.notification=staffNotify_(cfg,book,req.args.requestId).status;}catch(_){result.notification='PENDING';}}}return {bridge:'YC_V2_STAFF_V1',nonce:nonce,ok:true,result:result};}
  if(result&&result.code==='UNKNOWN')return fail('UNKNOWN','',null);
  return fail(result&&['AUTH_REQUIRED','HR_ONLY'].indexOf(result.code)>=0?'AUTH':'REJECTED',result&&result.code||'',false);
 }catch(_){return fail('UNKNOWN','',null);}
}
function doPost(e){var reply=staffHandle_(e&&e.parameter||{}),js=JSON.stringify(reply).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+js+',"https://line-punch.github.io");</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}
function doGet(){return ContentService.createTextOutput('YC/YT員工系統｜三功能服務；請從 LINE 員工入口使用。');}

/** Event-scoped production notifications. No timer and no blind retry. */
function staffNotifyPlan_(cfg,book,id){
 if(!/^V2_[A-Za-z0-9_-]{8,76}$/.test(id||''))throw Error('STAFF_ORIGINAL_INVALID');
 var data=staffTables_(cfg),policy=V2StaffAccess.compile(data.bindings),sh=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),state=V2StaffJournal.decode(sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[]),row=state.latest.get(id);
 if(!row)throw Error('STAFF_ORIGINAL_NOT_FOUND');var rec=policy.notificationRecipients(row),base=String(cfg.p.getProperty('STAFF_LIFF_URL')||'');
 if(!/^https:\/\/liff\.line\.me\/2009482137-[A-Za-z0-9]+$/.test(base))throw Error('STAFF_REVIEW_LINK_INVALID');
 var entries=[],title=row.kind==='LEAVE'?'請假申請':'補打卡申請',body=row.body;
 var empSheet=SpreadsheetApp.openById(cfg.source).getSheetByName('員工資料'),names=empSheet.getDataRange().getValues().slice(1),person=names.filter(function(r){return String(r[0])===row.employeeId;});if(person.length!==1)throw Error('STAFF_NAME_MAPPING_INVALID');
 var detail=row.kind==='LEAVE'?body.startDate+'～'+body.endDate+' '+body.leaveType+' '+(body.unit==='DAY'?'全天':body.fromTime+'～'+body.toTime):body.date+' '+body.type+' '+body.time;
 var text=title+'\n員工：'+String(person[0][1])+'\n'+detail+'\n原單：'+id;
 state.events.filter(function(e){return e.requestId===id&&(e.type==='REVIEWED'||row.status==='PENDING');}).forEach(function(event){
  function add(role,to,message){if(!/^U[0-9a-f]{32}$/i.test(to||''))throw Error('STAFF_RECIPIENT_INVALID');entries.push({deliveryKey:event.eventKey+':'+role+':'+to,to:to,role:role,message:message});}
  if(event.type==='REVIEWED'){if(event.status!==row.status)throw Error('STAFF_STATE_INVALID');add('EMPLOYEE_RESULT',rec.employee,{type:'text',text:text+'\n結果：'+(row.status==='APPROVED'?'核准':'駁回')});}
  else{
   rec.noticeSubs.forEach(function(sub){add('MANAGER_NOTICE',sub,{type:'text',text:text});});
   function action(label,d){return {type:'button',style:d==='APPROVE'?'primary':'secondary',action:{type:'uri',label:label,uri:base+'?qaReviewId='+encodeURIComponent(id)+'&qaDecision='+d}};}
   add('REVIEWER_CARD',rec.reviewer,{type:'flex',altText:title,contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:text,wrap:true}]},footer:{type:'box',layout:'horizontal',contents:[action('核准','APPROVE'),action('駁回','REJECT')]}}});
  }
 });return entries;
}
function staffNotify_(cfg,book,id){
 var p=cfg.p;if(!staffCanWrite_(cfg)||p.getProperty('STAFF_NOTIFY_ENABLED')!=='enabled')return {status:'DISABLED'};
 var sheet=staffSheet_(book,'V2_通知流水',['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']);
 function load(key){var result=null,rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];rows.forEach(function(r){if(r[0]!==key)return;var v=JSON.parse(r[1]);if(v.deliveryKey!==r[0]||result&&(result.body!==v.body||result.retryKey!==v.retryKey))throw Error('STAFF_NOTIFY_CONFLICT');result=v;});return result;}
 function save(v){if(!staffCanWrite_(cfg)||p.getProperty('STAFF_NOTIFY_ENABLED')!=='enabled')throw Error('STAFF_NOTIFY_DISABLED');sheet.getRange(sheet.getLastRow()+1,1,1,3).setValues([[v.deliveryKey,JSON.stringify(v),new Date().toISOString()]]);SpreadsheetApp.flush();}
 var plan=staffNotifyPlan_(cfg,book,id),status='ACCEPTED';
 for(var i=0;i<plan.length;i++){
  var entry=plan[i];var r=staffLock_(function(){
   var fresh=staffNotifyPlan_(cfg,book,id).filter(function(e){return e.deliveryKey===entry.deliveryKey;});if(fresh.length!==1||JSON.stringify(fresh[0])!==JSON.stringify(entry))throw Error('STAFF_NOTIFY_STALE');
   var body=JSON.stringify({to:entry.to,messages:[entry.message]}),old=load(entry.deliveryKey);
   if(old){if(old.body!==body||old.to!==entry.to||old.role!==entry.role)throw Error('STAFF_NOTIFY_CONFLICT');return old.state==='ACCEPTED'?'ACCEPTED':old.state==='REJECTED'?'REJECTED':'UNKNOWN';}
   var token=p.getProperty('STAFF_BOT_TOKEN'),expected=p.getProperty('STAFF_BOT_BASIC_ID');if(!token||expected!=='@090opuod')throw Error('STAFF_BOT_UNCONFIGURED');
   var row={deliveryKey:entry.deliveryKey,to:entry.to,role:entry.role,body:body,retryKey:Utilities.getUuid(),state:'SENDING',firstAttemptUTC:new Date().toISOString()};save(row);if(JSON.stringify(load(entry.deliveryKey))!==JSON.stringify(row))throw Error('STAFF_NOTIFY_PERSISTENCE_UNKNOWN');
   try{
    var info=UrlFetchApp.fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});if(info.getResponseCode()!==200||JSON.parse(info.getContentText()).basicId!==expected)throw Error('STAFF_BOT_IDENTITY');
    var response=UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':row.retryKey},payload:body,muteHttpExceptions:true});
    var code=response.getResponseCode(),headers=response.getAllHeaders(),normalized={};Object.keys(headers).forEach(function(k){normalized[k.toLowerCase()]=String(headers[k]);});
    row.state=code>=200&&code<300||code===409&&normalized['x-line-accepted-request-id']?'ACCEPTED':code>=400&&code<500&&code!==409?'REJECTED':'UNKNOWN';row.httpStatus=code;row.lineRequestId=normalized['x-line-accepted-request-id']||normalized['x-line-request-id']||'';
   }catch(_){row.state='UNKNOWN';}
   save(row);return row.state;
  });if(r!=='ACCEPTED'){status=r;break;}
 }return {status:status};
}

