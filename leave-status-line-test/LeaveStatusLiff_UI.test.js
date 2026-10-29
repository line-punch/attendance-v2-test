"use strict";
/* Node: node leave-status-line-test/LeaveStatusLiff_UI.test.js
 * Offline UI simulation. No real LINE SDK, Google or user credentials.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
let raw=(html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)||[])[1];
assert(raw,"inline UI code must be present");
function setup({enabled=false,logged=true,token="mockheader.mockpayload.mocksignature",
  reply="found",initError=null,delay=false}={}){
 const inputValue="https://script.google.com/macros/s/TEST_STANDALONE_READ_ONLY/exec";
 const log={sent:[],login:0,init:0,events:{},frames:[],release:null};
 const nodes={};
 for(const id of ["login","state","api","query","queryStatus","queryPane"]){
  nodes[id]={id,disabled:false,hidden:id==="queryPane",
    textContent:"",value:id==="api"?inputValue:"",
    listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}};
 }
 const document={getElementById:id=>nodes[id],
   body:{appendChild(){}},
   createElement(name){
     const o={nodeName:name,name,style:{},children:[],contentWindow:{},
       appendChild(el){this.children.push(el)},remove(){},
       setAttribute(){},
       submit(){
         const fields=Object.fromEntries(o.children.map(el=>[el.name,el.value]));
         log.sent.push({url:o.action,fields});
         const fire=()=>{
           const bridge="YC_V2_STAGING_FORM_V1",nonce=fields.nonce;
           let result;
           if(reply==="found")result={ok:true,readOnly:true,synthetic:true,
             requestId:"LEAVEV2_TEST_20261110_0001",found:true,status:"PENDING_REVIEW_TEST"};
           if(reply==="missing")result={ok:true,readOnly:true,synthetic:true,
             requestId:"LEAVEV2_TEST_20261110_0001",found:false,status:"NOT_FOUND_YET"};
           if(reply==="bad")result={ok:true,readOnly:false,synthetic:true,
             requestId:"LEAVEV2_TEST_20261110_0001",found:true,status:"PENDING_REVIEW_TEST"};
           if(reply==="auth"){
             log.events.message?.({origin:"https://script.googleusercontent.com",source:log.frames.at(-1)?.contentWindow,
               data:{bridge,nonce,ok:false,code:"AUTH"}});
             return;
           }
           log.events.message?.({origin:"https://script.googleusercontent.com",source:log.frames.at(-1)?.contentWindow,
               data:{bridge,nonce,ok:true,result}});
         };
         if(delay)log.release=fire;
         else Promise.resolve().then(fire);
       }
     };
     if(name==="iframe")log.frames.push(o);
     return o;
   }};
 const line={init:async()=>{log.init++;if(initError)throw initError;},
  isLoggedIn:()=>logged, getIDToken:()=>token,
  login:()=>{log.login++}};
 const win={
   crypto:{getRandomValues:b=>(b.fill(1),b)},
   addEventListener:(event,fn)=>{log.events[event]=fn;},
   removeEventListener:(event,fn)=>{if(log.events[event]===fn)delete log.events[event]}
 };
 const URLShim=function(str){
    const parts=String(str).match(/^(https?):\/\/([^/]+)(\/[^?#]*)(\?[^#]*)?(#.*)?$/);
    if(!parts)throw Error("Invalid url");
    return {href:str,protocol:parts[1]+":",hostname:parts[2],
     pathname:parts[3],username:"",password:"",search:parts[4]||"",hash:parts[5]||""};
 };
 let body="const SETTINGS=Object.freeze("+raw.split("const SETTINGS=Object.freeze(")[1];
 // Replace the isolated OFF flag only inside this offline test runtime.
 if(enabled)body=body.replace("enableStatusQuery:false","enableStatusQuery:true");
 new Function("document","window","liff","URL","Uint8Array","setTimeout","clearTimeout",
   body)(document,win,line,URLShim,Uint8Array,()=>1,()=>{});
 return {nodes,log,line};
}
async function settle(){for(let i=0;i<5;i++)await Promise.resolve();}
const tests=[
 ["new LIFF page has no real Web App address or LINE secrets",async()=>{
   assert(!html.includes("AKfycb"));
   assert(!html.includes("channelSecret"));
   assert(!html.includes("localStorage"));
 }],
 ["LIFF initialization is automatic but no POST occurs",async()=>{
   const x=setup();await settle();
   assert.equal(x.log.init,1);
   assert.equal(x.log.sent.length,0);
 }],
 ["feature is disabled by default",async()=>{
   assert(html.includes("enableStatusQuery:false"));
   const x=setup();await settle();
   assert.equal(x.nodes.query.disabled,true);
   assert(x.nodes.queryStatus.textContent.includes("未開放"));
 }],
 ["no backend request even after clicking disabled feature programmatically",async()=>{
   const x=setup();await settle();
   await x.nodes.query.listeners.click();
   assert.equal(x.log.sent.length,0);
 }],
 ["query available only for LINE logged-in tester",async()=>{
   const x=setup({enabled:true,logged:false});await settle();
   assert.equal(x.nodes.queryPane.hidden,true);
   await x.nodes.query.listeners.click();
   assert.equal(x.log.sent.length,0);
 }],
 ["LINE login handler only calls SDK login on direct user click",async()=>{
   const x=setup({logged:false});await settle();
   assert.equal(x.log.login,0);
   await x.nodes.login.listeners.click();
   assert.equal(x.log.login,1);
 }],
 ["valid request is fixed leaveStatus + requestId + idToken",async()=>{
   const x=setup({enabled:true});await settle();
   await x.nodes.query.listeners.click();
   assert.equal(x.log.sent.length,1);
   const call=x.log.sent[0];
   assert.equal(call.url,"https://script.google.com/macros/s/TEST_STANDALONE_READ_ONLY/exec");
   assert.equal(call.fields.operation,"leaveStatus");
   assert.equal(call.fields.nonce.length,40);
   assert.deepEqual(Object.keys(JSON.parse(call.fields.payload)).sort(),["idToken","requestId"]);
   assert.equal(JSON.parse(call.fields.payload).requestId,"LEAVEV2_TEST_20261110_0001");
 }],
 ["valid bound TEST001 result displays one existing synthetic application",async()=>{
   const x=setup({enabled:true});await settle();
   await x.nodes.query.listeners.click();
   assert(x.nodes.queryStatus.textContent.includes("查到 TEST001"));
 }],
 ["missing row never means guaranteed submission failure",async()=>{
   const x=setup({enabled:true,reply:"missing"});await settle();
   await x.nodes.query.listeners.click();
   assert(x.nodes.queryStatus.textContent.includes("不代表"));
 }],
 ["unexpected result treated as unconfirmed",async()=>{
   const x=setup({enabled:true,reply:"bad"});await settle();
   await x.nodes.query.listeners.click();
   assert(x.nodes.queryStatus.textContent.includes("無法確認"));
 }],
 ["auth rejected without any token text in message",async()=>{
   const x=setup({enabled:true,reply:"auth"});await settle();
   await x.nodes.query.listeners.click();
   assert(x.nodes.queryStatus.textContent.includes("身分驗證被拒絕"));
   assert(!x.nodes.queryStatus.textContent.includes("mockheader"));
 }],
 ["wrong URL host prevented before sending bearer token",async()=>{
   const x=setup({enabled:true});await settle();
   x.nodes.api.value="https://attacker.invalid/exec";
   await x.nodes.query.listeners.click();
   assert.equal(x.log.sent.length,0);
 }],
 ["missing token prevented before post",async()=>{
   const x=setup({enabled:true,token:""});await settle();
   await x.nodes.query.listeners.click();
   assert.equal(x.log.sent.length,0);
 }],
 ["concurrent click issues only one backend request",async()=>{
   const x=setup({enabled:true,delay:true});await settle();
   const first=x.nodes.query.listeners.click();
   const second=x.nodes.query.listeners.click();
   await second;
   assert.equal(x.log.sent.length,1);
   x.log.release();await first;
   assert.equal(x.nodes.query.disabled,false);
 }],
 ["server response bound to iframe source, nonce and trusted Google origin",async()=>{
   assert(raw.includes("ev.source!==iframe.contentWindow"));
   assert(raw.includes("ev.data.nonce!==n"));
   assert(raw.includes("allowedOrigin(ev.origin)"));
 }],
 ["old GPS HTML remains outside this page and no clock operations are present",async()=>{
   assert(!raw.includes('operation:"clock"'));
   assert(!raw.includes('operation:"bind"'));
   assert(!raw.includes("navigator.geolocation"));
 }]
];
(async()=>{
 let passed=0;
 for(const [name,fn] of tests){
  try{await fn();passed++;console.log("PASS",name);}
  catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}
 }
 console.log(passed+"/"+tests.length+" PASSED");
})();
