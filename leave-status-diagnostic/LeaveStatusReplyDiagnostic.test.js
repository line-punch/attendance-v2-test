"use strict";
/* Offline only: node leave-status-diagnostic/LeaveStatusReplyDiagnostic.test.js
 * The HTML file is a TEST001-only read-only UI. Never call real Google/LINE.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const page=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const raw=(page.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)||[])[1];
assert(raw,"Missing inline JS");

const originalId="LEAVEV2_TEST_20261110_0001",mockToken="FAKE-JWT.FAKE-CLAIMS.NEVER-REAL";
function scenario(opts={}){
 const cfg={reply:"FOUND",origin:"https://script.googleusercontent.com",nested:true,
  enabled:true,logged:true,approved:true,hold:false,token:mockToken,...opts};
 let sent=0,fields=null,iframe=null,waiter=null,timeoutTask=null,postedTo=null;
 const events={}, els={};
 const ids=["login","state","api","query","queryStatus","queryPane","approved"];
 ids.forEach(id=>els[id]={value:id==="api"?
    "https://script.google.com/macros/s/TEST_ONLY_FAKE_ID/exec":"",
    checked:id==="approved"?cfg.approved:false,disabled:id==="query",
    hidden:id==="queryPane",textContent:"",handlers:{},
    addEventListener(kind,fn){this.handlers[kind]=fn}});
 const document={getElementById:id=>els[id],body:{appendChild(){}},
   createElement(tag){
     const el={tag,style:{},children:[],contentWindow:{frame:true},
       setAttribute(){},remove(){},appendChild(v){this.children.push(v);},
       submit(){
         sent++;postedTo=this.action;
         fields=Object.fromEntries(this.children.map(x=>[x.name,x.value]));
         const data={bridge:"YC_V2_STAGING_FORM_V1",nonce:fields.nonce,
           ok:cfg.reply==="FOUND"||cfg.reply==="MISSING",
           result:{ok:true,synthetic:true,readOnly:true,requestId:originalId,
             found:cfg.reply==="FOUND",status:cfg.reply==="MISSING"?
             "NOT_FOUND_YET":"PENDING_REVIEW_TEST"}};
         if(!data.ok){delete data.result;data.code=cfg.reply;}
         const ev={origin:cfg.origin,
           source:cfg.nested?{innerGoogleHtmlService:true}:iframe.contentWindow,
           data};
         waiter=()=>{events.message?.(ev);};
         if(!cfg.hold)Promise.resolve().then(()=>waiter&&waiter());
       }};
     if(tag==="iframe")iframe=el;
     return el;
   }};
 const liff={init:async()=>{},isLoggedIn:()=>cfg.logged,getIDToken:()=>cfg.token,login(){}};
 const window={crypto:{getRandomValues:a=>(a.fill(11),a)},
   addEventListener:(x,fn)=>{events[x]=fn},
   removeEventListener:(x,fn)=>{if(events[x]===fn)delete events[x]}};
 const URLShim=function(x){
   const m=String(x).match(/^(https?):\/\/([^/]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/);
   if(!m)throw Error("bad URL");
   return {protocol:m[1]+":",hostname:m[2],pathname:m[3]||"/",search:m[4]||"",hash:m[5]||"",href:String(x),username:"",password:""};
 };
 const timers=new Map();let timerIndex=0;
 const setTimeoutShim=(fn)=>{const id=++timerIndex;timers.set(id,fn);return id;};
 const clearTimeoutShim=id=>timers.delete(id);
 let code='const SETTINGS=Object.freeze('+raw.split('const SETTINGS=Object.freeze(')[1];
 // All requests still need an explicit checkmark and a click, even in tests.
 new Function("document","window","liff","URL","Uint8Array",
   "setTimeout","clearTimeout",code)(document,window,liff,URLShim,Uint8Array,setTimeoutShim,clearTimeoutShim);
 return {els,events,getSent:()=>sent,getFields:()=>fields,getURL:()=>postedTo,
    fire:()=>waiter&&waiter(),fireTimeout:()=>[...timers.values()].forEach(fn=>fn()),
    send:()=>els.query.handlers.click()};
}
async function settle(){for(let i=0;i<10;i++)await Promise.resolve();}
const tests=[
 ["feature does not auto-send on opening page",async()=>{
    const s=scenario();await settle();assert.equal(s.getSent(),0);
 }],
 ["explicit confirmation required",async()=>{
    const s=scenario({approved:false});await settle();await s.send();
    assert.equal(s.getSent(),0);
 }],
 ["non-LINE visitor cannot query",async()=>{
    const s=scenario({logged:false});await settle();await s.send();
    assert.equal(s.getSent(),0);
 }],
 ["query uses only fixed mock request and bearer token",async()=>{
    const s=scenario();await settle();await s.send();
    const p=JSON.parse(s.getFields().payload);
    assert.deepEqual(Object.keys(p).sort(),["idToken","requestId"]);
    assert.equal(p.requestId,originalId);
    assert.equal(s.getFields().operation,"leaveStatus");
    assert.equal(s.getFields().nonce.length,40);
 }],
 ["nested Google HTMLService iframe is accepted by origin and nonce",async()=>{
    const s=scenario({nested:true});await settle();await s.send();
    assert(s.els.queryStatus.textContent.includes("查到 TEST001"));
 }],
 ["missing row never claims leave was not submitted",async()=>{
    const s=scenario({reply:"MISSING"});await settle();await s.send();
    assert(s.els.queryStatus.textContent.includes("不代表"));
 }],
 ["backend UNKNOWN rejection is separately explained",async()=>{
    const s=scenario({reply:"UNKNOWN"});await settle();await s.send();
    assert(s.els.queryStatus.textContent.includes("後端已回覆 UNKNOWN"));
 }],
 ["backend AUTH rejection is separately explained",async()=>{
    const s=scenario({reply:"AUTH"});await settle();await s.send();
    assert(s.els.queryStatus.textContent.includes("後端已回覆 AUTH"));
 }],
 ["no response triggers explicit timeout diagnostic",async()=>{
    const s=scenario({hold:true});await settle();
    const pending=s.send();s.fireTimeout();await pending;
    assert(s.els.queryStatus.textContent.includes("45 秒逾時"));
 }],
 ["other origin ignored even with matching nonce",async()=>{
    const s=scenario({hold:true,origin:"https://evil.example"});
    await settle();const pending=s.send();s.fire();await settle();
    assert(s.els.queryStatus.textContent.includes("正在安全查詢"));
    s.fireTimeout();await pending;
    assert(s.els.queryStatus.textContent.includes("45 秒逾時"));
 }],
 ["rapid repeat click does not create second call",async()=>{
    const s=scenario({hold:true});await settle();
    const pending=s.send();await s.send();assert.equal(s.getSent(),1);
    s.fire();await pending;assert.equal(s.els.query.disabled,false);
 }],
 ["no actual endpoint, token, employee scope or location stored",async()=>{
   assert(!/AKfycb[0-9A-Za-z_-]+|localStorage|sessionStorage|indexedDB/.test(page));
   assert(!/navigator\.geolocation|employeeId:|company:|spreadsheetId:/.test(raw));
 }],
 ["strict response origin, bridge and fresh nonce still checked",async()=>{
   assert(raw.includes("allowedOrigin(ev.origin)"));
   assert(raw.includes("ev.data.bridge!==SETTINGS.expectedBridge"));
   assert(raw.includes("ev.data.nonce!==n"));
   assert(!raw.includes("ev.source!==iframe.contentWindow"));
 }],
 ["query is a fixed read-only operation, not a leave submission",async()=>{
   assert(raw.includes('operation:"leaveStatus"'));
   assert(!raw.includes('operation:"leaveSubmit"'));
   assert(!raw.includes('operation:"clock"'));
 }]
];
(async()=>{
 let passed=0;
 for(const [name,fn] of tests)try{await fn();passed++;console.log("PASS",name);}
 catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
 console.log(passed+"/"+tests.length+" PASSED");
})();
