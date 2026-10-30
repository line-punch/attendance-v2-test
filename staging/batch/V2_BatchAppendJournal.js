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
 *   withExclusive(async ()=>...)
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
 const find=async id=>deep(state.latest.get(id)||null);
 return Object.freeze({
  find,list:async()=>Array.from(state.latest.values()).map(deep),
  create:readonly?async()=>{throw ERROR("READ_ONLY");}:async row=>{
   ensureRow(row);
   if(state.latest.has(row.requestId))throw ERROR("DUPLICATE_REQUEST");
   changes.push({kind:"CREATE",row:deep(row)});
  },
  replace:readonly?async()=>{throw ERROR("READ_ONLY");}:async row=>{
   ensureRow(row);
   if(!state.latest.has(row.requestId))throw ERROR("UNKNOWN_REQUEST");
   changes.push({kind:"REPLACE",row:deep(row)});
  },
  outbox:readonly?async()=>{throw ERROR("READ_ONLY");}:async event=>{
   if(!event||typeof event!=="object")throw ERROR("OUTBOX_REQUIRED");
   events.push(deep(event));
  }
 });
}
function make(io){
 if(!io||typeof io.withExclusive!=="function"||
    typeof io.readRows!=="function"||typeof io.appendRow!=="function"||
    typeof io.utcNow!=="function")throw ERROR("IO_ADAPTER_MISSING");
 async function read(fn){
  if(typeof fn!=="function")throw ERROR("BAD_CALLBACK");
  // Read consistent snapshot under same exclusive lock, fail-closed.
  return io.withExclusive(async()=>{
   const state=decode(await io.readRows());
   return fn(safeReader(state,true,[],[]));
  });
 }
 async function transaction(fn){
  if(typeof fn!=="function")throw ERROR("BAD_CALLBACK");
  return io.withExclusive(async()=>{
   const state=decode(await io.readRows());
   const changes=[],pendingEvents=[];
   const result=await fn(safeReader(state,false,changes,pendingEvents));
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
    await io.appendRow(data);
   }catch(_){
    throw ERROR("WRITE_OUTCOME_UNKNOWN");
   }
   try{
    const actual=decode(await io.readRows());
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
