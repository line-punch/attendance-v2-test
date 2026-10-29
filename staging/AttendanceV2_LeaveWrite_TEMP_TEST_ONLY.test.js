"use strict";
/** Run: node staging/AttendanceV2_LeaveWrite_TEMP_TEST_ONLY.test.js
 * In-memory tests only. No Google or LINE calls, no real employee data.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveWrite_TEMP_TEST_ONLY.gs"),"utf8");
class Sheet{
  constructor(name){this.name=name;this.values=new Map();this.frozen=0;}
  getName(){return this.name;}
  getLastRow(){return [...this.values].reduce((n,[k,v])=>v!==""&&v!==undefined&&v!==null?Math.max(n,Number(k.split(",")[0])):n,0);}
  getLastColumn(){return [...this.values].reduce((n,[k,v])=>v!==""&&v!==undefined&&v!==null?Math.max(n,Number(k.split(",")[1])):n,0);}
  getRange(row,col,rows=1,cols=1){
    const sheet=this;return {
      getValue:()=>sheet.values.get(row+","+col)??"",
      getValues:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>sheet.values.get((row+i)+","+(col+j))??"")),
      getDisplayValues(){return this.getValues().map(r=>r.map(v=>String(v)));},
      setValues(x){for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)sheet.values.set((row+i)+","+(col+j),x[i][j]);return this;}
    };
  }
  setFrozenRows(n){this.frozen=n;}
}
const book={name:"YC_ATTENDANCE_V2_TEST_ONLY",sheets:new Map(),getName(){return this.name;},
  getSheetByName(n){return this.sheets.get(n)||null;},
  insertSheet(n){if(this.sheets.has(n))throw Error("exists");const s=new Sheet(n);this.sheets.set(n,s);return s;}};
const existing=book.insertSheet("打卡紀錄");
existing.getRange(1,1).setValues([["ORIGINAL PUNCH"]]);
const originalLeave=book.insertSheet("請假申請");
originalLeave.getRange(1,1).setValues([["ORIGINAL LEAVE"]]);
let enabled=true,approved=true,dateValid=true,locked=false,tryLockAllowed=true,writes=0;
const logs=[];
const ctx={employee:{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"}};
const environment={
  v2hrGuardTestSheet_:()=>{
    if(!enabled)throw Error("Guard blocked");
    return book;
  },
  v2hrVerifySyntheticRules_TEST_ONLY:()=>({
    ok:approved,synthetic:true,readOnly:true,checksPassed:6
  }),
  v2hrReadTestCalendarContext_:()=>ctx,
  v2hrValidateSyntheticLeaveRequest_:()=>({
    ok:dateValid,code:dateValid?"DATE_RULES_PASSED":"NON_WORKDAY_IN_RANGE"
  }),
  Utilities:{formatDate:v=>v.toISOString().slice(0,10)},
  LockService:{getScriptLock:()=>({
    tryLock:()=>{if(!tryLockAllowed||locked)return false;locked=true;return true;},
    releaseLock:()=>{locked=false;}
  })},
  SpreadsheetApp:{flush:()=>{}},
  Logger:{log:v=>logs.push(JSON.parse(v))}
};
const api=new Function(...Object.keys(environment),source+
 "\nreturn {run:v2hrRunSyntheticLeaveWrite_TEST_ONLY,read:v2hrReadSyntheticLeaveStatus_TEST_ONLY};"
)(...Object.values(environment));
function sheet(){return book.getSheetByName("V2請假寫入測試");}
const tests=[
 ["read-only status before write says absent and creates nothing",()=>{
   const x=api.read();assert.equal(x.present,false);
   assert.equal(sheet(),null);
 }],
 ["initial operation writes exactly one mock leave to temporary tab",()=>{
   const x=api.run();assert.equal(x.ok,true);assert.equal(x.alreadySubmitted,false);assert.equal(x.writeCount,1);
   assert.equal(sheet().getLastRow(),2);assert.equal(sheet().getLastColumn(),12);
   assert.equal(sheet().getRange(2,1).getValue(),"LEAVEV2_TEST_20261110_0001");
 }],
 ["read-only status verifies already written",()=>{
   const before=[...sheet().values];const x=api.read();
   assert.equal(x.present,true);assert.deepEqual([...sheet().values],before);
 }],
 ["repeat same fixed request is idempotent",()=>{
   const before=[...sheet().values],x=api.run();
   assert.equal(x.alreadySubmitted,true);assert.equal(x.writeCount,0);
   assert.deepEqual([...sheet().values],before);
 }],
 ["original punches and original leave are unchanged",()=>{
   assert.equal(existing.getRange(1,1).getValue(),"ORIGINAL PUNCH");
   assert.equal(originalLeave.getRange(1,1).getValue(),"ORIGINAL LEAVE");
 }],
 ["wrong reused request data cannot be overwritten",()=>{
   sheet().getRange(2,8).setValues([["WRONG"]]);
   assert.throws(()=>api.run(),/不同內容/);
   assert.equal(sheet().getRange(2,8).getValue(),"WRONG");
   sheet().getRange(2,8).setValues([["純測試：正常上班日事假"]]);
 }],
 ["extra row rejects accidental multi-application writes",()=>{
   sheet().getRange(3,1).setValues([["NOT OUR TEST"]]);
   assert.throws(()=>api.run(),/額外資料/);
   sheet().getRange(3,1).setValues([[""]]);
 }],
 ["extra column rejects unexpected state",()=>{
   sheet().getRange(1,13).setValues([["EXTRA"]]);
   assert.throws(()=>api.run(),/額外欄位/);
   sheet().getRange(1,13).setValues([[""]]);
 }],
 ["changed header rejects",()=>{
   sheet().getRange(1,1).setValues([["WRONG"]]);
   assert.throws(()=>api.run(),/標題不符/);
   sheet().getRange(1,1).setValues([["申請單號"]]);
 }],
 ["unavailable lock does not submit",()=>{
   tryLockAllowed=false;assert.throws(()=>api.run(),/鎖定失敗/);
   tryLockAllowed=true;
 }],
 ["test environment guard refuses before write",()=>{
   enabled=false;assert.throws(()=>api.run(),/Guard blocked/);
   assert.throws(()=>api.read(),/Guard blocked/);
   enabled=true;
 }],
 ["unconfirmed fixture refuses any submission",()=>{
   approved=false;assert.throws(()=>api.run(),/SYNTHETIC_FIXTURE/);
   approved=true;
 }],
 ["calendar validation failure refuses any submission",()=>{
   dateValid=false;assert.throws(()=>api.run(),/LEAVE_CALENDAR_NOT_VALIDATED/);
   dateValid=true;
 }],
 ["no public endpoint or legacy Sheet writes exist in source",()=>{
   assert(!/\bfunction\s+(?:doGet|doPost)\s*\(/.test(source));
   assert(!/getSheetByName\s*\(\s*["'](?:請假申請|打卡紀錄)["']\s*\)/.test(source));
   assert(!/UrlFetchApp|pushMessage|replyMessage/.test(source));
 }],
 ["only one test submission log exists after idempotent repeat",()=>{
   assert.equal(logs.filter(x=>x.writeCount===1).length,1);
   assert.equal(logs.filter(x=>x.writeCount===0).length,1);
 }]
];
let passed=0;
for(const [title,fn] of tests){
 try{fn();passed++;console.log("PASS",title);}
 catch(error){console.error("FAIL",title,error.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
