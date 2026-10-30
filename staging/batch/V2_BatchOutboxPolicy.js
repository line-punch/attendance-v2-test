"use strict";
/**
 * V2 offline notification outbox POLICY – not a LINE sender or GAS trigger.
 *
 * Delivery is not exactly-once over a network. When the provider result is
 * unknown, hold the event for reconciliation instead of blindly sending again.
 * Any future persistent worker must acquire a lock before applying transitions.
 *
 * Never include tokens, LINE IDs, phone numbers, leave reasons or addresses
 * in diagnostic output. The durable store will have to resolve recipient from
 * a trusted server-side manager / employee binding.
 */
(function(root){
 const MAX_ATTEMPTS=5,LEASE_MS=120000;
 const TYPES=["LEAVE_SUBMITTED","MISSING_SUBMITTED","REVIEWED"];
 const statuses=["PENDING","CLAIMED","UNCERTAIN","SENT","DEAD"];
 const fail=code=>({ok:false,code});
 const date=x=>{const v=Date.parse(x);return Number.isFinite(v)?v:null};
 function idempotencyKey(e){
  if(!e||!TYPES.includes(e.type)||typeof e.requestId!=="string"||
     !/^[A-Za-z0-9_-]{12,80}$/.test(e.requestId))return null;
  if(e.type==="REVIEWED"&&!["APPROVED","REJECTED"].includes(e.status))return null;
  return e.type+"|"+e.requestId+"|"+(e.type==="REVIEWED"?e.status:"PENDING");
 }
 function make(entry,nowISO){
  const now=date(nowISO),key=idempotencyKey(entry);
  if(now===null||!key)return fail("EVENT_INVALID");
  return {ok:true,event:{
    eventKey:key,type:entry.type,requestId:entry.requestId,
    reviewStatus:entry.type==="REVIEWED"?entry.status:null,
    state:"PENDING",attempts:0,dueAt:new Date(now).toISOString(),
    leaseUntil:null,deliveryReference:null
  }};
 }
 function claim(event,nowISO){
  const now=date(nowISO);
  if(!event||!statuses.includes(event.state)||now===null)return fail("INVALID_EVENT");
  if(event.state==="SENT"||event.state==="DEAD"||event.state==="UNCERTAIN")
    return fail("NOT_RETRYABLE");
  if(event.attempts>=MAX_ATTEMPTS)return fail("ATTEMPT_LIMIT");
  if(event.state==="PENDING"&&now<date(event.dueAt))return fail("NOT_DUE");
  if(event.state==="CLAIMED"&&now<date(event.leaseUntil))return fail("LEASE_ACTIVE");
  if(!idempotencyKey(event)||event.eventKey!==idempotencyKey(event))
    return fail("IDEMPOTENCY_KEY_MISMATCH");
  return {ok:true,event:{...event,state:"CLAIMED",attempts:event.attempts+1,
    leaseUntil:new Date(now+LEASE_MS).toISOString()}};
 }
 function complete(event,nowISO,outcome){
  const now=date(nowISO);
  if(!event||event.state!=="CLAIMED"||now===null)return fail("NOT_CLAIMED");
  if(outcome==="SENT")return {ok:true,event:{
    ...event,state:"SENT",leaseUntil:null,
    deliveredAt:new Date(now).toISOString()}};
  if(outcome==="UNKNOWN")return {ok:true,event:{
    ...event,state:"UNCERTAIN",leaseUntil:null,
    note:"需核對原事件，不可直接重送"}};
  if(outcome!=="CONFIRMED_FAILURE")return fail("RESULT_INVALID");
  if(event.attempts>=MAX_ATTEMPTS)
   return {ok:true,event:{...event,state:"DEAD",leaseUntil:null}};
  const retry=Math.min(3600000,30000*Math.pow(2,event.attempts-1));
  return {ok:true,event:{...event,state:"PENDING",leaseUntil:null,
    dueAt:new Date(now+retry).toISOString()}};
 }
 function reconcile(event,confirmedSent){
  if(!event||event.state!=="UNCERTAIN")return fail("NO_UNKNOWN_RESULT");
  if(confirmedSent===true)return {ok:true,event:{
    ...event,state:"SENT",note:"reconciled",leaseUntil:null}};
  if(confirmedSent===false)return {ok:true,event:{
    ...event,state:"PENDING",note:"verified_not_sent",leaseUntil:null}};
  return fail("RECONCILIATION_REQUIRED");
 }
 const api=Object.freeze({idempotencyKey,make,claim,complete,reconcile,MAX_ATTEMPTS});
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.V2BatchOutboxPolicy=api;
})(typeof window!=="undefined"?window:this);
