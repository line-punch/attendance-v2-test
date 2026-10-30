"use strict";
/* Offline fake LIFF/DOM. No real network, Google, LINE or write requests. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const client=fs.readFileSync(path.join(__dirname,"qa-client/app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"qa-client/index.html"),"utf8");
const TOKEN="QA_FAKE_LINE_ID_TOKEN_NEVER_REAL";
function make(options={}){
 const params={login:true,origin:"https://script.googleusercontent.com",...options};
 let events=new Map(),posts=[],results=[],timerCalls=0;
 let stored=new Map();
 function elem(id){
  return {id,value:"",checked:false,disabled:false,textContent:"",
   listeners:{},children:[],style:{},name:"",
   appendChild(x){this.children.push(x)},
   addEventListener(type,fn){this.listeners[type]=fn},
   remove(){},
   submit(){
    const fields=Object.fromEntries(this.children.map(x=>[x.name,x.value]));
    posts.push(fields);
    Promise.resolve().then(()=>{
     const data=results.length?results.shift():{ok:true,result:{ok:true,readOnly:true}};
     const event={origin:params.origin,data:{
       bridge:"YC_V2_BATCH_QA_V1",nonce:fields.nonce,...data
     }};
     for(const fn of events.get("message")||[])fn(event);
    });
   },
   setAttribute(){}
  };
 }
 const ids=["login","identity","endpoint","confirmed","start","end","leaveType",
 "unit","fromTime","toTime","reason","requestId","newId","preview","leaveStatus",
 "submitLeave","missingDate","missingTime","missingType","missingReason",
 "submitMissing","missingStatus","month","myLeaves","hrPending","hrRequestId",
 "hrApprove","hrReject","writeConsent","result"];
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
   "hrApprove","hrReject"].includes(id)).map(id=>dom[id]),
  createElement:tag=>elem(tag),
  body:{appendChild(){}}
 };
 const win={crypto:{getRandomValues:arr=>{for(let i=0;i<arr.length;i++)arr[i]=i+1;return arr}},
  addEventListener:(ev,fn)=>{events.set(ev,[...(events.get(ev)||[]),fn])},
  removeEventListener:(ev,fn)=>{events.set(ev,(events.get(ev)||[]).filter(f=>f!==fn))}};
 const liff={init:async()=>{},isLoggedIn:()=>params.login,
  getIDToken:()=>params.login?TOKEN:null,login(){}};
 const URLMock=class{
  constructor(text){
   const m=/^(https?):\/\/([^/]+)(\/[^?#]*)(\?[^#]*)?(#.*)?$/.exec(text);
   if(!m)throw Error("URL_BAD");
   this.protocol=m[1]+":";this.hostname=m[2];this.pathname=m[3];
   this.username="";this.password="";this.search=m[4]||"";this.hash=m[5]||"";
   this.href=text;
  }
 };
 new Function("document","window","liff","sessionStorage","setTimeout",
   "clearTimeout","URL",client)(doc,win,liff,{
    getItem:k=>stored.get(k)||"",
    setItem:(k,v)=>stored.set(k,v)
   },()=>++timerCalls,()=>{},URLMock);
 async function click(id){
  const fn=dom[id].listeners.click;if(!fn)throw Error("missing click "+id);
  const returned=fn();if(returned&&typeof returned.then==="function")await returned;
  await Promise.resolve();await Promise.resolve();
 }
 return {click,dom,posts,results,stored,params,events,
  authReady:async()=>{await Promise.resolve();await Promise.resolve()}};
}
const tests=[
 ["page is clearly isolated QA and not deployed",async()=>{
  assert(html.includes("未部署"));
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
  x.results.push({ok:true,result:{request:{status:"PENDING"}}});
  await x.click("leaveStatus");
  await x.click("newId");assert(x.dom.requestId.value.startsWith("QA_"));
  assert.equal(x.posts.length,2);
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
