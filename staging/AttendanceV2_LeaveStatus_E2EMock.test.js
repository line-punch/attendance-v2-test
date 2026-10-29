"use strict";
/**
 * node staging/AttendanceV2_LeaveStatus_E2EMock.test.js
 * Offline integration with fake transport and fake TEST001:
 * UI -> scoped envelope -> LINE identity verification -> mock leave status.
 * No real LINE or Google requests, web publication, or sheet writes.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const client=require("./AttendanceV2_LeaveStatus_ClientCandidate.js");
const proposal=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.gs"),"utf8");
const router=fs.readFileSync(path.join(__dirname,"AttendanceV2_LeaveStatus_DispatchCandidate_TEST_ONLY.gs"),"utf8");
const id="LEAVEV2_TEST_20261110_0001",nonce="c".repeat(40);
const bookId="TEST_ONLY_SPREADSHEET_ID",idToken="mockjwt.syntheticclaims.not-a-real-signature";
let currentLine="MOCK-LINE",bound=true,present=true,loseReply=false,calls=0,writes=0;
const sheet={};
const book={getId:()=>bookId,getName:()=>"YC_ATTENDANCE_V2_TEST_ONLY",
  getSheetByName:()=>sheet};
const deps={
  v2hrGuardTestSheet_:()=>({...book}),
  v2dEmployee_:(_ss,sub)=>sub==="MOCK-LINE"&&bound?
    {bound:true,employeeId:"TEST001"}:{bound:false},
  v2dLineClaims_:token=>{if(token!==idToken)throw Error("BAD_LINE_CLAIMS");return currentLine;},
  V2HR_LEAVE_TEMP_REQUEST:id,
  V2HR_LEAVE_TEMP_TITLE:"V2請假寫入測試",
  v2hrLeaveTempCheckSheet_:()=>present?["MOCK"]:null
};
const dispatch=new Function(...Object.keys(deps),proposal+"\n"+router+
  "\nreturn v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_;")(...Object.values(deps));
const states=[];
let authenticated=true;
const ui=client.create({
  isAuthenticated:()=>authenticated,
  query:async ({requestId})=>{
    calls++;
    const env={nonce,operation:"leaveStatus",
      payload:JSON.stringify({idToken,requestId})};
    const reply=dispatch(env);
    // Simulate a successful server read while iframe postMessage is lost.
    if(loseReply)throw Error("iframe response timeout");
    assert.equal(reply.nonce,nonce);
    return reply.result;
  },
  onChange:state=>states.push(state)
});
const tests=[
  ["original synthetic leave is found through verified bridge",async()=>{
    const x=await ui.queryLeave(id);assert.equal(x.state,"FOUND");
    assert.equal(x.requestId,id);
  }],
  ["result pending is read only and identity is server verified",async()=>{
    assert.equal(writes,0);assert.equal(ui.getState().state,"FOUND");
  }],
  ["missing row must not imply submission failed",async()=>{
    present=false;const x=await ui.queryLeave(id);
    assert.equal(x.state,"NOT_FOUND_YET");
    present=true;
  }],
  ["lost server response gives UNKNOWN without a re-send",async()=>{
    loseReply=true;const before=calls;
    const x=await ui.queryLeave(id);
    assert.equal(x.state,"UNKNOWN");assert.equal(calls,before+1);
    assert.equal(writes,0);
    loseReply=false;
  }],
  ["later query of same request finds original record",async()=>{
    const x=await ui.queryLeave(id);assert.equal(x.state,"FOUND");
  }],
  ["unbound identity rejected rather than showing data",async()=>{
    bound=false;const x=await ui.queryLeave(id);
    assert.equal(x.state,"UNKNOWN");bound=true;
  }],
  ["wrong verified LINE user rejected",async()=>{
    currentLine="OTHER-LINE";
    const x=await ui.queryLeave(id);assert.equal(x.state,"UNKNOWN");
    currentLine="MOCK-LINE";
  }],
  ["client cannot send arbitrary request IDs",async()=>{
    const before=calls;
    const x=await ui.queryLeave("LEAVEV2_TEST_20261110_OTHER");
    assert.equal(x.state,"UNKNOWN");
    assert.equal(calls,before+1);
  }],
  ["unauthenticated UI blocks any backend operation",async()=>{
    authenticated=false;const before=calls;
    const x=await ui.queryLeave(id);
    assert.equal(x.state,"AUTH_REQUIRED");
    assert.equal(calls,before);authenticated=true;
  }],
  ["frontend and backend have no deployed entrypoint or writes",async()=>{
    for(const c of [proposal,router]){
      assert(!/\bfunction\s+(?:doGet|doPost)\s*\(/.test(c));
      assert(!/\.(?:setValues|setValue|appendRow|insertSheet|clearContents)\s*\(/.test(c));
    }
    assert.equal(writes,0);
  }]
];
(async()=>{
 let passed=0;
 for(const [label,test] of tests){
   try{await test();passed++;console.log("PASS",label);}
   catch(err){console.error("FAIL",label,err.stack);process.exitCode=1;}
 }
 console.log(passed+"/"+tests.length+" PASSED");
})();
