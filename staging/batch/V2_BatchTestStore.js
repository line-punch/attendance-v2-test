"use strict";
/**
 * TEST001-only in-memory transaction adapter for staged V2 WorkflowCore.
 * Not a production persistence layer. No network, Sheets, disk or LINE.
 *
 * Each transaction gets an isolated snapshot; commit only after all writes
 * and outbox records succeed. Async calls are serialized to test duplicate
 * requests and compare-and-swap review races. Failed transactions roll back.
 *
 * A real GAS adapter will need LockService + durable sheet write/outbox and
 * explicit partial-write recovery checks; do NOT equate this to real atomic
 * Google Sheets transactions.
 */
(function(root){
const clone=x=>JSON.parse(JSON.stringify(x));
function create(){
 let state={requests:[],outbox:[],version:0};
 let tail=Promise.resolve();
 function snapshot(){return clone(state);}
 function enforceRow(row){
  if(!row||typeof row!=="object"||!row.requestId||
     !["LEAVE","MISSING"].includes(row.kind)||!row.employeeId)
   throw Error("INVALID_TEST_ROW");
 }
 function makeTx(working,readonly){
  const failWrite=()=>{throw Error("READ_ONLY_TX")};
  return Object.freeze({
   find:async id=>clone(working.requests.find(x=>x.requestId===id)||null),
   list:async()=>clone(working.requests),
   create:readonly?failWrite:async row=>{
    enforceRow(row);
    if(working.requests.some(x=>x.requestId===row.requestId))
     throw Error("DUPLICATE_REQUEST");
    working.requests.push(clone(row));
   },
   replace:readonly?failWrite:async row=>{
    enforceRow(row);
    const pos=working.requests.findIndex(x=>x.requestId===row.requestId);
    if(pos<0)throw Error("REQUEST_MISSING");
    if(working.requests[pos].employeeId!==row.employeeId||
       working.requests[pos].kind!==row.kind)
     throw Error("IMMUTABLE_REQUEST_SCOPE");
    working.requests[pos]=clone(row);
   },
   outbox:readonly?failWrite:async event=>{
    if(!event||!["LEAVE_SUBMITTED","MISSING_SUBMITTED","REVIEWED"].includes(event.type)||
       typeof event.requestId!=="string"||!event.requestId)
     throw Error("UNRECOGNIZED_TEST_NOTIFICATION");
    working.outbox.push(clone({...event,delivery:"PENDING"}));
   }
  });
 }
 async function transaction(fn){
  if(typeof fn!=="function")throw Error("BAD_TRANSACTION_CALLBACK");
  const execute=async()=>{
   const working=snapshot();
   const answer=await fn(makeTx(working,false));
   working.version+=1;
   state=working;return answer;
  };
  const pending=tail.then(execute,execute);
  tail=pending.then(()=>undefined,()=>undefined);
  return pending;
 }
 async function read(fn){
  if(typeof fn!=="function")throw Error("BAD_READ_CALLBACK");
  await tail;
  return fn(makeTx(snapshot(),true));
 }
 return Object.freeze({transaction,read,testSnapshot:snapshot});
}
const api=Object.freeze({create});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchTestStore=api;
})(typeof window!=="undefined"?window:this);
