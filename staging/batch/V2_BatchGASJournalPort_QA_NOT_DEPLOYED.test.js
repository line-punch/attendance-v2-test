"use strict";
/* Offline only: mocks Apps Script services. NO REAL Google calls. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"V2_BatchGASJournalPort_QA_NOT_DEPLOYED.gs"),"utf8");
const journal=require("./V2_BatchAppendJournal.js"),core=require("./V2_BatchWorkflowCore.js");
const sheetID="MOCK_ISOLATED_QA_ONLY_BOOK_ID_20261030";
const headings=journal.HEADERS.slice();
function create(cfg={}){
 const options={enabled:true,access:true,bookName:"YC_ATTENDANCE_V2_BATCH_QA_ONLY",
   header:headings.slice(), extraColumn:false, lockAllowed:true,
   failWhenSet:false, failAfterSet:false, ...cfg};
 let rows=[options.header.slice()],flushes=0,setCalls=0,locked=false,readCalls=0;
 const sh={
  getLastColumn:()=>options.extraColumn?9:8,
  getLastRow:()=>rows.length,
  getRange:(r,c,rs=1,cs=1)=>({
   getDisplayValues:()=>[rows[r-1].map(String).slice(c-1,c+cs-1)],
   getValues:()=>{readCalls++;return rows.slice(r-1,r-1+rs).map(a=>a.slice(c-1,c-1+cs))},
   setValues:arr=>{
    setCalls++;
    if(options.failWhenSet)throw Error("BEFORE_WRITE");
    rows[r-1]=arr[0].slice();
    if(options.failAfterSet)throw Error("AFTER_WRITE");
   }
  })
 };
 const ss={getId:()=>sheetID,getName:()=>options.bookName,
  getSheetByName:name=>name==="V2_交易流水_QA"?sh:null};
 const m={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>
   k==="V2_BATCH_QA_ENABLED"?(options.enabled?"enabled":"disabled"):
   k==="V2_BATCH_QA_BOOK_ID"?sheetID:null})},
  SpreadsheetApp:{openById:id=>{if(!options.access)throw Error("NO_QA_SHEET");
   assert.equal(id,sheetID);return ss}},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(!options.lockAllowed||locked)return false;locked=true;return true},
   releaseLock:()=>{locked=false}
  })},
  SpreadsheetApp:undefined,
  Date:class FakeDate extends Date{constructor(...args){
    super(...(args.length?args:["2026-10-30T04:30:00.000Z"]))
  }}
 };
 // Assemble one SpreadsheetApp mock without losing openById.
 m.SpreadsheetApp={openById:id=>{if(!options.access)throw Error("NO_QA_SHEET");
   assert.equal(id,sheetID);return ss;},flush:()=>{flushes++}};
 const createPort=new Function(...Object.keys(m),code+
  "\nreturn v2BatchGASTestPort_;")(...Object.values(m));
 return {createPort,rows,options,counts:()=>({flushes,setCalls,readCalls,locked})};
}
const data={
 requestId:"TEST_REQ_JOURNAL_20261030_01",employeeId:"TEST001",
 company:"TEST_CO",kind:"LEAVE",status:"PENDING",
 body:{leaveType:"事假"},fingerprint:"FIXED_FINGERPRINT"
};
const event={type:"LEAVE_SUBMITTED",requestId:data.requestId};
async function appendOne(port){
 const ledger=journal.make(port);
 await ledger.transaction(async tx=>{
  await tx.create(data);
  await tx.outbox(event);
 });
 return ledger;
}
const tests=[
 ["feature disabled fails before opening QA workbook",async()=>{
  assert.throws(()=>create({enabled:false}).createPort(),/DISABLED/);
 }],
 ["correct isolated workbook mandatory",async()=>{
  assert.throws(()=>create({bookName:"PRODUCTION"}).createPort(),/WRONG_WORKBOOK/);
 }],
 ["no access to QA workbook fails closed",async()=>{
  assert.throws(()=>create({access:false}).createPort(),/NO_QA_SHEET/);
 }],
 ["incorrect headers refuse port creation",async()=>{
  const h=headings.slice();h[0]="WRONG";
  assert.throws(()=>create({header:h}).createPort(),/HEADER_MISMATCH/);
 }],
 ["unexpected ninth column rejected",async()=>{
  assert.throws(()=>create({extraColumn:true}).createPort(),/SHAPE_INVALID/);
 }],
 ["reads require script lock",async()=>{
  const x=create(),port=x.createPort();
  await assert.rejects(()=>port.readRows(),/LOCK_REQUIRED/);
 }],
 ["writes require script lock",async()=>{
  const x=create(),port=x.createPort();
  await assert.rejects(()=>port.appendRow(headings),/LOCK_REQUIRED/);
 }],
 ["one transaction creates exact single row and flushes once",async()=>{
  const x=create(),port=x.createPort();
  const ledger=await appendOne(port);
  assert.equal(x.rows.length,2);assert.equal(x.counts().setCalls,1);
  assert.equal(x.counts().flushes,1);
  const got=await ledger.read(tx=>tx.find(data.requestId));
  assert.equal(got.employeeId,"TEST001");
 }],
 ["locking prevents simultaneous non-serialized use",async()=>{
  const x=create({lockAllowed:false}),port=x.createPort();
  await assert.rejects(()=>port.withExclusive(async()=>{}),/BUSY/);
 }],
 ["lock is released after failing transaction",async()=>{
  const x=create({failWhenSet:true}),port=x.createPort();
  await assert.rejects(()=>appendOne(port),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(x.counts().locked,false);
 }],
 ["write then failure reports unknown and preserves ledger for readback",async()=>{
  const x=create({failAfterSet:true}),port=x.createPort();
  await assert.rejects(()=>appendOne(port),/WRITE_OUTCOME_UNKNOWN/);
  assert.equal(x.rows.length,2);
  const ledger=journal.make(port);
  const saved=await ledger.read(tx=>tx.find(data.requestId));
  assert.equal(saved.requestId,data.requestId);
 }],
 ["oversized cell rejected without writing",async()=>{
  const x=create(),p=x.createPort();
  const cells=["TX_ID_TEST_1234","REQUEST_TEST_1234",1,"A".repeat(31000),"{}","2026-10-30T04:30:00.000Z","ROOT","01234567"];
  await assert.rejects(()=>p.withExclusive(()=>p.appendRow(cells)),/CELL_TOO_LONG/);
  assert.equal(x.counts().setCalls,0);
 }],
 ["mock append cannot delete or overwrite existing rows",async()=>{
  const x=create(),p=x.createPort();
  await appendOne(p);const original=JSON.stringify(x.rows[1]);
  const ledger=journal.make(p);
  await ledger.transaction(async tx=>{
   const row=await tx.find(data.requestId);
   await tx.replace({...row,status:"APPROVED"});
   await tx.outbox({type:"REVIEWED",requestId:data.requestId,status:"APPROVED"});
  });
  assert.equal(x.rows.length,3);assert.equal(JSON.stringify(x.rows[1]),original);
 }],
 ["no public API or LINE network or workbook creation",async()=>{
  assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(code));
  assert(!/UrlFetchApp|insertSheet|deleteSheet|clearContents|pushMessage/.test(code));
 }],
 ["no real business Sheet tab is referenced",async()=>{
  assert(!code.includes('getSheetByName("請假申請")'));
  assert(!code.includes('getSheetByName("補打卡申請")'));
  assert(!code.includes('getSheetByName("打卡紀錄")'));
 }]
];
(async()=>{let pass=0;
for(const [name,fn] of tests)try{await fn();pass++;console.log("PASS",name)}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
console.log(pass+"/"+tests.length+" PASSED");
})();
