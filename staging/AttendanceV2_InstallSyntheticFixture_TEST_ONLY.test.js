"use strict";
/* Test via Node: node staging/AttendanceV2_InstallSyntheticFixture_TEST_ONLY.test.js
 * All mocks are in-memory. No real Google, Apps Script or LINE access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
class Sheet{
  constructor(name){this.name=name;this.cells=new Map();}
  getName(){return this.name;}
  setFrozenRows(n){this.frozenRows=n;}
  getLastRow(){let n=0;for(const [k,v] of this.cells)if(v!==""&&v!==null&&v!==undefined)n=Math.max(n,+k.split(",")[0]);return n;}
  getRange(row,col,h=1,w=1){const me=this;return{
    getValue:()=>me.cells.get(row+","+col)??"",
    getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>me.cells.get((row+i)+","+(col+j))??"")),
    getDisplayValues(){return this.getValues().map(r=>r.map(v=>String(v)));},
    setValues(rows){for(let i=0;i<h;i++)for(let j=0;j<w;j++)me.cells.set((row+i)+","+(col+j),rows[i][j]);return this;}
  };}
}
const b={name:"YC_ATTENDANCE_V2_TEST_ONLY",sheets:new Map(),
 getName(){return this.name;},getSheetByName(n){return this.sheets.get(n)||null;},
 insertSheet(n){if(this.sheets.has(n))throw Error("already exists");const s=new Sheet(n);this.sheets.set(n,s);return s;}};
b.insertSheet("員工資料").getRange(2,1,1,8).setValues([["TEST001","TEST NAME","","","TEST_CO","TEST","","TESTSITE"]]);
const d=b.insertSheet("打卡紀錄");d.getRange(1,1).setValues([["ORIGINAL PUNCHES"]]);
let enabled=true,locked=false,flushes=0;
const logs=[];
const env={
 v2dTestSheet_:()=>{if(!enabled)throw Error("disabled");return b;},
 v2dEmployee_:(_,id)=>({bound:id==="MOCK",employeeId:"TEST001"}),
 Utilities:{formatDate:(dt)=>dt.toISOString().slice(0,10)},
 SpreadsheetApp:{flush:()=>{flushes++;}},
 LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked)return false;locked=true;return true;},
   releaseLock:()=>{locked=false;}
 })},
 Logger:{log:x=>logs.push(x)}
};
function load(file,addition){
 const s=fs.readFileSync(path.join(__dirname,file),"utf8");
 const names=Object.keys(env),values=Object.values(env);
 return new Function(...names,s+addition)(...values);
}
const reader=load("AttendanceV2_TwoSheet_GAS_ReadOnly.gs",
 "\nreturn {v2hrGuardTestSheet_,v2hrCheckHeaders_,v2hrReadTestCalendarContext_,v2hrInstallEmptyTestTabs};");
Object.assign(env,reader);
const fixture=load("AttendanceV2_InstallSyntheticFixture_TEST_ONLY.gs",
 "\nreturn {v2hrInstallSyntheticFixture_TEST_ONLY};").v2hrInstallSyntheticFixture_TEST_ONLY;
const tests=[
 ["initialize only two empty HR sheets",()=>{
    assert.deepEqual(reader.v2hrInstallEmptyTestTabs().created,["公司工作日曆","特殊出勤事件"]);
    assert.equal(b.sheets.size,4);
 }],
 ["synthetic fixture writes only expected test rows",()=>{
    const before=d.getRange(1,1).getValue();
    const x=fixture();
    assert.equal(x.ok,true);assert.equal(x.synthetic,true);
    assert.deepEqual(x.annualYears,["2026"]);
    assert.equal(x.calendarOverrides,1);
    assert.equal(x.companyStopEvents,1);
    assert.equal(d.getRange(1,1).getValue(),before);
    assert(logs[0].includes("純模擬資料"));
 }],
 ["calendar annual metadata remains in J:N",()=>{
    const c=b.getSheetByName("公司工作日曆");
    assert.equal(c.getRange(2,10).getValue(),"2026");
    assert.equal(c.getRange(2,12).getValue(),"已確認");
    assert.equal(c.getRange(2,1).getValue(),"2026-11-11");
 }],
 ["company-wide event is synthetic only",()=>{
    const e=b.getSheetByName("特殊出勤事件");
    assert.equal(e.getRange(2,4).getValue(),"全公司");
    assert.equal(e.getRange(2,8).getValue(),"SYNTHETIC_TEST_ONLY");
    assert.equal(e.getRange(2,5).getValue(),"");
 }],
 ["second run refuses overwrite",()=>{
    assert.throws(fixture,/已有測試資料/);
 }],
 ["refuses live-looking book name",()=>{
    const old=b.name;b.name="LINE打卡系統";
    assert.throws(fixture,/非隔離資料表/);
    b.name=old;
 }],
 ["refuses disabled test guard",()=>{
    enabled=false;assert.throws(fixture,/disabled/);enabled=true;
 }],
 ["refuses fixture company mismatch",()=>{
    const emp=b.getSheetByName("員工資料");
    emp.getRange(2,5).setValues([["REAL"]]);
    assert.throws(fixture,/測試員工或公司/);
    emp.getRange(2,5).setValues([["TEST_CO"]]);
 }],
 ["never touches legacy sheet names",()=>{
    assert.equal(b.getSheetByName("工作日曆"),null);
    assert.equal(b.getSheetByName("打卡紀錄").getRange(1,1).getValue(),"ORIGINAL PUNCHES");
    assert.equal(b.getSheetByName("請假申請"),null);
 }]
];
let passed=0;
for(const [name,fn] of tests)try{fn();passed++;console.log("PASS",name);}
catch(err){console.error("FAIL",name,err.stack);process.exitCode=1;}
console.log(passed+"/"+tests.length+" PASSED");
