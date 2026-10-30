"use strict";
/* Offline V2 backend transaction and identity isolation tests.
 * Fake database and synthetic employees only; no Google/LINE access.
 */
const assert=require("node:assert/strict");
const core=require("./V2_BatchWorkflowCore.js");
const staff={source:"VERIFIED_SERVER_BINDING",employeeId:"TEST001",company:"TEST_CO",active:true,role:"STAFF"};
const other={...staff,employeeId:"TEST002"};
const hr={...staff,employeeId:"HR_TEST",role:"HR_OWNER"};
const otherCompanyHr={...hr,employeeId:"HR_OTHER",company:"OTHER_CO"};
const sameIdOtherCompany={...staff,company:"OTHER_CO"};
const REQS={
 leave:{requestId:"REQ_LEAVE_20261030_AAA",leaveType:"事假",startDate:"2026-11-09",
  endDate:"2026-11-10",unit:"DAY",reason:"純合成申請"},
 missed:{requestId:"REQ_MISSED_20261030_AAA",date:"2026-10-30",time:"08:30",type:"上班",
  reason:"忘記模擬打卡"}
};
function fixture(){
 let db={rows:[],events:[]},verified=0,calendarChecks=0,failNextOutbox=false;
 const deep=x=>JSON.parse(JSON.stringify(x));
 const transactions={
  async transaction(fn){
    const before=deep(db);
    const tx={
      find:async id=>db.rows.find(r=>r.requestId===id),
      list:async()=>deep(db.rows),
      create:async r=>db.rows.push(deep(r)),
      replace:async r=>{
        const pos=db.rows.findIndex(x=>x.requestId===r.requestId);
        if(pos<0)throw Error("not found");
        db.rows[pos]=deep(r);
      },
      outbox:async e=>{
        if(failNextOutbox){failNextOutbox=false;throw Error("synthetic outbox failed")}
        db.events.push(deep(e));
      }
    };
    try{return await fn(tx)}
    catch(e){db=before;throw e}
  },
  async read(fn){
    const tx={
      find:async id=>deep(db.rows.find(r=>r.requestId===id)||null),
      list:async()=>deep(db.rows)
    };
    return fn(tx);
  }
 };
 const featureFlags=Object.fromEntries(core.OPERATIONS.map(x=>[x,true]));
 const adapter=core.create({
  flags:featureFlags,
  identity:{verify:async token=>{verified++;
    if(token==="STAFF")return staff;
    if(token==="OTHER")return other;
    if(token==="HR")return hr;
    if(token==="OTHER_HR")return otherCompanyHr;
    if(token==="SAME_ID_OTHER_COMPANY")return sameIdOtherCompany;
    if(token==="INACTIVE")return {...staff,active:false};
    throw Error("Invalid synthetic auth token");
  }},
  store:transactions,
  calendar:{validateLeave:async data=>{
    calendarChecks++;
    if(data.startDate==="2026-11-11")return {ok:false,code:"NON_WORKDAY"};
    if(data.startDate==="2026-11-12")return {ok:false,code:"HR_REVIEW_REQUIRED"};
    return {ok:true,workingDays:2};
  }},
  clock:{today:()=>"2026-10-30"}
 });
 function call(operation,payload={},credential="STAFF"){
  return adapter.handle({operation,payload,credential});
 }
 return {call,db:()=>deep(db),flags:featureFlags,counts:()=>({verified,calendarChecks}),
  failOutbox:()=>{failNextOutbox=true}};
}
const scenarios=[
 ["features must be explicitly enabled",async()=>{
  const f=fixture();f.flags.LEAVE_REQUEST=false;
  const r=await f.call("LEAVE_REQUEST",REQS.leave);
  assert.equal(r.code,"FEATURE_DISABLED");assert.equal(f.counts().verified,0);
 }],
 ["identity scope field rejected before authentication",async()=>{
  const f=fixture();const r=await f.call("LEAVE_REQUEST",{...REQS.leave,employeeId:"TEST002"});
  assert.equal(r.code,"CLIENT_SCOPE_DENIED");assert.equal(f.counts().verified,0);
 }],
 ["LINE verified required",async()=>{
  const f=fixture();assert.equal((await f.call("LEAVE_REQUEST",REQS.leave,"BAD")).code,"AUTH_REQUIRED");
 }],
 ["inactive employee rejected",async()=>{
  const f=fixture();assert.equal((await f.call("LEAVE_REQUEST",REQS.leave,"INACTIVE")).code,"AUTH_REQUIRED");
 }],
 ["staff cannot request HR pending",async()=>{
  const f=fixture();assert.equal((await f.call("HR_PENDING",{})).code,"HR_ONLY");
 }],
 ["leave preview validates calendar without writing",async()=>{
  const f=fixture();const r=await f.call("LEAVE_PREVIEW",REQS.leave);
  assert.equal(r.ok,true);assert.equal(r.days,2);assert.equal(f.db().rows.length,0);
 }],
 ["approved holiday is blocked",async()=>{
  const f=fixture();const r=await f.call("LEAVE_REQUEST",{...REQS.leave,startDate:"2026-11-11",endDate:"2026-11-11"});
  assert.equal(r.code,"NON_WORKDAY");assert.equal(f.db().rows.length,0);
 }],
 ["storm date needs HR and is blocked",async()=>{
  const f=fixture();assert.equal((await f.call("LEAVE_REQUEST",{...REQS.leave,startDate:"2026-11-12",endDate:"2026-11-12"})).code,"HR_REVIEW_REQUIRED");
 }],
 ["first leave transaction adds one row plus outbox event",async()=>{
  const f=fixture();const r=await f.call("LEAVE_REQUEST",REQS.leave);
  assert.equal(r.ok,true);assert.equal(r.duplicate,false);
  assert.equal(r.notification,"QUEUED");
  assert.equal(f.db().rows.length,1);assert.equal(f.db().events.length,1);
 }],
 ["duplicate leave request returns same row and no second event",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("LEAVE_REQUEST",REQS.leave);
  assert.equal(r.ok,true);assert.equal(r.duplicate,true);
  assert.equal(f.db().rows.length,1);assert.equal(f.db().events.length,1);
 }],
 ["same ID with changed reason triggers conflict",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("LEAVE_REQUEST",{...REQS.leave,reason:"其他原因"});
  assert.equal(r.code,"REQUEST_ID_CONFLICT");assert.equal(f.db().rows.length,1);
 }],
 ["another identity cannot reuse requestId",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("LEAVE_REQUEST",REQS.leave,"OTHER");
  assert.equal(r.code,"REQUEST_ID_CONFLICT");
 }],
 ["same employee ID from a different company cannot reuse leave request ID",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const x=await f.call("LEAVE_REQUEST",REQS.leave,"SAME_ID_OTHER_COMPANY");
  assert.equal(x.code,"REQUEST_ID_CONFLICT");
  assert.equal(f.db().rows.length,1);
  assert.equal(f.db().rows[0].company,"TEST_CO");
 }],
 ["same employee ID from another company cannot reuse missed punch request ID",async()=>{
  const f=fixture();await f.call("MISSING_REQUEST",REQS.missed);
  const x=await f.call("MISSING_REQUEST",REQS.missed,"SAME_ID_OTHER_COMPANY");
  assert.equal(x.code,"REQUEST_ID_CONFLICT");
  assert.equal(f.db().rows.length,1);
  assert.equal(f.db().rows[0].company,"TEST_CO");
 }],
 ["the different company cannot create a second notification via guessed ID",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  await f.call("LEAVE_REQUEST",REQS.leave,"SAME_ID_OTHER_COMPANY");
  assert.equal(f.db().events.length,1);
 }],
 ["outbox failure rolls back row and audit entry",async()=>{
  const f=fixture();f.failOutbox();
  await assert.rejects(()=>f.call("LEAVE_REQUEST",REQS.leave),/outbox failed/);
  assert.equal(f.db().rows.length,0);assert.equal(f.db().events.length,0);
 }],
 ["leave read filtered to owner",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const a=await f.call("LEAVE_STATUS",{requestId:REQS.leave.requestId});
  const b=await f.call("LEAVE_STATUS",{requestId:REQS.leave.requestId},"OTHER");
  assert.equal(a.ok,true);assert.equal(b.code,"NOT_FOUND");
 }],
 ["missing punch request creates one row, repeat is idempotent",async()=>{
  const f=fixture();await f.call("MISSING_REQUEST",REQS.missed);
  const r=await f.call("MISSING_REQUEST",REQS.missed);
  assert.equal(r.duplicate,true);assert.equal(f.db().rows.length,1);
 }],
 ["missing reason rejected before writing",async()=>{
  const f=fixture();const r=await f.call("MISSING_REQUEST",{...REQS.missed,reason:""});
  assert.equal(r.code,"MISSING_REASON_INVALID");
 }],
 ["missing punch type must be 上班 or 下班",async()=>{
  const f=fixture();assert.equal((await f.call("MISSING_REQUEST",{...REQS.missed,type:"午休"})).code,"MISSING_PUNCH_INPUT_INVALID");
 }],
 ["missing punch status cannot be queried by other user",async()=>{
  const f=fixture();await f.call("MISSING_REQUEST",REQS.missed);
  const r=await f.call("MISSING_STATUS",{requestId:REQS.missed.requestId},"OTHER");
  assert.equal(r.code,"NOT_FOUND");
 }],
 ["HR pending lists unreviewed leave and missed",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  await f.call("MISSING_REQUEST",REQS.missed);
  const r=await f.call("HR_PENDING",{},"HR");
  assert.equal(r.ok,true);assert.equal(r.pending.length,2);
 }],
 ["HR review approves pending leave and enqueues notification once",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"APPROVE"},"HR");
  assert.equal(r.request.status,"APPROVED");assert.equal(f.db().events.length,2);
 }],
 ["same HR review decision is safe to repeat",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"APPROVE"},"HR");
  const r=await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"APPROVE"},"HR");
  assert.equal(r.duplicate,true);assert.equal(f.db().events.length,2);
 }],
 ["HR review conflicting second decision prevented",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"APPROVE"},"HR");
  const r=await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"REJECT"},"HR");
  assert.equal(r.code,"REVIEW_CONFLICT");
 }],
 ["HR role cannot be injected from browser payload",async()=>{
  const f=fixture();const r=await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,decision:"APPROVE",role:"HR_OWNER"});
  assert.equal(r.code,"CLIENT_SCOPE_DENIED");
 }],
 ["MY_LEAVES returns only current and previous two months",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",{...REQS.leave,startDate:"2026-10-29",endDate:"2026-10-30"});
  assert.equal((await f.call("MY_LEAVES",{month:"2026-10"})).total,1);
  assert.equal((await f.call("MY_LEAVES",{month:"2026-07"})).code,"MONTH_OUT_OF_RANGE");
 }],
 ["MY_LEAVES cannot return another employee",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",{...REQS.leave,startDate:"2026-10-29",endDate:"2026-10-30"});
  const r=await f.call("MY_LEAVES",{month:"2026-10"},"OTHER");
  assert.equal(r.total,0);
 }],
 ["MY_LEAVES does not expose request reason in summary",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",{...REQS.leave,startDate:"2026-10-29",endDate:"2026-10-30"});
  const r=await f.call("MY_LEAVES",{month:"2026-10"});
  assert(!JSON.stringify(r).includes("純合成申請"));
 }],

 ["HR cannot see another company pending work",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("HR_PENDING",{},"OTHER_HR");
  assert.equal(r.ok,true);assert.equal(r.pending.length,0);
 }],
 ["other company HR cannot review TEST_CO leave even with guessed request ID",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("HR_REVIEW",{requestId:REQS.leave.requestId,
    decision:"APPROVE"},"OTHER_HR");
  assert.equal(r.code,"NOT_FOUND");
  assert.equal(f.db().rows[0].status,"PENDING");
 }],
 ["same employee ID in different company cannot read leave status",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",REQS.leave);
  const r=await f.call("LEAVE_STATUS",{requestId:REQS.leave.requestId},
    "SAME_ID_OTHER_COMPANY");
  assert.equal(r.code,"NOT_FOUND");
 }],
 ["same employee ID in different company does not see my history",async()=>{
  const f=fixture();await f.call("LEAVE_REQUEST",
    {...REQS.leave,startDate:"2026-10-30",endDate:"2026-10-30"});
  const r=await f.call("MY_LEAVES",{month:"2026-10"},"SAME_ID_OTHER_COMPANY");
  assert.equal(r.total,0);
 }],
 ["no new public web handlers or Google Sheets writes",async()=>{
  const fs=require("node:fs"),path=require("node:path");
  const s=fs.readFileSync(path.join(__dirname,"V2_BatchWorkflowCore.js"),"utf8");
  assert(!/\b(?:SpreadsheetApp|UrlFetchApp|doPost|doGet|liff)\b/.test(s));
  assert(!/\.(?:setValue|setValues|appendRow|insertSheet)\s*\(/.test(s));
 }]
];
(async()=>{
 let pass=0;
 for(const [name,fn] of scenarios){
  try{await fn();pass++;console.log("PASS",name);}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
 }
 console.log(pass+"/"+scenarios.length+" PASSED");
})();
