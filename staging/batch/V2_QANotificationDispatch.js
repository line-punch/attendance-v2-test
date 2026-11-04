"use strict";
// Runtime-neutral, synchronous QA sender. Real IO/transport must be supplied by server.
(function(root){
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUB=/^U[0-9a-f]{32}$/i;
function create({io,transport,clock,uuid,settings}={}){
 function send(entry){
  if(!settings||settings.enabled!==true)return {status:"DISABLED",attempted:false};
  if(settings.scope!=="TEST001/TEST_CO"||!Array.isArray(settings.allowedTestRecipients)||
     !entry||!SUB.test(entry.to)||!settings.allowedTestRecipients.includes(entry.to)||
     !/^QA_[A-Za-z0-9_-]+__V[1-9][0-9]*:(MANAGER_NOTICE|REVIEWER_CARD|EMPLOYEE_RESULT):U[0-9a-f]{32}$/i.test(entry.deliveryKey||"")||
     !entry.deliveryKey.endsWith(":"+entry.role+":"+entry.to))throw Error("QA_DELIVERY_SCOPE_INVALID");
  if(!entry.message||!["text","flex"].includes(entry.message.type))throw Error("QA_MESSAGE_INVALID");
  if(!io||!transport||typeof io.withExclusive!=="function"||typeof io.load!=="function"||
     typeof io.save!=="function"||typeof transport.push!=="function"||typeof clock!=="function"||typeof uuid!=="function")
   throw Error("QA_DELIVERY_ADAPTERS_MISSING");
  // Only isolated LIFF review links may be transmitted, never QA postbacks to the formal webhook.
  const messageText=JSON.stringify(entry.message);
  if(entry.role==="REVIEWER_CARD"&&(!messageText.includes("https://liff.line.me/2012136707-CgGNZAuq?")||
     /"type"\s*:\s*"postback"/.test(messageText)))throw Error("QA_REVIEW_LINK_REQUIRED");
  const body=JSON.stringify({to:entry.to,messages:[entry.message]});
  return io.withExclusive(function(){
   const old=io.load(entry.deliveryKey);
   if(old){
    if(old.body!==body||old.to!==entry.to||old.role!==entry.role||!UUID.test(old.retryKey||""))
     throw Error("QA_DELIVERY_ORIGINAL_CONFLICT");
    if(old.state==="ACCEPTED")return {status:"ACCEPTED",attempted:false,duplicate:true,requestId:old.requestId||""};
    // A durable SENDING row also covers a process crash / lost update.
    // No timer, automatic retry or replacement retry key is allowed here.
    return {status:old.state==="REJECTED"?"REJECTED":"UNKNOWN",attempted:false,needsOriginalCheck:true};
   }
   const retryKey=uuid(),now=clock();
   if(!UUID.test(retryKey)||!Number.isFinite(Date.parse(now)))throw Error("QA_DELIVERY_KEY_INVALID");
   const row={deliveryKey:entry.deliveryKey,to:entry.to,role:entry.role,body,retryKey,state:"SENDING",firstAttemptUTC:now};
   // Confirm persistence before any outbound call. Failure leaves sending disabled for this attempt.
   io.save(row);
   const persisted=io.load(entry.deliveryKey);
   if(JSON.stringify(persisted)!==JSON.stringify(row))throw Error("QA_DELIVERY_PERSISTENCE_UNCONFIRMED");
   let response;
   try{response=transport.push(body,{"X-Line-Retry-Key":retryKey});}
   catch(_){
    io.save({...row,state:"UNKNOWN"});
    return {status:"UNKNOWN",attempted:true,needsOriginalCheck:true};
   }
   const code=Number(response&&response.status);
   const headers=Object.fromEntries(Object.entries(response&&response.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
   let state="UNKNOWN",requestId="";
   if(code>=200&&code<300){state="ACCEPTED";requestId=headers["x-line-request-id"]||"";}
   else if(code===409&&headers["x-line-accepted-request-id"]){state="ACCEPTED";requestId=headers["x-line-accepted-request-id"];}
   else if(code>=400&&code<500&&code!==409)state="REJECTED";
   // Accepted by LINE does not establish employee receipt or reading.
   io.save({...row,state,httpStatus:Number.isFinite(code)?code:null,requestId});
   return {status:state,attempted:true,requestId,delivered:false,needsOriginalCheck:state==="UNKNOWN"};
  });
 }
 return {send};
}
const api={create};if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2QANotificationDispatch=api;
})(typeof window!=="undefined"?window:this);

