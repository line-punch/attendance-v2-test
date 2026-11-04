"use strict";
// Staged local bridge; deliberately has no delivery API and is NOT deployed.
const journal=require('./V2_BatchAppendJournal.js');
const normal=require('./V2_OperationalExport.js');
const notification=require('./V2_QANotificationPlan.js');
function preview(snapshot,config){
 normal.tables(snapshot); // validates full downloaded scope/schema and journal chain
 const state=journal.decode(snapshot.ledger.slice(1)),plans=[],skipped=[];
 for(const event of state.events){
  const row=state.latest.get(event.requestId);
  // A reviewed request must never produce a new stale approval card.
  if(event.type!=="REVIEWED"&&row.status!=="PENDING"){
   skipped.push({eventKey:event.eventKey,reason:"ALREADY_REVIEWED"});continue;
  }
  plans.push(notification.plan(event,row,config));
 }
 return {delivery:"NOT_SENT",plans,skipped};
}
async function review({snapshot,config,data,principal,credential,service}){
 normal.tables(snapshot);
 const state=journal.decode(snapshot.ledger.slice(1));
 // Do not use an unverified callback to retrieve arbitrary data or grant a role.
 const match=typeof data==="string"&&data.match(/(?:^|&)requestId=([^&]+)(?:&|$)/);
 let id;try{id=match&&decodeURIComponent(match[1]);}catch(_){throw Error("QA_CALLBACK_INVALID");}
 const row=state.latest.get(id);if(!row)throw Error("QA_ORIGINAL_NOT_FOUND");
 const command=notification.reviewCommand(data,row,principal,config);
 if(!service||typeof service.handle!=="function")throw Error("QA_VERIFIED_SERVICE_REQUIRED");
 // Existing Core independently verifies the actual credential and HR role,
 // then reads the current original under its transaction. Snapshot is not authority.
 // No injected role, company, reviewer or preselected status enters the payload.
 return service.handle({operation:command.operation,payload:command.args,credential});
}
module.exports={preview,review};

