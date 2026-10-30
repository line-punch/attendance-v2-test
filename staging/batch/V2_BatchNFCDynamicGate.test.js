"use strict";
const assert=require("node:assert/strict");
const NFC=require("./V2_BatchNFCDynamicGate.js");
const staff={source:"VERIFIED_SERVER_BINDING",active:true,employeeId:"TEST001",
 company:"TEST_CO",allowedSites:["TESTSITE"]};
const attestation={source:"SERVER_AES_SDM_VERIFIER",cryptogramValid:true,
 tagKey:"TAG_QA_0001",siteId:"TESTSITE",company:"TEST_CO",readCounter:23};
const payload={requestId:"NFC_REQ_TEST_20261030_0001",type:"上班",
 sunUrl:"https://example.invalid/nfc?picc=opaque&cmac=opaque"};
function fixture(opts={}){
 const counter=new Map(),requests=new Map(),calls={auth:0,verify:0,commit:0};
 let proof=opts.attestation||attestation,wait=Promise.resolve();
 const f=NFC.create({
  enabled:opts.enabled??true,
  verifyIdentity:async token=>{
   calls.auth++;if(token!=="TEST_LOGIN")throw Error("BAD_TOKEN");
   return opts.identity||staff;
  },
  verifySun:async url=>{
   calls.verify++;if(opts.verifierThrows)throw Error("CMAC_INVALID");
   return proof;
  },
  commitOnce:async record=>{
   calls.commit++;
   const run=wait.then(async()=>{
    const old=requests.get(record.requestId);
    if(old){
     if(JSON.stringify(old)!==JSON.stringify(record)){
      const e=Error("request changed");e.code="REQUEST_CONFLICT";throw e;
     }
     return {ok:true,duplicate:true,state:"ALREADY_RECORDED"};
    }
    const last=counter.get(record.tagKey)??-1;
    if(record.readCounter<=last){
     const e=Error("counter replay");e.code="REPLAY_DETECTED";throw e;
    }
    if(opts.commitThrows)throw Error("WRITE_UNKNOWN");
    counter.set(record.tagKey,record.readCounter);
    requests.set(record.requestId,{...record});
    return {ok:true,duplicate:false,state:"RECORDED"};
   });wait=run.catch(()=>{});return run;
  }
 });
 return {call:(p=payload,token="TEST_LOGIN")=>f.handle({payload:p,idToken:token}),
  calls,counter,requests,setProof:p=>{proof=p}};
}
const tests=[
 ["disabled flag blocks before any token or SUN verification",async()=>{
  const x=fixture({enabled:false}),r=await x.call();
  assert.equal(r.code,"NFC_DISABLED");assert.equal(x.calls.auth,0);
 }],
 ["missing token blocks before verifying NFC URL",async()=>{
  const x=fixture();assert.equal((await x.call(payload,"BAD")).code,"AUTH_REQUIRED");
  assert.equal(x.calls.verify,0);
 }],
 ["pasted legacy static NFC URL without crypto fails",async()=>{
  const x=fixture({attestation:{source:"BROWSER",cryptogramValid:true,
    tagKey:"TAG_QA_0001",readCounter:23,siteId:"TESTSITE",company:"TEST_CO"}});
  assert.equal((await x.call()).code,"TAG_VERIFICATION_FAILED");
  assert.equal(x.calls.commit,0);
 }],
 ["invalid AES attestation blocked",async()=>{
  const x=fixture({attestation:{...attestation,cryptogramValid:false}});
  assert.equal((await x.call()).code,"TAG_VERIFICATION_FAILED");
 }],
 ["SUN verifier exception rejected",async()=>{
  const x=fixture({verifierThrows:true});
  assert.equal((await x.call()).code,"TAG_VERIFICATION_FAILED");
 }],
 ["validated original tap records exactly once",async()=>{
  const x=fixture();const r=await x.call();
  assert.equal(r.ok,true);assert.equal(r.state,"RECORDED");
  assert.equal(x.requests.size,1);
 }],
 ["same request and SUN proof returns idempotent readback",async()=>{
  const x=fixture();await x.call();
  const r=await x.call();
  assert.equal(r.duplicate,true);assert.equal(x.requests.size,1);
 }],
 ["new request reusing same tag read counter is rejected",async()=>{
  const x=fixture();await x.call();
  const r=await x.call({...payload,requestId:"NFC_REQ_TEST_20261030_0002"});
  assert.equal(r.code,"REPLAY_DETECTED");
  assert.equal(x.requests.size,1);
 }],
 ["fresh higher counter on SAME tag is accepted as a second reading",async()=>{
  const x=fixture();await x.call();
  x.setProof({...attestation,readCounter:24});
  const r=await x.call({...payload,requestId:"NFC_REQ_TEST_20261030_0002"});
  assert.equal(r.ok,true);
  assert.equal(x.requests.size,2);
  assert.equal(x.counter.get("TAG_QA_0001"),24);
 }],
 ["untrusted site rejected before committing",async()=>{
  const x=fixture({attestation:{...attestation,siteId:"OTHER_SITE"}});
  assert.equal((await x.call()).code,"SITE_NOT_PERMITTED");
  assert.equal(x.calls.commit,0);
 }],
 ["mismatched tag company refused",async()=>{
  const x=fixture({attestation:{...attestation,company:"OTHER_CO"}});
  assert.equal((await x.call()).code,"SITE_NOT_PERMITTED");
 }],
 ["unverified or inactive LINE binding refused",async()=>{
  const x=fixture({identity:{...staff,active:false}});
  assert.equal((await x.call()).code,"AUTH_REQUIRED");
 }],
 ["client cannot choose tag key, counter or employee ID",async()=>{
  const x=fixture();
  const r=await x.call({...payload,readCounter:999999,employeeId:"TEST002"});
  assert.equal(r.code,"NFC_REQUEST_INVALID");assert.equal(x.calls.auth,0);
 }],
 ["24-bit counter limit enforced",async()=>{
  const x=fixture({attestation:{...attestation,readCounter:16777216}});
  assert.equal((await x.call()).code,"TAG_VERIFICATION_FAILED");
 }],
 ["non-HTTPS tag links refused",async()=>{
  const x=fixture();assert.equal((await x.call({...payload,sunUrl:"http://test.invalid"})).code,"NFC_REQUEST_INVALID");
 }],
 ["malformed punch type refused",async()=>{
  const x=fixture();assert.equal((await x.call({...payload,type:"午休"})).code,"NFC_REQUEST_INVALID");
 }],
 ["unknown write outcome requires original request query",async()=>{
  const x=fixture({commitThrows:true});
  assert.equal((await x.call()).code,"PUNCH_RESULT_UNKNOWN");
  assert.equal(x.requests.size,0);
 }],
 ["changed punch type with same request ID rejected",async()=>{
  const x=fixture();await x.call();
  const r=await x.call({...payload,type:"下班"});
  assert.equal(r.code,"REQUEST_CONFLICT");
 }],
 ["concurrent 10 requests with same counter accept exactly one",async()=>{
  const x=fixture();
  const r=await Promise.all(Array.from({length:10},(_,i)=>
   x.call({...payload,requestId:"NFC_REQ_TEST_20261030_"+String(i+10)})));
  assert.equal(r.filter(v=>v.ok).length,1);
  assert.equal(r.filter(v=>v.code==="REPLAY_DETECTED").length,9);
 }],
 ["module has no real AES keys, HTTP requests or GAS calls",async()=>{
  const fs=require("node:fs"),path=require("node:path");
  const src=fs.readFileSync(path.join(__dirname,"V2_BatchNFCDynamicGate.js"),"utf8");
  assert(!/UrlFetchApp|SpreadsheetApp|google\.script\.run|navigator\.nfc/.test(src));
  assert(!/\.(?:setValues?|appendRow|insertSheet)\s*\(/.test(src));
 }]
];
(async()=>{let passed=0;
 for(const [name,fn] of tests)try{await fn();passed++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
 console.log(passed+"/"+tests.length+" PASSED");
})();
