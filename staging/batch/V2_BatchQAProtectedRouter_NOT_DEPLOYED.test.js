"use strict";
/* Synthetic TEST001-only protected router tests. No real LINE or Apps Script. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const router=fs.readFileSync(path.join(__dirname,"V2_BatchQAProtectedRouter_NOT_DEPLOYED.gs"),"utf8");
const Core=require("./V2_BatchWorkflowCore.js");
const Journal=require("./V2_BatchAppendJournal.js");
const SID="SOURCE_TEST001_ONLY_BOOK_20261030";
const QID="SEPARATE_BATCH_QA_ONLY_LEDGER_20261030";
const staffSub="U"+"a".repeat(32),ownerSub="U"+"b".repeat(32);
const staffToken="a".repeat(36)+".synthetic.signature";
const ownerToken="b".repeat(36)+".synthetic.signature";
const invalidToken="z".repeat(36)+".synthetic.signature";
const nonce="f".repeat(40);
const request={
 requestId:"TEST_QA_ROUTER_LEAVE_20261030",leaveType:"事假",
 startDate:"2026-11-09",endDate:"2026-11-10",unit:"DAY",reason:"測試"
};
function fixture(overrides={}){
 let options={enabled:"enabled",writeEnabled:"disabled",hrSub:ownerSub,
  staffSub:staffSub,sourceId:SID,ledgerId:QID,channel:"2012136707",
  calendarError:null,throwAfterWrite:false,wrongSource:false,...overrides};
 let rows=[],fetches=0,opened=0,calendarCalls=0,queue=Promise.resolve();
 const properties={
  V2_BATCH_QA_ENABLED:options.enabled,
  V2_BATCH_QA_WRITE_ENABLED:options.writeEnabled,
  V2_BATCH_QA_SOURCE_BOOK_ID:options.sourceId,
  V2_BATCH_QA_BOOK_ID:options.ledgerId,
  LINE_LOGIN_CHANNEL_ID:options.channel,
  V2_BATCH_QA_HR_LINE_SUB:options.hrSub
 };
 const roster=["TEST001","模擬員工甲","000000",options.staffSub,
  "TEST_CO","QA","在職","TESTSITE"];
 const booked={
  getId:()=>SID,
  getName:()=>options.wrongSource?"PRODUCTION":"YC_ATTENDANCE_V2_TEST_ONLY",
  getSheetByName:name=>name==="員工資料"?{
    getLastRow:()=>2,
    getRange:()=>({getValues:()=>[roster]})
  }:null
 };
 const port=()=>{
  let locked=false;
  return {
   withExclusive:fn=>{
    const p=queue.then(async()=>{
     locked=true;try{return await fn()}finally{locked=false}
    });
    queue=p.then(()=>{},()=>{});return p;
   },
   readRows:async()=>JSON.parse(JSON.stringify(rows)),
   appendRow:async row=>{
    rows.push(row.slice());
    if(options.throwAfterWrite){options.throwAfterWrite=false;throw Error("SYNTHETIC_POST_COMMIT_TIMEOUT")}
   },
   utcNow:()=>"2026-10-30T06:00:00.000Z"
  };
 };
 const deps={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]??""})},
  SpreadsheetApp:{openById:id=>{opened++;if(id!==SID)throw Error("WRONG_ID");return booked}},
  UrlFetchApp:{fetch:(url,args)=>{
    fetches++;assert(url.includes("api.line.me/oauth2"));
    const id=args.payload.id_token;
    const now=Math.floor(Date.now()/1000);
    const sub=id===staffToken?staffSub:id===ownerToken?ownerSub:null;
    return {
      getResponseCode:()=>sub?200:401,
      getContentText:()=>JSON.stringify({iss:"https://access.line.me",
       aud:"2012136707",sub,iat:now-30,exp:now+3600})
    };
  }},
  Utilities:{formatDate:()=> "2026-10-30"},
  V2BatchWorkflowCore:Core,
  V2BatchAppendJournal:Journal,
  v2BatchGASTestPort_:port,
  v2BatchCalendarQA_:()=>({
   validateLeave:async ()=>{
    calendarCalls++;
    return options.calendarError?
      {ok:false,code:options.calendarError}:
      {ok:true,workingDays:2};
   }
  })
 };
 const handler=new Function(...Object.keys(deps),router+
   "\nreturn v2BatchQAHandleCandidate_;")(...Object.values(deps));
 const call=(operation,args={},token=staffToken)=>
  handler({nonce,operation,payload:JSON.stringify({idToken:token,args})});
 return {call,rows,options,stats:()=>({fetches,opened,calendarCalls}),handler};
}
const cases=[
 ["disabled QA does not call LINE or Google",async()=>{
  const x=fixture({enabled:"disabled"});const r=await x.call("LEAVE_PREVIEW",request);
  assert.equal(r.code,"UNKNOWN");assert.equal(x.stats().fetches,0);
  assert.equal(x.stats().opened,0);
 }],
 ["wrong channel stops before LINE",async()=>{
  const x=fixture({channel:"OTHER"});assert.equal((await x.call("LEAVE_PREVIEW",request)).code,"UNKNOWN");
  assert.equal(x.stats().fetches,0);
 }],
 ["missing source config fails closed",async()=>{
  const x=fixture({sourceId:""});
  assert.equal((await x.call("LEAVE_PREVIEW",request)).code,"UNKNOWN");
 }],
 ["read-only employee calendar preview succeeds",async()=>{
  const x=fixture(),r=await x.call("LEAVE_PREVIEW",request);
  assert.equal(r.ok,true);assert.equal(r.result.days,2);
  assert.equal(x.rows.length,0);
 }],
 ["writes disabled blocks leave requests before store",async()=>{
  const x=fixture(),r=await x.call("LEAVE_REQUEST",request);
  assert.equal(r.code,"DISABLED");assert.equal(x.rows.length,0);
 }],
 ["invalid LINE ID token never opens QA storage",async()=>{
  const x=fixture({writeEnabled:"enabled"});
  const r=await x.call("LEAVE_REQUEST",request,invalidToken);
  assert.equal(r.code,"AUTH");assert.equal(x.rows.length,0);
 }],
 ["TEST001 can create exactly one QA technical journal entry",async()=>{
  const x=fixture({writeEnabled:"enabled"});
  const r=await x.call("LEAVE_REQUEST",request);
  assert.equal(r.ok,true);assert.equal(x.rows.length,1);
  assert.equal(Journal.decode(x.rows).events.length,1);
 }],
 ["same request ID repeats without second journal entry",async()=>{
  const x=fixture({writeEnabled:"enabled"});
  await x.call("LEAVE_REQUEST",request);
  const r=await x.call("LEAVE_REQUEST",request);
  assert.equal(r.ok,true);assert.equal(r.result.duplicate,true);
  assert.equal(x.rows.length,1);
 }],
 ["result unknown after durable write; original request still readable",async()=>{
  const x=fixture({writeEnabled:"enabled",throwAfterWrite:true});
  const a=await x.call("LEAVE_REQUEST",request);
  assert.equal(a.code,"UNKNOWN");assert.equal(a.persisted,null);
  const b=await x.call("LEAVE_STATUS",{requestId:request.requestId});
  assert.equal(b.ok,true);assert.equal(b.result.request.status,"PENDING");
  assert.equal(x.rows.length,1);
 }],
 ["staff cannot view HR pending or approve",async()=>{
  const x=fixture({writeEnabled:"enabled"});
  assert.equal((await x.call("HR_PENDING",{})).code,"REJECTED");
  assert.equal(x.rows.length,0);
 }],
 ["configured verified HR can approve QA request",async()=>{
  const x=fixture({writeEnabled:"enabled"});
  await x.call("LEAVE_REQUEST",request);
  const p=await x.call("HR_PENDING",{},ownerToken);
  assert.equal(p.ok,true);assert.equal(p.result.pending.length,1);
  const r=await x.call("HR_REVIEW",
   {requestId:request.requestId,decision:"APPROVE"},ownerToken);
  assert.equal(r.ok,true);assert.equal(x.rows.length,2);
 }],
 ["HR identity overlapping employee fixture is refused",async()=>{
  const x=fixture({hrSub:staffSub});
  const r=await x.call("LEAVE_PREVIEW",request);
  assert.equal(r.code,"AUTH");
 }],
 ["unconfigured HR cannot approve from client role field",async()=>{
  const x=fixture({hrSub:"",writeEnabled:"enabled"});
  await x.call("LEAVE_REQUEST",request);
  const r=await x.call("HR_REVIEW",
   {requestId:request.requestId,decision:"APPROVE",role:"HR_OWNER"},ownerToken);
  assert.equal(r.ok,false);assert.equal(x.rows.length,1);
 }],
 ["calendar refuses holiday despite client request ID",async()=>{
  const x=fixture({calendarError:"NON_WORKDAY",writeEnabled:"enabled"});
  const r=await x.call("LEAVE_REQUEST",request);
  assert.equal(r.code,"REJECTED");assert.equal(x.rows.length,0);
 }],
 ["wrong source sheet name blocks verified identity",async()=>{
  const x=fixture({wrongSource:true});
  assert.equal((await x.call("LEAVE_PREVIEW",request)).code,"AUTH");
 }],
 ["server reply never includes token or LINE sub",async()=>{
  const x=fixture(),r=await x.call("LEAVE_PREVIEW",request);
  const raw=JSON.stringify(r);
  for(const secret of [staffToken,staffSub,ownerSub,SID,QID])
   assert(!raw.includes(secret));
 }],
 ["no public doPost or workbook writes in router",async()=>{
  assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(router));
  assert(!/\.(?:setValues?|appendRow|insertSheet|clearContents)\s*\(/.test(router));
 }]
];
(async()=>{let pass=0;
 for(const [name,fn] of cases){
  try{await fn();pass++;console.log("PASS",name)}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
 }
 console.log(pass+"/"+cases.length+" PASSED");
})();
