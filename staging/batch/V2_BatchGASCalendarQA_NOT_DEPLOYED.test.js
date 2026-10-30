"use strict";
/* Google Apps Script simulation ONLY; no real Google requests or writes. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"V2_BatchGASCalendarQA_NOT_DEPLOYED.gs"),"utf8");
const model=require("../AttendanceV2_TwoSheetAdapter.js");
const service=require("../AttendanceV2_CalendarAndEventService.js");
const sourceId="ISOLATED_TEST001_SOURCE_ID_20261030";
const ledgerId="SEPARATE_BATCH_QA_LEDGER_ID_20261030";
const headerCal=["日期","公司","指定打卡地點","日別","原因","核對依據","備註","確認紀錄"];
const headerYear=["年度","公司","核對狀態","確認人","確認時間"];
const headerEv=["事件單號","日期","類型","適用範圍","指定打卡地點","全日／部分",
 "給薪處理","公告或佐證","核對狀態","確認人","確認時間","核定停班分鐘數","備註"];
const user={source:"VERIFIED_SERVER_BINDING",employeeId:"TEST001",company:"TEST_CO",role:"STAFF",active:true};
function fixture(opts={}){
 const config={flag:"enabled",ledgerId,sourceId,bookName:"YC_ATTENDANCE_V2_TEST_ONLY",
  includeCalendar:true,includeEvents:true,fixtureEmployee:"TEST001",
  validHeaders:true,makeup:false,annual:true,partial:false,...opts};
 let readCount=0,writes=0;
 const employee=["TEST001","模擬員工甲","000000","U"+"a".repeat(32),"TEST_CO","QA","在職","TESTSITE"];
 employee[0]=config.fixtureEmployee;
 const annualRow=config.annual?["2026","TEST_CO","已確認","QA管理員","2026-10-29 14:00"]:[];
 const calHeader=Array(14).fill("");
 headerCal.forEach((v,i)=>calHeader[i]=i===0&&!config.validHeaders?"WRONG":v);
 headerYear.forEach((v,i)=>calHeader[9+i]=v);
 const holiday=["2026-11-11","TEST_CO","","休假","虛構休假","SYNTHETIC_TEST_ONLY","","QA|2026-10-29"];
 const calRows=[calHeader,Array(14).fill("")];
 holiday.forEach((v,i)=>calRows[1][i]=v);
 annualRow.forEach((v,i)=>calRows[1][9+i]=v);
 if(config.makeup){
  const row=Array(14).fill("");
  ["2026-11-14","TEST_CO","","上班","虛構補班","SYNTHETIC_TEST_ONLY","","QA|2026-10-29"].forEach((v,i)=>row[i]=v);
  calRows.push(row);
 }
 if(config.partial){
  const row=Array(14).fill("");row[4]="orphan";
  calRows.push(row);
 }
 const eventRows=[headerEv,["EVENT_MOCK_20261112","2026-11-12","虛構停班",
  "全公司","","全日","照常給薪","SYNTHETIC_TEST_ONLY","已確認","QA",
  "2026-10-29 14:00",480,""]];
 function sheet(rows){
  return {
   getLastRow:()=>rows.length,
   getRange:(r,c,height,width)=>({
    getDisplayValues:()=>{readCount++;return rows.slice(r-1,r-1+height)
       .map(row=>row.slice(c-1,c-1+width).map(String));},
    getValues:()=>{readCount++;return rows.slice(r-1,r-1+height)
       .map(row=>row.slice(c-1,c-1+width));}
   })
  };
 }
 const book={
  getId:()=>config.sourceId,getName:()=>config.bookName,
  getSheetByName:name=>name==="員工資料"?sheet([Array(8).fill(""),employee]):
   name==="公司工作日曆"&&config.includeCalendar?sheet(calRows):
   name==="特殊出勤事件"&&config.includeEvents?sheet(eventRows):null
 };
 const services={
  AttendanceV2TwoSheetAdapter:model,
  AttendanceV2CalendarService:service,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>({
   V2_BATCH_QA_ENABLED:config.flag,
   V2_BATCH_QA_SOURCE_BOOK_ID:config.sourceId,
   V2_BATCH_QA_BOOK_ID:config.ledgerId})[k]||""})},
  SpreadsheetApp:{openById:id=>{
    if(id!==sourceId)throw Error("SOURCE_NOT_AVAILABLE");
    return book;
  }},
  Utilities:{formatDate:()=>{throw Error("Unexpected Date object fixture");}}
 };
 const fn=new Function(...Object.keys(services),code+
  "\nreturn v2BatchCalendarQA_;")(...Object.values(services));
 return {make:fn,readCount:()=>readCount,writes:()=>writes};
}
const leave=(a,b=a,unit="DAY")=>({
 startDate:a,endDate:b,unit,fromTime:"09:00",toTime:"11:00"
});
const cases=[
 ["confirmed 2026 weekday accepted",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-10"),user,"2026-10-30");
  assert.equal(r.ok,true);assert.equal(r.workingDays,1);
 }],
 ["two consecutive approved working days accepted",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-09","2026-11-10"),user,"2026-10-30");
  assert.equal(r.ok,true);assert.equal(r.workingDays,2);
 }],
 ["known synthetic holiday blocked",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-11"),user,"2026-10-30");
  assert.equal(r.code,"NON_WORKDAY_IN_RANGE");
 }],
 ["crossing known nonworking day requires split",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-13","2026-11-16"),user,"2026-10-30");
  assert.equal(r.code,"NON_WORKDAY_IN_RANGE");
 }],
 ["confirmed synthetic disaster requires HR",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-12"),user,"2026-10-30");
  assert.equal(r.code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
 }],
 ["ordinary Saturday is blocked",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-14"),user,"2026-10-30");
  assert.equal(r.code,"NON_WORKDAY_IN_RANGE");
 }],
 ["approved Saturday makeup is accepted",()=>{
  const r=fixture({makeup:true}).make().validateLeave(leave("2026-11-14"),user,"2026-10-30");
  assert.equal(r.ok,true);
 }],
 ["missing annual check requires HR",()=>{
  const r=fixture({annual:false}).make().validateLeave(leave("2026-11-10"),user,"2026-10-30");
  assert.equal(r.code,"CALENDAR_OR_EVENT_REVIEW_REQUIRED");
 }],
 ["server verified active TEST001 required",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-10"),
   {...user,source:"CLIENT"}, "2026-10-30");
  assert.equal(r.code,"QA_CALENDAR_IDENTITY_UNVERIFIED");
 }],
 ["other employee is blocked",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-10"),
   {...user,employeeId:"TEST002"},"2026-10-30");
  assert.equal(r.code,"QA_CALENDAR_IDENTITY_UNVERIFIED");
 }],
 ["disabled QA property refuses to open calendar",()=>{
  assert.throws(()=>fixture({flag:"disabled"}).make(),/QA_CALENDAR_DISABLED/);
 }],
 ["same source and technical QA workbook is forbidden",()=>{
  assert.throws(()=>fixture({ledgerId:sourceId}).make(),/QA_CALENDAR_SOURCE_NOT_ISOLATED/);
 }],
 ["wrong workbook title rejected",()=>{
  assert.throws(()=>fixture({bookName:"PRODUCTION"}).make(),/QA_CALENDAR_WRONG_SOURCE_BOOK/);
 }],
 ["employee fixture mismatch rejected",()=>{
  assert.throws(()=>fixture({fixtureEmployee:"EMPLOYEE_REAL"}).make(),/QA_CALENDAR_EMPLOYEE_MISMATCH/);
 }],
 ["missing two test HR tables rejected",()=>{
  assert.throws(()=>fixture({includeEvents:false}).make(),/QA_CALENDAR_TEST_TABS_MISSING/);
 }],
 ["wrong calendar headers rejected",()=>{
  assert.throws(()=>fixture({validHeaders:false}).make(),/QA_CALENDAR_HEADERS_UNVERIFIED/);
 }],
 ["partial row without date key fails closed",()=>{
  assert.throws(()=>fixture({partial:true}).make(),/QA_CALENDAR_PARTIAL_ROW/);
 }],
 ["31+ days blocked before returning any approved result",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-02","2026-12-10"),user,"2026-10-30");
  assert.equal(r.code,"RANGE_TOO_LONG");
 }],
 ["hours cannot span several days",()=>{
  const r=fixture().make().validateLeave(leave("2026-11-09","2026-11-10","HOURS"),user,"2026-10-30");
  assert.equal(r.code,"HOURS_MULTI_DAY");
 }],
 ["historical leave is blocked",()=>{
  const r=fixture().make().validateLeave(leave("2026-10-29"),user,"2026-10-30");
  assert.equal(r.code,"PAST_DATE");
 }],
 ["source is free of mutations and public handlers",()=>{
  assert(!/function\s+(?:doPost|doGet)\s*\(/.test(code));
  assert(!/\.(?:setValues?|appendRow|insertSheet|clearContents)\s*\(/.test(code));
 }]
];
let passed=0;for(const [name,fn] of cases)try{fn();passed++;console.log("PASS",name)}
catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
console.log(passed+"/"+cases.length+" PASSED");
