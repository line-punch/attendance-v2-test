"use strict";
// Offline export tests only. No real workbook, employee, LINE or cloud calls.
const assert=require("node:assert/strict"),exp=require("./V2_OperationalExport.js"),journal=require("./V2_BatchAppendJournal.js");
let pass=0;
function test(name,fn){try{fn();pass++;console.log("PASS",name)}catch(e){process.exitCode=1;console.error("FAIL",name,e)}}
const empty=()=>({ledger:[journal.HEADERS.slice()],normal:[exp.CLOCK_HEADERS.slice()]});
test("empty snapshot exports three separate header tables without fake attendance",()=>{
 const input=empty(),before=JSON.stringify(input),r=exp.tables(input);
 assert.equal(r.clock.length,1);assert.equal(r.leaves.length,1);assert.equal(r.missing.length,1);assert.equal(JSON.stringify(input),before);
});
test("normal GPS row only enters normal table",()=>{
 const input=empty();input.normal.push(["QA_EXPORT_CLOCK_0001","TEST001","TEST_CO","2026-10-30","08:30:00","上班","GPS","TESTSITE","合成地點",0,10,"2026-10-30T00:30:00Z"]);
 const r=exp.tables(input);assert.equal(r.clock.length,2);assert.equal(r.missing.length,1);assert.equal(r.leaves.length,1);
});
test("mixed missed source cannot enter normal export",()=>{
 const input=empty();input.normal.push(["QA_EXPORT_MISSING_001","TEST001","TEST_CO","2026-10-30","08:30:00","上班","MISSING","TESTSITE","",0,10,""]);
 assert.throws(()=>exp.tables(input),/QA_EXPORT_NORMAL_ROW_INVALID/);
});
test("foreign employee cannot enter QA export",()=>{
 const input=empty();input.normal.push(["QA_EXPORT_CLOCK_0002","OTHER","TEST_CO","2026-10-30","08:30:00","上班","GPS","TESTSITE","",0,10,""]);
 assert.throws(()=>exp.tables(input),/QA_EXPORT_NORMAL_ROW_INVALID/);
});
test("CSV preserves commas, quotes and line breaks; neutralizes formula injection",()=>{
 const text=exp.csv([["a,b",'a"b',"a\nb","=1+1","  @SUM(1)",""]]);
 assert(text.startsWith("\ufeff"));assert(text.includes('"a,b","a""b","a\nb"'));
 assert(text.includes('"\'=1+1"'));assert(text.includes('"\'  @SUM(1)"'));
});
test("incorrect ledger headers rejected rather than guessed",()=>{
 const input=empty();input.ledger[0][0]="WRONG";assert.throws(()=>exp.tables(input),/QA_EXPORT_HEADERS_INVALID/);
});
test("approved missed request exports once at latest version, never as normal time",()=>{
 const input=empty(),id="QA_EXPORT_APPROVAL_0001";
 const base={requestId:id,employeeId:"TEST001",company:"TEST_CO",kind:"MISSING",fingerprint:"SYNTHETIC",
  body:{date:"2026-10-30",type:"上班",time:"08:30",reason:"synthetic"},submittedAt:"2026-10-30"};
 let previous="ROOT";
 for(const [index,status] of ["PENDING","APPROVED"].entries()){
  const version=index+1,item={...base,status};
  const event=index?{type:"REVIEWED",requestId:id,status}:{type:"MISSING_SUBMITTED",requestId:id};
  const row=[id+"__V"+version,id,version,JSON.stringify(item),JSON.stringify(event),"2026-10-30T00:00:00.000Z",previous];
  let h=2166136261;for(const ch of row.join("\u001f")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  previous=h.toString(16).padStart(8,"0");input.ledger.push([...row,previous]);
 }
 const before=JSON.stringify(input),r=exp.tables(input);
 assert.equal(r.missing.length,2);assert.equal(r.missing[1][7],"APPROVED");
 assert.equal(r.missing[1][5],"08:30");assert.equal(r.clock.length,1);
 assert.equal(input.ledger.length,3);assert.equal(JSON.stringify(input),before);
});
console.log(pass+"/7 PASSED");

