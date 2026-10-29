"use strict";
/**
 * Node-compatible isolated mocks. This tests the GAS fragment WITHOUT
 * accessing Apps Script, Google Sheets, LINE or the public internet.
 * Run: node staging/AttendanceV2_TwoSheet_GAS_ReadOnly.test.js
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"AttendanceV2_TwoSheet_GAS_ReadOnly.gs"),"utf8");
class MockSheet{
  constructor(name){this.name=name;this.cells=new Map();this.frozen=0;}
  getName(){return this.name;}
  getLastRow(){
    let max=0;
    for(const [key,v] of this.cells.entries())if(v!==""&&v!==null&&v!==undefined)
      max=Math.max(max,Number(key.split(",")[0]));
    return max;
  }
  getRange(row,col,numRows=1,numCols=1){
    const self=this;
    return {
      getValue(){return self.cells.get(row+","+col)??"";},
      getValues(){
        return Array.from({length:numRows},(_,i)=>Array.from({length:numCols},(_,j)=>
          self.cells.get((row+i)+","+(col+j))??""));
      },
      getDisplayValues(){return this.getValues().map(r=>r.map(v=>String(v)));},
      setValues(rows){
        for(let i=0;i<numRows;i++)for(let j=0;j<numCols;j++)
          self.cells.set((row+i)+","+(col+j),rows[i][j]);
        return this;
      }
    };
  }
  setFrozenRows(n){this.frozen=n;}
}
class MockBook{
  constructor(name){this.name=name;this.sheets=new Map();this.add("員工資料");
    const e=this.getSheetByName("員工資料");
    e.getRange(2,1,1,8).setValues([["TEST001","TEST NAME","","","TEST_CO","TEST","","TESTSITE"]]);
  }
  add(name){const s=new MockSheet(name);this.sheets.set(name,s);return s;}
  getSheetByName(name){return this.sheets.get(name)||null;}
  insertSheet(name){if(this.sheets.has(name))throw Error("already exists");return this.add(name);}
  getName(){return this.name;}
}
const book=new MockBook("YC_ATTENDANCE_V2_TEST_ONLY");
let testEnabled=true;
let authorized=true;
let writeCount=0;
const props={
  v2dTestSheet_:()=>{if(!testEnabled)throw Error("test disabled");return book;},
  v2dEmployee_:(_,id)=>({bound:id==="MOCK-LINE",employeeId:"TEST001"}),
  Utilities:{formatDate:(d,tz,fmt)=>{
    assert.equal(tz,"Asia/Taipei");
    if(!(d instanceof Date))throw Error("Not date");
    return d.toISOString().slice(0,10);
  }},
  SpreadsheetApp:{flush:()=>{}}
};
const named=Object.keys(props),values=Object.values(props);
const app=new Function(...named,source+
  "\nreturn {v2hrInstallEmptyTestTabs,v2hrReadTestCalendarContext_,v2hrReadVerifiedTestSnapshot_,v2hrGuardTestSheet_};"
)(...values);
const tests=[
 ["owner install creates precisely 2 new tabs",()=>{
   const x=app.v2hrInstallEmptyTestTabs();
   assert.deepEqual(x.created,["公司工作日曆","特殊出勤事件"]);
   assert.equal(book.getSheetByName("工作日曆"),null);
   assert.equal(book.sheets.size,3);
 }],
 ["setup is idempotent and never clears existing data",()=>{
   const x=app.v2hrInstallEmptyTestTabs();
   assert.deepEqual(x.created,[]);
   assert.equal(book.getSheetByName("員工資料").getRange(2,1).getValue(),"TEST001");
 }],
 ["empty new calendar has zero approvals, not auto approved",()=>{
   const x=app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE");
   assert.deepEqual(x.annualYears,[]);
   assert.equal(x.reviewedEventCount,0);
 }],
 ["missing verified identity denied",()=>{
   assert.throws(()=>app.v2hrReadVerifiedTestSnapshot_("OTHER"),/沒有已綁定/);
 }],
 ["disabled sandbox refuses setup or reads",()=>{
   testEnabled=false;
   assert.throws(()=>app.v2hrInstallEmptyTestTabs(),/test disabled/);
   assert.throws(()=>app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE"),/test disabled/);
   testEnabled=true;
 }],
 ["non-sandbox book name blocked",()=>{
   const old=book.name;book.name="打卡系統";
   assert.throws(()=>app.v2hrInstallEmptyTestTabs(),/非隔離/);
   book.name=old;
 }],
 ["company fixture mismatch blocked",()=>{
   const employee=book.getSheetByName("員工資料");
   employee.getRange(2,5).setValues([["REAL_COMPANY"]]);
   assert.throws(()=>app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE"),/測試員工或公司/);
   employee.getRange(2,5).setValues([["TEST_CO"]]);
 }],
 ["calendar year check read from J:N",()=>{
   const c=book.getSheetByName("公司工作日曆");
   c.getRange(2,10,1,5).setValues([["2026","TEST_CO","已確認","MOCK-HR","2026-10-29"]]);
   const x=app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE");
   assert.deepEqual(x.annualYears,["2026"]);
 }],
 ["date override and event mapped without personal ids",()=>{
   const c=book.getSheetByName("公司工作日曆");
   c.getRange(2,1,1,8).setValues([["2026/11/02","TEST_CO","","休假","MOCK DAY","MOCK REF","",
     "MOCK-HR|2026-10-29"]]);
   const e=book.getSheetByName("特殊出勤事件");
   e.getRange(2,1,1,13).setValues([["E-MOCK","2026/11/03","颱風","全公司","","全日",
     "照常給薪","MOCK NOTICE","已確認","MOCK-HR","2026-10-29","",""]]);
   const x=app.v2hrReadTestCalendarContext_(book,{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"});
   assert.equal(x.calendarOverrides[0].dayType,"OFF");
   assert.equal(x.events[0].scope,"ALL");
   assert.equal(x.events[0].payPolicy,"PAID");
   assert(!("employeeIds" in x.events[0]));
 }],
 ["annual J:N settings still read with many A:H holiday rows",()=>{
   const c=book.getSheetByName("公司工作日曆");
   for(let i=3;i<=36;i++){
     const day=new Date(Date.UTC(2026,0,i));
     const date=day.toISOString().slice(0,10);
     c.getRange(i,1,1,8).setValues([
       [date,"TEST_CO","","休假","MOCK","MOCK","","MOCK-HR|2026-10-29"]
     ]);
   }
   const x=app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE");
   assert.deepEqual(x.annualYears,["2026"]);
   assert.equal(x.holidayOverrideCount,35);
 }],
 ["partially populated annual row fails closed",()=>{
   const c=book.getSheetByName("公司工作日曆");
   c.getRange(3,11).setValues([["TEST_CO"]]);
   assert.throws(()=>app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE"),/缺少主鍵/);
   c.getRange(3,11).setValues([[""]]);
 }],
 ["old personal target in company event not accepted",()=>{
   const e=book.getSheetByName("特殊出勤事件");
   e.getRange(2,5).setValues([["TEST002"]]);
   const x=app.v2hrReadTestCalendarContext_(book,{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"});
   assert.equal(x.events[0].scope,"UNKNOWN");
   e.getRange(2,5).setValues([[""]]);
 }],
 ["bad existing headers abort before modifying anything",()=>{
   const e=book.getSheetByName("特殊出勤事件");
   e.getRange(1,1).setValues([["UNEXPECTED"]]);
   const oldCount=book.sheets.size;
   assert.throws(()=>app.v2hrInstallEmptyTestTabs(),/欄位/);
   assert.equal(book.sheets.size,oldCount);
   e.getRange(1,1).setValues([["事件單號"]]);
 }],
 ["read-only context does not insert or modify rows",()=>{
   const before=JSON.stringify([...book.sheets.values()].map(s=>[s.getName(),[...s.cells.entries()]]));
   const x=app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE");
   assert.equal(x.ok,true);
   const after=JSON.stringify([...book.sheets.values()].map(s=>[s.getName(),[...s.cells.entries()]]));
   assert.equal(before,after);
 }],
 ["missing tabs return explicit error, never populate",()=>{
   const e=book.sheets.get("特殊出勤事件");
   book.sheets.delete("特殊出勤事件");
   assert.throws(()=>app.v2hrReadVerifiedTestSnapshot_("MOCK-LINE"),/請先建立/);
   book.sheets.set("特殊出勤事件",e);
 }]
];
let passed=0;
for(const [name,fn] of tests) {
 try{fn();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
