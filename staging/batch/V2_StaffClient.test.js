"use strict";
const assert=require('node:assert/strict'),{build}=require('./build-staff-client.cjs');
assert.throws(()=>build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2012136707-Synthetic'),/REQUIRED/);
assert.throws(()=>build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2009482137-QgqJEHgA'),/REQUIRED/);
const a=build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2009482137-Synthetic');
new (require('node:vm').Script)(a['app.js']);
assert.ok(a['app.js'].includes('candidateRoute:"staff-v1"'));
assert.ok(a['app.js'].includes('YC_V2_STAFF_V1'));
assert.ok(!a['app.js'].includes('v2_candidate_phone_'));
assert.ok(a['app.js'].includes('"V2_GPS_"'));
assert.ok(a['review-entry.js'].includes('/^V2_'));
assert.ok(a['index.html'].includes('<title>YC/YT員工系統</title>'));
assert.ok(!a['index.html'].includes('TEST001'));
assert.ok(!a['app.js'].includes('candidateRoute:"v1"'));
assert.ok(a['app.js'].includes('/^2009482137-'));
assert.ok(!a['app.js'].includes('/^2012136707-'));
assert.ok(a['app.js'].includes('leave:"Leave",miss:"Missing"'));
assert.ok(a['app.js'].includes('query:"Hr"'));
assert.ok(a['app.js'].includes('function renderStaffQueue'));
assert.ok(a['app.js'].includes('if(!reviewEntry||!reviewLoaded'));
assert.ok(a['app.js'].includes('LINE通知尚未確認'));
assert.ok(!a['app.js'].includes('await execute("MY_CLOCKS");status(receipt'));
for(const id of ['clockRecords','leaveRecords','missingRecords'])assert.ok(a['index.html'].includes('class="staffRecords" id="'+id+'"><summary>查看'));
console.log('PASS offline staff frontend route, distinct storage, identity prefix and public display; no browser or LINE calls');
assert.ok(!a['index.html'].includes('id="clockStatus"'));
assert.ok(!a['index.html'].includes('id="leaveStatus"'));
assert.ok(!a['index.html'].includes('id="missingStatus"'));
for(const id of ['preview','newLeave','newMissing'])assert.ok(!a['index.html'].includes('id="'+id+'"'));
const resetSource=a['app.js'].slice(a['app.js'].indexOf('function resetStaffApplication(op,id){'),a['app.js'].indexOf('async function init(){'));
for(const operation of ['LEAVE_REQUEST','MISSING_REQUEST']){
 const elements={};const el=id=>elements[id]||(elements[id]={value:'old draft',hidden:true,setAttribute(k,v){this[k]=v;}});
 const context={$:el,confirmedForms:{[operation]:'V2_SAVED_12345'},sessionStorage:{setItem(){}},formConfig:{LEAVE_REQUEST:['submitLeave','leaveReceipt','leaveFields'],MISSING_REQUEST:['submitMissing','missingReceipt','missingFields']},localToday:()=> '2026-11-05',preserveId:v=>context.savedId=v,updateLeaveUnit(){},draftOperation:operation};
 require('node:vm').createContext(context);
 require('node:vm').runInContext(resetSource+'\nresetStaffApplication('+JSON.stringify(operation)+',"bad")',context);assert.deepEqual(Object.keys(elements),[]);
 require('node:vm').runInContext('resetStaffApplication('+JSON.stringify(operation)+',"V2_SAVED_12345")',context);
 assert.equal(elements.requestId.value,'');assert.equal(context.draftOperation,null);assert.equal(context.confirmedForms[operation],undefined);
 assert.equal(elements[operation==='LEAVE_REQUEST'?'reason':'missingReason'].value,'');
 assert.equal(elements[operation==='LEAVE_REQUEST'?'leaveFields':'missingFields'].hidden,false);
 assert.equal(elements[operation==='LEAVE_REQUEST'?'submitLeave':'submitMissing']['data-unavailable'],'false');
}
console.log('PASS confirmed submissions reset editable forms and retire the old ID; invalid confirmation preserves drafts');
const routeSource=a['app.js'].slice(a['app.js'].indexOf('function selectStaffPage(){'),a['app.js'].indexOf('async function init(){'));
for(const [query,target] of [['?page=clock','Clock'],['?page=leave','Leave'],['?page=miss','Missing'],['?page=query','Hr'],['?qaReviewId=V2_SYNTHETIC_123',null]]){
 const elements={},header={},doc={querySelector:()=>header};const context={URL,window:{location:{href:'https://example.test/staff/'+query}},pages:['Clock','Leave','Missing','Hr'],document:doc,$:id=>elements[id]||(elements[id]={})};
 require('node:vm').createContext(context);require('node:vm').runInContext(routeSource+'\nselectStaffPage()',context);
 for(const name of context.pages)assert.equal(elements['page'+name].hidden,name!==target);
 assert.match(doc.title,/YC\/YT員工系統/);
}
assert.ok(a['index.html'].includes('nav[aria-label="員工功能"]'));
assert.ok(a['index.html'].includes('<div class="loginRow"><button id="login">'));
assert.ok(a['index.html'].includes('<div class="clockActions">'));
assert.ok(a['index.html'].includes('.pair{grid-template-columns:minmax(0,1fr);gap:12px}'));
console.log('PASS direct OA routes show only the chosen page before login; review route hides employee forms');
assert.ok(!a['app.js'].includes('["clockStatus","GPS_STATUS"'));
assert.ok(a['app.js'].includes('onAction("myClocks",refreshStaffClocks)'));
const refreshSource=a['app.js'].slice(a['app.js'].indexOf('async function refreshStaffClocks(){'),a['app.js'].indexOf('async function init(){'));
async function checkRefresh(pending,found,history){
 const calls=[],messages=[],context={pendingWrite:pending,status:(...args)=>messages.push(args)};
 context.execute=async op=>{calls.push(op);if(op==='GPS_STATUS'){if(found){context.pendingWrite=null;return {ok:true,result:{request:found}};}return undefined;}return history;};
 require('node:vm').createContext(context);
 await require('node:vm').runInContext(refreshSource+'\nrefreshStaffClocks()',context);
 return {calls,messages,pending:context.pendingWrite};
}
(async()=>{
 const initSource=a['app.js'].slice(a['app.js'].indexOf('async function init(){'),a['app.js'].indexOf('onAction("login"'));
 for(const page of ['clock','leave','miss']){
  const calls=[],els={},context={unknownWrite:false,status(){},LIFF_ID:'2009482137-Synthetic',URL,window:{location:{href:'https://example.test/?page='+page}},pages:['Clock','Leave','Missing','Hr'],reviewEntry:null,liff:{init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> 'synthetic'},selectStaffPage(){},prepareReviewEntry(){},$:id=>els[id]||(els[id]={setAttribute(){}}),execute:async op=>calls.push(op)};
  require('node:vm').createContext(context);await require('node:vm').runInContext(initSource+'\ninit()',context);assert.deepEqual(calls,[]);assert.equal(context.loggedIn,true);
 }
 const toggles={},reads=[],els={},toggleContext={busy:false,uiBusy:false,status(){},$:id=>els[id]||(els[id]={open:false,addEventListener:(name,fn)=>toggles[id]=fn}),refreshStaffClocks:async()=>reads.push('MY_CLOCKS'),refreshStaffApplications:async op=>reads.push(op)};
 const toggleSource=a['app.js'].slice(a['app.js'].indexOf('function prepareStaffRecords(){'),a['app.js'].indexOf('async function init(){'));
 require('node:vm').createContext(toggleContext);require('node:vm').runInContext(toggleSource+'\nprepareStaffRecords()',toggleContext);assert.deepEqual(reads,[]);
 for(const [id,op]of [['clockRecords','MY_CLOCKS'],['leaveRecords','MY_LEAVES'],['missingRecords','MY_MISSING']]){await toggles[id]();assert.equal(reads.includes(op),false);els[id].open=true;await toggles[id]();assert.equal(reads[reads.length-1],op);}
 const gpsSource=a['app.js'].slice(a['app.js'].indexOf('for(const [id,type] of [["clockIn"'),a['app.js'].indexOf('if(unknownWrite)document.querySelectorAll'));
 const handlers={},sent=[],gpsContext={busy:false,unknownWrite:false,onAction:(id,fn)=>handlers[id]=fn,status(){},freshHex:()=> '1234567890abcdef',preserveId(){},$:()=>({value:''}),execute:async op=>{sent.push(op);return {ok:true};}};
 require('node:vm').createContext(gpsContext);require('node:vm').runInContext(gpsSource,gpsContext);await handlers.clockIn();assert.deepEqual(sent,['GPS_CLOCK']);
 console.log('PASS logged-in entry makes no history calls; panels read only when opened; clock success makes no follow-up history call');
 const pending={operation:'GPS_CLOCK',requestId:'V2_GPS_SYNTHETIC_123',type:'上班'};
 const found={requestId:pending.requestId,type:'上班',time:'09:01:02'};
 let r=await checkRefresh(null,null,{ok:true});assert.deepEqual(r.calls,['MY_CLOCKS']);
 r=await checkRefresh(pending,found,{ok:true});assert.deepEqual(r.calls,['GPS_STATUS','MY_CLOCKS']);assert.equal(r.pending,null);assert.match(r.messages[0][0],/已確認剛才上班打卡成功：09:01:02/);
 r=await checkRefresh(pending,null,{ok:true});assert.deepEqual(r.calls,['GPS_STATUS','MY_CLOCKS']);assert.equal(r.pending,pending);assert.equal(r.messages[0][1],'unknown');
 r=await checkRefresh(pending,found,undefined);assert.equal(r.pending,null);assert.match(r.messages[0][0],/不要重打/);
 console.log('PASS refresh-only recovery: saved original, unresolved lookup, failed history and normal refresh; no write or new ID');
 for(const [operation,kind,lookup] of [['MY_LEAVES','LEAVE_REQUEST','LEAVE_STATUS'],['MY_MISSING','MISSING_REQUEST','MISSING_STATUS']]){
  for(const saved of [true,false]){
   const calls=[],messages=[],p={operation:kind,requestId:'V2_SYNTHETIC_REQUEST_123'};
   const context={pendingWrite:p,status:(...x)=>messages.push(x)};
   context.execute=async op=>{calls.push(op);if(op===lookup){if(!saved)return undefined;context.pendingWrite=null;return {ok:true,result:{request:{requestId:p.requestId}}};}return {ok:true};};
   require('node:vm').createContext(context);
   await require('node:vm').runInContext(refreshSource+'\nrefreshStaffApplications('+JSON.stringify(operation)+')',context);
   assert.deepEqual(calls,[lookup,operation]);assert.equal(context.pendingWrite,saved?null:p);assert.equal(messages[0][1],saved?'success':'unknown');
  }
 }
 console.log('PASS leave and missed-punch refresh recover only the same original; unresolved submissions stay blocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
