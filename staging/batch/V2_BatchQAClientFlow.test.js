"use strict";
/* Offline fake LIFF/DOM. No real network, Google, LINE or write requests. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const client=fs.readFileSync(path.join(__dirname,"qa-client/app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"qa-client/index.html"),"utf8");
const TOKEN="QA_FAKE_LINE_ID_TOKEN_NEVER_REAL";
function make(options={}){
 const params={login:true,origin:"https://script.googleusercontent.com",...options};
 let events=new Map(),posts=[],results=[],pendingResponses=[],timerCalls=0;
 let stored=options.stored||new Map();
 function elem(id){
  return {id,value:"",checked:false,disabled:false,textContent:"",
   listeners:{},children:[],style:{},name:"",
   appendChild(x){this.children.push(x)},
   addEventListener(type,fn){this.listeners[type]=fn},
   remove(){},
   submit(){
    const fields=Object.fromEntries(this.children.map(x=>[x.name,x.value]));
    posts.push(fields);
    const deliver=()=>{
     const data=results.length?results.shift():{ok:true,result:{ok:true,readOnly:true}};
     const event={origin:params.origin,data:{
       bridge:"YC_V2_BATCH_QA_V1",nonce:fields.nonce,...data
     }};
     for(const fn of events.get("message")||[])fn(event);
    };
    if(params.defer)pendingResponses.push(deliver);else Promise.resolve().then(deliver);
   },
   attributes:{},setAttribute(key,value){this.attributes[key]=value;}
  };
 }
 const ids=["login","identity","endpoint","confirmed","start","end","leaveType",
 "unit","fromTime","toTime","reason","requestId","newId","preview","leaveStatus",
 "submitLeave","missingDate","missingTime","missingType","missingReason",
 "submitMissing","missingStatus","month","myLeaves","hrPending","hrRequestId",
 "hrApprove","hrReject","hrStatus","writeConsent","result","myMissing","missingHistory","leaveHistory",
 "currentLeaves","navClock","navLeave","navMissing","navHr","pageClock","pageLeave","pageMissing","pageHr",
 "clockIn","clockOut","clockStatus","myClocks","clockHistory","feedback"];
 const dom=Object.fromEntries(ids.map(x=>[x,elem(x)]));
 Object.assign(dom.endpoint,{value:"https://script.google.com/macros/s/QA_WEBAPP_TEST/exec"});
 Object.assign(dom.start,{value:"2026-11-09"});
 Object.assign(dom.end,{value:"2026-11-10"});
 Object.assign(dom.leaveType,{value:"事假"});
 Object.assign(dom.unit,{value:"DAY"});
 Object.assign(dom.fromTime,{value:"09:00"});
 Object.assign(dom.toTime,{value:"11:00"});
 Object.assign(dom.reason,{value:"合成原因"});
 Object.assign(dom.missingDate,{value:"2026-10-30"});
 Object.assign(dom.missingTime,{value:"08:30"});
 Object.assign(dom.missingType,{value:"上班"});
 Object.assign(dom.missingReason,{value:"合成補打卡"});
 dom.month.value="2026-10";
 dom.confirmed.checked=true;
 dom.writeConsent.checked=true;
 const doc={
  getElementById:id=>{if(!dom[id])throw Error("missing "+id);return dom[id]},
  querySelectorAll:()=>ids.filter(id=>["login","newId","preview","leaveStatus",
   "submitLeave","submitMissing","missingStatus","myLeaves","hrPending",
   "hrApprove","hrReject","hrStatus","clockIn","clockOut","clockStatus","myClocks",
   "currentLeaves","myMissing","navClock","navLeave","navMissing","navHr"].includes(id)).map(id=>dom[id]),
  createElement:tag=>elem(tag),
  body:{appendChild(){}}
 };
 const win={V2_QA_LIFF_ID:options.liffId??"2012136707-QAOFFLINETEST",crypto:{getRandomValues:arr=>{for(let i=0;i<arr.length;i++)arr[i]=i+1;return arr}},
  addEventListener:(ev,fn)=>{events.set(ev,[...(events.get(ev)||[]),fn])},
  removeEventListener:(ev,fn)=>{events.set(ev,(events.get(ev)||[]).filter(f=>f!==fn))}};
 const liff={init:async()=>{},isLoggedIn:()=>params.login,
  getIDToken:()=>params.login?TOKEN:null,login(){}};
 const URLMock=class{
  constructor(text){
   const m=/^(https?):\/\/([^/]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/.exec(text);
   if(!m)throw Error("URL_BAD");
   this.protocol=m[1]+":";this.hostname=m[2];this.pathname=m[3]||"/";
   this.username="";this.password="";this.search=m[4]||"";this.hash=m[5]||"";
   this.href=text;
  }
 };
 new Function("document","window","liff","sessionStorage","setTimeout",
   "clearTimeout","URL","navigator",client)(doc,win,liff,{
    getItem:k=>stored.get(k)||"",
    setItem:(k,v)=>stored.set(k,v)
   },()=>++timerCalls,()=>{},URLMock,{geolocation:{getCurrentPosition:(ok,fail)=>{
    if(options.gpsFailure)fail({code:1});else ok({coords:{latitude:25,longitude:121,accuracy:10}});
   }}});
 async function click(id){
  const fn=dom[id].listeners.click;if(!fn)throw Error("missing click "+id);
  const returned=fn();if(returned&&typeof returned.then==="function")await returned;
  await Promise.resolve();await Promise.resolve();
 }
 return {click,dom,posts,results,stored,params,events,release:()=>pendingResponses.shift()(),
  authReady:async()=>{await Promise.resolve();await Promise.resolve()}};
}
const tests=[
 ["all actions show busy feedback, block double clicks and restore their labels",async()=>{
  const x=make({defer:true});await x.authReady();await x.click("newId");x.dom.preview.textContent="日期預檢";
  const first=x.click("preview");await Promise.resolve();
  assert.equal(x.dom.preview.textContent,"處理中…");assert.equal(x.dom.preview.attributes["aria-busy"],"true");
  assert.equal(x.dom.login.disabled,true);assert.equal(x.dom.submitLeave.disabled,true);
  assert.equal(x.dom.feedback.attributes["data-phase"],"busy");
  await x.click("preview");assert.equal(x.posts.length,1);
  x.release();await first;
  assert.equal(x.dom.preview.textContent,"日期預檢");assert.equal(x.dom.preview.attributes["aria-busy"],"false");
  assert.equal(x.dom.preview.disabled,false);assert.equal(x.dom.feedback.attributes["data-phase"],"success");
 }],
 ["unknown write disables new writes while original readback stays available and unlocks them",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("submitLeave");
  assert.equal(x.dom.submitLeave.disabled,true);assert.equal(x.dom.clockOut.disabled,true);
  assert.equal(x.dom.leaveStatus.disabled,false);assert.equal(x.dom.feedback.attributes["data-phase"],"unknown");
  x.results.push({ok:true,result:{request:{requestId:x.dom.requestId.value,status:"PENDING"}}});
  await x.click("leaveStatus");assert.equal(x.dom.submitLeave.disabled,false);assert.equal(x.dom.clockOut.disabled,false);
 }],
 ["empty normal month shows a clear empty message without generating dates",async()=>{
  const x=make();await x.authReady();x.results.push({ok:true,result:{month:"2026-10",days:[]}});
  await x.click("myClocks");assert.equal(x.dom.clockHistory.children.length,1);
  assert.equal(x.dom.clockHistory.children[0].children[0].textContent,"本月尚無正常打卡紀錄。");
 }],
 ["normal month shows sorted data dates only, including a clock-out-only date",async()=>{
  const x=make();await x.authReady();x.results.push({ok:true,result:{month:"2026-10",days:[
   {date:"2026-10-30",clockIn:"18:14:47",clockOut:"18:28:13"},
   {date:"2026-10-31",clockIn:"",clockOut:""},
   {date:"2026-10-02",clockIn:"",clockOut:"17:30:00"}
  ]}});await x.click("myClocks");const rows=x.dom.clockHistory.children;
  assert.equal(rows.length,2);assert.deepEqual(rows[0].children.map(c=>c.textContent),["2026-10-02","","17:30:00"]);
  assert.deepEqual(rows[1].children.map(c=>c.textContent),["2026-10-30","18:14:47","18:28:13"]);
 }],
 ["confirmed duplicate GPS rejection explains existing attendance and releases pending lock",async()=>{
  const x=make();await x.authReady();x.results.push({ok:false,code:"REJECTED",reason:"ALREADY_CLOCKED",persisted:false});
  await x.click("clockIn");assert(x.dom.result.textContent.includes("今天已有同類型"));
  assert.equal(x.stored.get("v2_batch_qa_pending_write"),"null");assert.equal(x.posts.length,1);
 }],
 ["GPS failed positioning sends no request and leaves no pending write",async()=>{
  const x=make({gpsFailure:true});await x.authReady();await x.click("clockIn");
  assert.equal(x.posts.length,0);assert(!x.stored.get("v2_batch_qa_pending_write"));
 }],
 ["GPS unknown write preserves original type and ID across reload for readback",async()=>{
  const x=make();await x.authReady();x.results.push({ok:false,code:"UNKNOWN",persisted:null});
  await x.click("clockOut");const original=JSON.parse(x.posts[0].payload).args;
  assert.equal(original.type,"下班");assert.equal(original.lat,25);
  const y=make({stored:x.stored});await y.authReady();await y.click("clockIn");assert.equal(y.posts.length,0);
  y.results.push({ok:true,result:{request:{requestId:original.requestId,kind:"CLOCK",type:"下班"}}});
  await y.click("clockStatus");assert.equal(y.posts[0].operation,"GPS_STATUS");
  assert.equal(JSON.parse(y.posts[0].payload).args.type,"下班");
  assert.equal(y.stored.get("v2_batch_qa_pending_write"),"null");
 }],
 ["normal monthly table has only date and normal times, missing time stays blank",async()=>{
  const x=make();await x.authReady();x.results.push({ok:true,result:{month:"2026-10",
   days:[{date:"2026-10-02",clockIn:"08:30:00",clockOut:""}]}});
  await x.click("myClocks");assert.equal(x.posts[0].operation,"MY_CLOCKS");
  const rows=x.dom.clockHistory.children;assert.equal(rows.length,1);
  assert.deepEqual(rows[0].children.map(c=>c.textContent),["2026-10-02","08:30:00",""]);
  assert.equal(rows[0].children.length,3);assert.equal(x.dom.missingHistory.children.length,0);
 }],
 ["entering monthly pages queries only own records while HR stays a placeholder",async()=>{
  const x=make();await x.authReady();await x.click("navMissing");
  assert.equal(x.dom.pageMissing.hidden,false);assert.equal(x.dom.pageClock.hidden,true);
  assert.equal(x.posts[0].operation,"MY_MISSING");
  await x.click("navHr");assert.equal(x.dom.pageHr.hidden,false);
  assert.equal(x.dom.pageMissing.hidden,true);assert.equal(x.posts.length,1);
  await x.click("navLeave");assert.equal(x.posts[1].operation,"MY_LEAVES");
  await x.click("navClock");assert.equal(x.posts[2].operation,"MY_CLOCKS");
  assert.equal(x.stored.has("v2_batch_qa_pending_write"),false);
 }],
 ["page navigation without QA confirmation never queries or obtains location",async()=>{
  const x=make();await x.authReady();x.dom.confirmed.checked=false;
  await x.click("navLeave");await x.click("navMissing");await x.click("navClock");
  assert.equal(x.posts.length,0);
 }],
 ["monthly missed table filters out leave and displays approved missed time",async()=>{
  const x=make();await x.authReady();
  x.results.push({ok:true,result:{requests:[
   {kind:"LEAVE",startDate:"2026-10-01",leaveType:"病假",status:"APPROVED"},
   {kind:"MISSING",date:"2026-10-02",type:"上班",time:"08:30",status:"APPROVED"}
  ]}});
  await x.click("myMissing");
  assert.equal(x.posts[0].operation,"MY_MISSING");
  const table=x.dom.missingHistory.children[0];
  assert.equal(table.children.length,2);
  assert.deepEqual(table.children[1].children.map(c=>c.textContent),["2026-10-02","上班","08:30","已核准"]);
  assert.equal(x.dom.leaveHistory.children.length,0);
 }],
 ["current leave table displays requested hourly range as plain text",async()=>{
  const x=make();await x.authReady();
  x.results.push({ok:true,result:{requests:[{kind:"LEAVE",startDate:"2026-10-02",
   endDate:"2026-10-02",leaveType:"<script>synthetic</script>",unit:"HOURS",
   fromTime:"09:00",toTime:"11:00",status:"PENDING"}]}});
  await x.click("currentLeaves");
  const cells=x.dom.leaveHistory.children[0].children[1].children;
  assert.equal(cells[2].textContent,"<script>synthetic</script>");
  assert.equal(cells[3].textContent,"09:00～11:00");assert.equal(cells[4].textContent,"待審核");
 }],
 ["original GPS LIFF cannot initialize the independent QA client",async()=>{
  const x=make({liffId:"2012136707-2dDU0aSJ"});await x.authReady();
  await x.click("newId");await x.click("preview");
  assert.equal(x.posts.length,0);assert(x.dom.identity.textContent.includes("不可使用原 GPS"));
 }],
 ["missing QA LIFF config fails closed",async()=>{
  const x=make({liffId:""});await x.authReady();await x.click("newId");
  await x.click("preview");assert.equal(x.posts.length,0);
 }],
 ["HR original status restores unknown review without another review submission",async()=>{
  const x=make();await x.authReady();
  x.dom.hrRequestId.value="QA_HR_REVIEW_REQUEST_0001";
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("hrApprove");
  const y=make({stored:x.stored});await y.authReady();
  y.results.push({ok:true,result:{request:{requestId:y.dom.hrRequestId.value,status:"APPROVED"}}});
  await y.click("hrStatus");
  assert.equal(y.posts.length,1);assert.equal(y.posts[0].operation,"HR_STATUS");
  assert.equal(y.stored.get("v2_batch_qa_pending_write"),"null");
 }],
 ["another HR request status cannot release original review lock",async()=>{
  const x=make();await x.authReady();x.dom.hrRequestId.value="QA_HR_REVIEW_REQUEST_0001";
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("hrApprove");
  x.dom.hrRequestId.value="QA_DIFFERENT_HR_REQUEST_0002";
  x.results.push({ok:true,result:{request:{requestId:x.dom.hrRequestId.value,status:"APPROVED"}}});
  await x.click("hrStatus");await x.click("hrApprove");assert.equal(x.posts.length,2);
 }],
 ["page is clearly isolated QA without automatic form submission",async()=>{
  assert(html.includes("獨立 QA 測試頁"));
  assert(!html.includes('action="https://script.google.com'));
 }],
 ["no requests made on page initialization",async()=>{
  const x=make();await x.authReady();assert.equal(x.posts.length,0);
 }],
 ["LINE ID token and /exec never persisted",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  assert(![...x.stored.values()].includes(TOKEN));
  assert(![...x.stored.values()].some(v=>v.includes("script.google.com")));
 }],
 ["new request ID generated with crypto random and stored for recovery",async()=>{
  const x=make();await x.click("newId");
  assert(/^QA_[0-9a-f]{32}$/.test(x.dom.requestId.value));
  assert.equal(x.stored.get("v2_batch_qa_request_id"),x.dom.requestId.value);
 }],
 ["without QA confirmation no request is sent",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.confirmed.checked=false;await x.click("preview");
  assert.equal(x.posts.length,0);
 }],
 ["non Google URL blocked",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.endpoint.value="https://evil.example/exec";await x.click("preview");
  assert.equal(x.posts.length,0);
 }],
 ["preflight sends only business fields and token, never client employeeId",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  await x.click("preview");
  assert.equal(x.posts.length,1);
  assert.equal(x.posts[0].operation,"LEAVE_PREVIEW");
  const body=JSON.parse(x.posts[0].payload);
  assert.equal(body.idToken,TOKEN);assert(!("employeeId" in body.args));
 }],
 ["write consent is required for leave submission",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.writeConsent.checked=false;await x.click("submitLeave");
  assert.equal(x.posts.length,0);
 }],
 ["confirmed QA leave write posts exactly once",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  await x.click("submitLeave");assert.equal(x.posts.length,1);
  assert.equal(x.posts[0].operation,"LEAVE_REQUEST");
 }],
 ["confirmed missed punch uses the same original request ID",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  const id=x.dom.requestId.value;
  await x.click("submitMissing");assert.equal(x.posts.length,1);
  assert.equal(JSON.parse(x.posts[0].payload).args.requestId,id);
 }],
 ["backend unknown write locks further submission and new request ID",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  const original=x.dom.requestId.value;
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});
  await x.click("submitLeave");
  assert.equal(x.posts.length,1);
  await x.click("newId");assert.equal(x.dom.requestId.value,original);
  await x.click("submitLeave");assert.equal(x.posts.length,1);
 }],
 ["original request readback releases unknown write lock",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});
  await x.click("submitLeave");
  x.results.push({ok:true,result:{request:{requestId:x.dom.requestId.value,status:"PENDING"}}});
  await x.click("leaveStatus");
  await x.click("submitLeave");
  assert.equal(x.posts.length,3);
 }],
 ["unknown write remains locked after page reload",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  const original=x.dom.requestId.value;
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});
  await x.click("submitLeave");
  const y=make({stored:x.stored});await y.authReady();
  assert.equal(y.dom.requestId.value,original);
  await y.click("submitLeave");await y.click("newId");
  assert.equal(y.posts.length,0);assert.equal(y.dom.requestId.value,original);
 }],
 ["another request readback cannot unlock the original unknown write",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("submitLeave");
  x.dom.requestId.value="QA_ANOTHER_REQUEST_0001";
  x.results.push({ok:true,result:{request:{requestId:x.dom.requestId.value,status:"PENDING"}}});
  await x.click("leaveStatus");await x.click("submitLeave");
  assert.equal(x.posts.length,2);
 }],
 ["wrong operation readback cannot unlock a pending leave",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("submitLeave");
  x.results.push({ok:true,result:{request:{requestId:x.dom.requestId.value,status:"PENDING"}}});
  await x.click("missingStatus");await x.click("submitLeave");
  assert.equal(x.posts.length,2);
 }],
 ["local validation failure permits corrected first submission",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.writeConsent.checked=false;await x.click("submitLeave");
  x.dom.writeConsent.checked=true;await x.click("submitLeave");
  assert.equal(x.posts.length,1);
 }],
 ["explicit no-write response permits another attempt",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.results.push({ok:false,code:"DISABLED",persisted:false});await x.click("submitLeave");
  await x.click("submitLeave");assert.equal(x.posts.length,2);
 }],
 ["HR unknown reload restores actual HR request and blocks another review",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.hrRequestId.value="QA_HR_REVIEW_REQUEST_0001";
  x.results.push({ok:false,code:"UNKNOWN",persisted:null});await x.click("hrApprove");
  const y=make({stored:x.stored});await y.authReady();
  assert.equal(y.dom.hrRequestId.value,"QA_HR_REVIEW_REQUEST_0001");
  await y.click("hrApprove");assert.equal(y.posts.length,0);
 }],
 ["untrusted origin never marks a request confirmed",async()=>{
  const x=make({origin:"https://evil.example"});await x.authReady();
  await x.click("newId");
  // Response ignored; operation remains outstanding and request does not
  // falsely display success. Fake timers do not elapse in this test.
  const p=x.click("preview");
  await Promise.resolve();
  assert.equal(x.posts.length,1);
  assert(!x.dom.result.textContent.includes("已回覆成功"));
 }],
 ["HR request includes chosen approved action only",async()=>{
  const x=make();await x.authReady();await x.click("newId");
  x.dom.hrRequestId.value="QA_HR_REVIEW_REQUEST_0001";
  await x.click("hrApprove");assert.equal(x.posts[0].operation,"HR_REVIEW");
  const arg=JSON.parse(x.posts[0].payload).args;
  assert.equal(arg.decision,"APPROVE");assert(!("role" in arg));
 }],
 ["unverified LIFF session does not submit",async()=>{
  const x=make({login:false});await x.authReady();await x.click("newId");
  await x.click("preview");assert.equal(x.posts.length,0);
 }],
 ["script does not contain production Sheet IDs or stored access tokens",async()=>{
  assert(!/localStorage\.setItem|sessionStorage\.setItem\(\s*["']token/i.test(client));
  assert(!/SpreadsheetApp|UrlFetchApp|pushMessage/.test(client));
 }]
];
(async()=>{let pass=0;
for(const [name,fn] of tests){
 try{await fn();pass++;console.log("PASS",name)}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1}
}
console.log(pass+"/"+tests.length+" PASSED");
})();


