"use strict";
// Offline Apps Script doubles only; no real LINE, GPS, Sheets or network.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const code=fs.readFileSync(__dirname+"/V2_MobileClockQA.gs","utf8");
const NOW=Date.parse("2026-10-30T00:30:00Z");
class FakeDate extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}}
function fixture(options={}){
 const config={sourceId:"SYNTHETIC_SOURCE_ONLY",ledgerId:"SYNTHETIC_QA_ONLY",writeEnabled:true};
 let rows=[],writes=0,opens=0,locked=false;
 const header=["REQUEST_ID","EMPLOYEE_ID","COMPANY","DATE","TIME","TYPE","SOURCE","SITE_CODE","SITE_NAME","DISTANCE_METERS","ACCURACY_METERS","UTC_TIME"];
 const sheet={getLastColumn:()=>12,getRange:()=>({getValues:()=>[header]}),
  getDataRange:()=>({getValues:()=>[header,...rows.map(r=>r.slice())]}),
  appendRow(row){assert(locked);rows.push(row);writes++;if(options.lostReply)throw Error("AFTER_APPEND");}};
 const qa={getId:()=>config.ledgerId,getName:()=>options.wrongBook?"PRODUCTION":"YC_ATTENDANCE_V2_BATCH_QA_ONLY",
  getSheetByName:name=>name==="V2_正常打卡_QA"?sheet:null};
 const source={getId:()=>config.sourceId,getName:()=>"YC_ATTENDANCE_V2_TEST_ONLY",
  getSheetByName:()=>({getDataRange:()=>({getValues:()=>[[],["TESTSITE","合成地點","","25,121",50]]})})};
 const api={Date:FakeDate,console,Utilities:{formatDate:(d,tz,format)=>format==="yyyy-MM-dd"?"2026-10-30":"08:30:00"},
  SpreadsheetApp:{openById:id=>{opens++;return id===config.ledgerId?qa:source},flush(){}},
  LockService:{getScriptLock:()=>({tryLock:()=>{assert(!locked);locked=true;return true},releaseLock:()=>{locked=false}})},
  v2BatchQAIdentity_:()=>({verify:token=>token==="valid"?{source:"VERIFIED_SERVER_BINDING",active:true,
   employeeId:"TEST001",company:"TEST_CO",role:"STAFF"}:null})};
 vm.createContext(api);vm.runInContext(code,api);
 const call=(operation,args={},token="valid")=>api.v2MobileClockHandle_({operation,args,token},config);
 return {call,config,rows:()=>rows,writes:()=>writes,opens:()=>opens,locked:()=>locked};
}
const punch={requestId:"QA_GPS_SYNTHETIC_0001",type:"上班",lat:25,lng:121,accuracy:10,capturedAt:NOW};
const tests=[
 ["GPS persists source and server time in QA normal table only",()=>{const f=fixture();const r=f.call("GPS_CLOCK",punch);
  assert(r.ok);assert.equal(r.request.source,"GPS");assert.equal(r.request.time,"08:30:00");assert.equal(f.writes(),1);assert(!f.locked());}],
 ["same request is idempotent before stale GPS validation",()=>{const f=fixture();f.call("GPS_CLOCK",punch);
  assert(f.call("GPS_CLOCK",{...punch,capturedAt:0}).duplicate);assert.equal(f.writes(),1);}],
 ["daily same-type second request blocked; opposite type allowed",()=>{const f=fixture();f.call("GPS_CLOCK",punch);
  assert.equal(f.call("GPS_CLOCK",{...punch,requestId:"QA_GPS_SYNTHETIC_0002"}).code,"ALREADY_CLOCKED");
  assert(f.call("GPS_CLOCK",{...punch,requestId:"QA_GPS_SYNTHETIC_0003",type:"下班"}).ok);assert.equal(f.writes(),2);}],
 ["request ID type conflict cannot change existing punch",()=>{const f=fixture();f.call("GPS_CLOCK",punch);
  assert.equal(f.call("GPS_CLOCK",{...punch,type:"下班"}).code,"REQUEST_ID_CONFLICT");assert.equal(f.writes(),1);}],
 ["monthly normal query leaves absent clock-out blank and has no status",()=>{const f=fixture();f.call("GPS_CLOCK",punch);
  const r=f.call("MY_CLOCKS");assert.equal(r.days.length,1);assert.equal(r.days[0].clockOut,"");
  assert(!("status" in r.days[0]));assert.equal(f.writes(),1);}],
 ["lost write response recovers original ID without a second write",()=>{const f=fixture({lostReply:true});
  assert.throws(()=>f.call("GPS_CLOCK",punch),/AFTER_APPEND/);assert(!f.locked());
  assert(f.call("GPS_STATUS",{requestId:punch.requestId,type:"上班"}).ok);assert.equal(f.writes(),1);}],
 ["out-of-range, stale or inaccurate GPS never writes",()=>{
  for(const [delta,expected] of [[{lat:26},"OUT_OF_RANGE"],[{capturedAt:NOW-120001},"GPS_EXPIRED"],[{accuracy:151},"GPS_ACCURACY"]]){
   const f=fixture();assert.equal(f.call("GPS_CLOCK",{...punch,...delta}).code,expected);assert.equal(f.writes(),0);assert(!f.locked());}}],
 ["disabled writes and invalid identity cannot open any workbook",()=>{const f=fixture();f.config.writeEnabled=false;
  assert.equal(f.call("GPS_CLOCK",punch).code,"FEATURE_DISABLED");assert.equal(f.call("MY_CLOCKS",{},"bad").code,"AUTH_REQUIRED");assert.equal(f.opens(),0);}],
 ["client employee injection rejected and wrong QA workbook blocked",()=>{const f=fixture();
  assert.equal(f.call("GPS_CLOCK",{...punch,employeeId:"OTHER"}).code,"INVALID_FORM_FIELDS");assert.equal(f.opens(),0);
  const g=fixture({wrongBook:true});assert.throws(()=>g.call("GPS_CLOCK",punch),/QA_CLOCK_WRONG_BOOK/);assert.equal(g.writes(),0);assert(!g.locked());}],
 ["mixed or tampered rows are refused rather than merged into normal history",()=>{const f=fixture();f.call("GPS_CLOCK",punch);
  f.rows()[0][6]="MISSING";assert.throws(()=>f.call("MY_CLOCKS"),/QA_CLOCK_ROW_INVALID/);}],
 ["GPS readback missing original does not authorize a retry",()=>{const f=fixture();assert.equal(f.call("GPS_STATUS",{requestId:punch.requestId,type:"上班"}).code,"NOT_FOUND");assert.equal(f.writes(),0);}]
];
let pass=0;for(const [name,test] of tests){try{test();pass++;console.log("PASS",name)}catch(e){process.exitCode=1;console.error("FAIL",name,e)}}console.log(`${pass}/${tests.length} PASSED`);

