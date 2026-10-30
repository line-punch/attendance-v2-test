"use strict";
/* Offline synthetic DOM. No real LINE SDK, browser or network requests. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=__dirname;
const html=fs.readFileSync(path.join(base,"demo/index.html"),"utf8");
const app=fs.readFileSync(path.join(base,"demo/app.js"),"utf8");
const rules=require("./V2_BatchRules.js"),state=require("./V2_DemoState.js");
function el(id){
 return {id,value:"",textContent:"",hidden:false,disabled:false,children:[],listeners:{},attrs:{},
  addEventListener(name,cb){(this.listeners[name]||(this.listeners[name]=[])).push(cb);},
  setAttribute(n,v){this.attrs[n]=v;},removeAttribute(n){delete this.attrs[n];},
  appendChild(child){this.children.push(child);},dataset:{}};
}
const ids=["clock","missing","history","leave","clockIn","clockOut","clockCheck",
 "missDate","missTime","missType","missReason","missSend","missResult",
 "month","historyRefresh","historyResult","leaveFrom","leaveTo",
 "leaveType","leaveUnit","fromTime","toTime","leaveReason","leaveCheck",
 "leaveSend","leaveResult","clockResult","hrRefresh","hrItems"];
const nodes={};for(const id of ids)nodes[id]=el(id);
Object.assign(nodes.missDate,{value:"2026-10-30"});nodes.missTime.value="08:30";
nodes.missType.value="上班";nodes.month.value="2026-10";
nodes.leaveFrom.value="2026-11-09";nodes.leaveTo.value="2026-11-10";
nodes.leaveType.value="事假";nodes.leaveUnit.value="DAY";
nodes.fromTime.value="09:00";nodes.toTime.value="11:00";
const tabs=["clock","missing","history","leave"].map(v=>{
 const x=el("tab-"+v);x.dataset.tab=v;return x;
});
const document={getElementById:id=>{
  if(!nodes[id])throw Error("Missing element "+id);return nodes[id];
 },querySelectorAll:()=>tabs,querySelector:()=>tabs[0],createElement:tag=>el(tag)};
new Function("document","window","Promise",app)(
 document,{V2BatchRules:rules,V2BatchDemo:state},Promise);
async function click(elm){
 if(typeof elm==="string")elm=nodes[elm];
 for(const fn of elm.listeners.click||[])await fn();
}
const cases=[
 ["all four tabs initialized",async()=>assert(tabs.every(x=>x.listeners.click?.length===1))],
 ["clicking leave tile changes visible panel",async()=>{
  await click(tabs[3]);assert.equal(nodes.leave.hidden,false);assert.equal(nodes.clock.hidden,true);
 }],
 ["mock clock-in and clock-out can be queried",async()=>{
  await click("clockIn");await click("clockOut");await click("clockCheck");
  assert(nodes.clockResult.textContent.includes("上班"));
  assert(nodes.clockResult.textContent.includes("下班"));
 }],
 ["same mock punch never adds duplicate",async()=>{
  await click("clockIn");assert(nodes.clockResult.textContent.includes("存在"));
 }],
 ["leave preview accepts 2 workdays",async()=>{
  await click("leaveCheck");assert(nodes.leaveResult.textContent.includes("2 個上班日"));
 }],
 ["leave submit creates one pending review",async()=>{
  await click("leaveSend");await click("hrRefresh");
  assert.equal(nodes.hrItems.children.length,1);
 }],
 ["same leave form does not create second review",async()=>{
  await click("leaveSend");await click("hrRefresh");
  assert.equal(nodes.hrItems.children.length,1);
 }],
 ["missed punch requires reason",async()=>{
  await click("missSend");assert(nodes.missResult.textContent.includes("MISSING_REASON"));
 }],
 ["missed punch request appears as second review",async()=>{
  nodes.missReason.value="純模擬原因";await click("missSend");await click("hrRefresh");
  assert.equal(nodes.hrItems.children.length,2);
 }],
 ["HR mock approval clears pending first item",async()=>{
  const first=nodes.hrItems.children[0];
  const approve=first.children[1];await click(approve);await click("hrRefresh");
  assert.equal(nodes.hrItems.children.length,1);
 }],
 ["mock holiday blocks leave",async()=>{
  nodes.leaveFrom.value="2026-11-11";nodes.leaveTo.value="2026-11-11";
  await click("leaveCheck");assert(nodes.leaveResult.textContent.includes("NON_WORKDAY_REQUIRES_SPLIT"));
 }],
 ["mock storm requests HR review",async()=>{
  nodes.leaveFrom.value="2026-11-12";nodes.leaveTo.value="2026-11-12";
  await click("leaveCheck");assert(nodes.leaveResult.textContent.includes("NEEDS_HR_REVIEW"));
 }],
 ["source contains no live LINE or Google transport",async()=>{
  assert(!/UrlFetchApp|navigator\.geolocation|google\.script\.run|liff\.|fetch\(/.test(app));
  assert(!/https?:\/\//.test(html));
 }],
 ["offline HTML refers to both pure helper scripts",async()=>{
  assert(html.includes("../V2_BatchRules.js"));assert(html.includes("../V2_DemoState.js"));
 }]
];
(async()=>{let passed=0;
 for(const [label,fn] of cases){
  try{await fn();passed++;console.log("PASS",label);}
  catch(e){console.error("FAIL",label,e.stack);process.exitCode=1;}
 }
 console.log(passed+"/"+cases.length+" PASSED");
})();
