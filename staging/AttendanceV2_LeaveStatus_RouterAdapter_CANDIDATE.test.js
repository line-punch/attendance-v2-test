"use strict";
/* Run: node staging/AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.test.js
 * In-memory only. No deployed GAS, Google Sheet or LINE requests.
 * The 5-operation legacy dispatch fixture below mirrors the operation
 * routing from line-punch/line-punch feature/v2-gps-boundary-regression-20261022
 * AttendanceV2_SandboxDataService.gs, source blob SHA
 * 784b1ad143f38f9622f8b6a086d7b8a00b3d9247.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.gs"),"utf8");
let oldCalls=[],newCalls=[],tokenChecks=0;
const services={
  v2dTestSheet_:()=>({name:"YC_ATTENDANCE_V2_TEST_ONLY"}),
  v2dLineClaims_:token=>{tokenChecks++;if(token!=="SYNTHETIC_ID_TOKEN")throw Error("DENIED");return "MOCK_LINE"},
  v2dWhoami_:(_ss,_uid)=>({op:"whoami",verified:true}),
  v2dBind_:(_ss,_uid,data)=>({op:"bind",invite:data.invitationCode}),
  v2dClock_:(_ss,_uid,data,status)=>({op:status?"clockStatus":"clock",type:data.type}),
  v2dTodayAttendance_:()=>({op:"todayAttendance",total:2})
};
// Mirror the original route contract (unchanged 5 operations).
function v2dDispatch_(params) {
  oldCalls.push(params.operation);
  const ss=services.v2dTestSheet_();
  if(!params || typeof params!=="object")throw Error("Invalid request");
  const nonce=String(params.nonce||"");
  if(!/^[0-9a-f]{40}$/.test(nonce))throw Error("Invalid nonce");
  const operation=String(params.operation||"");
  if(!["whoami","bind","clock","clockStatus","todayAttendance"].includes(operation))
    throw Error("Unknown original operation");
  const raw=String(params.payload||"");
  if(raw.length<30||raw.length>12000)throw Error("Invalid payload");
  let data;
  try{data=JSON.parse(raw)}catch(_){throw Error("Invalid JSON")}
  if(!data||Array.isArray(data)||typeof data!=="object"||typeof data.idToken!=="string")
    throw Error("Missing LINE login");
  const lineUserId=services.v2dLineClaims_(data.idToken);
  if(operation==="whoami")return {nonce,result:services.v2dWhoami_(ss,lineUserId)};
  if(operation==="todayAttendance")return {nonce,result:services.v2dTodayAttendance_(ss,lineUserId)};
  if(operation==="bind")return {nonce,result:services.v2dBind_(ss,lineUserId,data)};
  if(operation==="clock")return {nonce,result:services.v2dClock_(ss,lineUserId,data,false)};
  return {nonce,result:services.v2dClock_(ss,lineUserId,data,true)};
}
const route=new Function("v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_",src+
  "\nreturn v2hrRouteTestOnly_;")(
    params=>{newCalls.push(params.operation);return {nonce:params.nonce,
      result:{ok:true,found:true,synthetic:true,readOnly:true}};}
  );
const nonce="f".repeat(40);
const msg=(operation,extra={})=>({nonce,operation,
  payload:JSON.stringify({idToken:"SYNTHETIC_ID_TOKEN",
    invitationCode:"TEST_INVITE",type:"上班",requestId:"MOCK_ID",note:"LONG_ENOUGH_FOR_VALID_PAYLOAD"}),...extra});
const testCases=[
  ...["whoami","bind","clock","clockStatus","todayAttendance"].map(op=>[
    "legacy "+op+" route unchanged",()=>{
      const before=newCalls.length,expected=v2dDispatch_(msg(op));
      const got=route(msg(op),v2dDispatch_);
      assert.deepEqual(got,expected);
      assert.equal(newCalls.length,before);
      assert.equal(got.result.op,op);
    }
  ]),
  ["read-only leaveStatus routes only to new candidate",()=>{
    const before=oldCalls.length;
    const x=route(msg("leaveStatus"),v2dDispatch_);
    assert.equal(x.result.found,true);
    assert.equal(x.result.readOnly,true);
    assert.equal(oldCalls.length,before);
  }],
  ["unknown operation still rejected by original legacy whitelist",()=>{
    assert.throws(()=>route(msg("deleteAll"),v2dDispatch_),/Unknown original operation/);
  }],
  ["existing bad GPS caller nonce still rejected",()=>{
    assert.throws(()=>route(msg("clock",{nonce:"BAD"}),v2dDispatch_),/Invalid nonce/);
  }],
  ["original LINE validation still used for legacy operations",()=>{
    const before=tokenChecks;
    const bad=msg("whoami");bad.payload=JSON.stringify({idToken:"INVALID_TOKEN",note:"X".repeat(40)});
    assert.throws(()=>route(bad,v2dDispatch_),/DENIED/);
    assert.equal(tokenChecks,before+1);
  }],
  ["new route does not alter legacy failure format",()=>{
    assert.throws(()=>route(msg("clock",{payload:"{"}),v2dDispatch_),/Invalid payload/);
  }],
  ["missing legacy dispatch cannot silently be bypassed",()=>{
    assert.throws(()=>route(msg("whoami"),null),/找不到原/);
  }],
  ["candidate cannot add a second doPost or doGet",()=>{
    assert(!/\bfunction\s+(?:doPost|doGet|v2dDispatch_)\s*\(/.test(src));
  }],
  ["candidate has no writes or LINE push",()=>{
    assert(!/\.(?:setValues|setValue|appendRow|clearContents|insertSheet)\s*\(/.test(src));
    assert(!/\b(?:UrlFetchApp|pushMessage|replyMessage)\b/.test(src));
  }]
];
let passed=0;
for(const [name,fn] of testCases){
 try{fn();passed++;console.log("PASS",name);}
 catch(err){console.error("FAIL",name,err.stack);process.exitCode=1;}
}
console.log(passed+"/"+testCases.length+" PASSED");
