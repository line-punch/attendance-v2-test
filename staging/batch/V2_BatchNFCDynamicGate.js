"use strict";
/**
 * TEST001 NFC 424 DNA dynamic-SUN policy / NOT DEPLOYED.
 *
 * No cryptographic keys, AES implementation, trusted tag IDs or real NFC
 * access are embedded here. A separate *server-side* verifier must validate
 * the NXP SDM/SUN cryptogram with per-tag keys and return a trusted attestation.
 * An ordinary URL containing client-supplied uid/counter/cmac/verified flags
 * NEVER counts as authentication. Copied unused signed URL can still be
 * relayed; SUN alone does not prove the phone is physically at the workplace.
 *
 * The atomic commit adapter MUST check counter monotonicity + request-id
 * idempotency and append the real punch within a single durable lock; this
 * contract alone is not proof of a safe deployed system.
 */
(function(root){
 const fail=code=>({ok:false,code});
 const REQ=/^[A-Za-z0-9_-]{12,80}$/;
 const CTR_MAX=0xffffff;
 function create({enabled=false,verifyIdentity,verifySun,commitOnce}={}){
  if(typeof verifyIdentity!=="function"||typeof verifySun!=="function"||
     typeof commitOnce!=="function")throw Error("SERVER_ADAPTERS_REQUIRED");
  async function handle({idToken,payload}={}){
   if(enabled!==true)return fail("NFC_DISABLED");
   if(!payload||typeof payload!=="object"||Array.isArray(payload)||
      Object.keys(payload).some(k=>!["requestId","type","sunUrl"].includes(k)))
    return fail("NFC_REQUEST_INVALID");
   if(!REQ.test(String(payload.requestId||""))||
      !["上班","下班"].includes(payload.type)||
      typeof payload.sunUrl!=="string"||payload.sunUrl.length>2048||
      !/^https:\/\//.test(payload.sunUrl))
    return fail("NFC_REQUEST_INVALID");
   let employee,attestation;
   try{employee=await verifyIdentity(idToken)}
   catch(_){return fail("AUTH_REQUIRED")}
   if(!employee||employee.source!=="VERIFIED_SERVER_BINDING"||
      employee.active!==true||
      !/^[A-Za-z0-9_-]{2,40}$/.test(String(employee.employeeId||""))||
      !/^[A-Za-z0-9_-]{2,40}$/.test(String(employee.company||""))||
      !Array.isArray(employee.allowedSites))
    return fail("AUTH_REQUIRED");
   try{attestation=await verifySun(payload.sunUrl)}
   catch(_){return fail("TAG_VERIFICATION_FAILED")}
   // Attestation MUST originate from a trusted verifier, never from URL.
   if(!attestation||attestation.source!=="SERVER_AES_SDM_VERIFIER"||
      attestation.cryptogramValid!==true||
      !/^[A-Za-z0-9_-]{4,80}$/.test(String(attestation.tagKey||""))||
      !/^[A-Za-z0-9_-]{2,40}$/.test(String(attestation.siteId||""))||
      !Number.isInteger(attestation.readCounter)||
      attestation.readCounter<0||attestation.readCounter>CTR_MAX)
    return fail("TAG_VERIFICATION_FAILED");
   if(!employee.allowedSites.includes(attestation.siteId)||
      employee.company!==attestation.company)
    return fail("SITE_NOT_PERMITTED");
   // No token, URL, cryptogram or employee's LINE ID leaves this function.
   try{
    const result=await commitOnce({
     requestId:payload.requestId,type:payload.type,
     employeeId:employee.employeeId,company:employee.company,
     siteId:attestation.siteId,tagKey:attestation.tagKey,
     readCounter:attestation.readCounter
    });
    if(!result||result.ok!==true||typeof result.duplicate!=="boolean"||
       !["RECORDED","ALREADY_RECORDED"].includes(result.state))
     return fail("PUNCH_RESULT_UNKNOWN");
    return {ok:true,readOnly:false,requestId:payload.requestId,
      duplicate:result.duplicate,state:result.state};
   }catch(err){
    if(err&&err.code==="REPLAY_DETECTED")return fail("REPLAY_DETECTED");
    if(err&&err.code==="REQUEST_CONFLICT")return fail("REQUEST_CONFLICT");
    // A successful write can throw after persistence; client must query the
    // ORIGINAL request ID before any new NFC read or press.
    return fail("PUNCH_RESULT_UNKNOWN");
   }
  }
  return Object.freeze({handle});
 }
 const api=Object.freeze({create,CTR_MAX});
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.V2BatchNFCDynamicGate=api;
})(typeof window!=="undefined"?window:this);
