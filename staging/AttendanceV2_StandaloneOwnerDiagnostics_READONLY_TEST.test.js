"use strict";
/* node staging/AttendanceV2_StandaloneOwnerDiagnostics_READONLY_TEST.test.js
 * Entirely in memory. No Google account, LINE token or real spreadsheet.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_StandaloneOwnerDiagnostics_READONLY_TEST.gs"),"utf8");
const expectHeaders=["申請單號","員工ID","姓名","假別","開始日期","結束日期",
 "天數/時數","原因","狀態","申請時間","審核人","審核時間"];
const expectRow=["LEAVEV2_TEST_20261110_0001","TEST001","模擬員工甲","事假",
 "2026-11-10","2026-11-10","1天","純測試：正常上班日事假",
 "待審核（測試）","SYNTHETIC_TEST_ONLY","",""];
const fakeSheetId="MOCK_TEST_BOOK_ID_NOT_REAL_2026";
const originalEmployee=["TEST001","模擬員工甲","000000","U"+"a".repeat(32),
 "TEST_CO","測試部門","在職","TESTSITE"];
function build(changes={}){
  const c={flag:"disabled",channel:"2012136707",sheetId:fakeSheetId,
    openWorks:true,bookName:"YC_ATTENDANCE_V2_TEST_ONLY",
    employee:originalEmployee.slice(),row:expectRow.slice(),headers:expectHeaders.slice(),
    leaveLastRow:2,leaveLastColumn:12,employeeLastRow:2,
    noLeaveTab:false, ...changes};
  const logs=[];let writes=0,opens=0;
  const employees={getLastRow:()=>c.employeeLastRow,
   getRange:()=>({getValues:()=>[c.employee.slice()]})};
  const leave={getLastRow:()=>c.leaveLastRow,getLastColumn:()=>c.leaveLastColumn,
   getRange:r=>r===1?{getDisplayValues:()=>[c.headers.slice()]}:
    {getValues:()=>[c.row.slice()]}};
  const ss={
    getId:()=>fakeSheetId,getName:()=>c.bookName,
    getSheetByName:name=>name==="員工資料"?employees:
     name==="V2請假寫入測試"?(c.noLeaveTab?null:leave):null
  };
  const mock={
    PropertiesService:{getScriptProperties:()=>({getProperty:name=>{
       if(name==="V2HR_READONLY_TEST_ENABLED")return c.flag;
       if(name==="LINE_LOGIN_CHANNEL_ID")return c.channel;
       if(name==="V2HR_TEST_SHEET_ID")return c.sheetId;
       return null;
    }})},
    SpreadsheetApp:{openById:id=>{opens++;if(!c.openWorks)throw Error("fake inaccessible");return ss;}},
    Logger:{log:x=>logs.push(JSON.parse(x))},
    v2hrOnlyDate_:d=>typeof d==="string"?d:d.toISOString().slice(0,10),
    v2hrOnlyDispatch_:()=>null,
    doPost:()=>null,
    V2HR_STANDALONE_ROW:expectRow,
    V2HR_STANDALONE_HEADERS:expectHeaders
  };
  const fn=new Function(...Object.keys(mock),source+
     "\nreturn v2hrAuditStandaloneOwner_TEST_ONLY;")(...Object.values(mock));
  return {run:fn,logs,opens:()=>opens,writes:()=>writes};
}
const checks=[
 ["healthy TEST001 fixture passes with feature OFF",()=>{
   const x=build(),r=x.run();assert.equal(r.ok,true);assert.equal(r.enabledFlagStillDisabled,true);
   assert.equal(r.expectedRowMatch,true);assert.equal(r.lineBindingFormatValid,true);
 }],
 ["summary never includes fake Sheet ID, linked LINE ID or mock data contents",()=>{
   const x=build();x.run();const body=JSON.stringify(x.logs);
   assert(!body.includes(fakeSheetId));assert(!body.includes("U"+"a".repeat(32)));
   assert(!body.includes("模擬員工甲"));assert(!body.includes("2026-11-10"));
 }],
 ["feature ON fails before opening any Sheet",()=>{
   const x=build({flag:"enabled"}),r=x.run();
   assert.equal(r.errorCode,"FEATURE_NOT_DISABLED");assert.equal(x.opens(),0);
 }],
 ["wrong LINE channel stops before spreadsheet access",()=>{
   const x=build({channel:"OTHER"}),r=x.run();
   assert.equal(r.errorCode,"CHANNEL_CONFIG_MISMATCH");assert.equal(x.opens(),0);
 }],
 ["missing spreadsheet ID stops before opening",()=>{
   const x=build({sheetId:""}),r=x.run();
   assert.equal(r.errorCode,"TEST_SHEET_ID_MISSING");assert.equal(x.opens(),0);
 }],
 ["inaccessible Sheet is a sanitized diagnostic error",()=>{
   const r=build({openWorks:false}).run();
   assert.equal(r.errorCode,"TEST_SHEET_CANNOT_OPEN");
   assert(!JSON.stringify(r).includes("fake inaccessible"));
 }],
 ["wrong spreadsheet name blocks before reading employee or leave",()=>{
   const r=build({bookName:"PRODUCTION"}).run();
   assert.equal(r.errorCode,"NOT_THE_ISOLATED_TEST_BOOK");
 }],
 ["wrong fixture company blocks",()=>{
   const e=originalEmployee.slice();e[4]="OTHER";
   const r=build({employee:e}).run();assert.equal(r.errorCode,"TEST_EMPLOYEE_FIXTURE_MISMATCH");
 }],
 ["unbound employee blocks and reports no LINE user ID",()=>{
   const e=originalEmployee.slice();e[3]="";
   const r=build({employee:e}).run();assert.equal(r.errorCode,"TEST_LINE_BINDING_MISSING_OR_INVALID");
 }],
 ["leave tab missing blocks",()=>{
   assert.equal(build({noLeaveTab:true}).run().errorCode,"MOCK_LEAVE_TAB_MISSING");
 }],
 ["extra leave row blocks",()=>{
   assert.equal(build({leaveLastRow:3}).run().errorCode,"MOCK_LEAVE_SHAPE_MISMATCH");
 }],
 ["altered table header blocks",()=>{
   const h=expectHeaders.slice();h[2]="bad header";
   assert.equal(build({headers:h}).run().errorCode,"MOCK_LEAVE_HEADERS_MISMATCH");
 }],
 ["mismatched mock leave value outputs column letter only",()=>{
   const row=expectRow.slice();row[8]="CHANGED STATUS";
   const result=build({row}).run();
   assert.equal(result.errorCode,"MOCK_LEAVE_CONTENT_MISMATCH");
   assert.deepEqual(result.mismatchedColumns,["I"]);
   assert(!JSON.stringify(result).includes("CHANGED STATUS"));
 }],
 ["source contains no write method, endpoint or LINE token fetch",()=>{
   assert(!/\.(?:setValues?|appendRow|insertSheet|clearContents|setProperty)\s*\(/.test(source));
   assert(!/\bfunction\s+(?:doPost|doGet)\s*\(/.test(source));
   assert(!/\b(?:UrlFetchApp|fetch)\s*\(/.test(source));
 }]
];
let passed=0;
for(const [name,fn] of checks){
 try{fn();passed++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
}
console.log(passed+"/"+checks.length+" PASSED");
