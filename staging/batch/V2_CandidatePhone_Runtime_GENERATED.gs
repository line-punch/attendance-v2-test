/** GENERATED CANDIDATE READONLY PHONE RUNTIME. Verified QA LINE only; all phone writes disabled. */
var V2ProductionCore=(function(){var module={exports:{}};
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
  status:row.status,employeeId:row.employeeId,submittedAt:row.submittedAt||"",
  ...(row.kind==="LEAVE"?{
    leaveType:row.body.leaveType,startDate:row.body.startDate,
    endDate:row.body.endDate,unit:row.body.unit,
    fromTime:row.body.fromTime||"",toTime:row.body.toTime||""
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
var V2ProductionJournal=(function(){var module={exports:{}};
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
var V2ProductionAccess=(function(){var module={exports:{}};
"use strict";
// Candidate only: no endpoint, real accounts, credentials, network or deployment.
// loadBindings and verifyLine must be trusted server adapters, never client fields.
const core=V2ProductionCore;
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
var V2ProductionTables=(function(){var module={exports:{}};
"use strict";
// Pure table adapter. No Sheets calls; only arrays supplied by a trusted server.
const access=V2ProductionAccess;
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
var V2ProductionClock=(function(){var module={exports:{}};
"use strict";
// Candidate normal-clock service. No public route, GPS hardware or real storage.
const tables=V2ProductionTables,access=V2ProductionAccess;
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
   if(rows.some(r=>r.kind!=='CLOCK'||r.source!=='GPS'||!TYPES.includes(r.type)))throw Error('NORMAL_LEDGER_INVALID');
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

/** Read-only candidate phone port. All functions private to server bridge.
 * No public admin functions, writes, notifications or triggers.
 */
function v2CandidatePhoneBook_(){
 var p=PropertiesService.getScriptProperties(),id=p.getProperty('V2_MULTIUSER_QA_BOOK_ID');
 if(!id||id===p.getProperty('V2_BATCH_QA_BOOK_ID')||id===p.getProperty('V2_BATCH_QA_SOURCE_BOOK_ID'))throw Error('CANDIDATE_SCOPE_INVALID');
 var book=SpreadsheetApp.openById(id);if(book.getName()!=='YC_ATTENDANCE_V2_MULTIUSER_QA_ONLY')throw Error('CANDIDATE_SCOPE_INVALID');return book;
}
function v2CandidatePhoneSheet_(book,name,headers){
 var sheet=book.getSheetByName(name);if(!sheet||sheet.getLastColumn()!==headers.length||JSON.stringify(sheet.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error('CANDIDATE_SCHEMA_INVALID');return sheet;
}
function v2CandidatePhoneLock_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('CANDIDATE_BUSY');try{return fn();}finally{lock.releaseLock();}}
function v2CandidatePhoneData_(config,book){
 config=v2BatchQASettings_(); // Re-read private role settings for each snapshot.
 var raw={};[['employees','員工資料'],['sites','上班地點_候選文字'],['assignments','審核通知名單']].forEach(function(pair){raw[pair[0]]=v2CandidatePhoneSheet_(book,pair[1],V2ProductionTables.HEADERS[pair[0]]).getDataRange().getValues();});
 if(raw.employees.length!==2||raw.employees[1][0]!=='TEST001'||raw.employees[1][4]!=='TEST_CO'||raw.sites.length!==2||raw.assignments.length!==2||raw.assignments[1][0]!=='TEST001')throw Error('CANDIDATE_SCOPE_INVALID');
 var source=SpreadsheetApp.openById(config.sourceId);
 if(source.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY')throw Error('CANDIDATE_SOURCE_INVALID');
 var staff=source.getSheetByName('員工資料');if(!staff||staff.getLastRow()!==2)throw Error('CANDIDATE_ROSTER_INVALID');
 var employee=staff.getRange(2,1,1,8).getValues()[0];
 if(employee[0]!=='TEST001'||employee[4]!=='TEST_CO'||employee[6]!=='在職'||employee[7]!=='TESTSITE'||!/^U[0-9a-f]{32}$/i.test(String(employee[3]||''))||!config.owner||config.owner===employee[3])throw Error('CANDIDATE_ROSTER_INVALID');
 // Bind actual verified QA accounts in memory. Do not rewrite synthetic rows
 // with private LINE subs, and do not accept identity fields from the phone.
 raw.employees[1]=raw.employees[1].slice();raw.employees[1][3]=String(employee[3]);
 raw.assignments[1]=raw.assignments[1].slice();raw.assignments[1][2]=config.owner;raw.assignments[1][3]='';raw.assignments[1][4]=config.owner;
 return V2ProductionTables.parse(raw,{externalReviewers:[{reviewerId:'QA_HR_TEST',lineSub:config.owner,active:true}]});
}
function v2CandidatePhoneJournal_(book){
 var sh=v2CandidatePhoneSheet_(book,'候選交易流水',V2ProductionJournal.HEADERS);
 return V2ProductionJournal.make({withExclusive:v2CandidatePhoneLock_,
  readRows:function(){var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];V2ProductionJournal.decode(rows).latest.forEach(function(row){if(row.employeeId!=='TEST001'||row.company!=='TEST_CO')throw Error('CANDIDATE_SCOPE_INVALID');});return rows;},
  appendRow:function(){throw Error('CANDIDATE_READONLY');},utcNow:function(){return new Date().toISOString();}});
}
function v2CandidatePhoneNormal_(book){
 var sh=v2CandidatePhoneSheet_(book,'候選正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 return {read:function(fn){return v2CandidatePhoneLock_(function(){return fn({list:function(){return sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var row=JSON.parse(r[1]);if(row.requestId!==r[0]||row.employeeId!=='TEST001'||row.company!=='TEST_CO'||row.kind!=='CLOCK'||row.source!=='GPS')throw Error('CANDIDATE_SCOPE_INVALID');return row;}):[];}});});},transaction:function(){throw Error('CANDIDATE_READONLY');}};
}
function v2CandidatePhoneHandle_(params){
 var nonce=String(params&&params.nonce||''),bridge='YC_V2_BATCH_QA_V1';
 function fail(code,reason,persisted){return {bridge:bridge,nonce:/^[0-9a-f]{40}$/.test(nonce)?nonce:'',ok:false,code:code,reason:reason||'',persisted:persisted};}
 try{
  var p=PropertiesService.getScriptProperties();if(p.getProperty('V2_CANDIDATE_PHONE_ENABLED')!=='enabled')return fail('DISABLED','',false);
  if(!params||params.candidateRoute!=='v1'||Object.keys(params).some(function(k){return ['nonce','operation','payload','candidateRoute'].indexOf(k)<0;}))return fail('REJECTED','',false);
  var request=v2BatchQAParse_({nonce:params.nonce,operation:params.operation,payload:params.payload});
  if(['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(request.operation)>=0)return fail('DISABLED','',false);
  var config=v2BatchQASettings_(),book=v2CandidatePhoneBook_();
  function verify(token){
   var sub=v2BatchQALineClaims_(token),data=v2CandidatePhoneData_(config,book);
   if(sub===data.bindings.employees[0].lineSub||data.bindings.reviewers.some(function(r){return r.active&&r.lineSub===sub;}))return {source:'VERIFIED_LINE_ID_TOKEN',sub:sub};
   throw Error('CANDIDATE_AUTH_REQUIRED');
  }
  var flags={};V2_BATCH_QA_OPS_.forEach(function(op){flags[op]=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(op)<0;});
  var now=new Date(),result;
  if(['GPS_STATUS','MY_CLOCKS'].indexOf(request.operation)>=0){
   result=V2ProductionClock.create({verifyLine:verify,loadTables:function(){return v2CandidatePhoneData_(config,book);},normalStore:v2CandidatePhoneNormal_(book),
    clock:{now:function(){return {epochMs:now.getTime(),date:Utilities.formatDate(now,'Asia/Taipei','yyyy-MM-dd'),time:Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss'),utc:now.toISOString()};}},flags:flags}).handle({operation:request.operation,args:request.args,credential:request.token});
  }else{
   result=V2ProductionAccess.create({verifyLine:verify,loadBindings:function(){return v2CandidatePhoneData_(config,book).bindings;},store:v2CandidatePhoneJournal_(book),calendar:v2BatchCalendarQA_(),
    clock:{today:function(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');}},flags:flags}).handle({operation:request.operation,payload:request.args,credential:request.token});
  }
  if(result&&result.ok===true)return {bridge:bridge,nonce:nonce,ok:true,result:result};
  return fail(result&&['AUTH_REQUIRED','HR_ONLY'].indexOf(result.code)>=0?'AUTH':'REJECTED',result&&['NOT_FOUND','REQUEST_ID_CONFLICT'].indexOf(result.code)>=0?result.code:'',false);
 }catch(_){return fail('UNKNOWN','',null);}
}

