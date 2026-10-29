"use strict";
/* node staging/AttendanceV2_EditorRoutingPreflight_TEST_ONLY.test.js
 * All tests are in-memory. Never reads real Apps Script or Google data.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"AttendanceV2_EditorRoutingPreflight_TEST_ONLY.gs"),"utf8");
let count=0;
function build(options={}){
  let logs=[],writes=0;
  let properties={...options.properties};
  let book={getName:()=>options.sheetName||"YC_ATTENDANCE_V2_TEST_ONLY"};
  const ops=options.oldOperations||["whoami","bind","clock","clockStatus","todayAttendance"];
  const dispatch=options.dispatch||new Function(
    "return function v2dDispatch_(params){"+JSON.stringify(ops)+
    ";return params;}")();
  const post=options.post||function doPost(event) {
    return v2dResponse_(v2dDispatch_(event));
  };
  const test=new Function("v2hrGuardTestSheet_","v2dDispatch_",
    "doPost","v2dLineClaims_","v2dResponse_","v2dPublicFailure_",
    "PropertiesService","Logger",
    source+"\nreturn v2hrInspectTestRouting_TEST_ONLY;")(
    ()=>{if(options.guardFails)throw Error("not TEST001");return book;},
    dispatch,post,options.noLineClaims?null:function v2dLineClaims_(){},
    function v2dResponse_(){},function v2dPublicFailure_(){},
    {getScriptProperties:()=>({getProperty:key=>properties[key]||null})},
    {log:x=>logs.push(JSON.parse(x))}
  );
  return {test,logs,mutations:()=>writes,properties};
}
const tests=[
 ["safe editor source and test guard passes",()=>{
    const x=build(),r=x.test();
    assert.equal(r.ok,true);assert.equal(r.readOnly,true);
    assert.equal(r.deployedRevisionVerified,false);
    assert.equal(r.existingOperations.length,5);
 }],
 ["all five operations present",()=>{
   assert.deepEqual(build().test().existingOperations,
    ["whoami","bind","clock","clockStatus","todayAttendance"]);
 }],
 ["owner gets a sanitized log only",()=>{
    const x=build();x.test();
    assert.equal(x.logs.length,1);
    assert.equal(x.logs[0].editorSourceChecked,true);
    assert(!JSON.stringify(x.logs).includes("script.google.com/macros"));
 }],
 ["TEST001 guard refuses incorrect environment",()=>{
    assert.throws(()=>build({guardFails:true}).test(),/not TEST001/);
 }],
 ["correct TEST001 sheet name mandatory",()=>{
    assert.throws(()=>build({sheetName:"LINE打卡系統"}).test(),/不是指定/);
 }],
 ["existing leaveStatus route prevents adding duplicate",()=>{
    const ops=["whoami","bind","clock","clockStatus","todayAttendance","leaveStatus"];
    assert.throws(()=>build({oldOperations:ops}).test(),/已有假單/);
 }],
 ["missing original today query blocks",()=>{
    const ops=["whoami","bind","clock","clockStatus"];
    assert.throws(()=>build({oldOperations:ops}).test(),/缺少既有功能/);
 }],
 ["missing LINE claims function blocks",()=>{
    assert.throws(()=>build({noLineClaims:true}).test(),/函式不完整/);
 }],
 ["missing original post routing blocks",()=>{
    const post=function doPost(){return {data:"different"}};
    assert.throws(()=>build({post}).test(),/doPost 路由/);
 }],
 ["leaveStatus flag enabled prevents proceeding",()=>{
    assert.throws(()=>build({properties:{"ATTENDANCE_V2_LEAVE_QUERY_TEST":"enabled"}}).test(),/開關已開啟/);
 }],
 ["normal disabled or absent flag accepted",()=>{
    assert.equal(build({properties:{"ATTENDANCE_V2_LEAVE_QUERY_TEST":"disabled"}}).test().ok,true);
 }],
 ["script contains no spreadsheet writes or LINE requests",()=>{
   assert(!/\.(?:setValue|setValues|appendRow|insertSheet|clearContents|deleteRow)\s*\(/.test(source));
   assert(!/\b(?:UrlFetchApp|doGet|pushMessage|replyMessage)\b/.test(source));
 }],
 ["source returns deployedRevisionVerified false explicitly",()=>{
    const r=build().test();
    assert.equal(r.deployedRevisionVerified,false);
 }],
 ["preflight does not change any script property",()=>{
   const x=build(),before={...x.properties};x.test();
   assert.deepEqual(x.properties,before);
 }]
];
let passed=0;
for(const [label,fn] of tests){
 try{fn();passed++;console.log("PASS",label);}
 catch(err){console.error("FAIL",label,err.stack);process.exitCode=1;}
}
console.log(passed+"/"+tests.length+" PASSED");
