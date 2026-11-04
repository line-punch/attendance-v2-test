"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const journal=require('./V2_BatchAppendJournal.js');
const runtime=fs.readFileSync(path.join(__dirname,'V2_QANotificationRuntime_GENERATED.gs'),'utf8');
const employee='U'+'1'.repeat(32),reviewer='U'+'3'.repeat(32),manager='U'+'2'.repeat(32);
function fixture(){
 const sourceId='QA_SOURCE_12345678901234567890',bookId='QA_DEST_12345678901234567890';
 const props={V2_BATCH_QA_ENABLED:'enabled',V2_BATCH_QA_SOURCE_BOOK_ID:sourceId,V2_BATCH_QA_BOOK_ID:bookId,
  V2_BATCH_QA_HR_LINE_SUB:reviewer,V2_QA_NOTIFY_TEST_RECIPIENTS:JSON.stringify([employee,reviewer,manager]),V2_QA_NOTIFY_MANAGERS:JSON.stringify([manager,manager])};
 const record={requestId:'QA_WORKER_TEST_0001',kind:'MISSING',employeeId:'TEST001',company:'TEST_CO',status:'PENDING',fingerprint:'SYNTHETIC',
  body:{date:'2026-11-03',type:'上班',time:'08:30',reason:'合成'}};
 const event={requestId:record.requestId,type:'MISSING_SUBMITTED'};
 const row=[record.requestId+'__V1',record.requestId,1,JSON.stringify(record),JSON.stringify(event),'2026-11-04T00:00:00Z','ROOT'];
 let hash=2166136261;for(const c of row.join('\u001f')){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}row.push(hash.toString(16).padStart(8,'0'));
 let made=0,network=0;
 const sheets={'V2_交易流水_QA':{getLastRow:()=>2,getLastColumn:()=>8,getDataRange:()=>({getValues:()=>[journal.HEADERS.slice(),row.slice()]})}};
 const book={getId:()=>bookId,getName:()=> 'YC_ATTENDANCE_V2_BATCH_QA_ONLY',getSheetByName:name=>sheets[name]||null,
  insertSheet:name=>{made++;let values=[];const s={getRange:()=>({setValues:v=>{values=v},getValues:()=>values}),getDataRange:()=>({getValues:()=>values.slice()}),getLastRow:()=>values.length,getLastColumn:()=>values[0]?.length||0};sheets[name]=s;return s;}};
 const source={getId:()=>sourceId,getName:()=> 'YC_ATTENDANCE_V2_TEST_ONLY',getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[['TEST001','合成','',employee,'TEST_CO','','在職','TESTSITE']]})})};
 const ctx=vm.createContext({URL,console:{log(){}},V2BatchAppendJournal:journal,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
  SpreadsheetApp:{openById:id=>{if(id===sourceId)return source;if(id===bookId)return book;throw Error('OUTSIDE_QA');},flush(){}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  v2QANotificationSendCandidate_:()=>{network++;return {status:'ACCEPTED',attempted:true};}});
 vm.runInContext(runtime,ctx);return {ctx,props,book,made:()=>made,network:()=>network};
}
let pass=0;function test(name,fn){fn();pass++;console.log('PASS '+name);}
test('generated GAS builds exact separate text and LIFF reviewer plans from validated journal',()=>{
 const f=fixture(),plans=f.ctx.v2QANotificationPlans_(f.ctx.v2QANotificationContext_());
 assert.equal(plans.length,2);assert.equal(plans[0].to,manager);assert.equal(plans[1].to,reviewer);
 assert.equal(plans[1].message.contents.footer.contents[0].action.type,'uri');assert.equal(f.network(),0);
});
test('ledger initialization is QA-only and preserves existing sheet on repeated setup',()=>{
 const f=fixture();f.ctx.desktopQaNotificationInitializeLedger();f.ctx.desktopQaNotificationInitializeLedger();assert.equal(f.made(),1);assert.equal(f.network(),0);
});
test('default drain is disabled; enabled drain consumes the existing original plans',()=>{
 const f=fixture();assert.equal(f.ctx.desktopQaNotificationDrain().status,'DISABLED');assert.equal(f.network(),0);
 f.ctx.desktopQaNotificationInitializeLedger();
 f.props.V2_QA_NOTIFY_ENABLED='enabled';f.props.V2_BATCH_QA_WRITE_ENABLED='enabled';
 const result=f.ctx.desktopQaNotificationDrain();assert.equal(result.attempted,2);assert.equal(f.network(),2);
});
test('changed plan or changed manager is rejected before send',()=>{
 const f=fixture(),entry=f.ctx.v2QANotificationPlans_(f.ctx.v2QANotificationContext_())[0];
 assert.equal(f.ctx.v2QANotificationCurrentEntry_(entry),true);
 assert.throws(()=>f.ctx.v2QANotificationCurrentEntry_({...entry,message:{type:'text',text:'changed'}}),/STALE_OR_CHANGED/);
 f.props.V2_QA_NOTIFY_MANAGERS='[]';assert.throws(()=>f.ctx.v2QANotificationCurrentEntry_(entry),/STALE_OR_CHANGED/);assert.equal(f.network(),0);
});
test('read-only queue status remains useful before reviewer or recipients are configured',()=>{
 const f=fixture();delete f.props.V2_BATCH_QA_HR_LINE_SUB;delete f.props.V2_QA_NOTIFY_TEST_RECIPIENTS;
 const status=f.ctx.desktopQaNotificationQueueStatus();assert.equal(status.pendingApplications,1);assert.equal(status.reviewerConfigured,false);assert.equal(status.notificationEnabled,false);assert.equal(f.network(),0);
});
test('readiness reports missing final setup without exposing user IDs or sending anything',()=>{
 const f=fixture();delete f.props.V2_BATCH_QA_HR_LINE_SUB;
 const result=f.ctx.desktopQaReadinessReport();assert.equal(result.readyToEnableQA,false);assert.equal(result.modified,false);
 assert.equal(result.messagesSent,0);assert.equal(result.productionSwitched,false);
 assert.ok(result.checks.some(x=>x.item==='測試審核身分'&&!x.passed));
 assert.equal(JSON.stringify(result).includes(employee),false);assert.equal(JSON.stringify(result).includes(reviewer),false);assert.equal(f.network(),0);
});
console.log(pass+'/'+pass+' offline generated-worker checks passed');

