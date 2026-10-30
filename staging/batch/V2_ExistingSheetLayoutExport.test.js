"use strict";
// Offline synthetic fixtures only; no production or cloud access.
const assert=require("node:assert/strict");
const legacy=require("./V2_ExistingSheetLayoutExport.js"),standard=require("./V2_OperationalExport.js"),journal=require("./V2_BatchAppendJournal.js");
const empty=()=>({ledger:[journal.HEADERS.slice()],normal:[standard.CLOCK_HEADERS.slice()]});
const names={TEST001:"合成員工",HR_QA:"合成審核人"};
function append(input,row,event,version=1,utc="2026-10-30T00:30:45.000Z"){
 const prev=input.ledger.length===1?"ROOT":input.ledger.at(-1)[7];
 const data=[row.requestId+"__V"+version,row.requestId,version,JSON.stringify(row),JSON.stringify(event),utc,prev];
 let hash=2166136261;for(const ch of data.join("\u001f")){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}
 input.ledger.push([...data,hash.toString(16).padStart(8,"0")]);
}
function request(kind,id,body){return {kind,requestId:id,employeeId:"TEST001",company:"TEST_CO",body,status:"PENDING",fingerprint:"SYNTHETIC",submittedAt:"2026-10-30"};}
let pass=0;function test(name,fn){try{fn();pass++;console.log("PASS",name)}catch(e){process.exitCode=1;console.error("FAIL",name,e)}}
test("three exact legacy layouts have 11, 12 and 13 columns",()=>{
 const r=legacy.tables(empty(),{names});assert.deepEqual(Object.values(r.tables).map(t=>t[0].length),[11,12,13]);
 assert.equal(r.tables.missing[0][4],"公司");assert.equal(r.tables.missing[0][5],"班別");
 assert.equal(r.tables.missing[0][12],"核定打卡時間");assert.equal(r.excelProgramValidated,false);
});
test("normal GPS keeps observed source and never invents missing coordinates",()=>{
 const x=empty();x.normal.push(["QA_CLOCK_LAYOUT_0001","TEST001","TEST_CO","2026-10-30","08:30:45","上班","GPS","TESTSITE","合成地點",13,10,"2026-10-30T00:30:45.000Z"]);
 const r=legacy.tables(x,{names});assert.equal(r.tables.clock[1][0],"2026/10/30 08:30:45");
 assert.equal(r.tables.clock[1][8],"");assert.equal(r.tables.clock[1][10],"GPS");assert.equal(r.warnings.length,2);
 assert.equal(r.tables.missing.length,1);
});
test("multi-day quantity uses verified days while hourly quantity remains a time range",()=>{
 const x=empty();
 for(const [id,body] of [["QA_LEAVE_LAYOUT_DAY",{leaveType:"事假",startDate:"2026-11-30",endDate:"2026-12-01",unit:"DAY",workingDays:2}],
  ["QA_LEAVE_LAYOUT_HOURS",{leaveType:"事假",startDate:"2026-11-30",endDate:"2026-11-30",unit:"HOURS",fromTime:"11:00",toTime:"14:00"}]]){
  append(x,request("LEAVE",id,body),{type:"LEAVE_SUBMITTED",requestId:id});
 }
 const before=JSON.stringify(x),r=legacy.tables(x,{names});
 assert.equal(r.tables.leaves[1][6],"2天");assert.equal(r.tables.leaves[2][6],"11:00-14:00");
 assert.equal(r.tables.leaves[1][9],"2026/10/30 08:30:45");assert.equal(r.tables.leaves.length,3);
 assert.equal(JSON.stringify(x),before);
});
test("pending missed punch never fills approval fields; approved latest version stays separate",()=>{
 const x=empty(),id="QA_MISSING_LAYOUT_0001",base=request("MISSING",id,{date:"2026-10-29",type:"下班",time:"17:31",reason:"合成"});
 append(x,base,{type:"MISSING_SUBMITTED",requestId:id});
 let r=legacy.tables(x,{names});assert.deepEqual(r.tables.missing[1].slice(10),["","",""]);
 append(x,{...base,status:"APPROVED",reviewedBy:"HR_QA",reviewedAt:"2026-10-31"},{type:"REVIEWED",requestId:id,status:"APPROVED"},2,"2026-10-31T01:02:03.000Z");
 r=legacy.tables(x,{names});assert.equal(r.tables.missing.length,2);assert.equal(r.tables.missing[1][8],"核准");
 assert.equal(r.tables.missing[1][9],"2026/10/30 08:30:45");assert.equal(r.tables.missing[1][11],"2026/10/31 09:02:03");
 assert.equal(r.tables.missing[1][12],"2026/10/29 17:31");assert.equal(r.tables.clock.length,1);
 assert.throws(()=>legacy.tables(x,{names:{TEST001:"合成"}}),/VERIFIED_REVIEWER_NAME_REQUIRED/);
});
test("missing name or day count is refused rather than guessed",()=>{
 assert.throws(()=>legacy.tables(empty()),/VERIFIED_QA_NAME_REQUIRED/);
 const x=empty(),id="QA_NO_DAY_COUNT_0001";
 append(x,request("LEAVE",id,{startDate:"2026-11-30",endDate:"2026-12-01",unit:"DAY"}),{type:"LEAVE_SUBMITTED",requestId:id});
 assert.throws(()=>legacy.tables(x,{names}),/VERIFIED_WORKING_DAYS_REQUIRED/);
});
console.log(pass+"/5 PASSED");

