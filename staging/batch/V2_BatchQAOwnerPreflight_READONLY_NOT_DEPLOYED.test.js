"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,
  "V2_BatchQAOwnerPreflight_READONLY_NOT_DEPLOYED.gs"),"utf8");
const ID="MOCK_QA_BOOK_ID_20261030_ONLY";
const H=["TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
 "UTC_TIME","PREV_HASH","CONTENT_HASH"];
function fixture(o={}){
 const opts={active:"owner@test.invalid",effective:"owner@test.invalid",
  enabled:"disabled",id:ID,bookId:ID,
  bookName:"YC_ATTENDANCE_V2_BATCH_QA_ONLY",sheet:true,
  header:H.slice(),cols:8,rows:1,access:true,...o};
 const logs=[];let opened=0,reads=0;
 const sheet={getLastRow:()=>opts.rows,getLastColumn:()=>opts.cols,
  getRange:()=>({getDisplayValues:()=>{reads++;return [opts.header.slice()]}})};
 const book={getId:()=>opts.bookId,getName:()=>opts.bookName,
  getSheetByName:name=>opts.sheet&&name==="V2_交易流水_QA"?sheet:null};
 const deps={
  Session:{getActiveUser:()=>({getEmail:()=>opts.active}),
   getEffectiveUser:()=>({getEmail:()=>opts.effective})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>
    k==="V2_BATCH_QA_ENABLED"?opts.enabled:
    k==="V2_BATCH_QA_BOOK_ID"?opts.id:null})},
  SpreadsheetApp:{openById:id=>{opened++;
    if(!opts.access)throw Error("INSUFFICIENT_ACCESS");
    assert.equal(id,ID);return book;}},
  Logger:{log:x=>logs.push(x)}
 };
 const fn=new Function(...Object.keys(deps),
  src+"\nreturn v2BatchQAOwnerPreflight_TEST_ONLY;")(...Object.values(deps));
 return {run:fn,counts:()=>({opened,reads}),logs};
}
const tests=[
 ["valid signed-in editor with disabled QA flag passes read-only preflight",()=>{
  const x=fixture();const r=x.run();
  assert.equal(r.ok,true);assert.equal(r.reason,"PRECHECK_ONLY");
 }],
 ["mismatched active and effective Google account rejected before sheet",()=>{
  const x=fixture({active:"other@test.invalid"});
  assert.equal(x.run().reason,"GOOGLE_ACCOUNT_CONTEXT_UNVERIFIED");
  assert.equal(x.counts().opened,0);
 }],
 ["blank Google identity rejected before sheet",()=>{
  const x=fixture({active:""});
  assert.equal(x.run().reason,"GOOGLE_ACCOUNT_CONTEXT_UNVERIFIED");
  assert.equal(x.counts().opened,0);
 }],
 ["QA enabled flag must be disabled for owner preflight",()=>{
  const x=fixture({enabled:"enabled"});
  assert.equal(x.run().reason,"QA_FLAG_NOT_DISABLED");
  assert.equal(x.counts().opened,0);
 }],
 ["missing QA sheet ID gives sanitized error",()=>{
  const x=fixture({id:""});
  assert.equal(x.run().reason,"QA_WORKBOOK_NOT_CONFIGURED");
  assert.equal(x.counts().opened,0);
 }],
 ["QA sheet inaccessible gives sanitized result",()=>{
  const x=fixture({access:false});
  assert.equal(x.run().reason,"QA_WORKBOOK_UNAVAILABLE");
  assert.equal(x.counts().opened,1);
 }],
 ["wrong Google workbook name cannot be confused with TEST001",()=>{
  const x=fixture({bookName:"YC_ATTENDANCE_V2_TEST_ONLY"});
  assert.equal(x.run().reason,"QA_WORKBOOK_MISMATCH");
 }],
 ["wrong workbook ID rejected",()=>{
  const x=fixture({bookId:"MOCK_PRODUCTION_BOOK"});
  assert.equal(x.run().reason,"QA_WORKBOOK_MISMATCH");
 }],
 ["missing QA technical ledger tab blocked",()=>{
  const x=fixture({sheet:false});
  assert.equal(x.run().reason,"QA_LEDGER_SHAPE_INVALID");
 }],
 ["unexpected additional column blocked",()=>{
  const x=fixture({cols:9});
  assert.equal(x.run().reason,"QA_LEDGER_SHAPE_INVALID");
 }],
 ["mismatched ledger header blocked",()=>{
  const h=H.slice();h[0]="EMPLOYEE_ID";
  const x=fixture({header:h});
  assert.equal(x.run().reason,"QA_LEDGER_HEADER_MISMATCH");
 }],
 ["no employee or owner email or exact ID ever logged",()=>{
  const x=fixture(),r=x.run();
  const serialized=JSON.stringify(r)+x.logs.join("\n");
  for(const forbidden of ["owner@test.invalid",ID,"TEST001","LINE_ID_TOKEN"])
   assert(!serialized.includes(forbidden));
 }],
 ["preflight has no Sheet mutation and no public web handlers",()=>{
  assert(!/\.(?:setValue|setValues|appendRow|insertSheet|setProperty|clearContents)\s*\(/.test(src));
  assert(!/function\s+(?:doPost|doGet)\s*\(/.test(src));
 }]
];
let passed=0;for(const [name,fn] of tests){
 try{fn();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
