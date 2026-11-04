"use strict";
// Full synchronous bridge + real journal algorithm, with fake Google/LINE IO.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {make:readonlyFixture,sub}=require('./V2_CandidatePhone_Readonly.test.js');
const workflow=fs.readFileSync(path.join(__dirname,'V2_CandidatePhone_Workflow_Runtime_GENERATED.gs'),'utf8');
function fixture(){
 const f=readonlyFixture();vm.runInContext(workflow,f.context);
 let pushes=[],botQueries=0,mode='accepted',uuid=0;
 const verifyFetch=f.context.UrlFetchApp.fetch;
 f.context.UrlFetchApp.fetch=(url,options)=>{
  if(url==='https://api.line.me/v2/bot/info'){botQueries++;return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({basicId:'@qa_test'})};}
  if(url==='https://api.line.me/v2/bot/message/push'){
   pushes.push({body:JSON.parse(options.payload),retryKey:options.headers['X-Line-Retry-Key']});
   if(mode==='unknown')throw Error('SYNTHETIC_NETWORK_LOSS');
   return {getResponseCode:()=>mode==='rejected'?400:200,getAllHeaders:()=>({'X-Line-Request-Id':'SYN_LINE_'+pushes.length})};
  }
  return verifyFetch(url,options);
 };
 f.context.Utilities.getUuid=()=> '00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0');
 const notify=f.book.insertSheet('候選通知流水');notify.getRange(1,1,1,3).setValues([['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']]);
 function enable(notifications=false){Object.assign(f.props,{V2_CANDIDATE_PHONE_WRITE_ENABLED:'enabled',V2_CANDIDATE_NOTIFY_ENABLED:notifications?'enabled':'disabled',
  V2_QA_NOTIFY_TEST_RECIPIENTS:JSON.stringify([sub(4),sub(3)]),V2_QA_NOTIFY_TOKEN:'SYNTHETIC_TOKEN_'.repeat(5),V2_QA_NOTIFY_CONFIRMED_BOT_BASIC_ID:'@qa_test'});}
 const leave=id=>({requestId:id,leaveType:'事假',startDate:'2026-11-06',endDate:'2026-11-06',unit:'DAY',reason:'pure synthetic candidate test'});
 const journalRows=()=>f.sheets.get('候選交易流水').getLastRow();
 return {...f,enable,leave,journalRows,pushes,botQueries:()=>botQueries,setMode:x=>{mode=x;},notify};
}
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
test('workflow has private functions only and no admin fixture initializer or automatic trigger',()=>{
 assert.ok(!/function\s+desktopMultiUserQa/.test(workflow));assert.ok(!/ScriptApp\.newTrigger/.test(workflow));
 const named=[...workflow.matchAll(/^function\s+(v2\w+)\s*\(/gm)].map(x=>x[1]);assert.ok(named.every(n=>n.endsWith('_')));
});
test('writes default disabled even while readonly queries are enabled',()=>{
 const f=fixture(),before=f.counts();for(const op of ['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'])assert.equal(f.post(op,{}).code,'DISABLED');assert.deepEqual(f.counts(),before);assert.equal(f.pushes.length,0);
});
test('candidate write gate cannot be used simultaneously with old QA or admin test write flags',()=>{
 for(const flag of ['V2_BATCH_QA_WRITE_ENABLED','V2_QA_NOTIFY_ENABLED','V2_MULTIUSER_QA_ENABLED']){
  const f=fixture();f.enable();f.props[flag]='enabled';assert.equal(f.post('LEAVE_REQUEST',f.leave('QA_CANDIDATE_GATE_001')).code,'DISABLED');assert.equal(f.journalRows(),5);
 }
});
test('one candidate leave creates one journal row and replay adds neither row nor notification',()=>{
 const f=fixture(),id='QA_CANDIDATE_LEAVE_001';f.enable();const before=f.journalRows();
 assert.equal(f.post('LEAVE_REQUEST',f.leave(id)).ok,true);assert.equal(f.journalRows(),before+1);assert.equal(f.pushes.length,0);
 assert.equal(f.post('LEAVE_STATUS',{requestId:id}).result.request.status,'PENDING');assert.equal(f.post('LEAVE_REQUEST',f.leave(id)).result.duplicate,true);assert.equal(f.journalRows(),before+1);
});
test('new leave sends only its own notice/card, with candidate LIFF links, and approval sends one result',()=>{
 const f=fixture(),id='QA_CANDIDATE_AUTO_0001';f.enable(true);
 const r=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);assert.equal(r.result.notification,'ACCEPTED');assert.equal(f.pushes.length,2);
 assert.deepEqual(f.pushes.map(x=>x.body.to),[sub(3),sub(3)]);
 const uri=f.pushes[1].body.messages[0].contents.footer.contents[0].action.uri;assert.ok(uri.startsWith('https://liff.line.me/2012136707-CgGNZAuq/candidate/?qaReviewId='+id));
 f.post('LEAVE_REQUEST',f.leave(id));assert.equal(f.pushes.length,2);
 assert.equal(f.post('HR_REVIEW',{requestId:id,decision:'APPROVE'},3).ok,true);assert.equal(f.pushes.length,3);assert.equal(f.pushes[2].body.to,sub(4));
 const before=f.journalRows();assert.equal(f.post('HR_REVIEW',{requestId:id,decision:'APPROVE'},3).result.duplicate,true);assert.equal(f.pushes.length,3);assert.equal(f.journalRows(),before);
 assert.equal(f.notify.getLastRow(),7); // three SENDING plus three ACCEPTED.
});
test('staff and unrelated identities cannot review or create another identity records',()=>{
 const f=fixture(),id='QA_CANDIDATE_ROLES_001';f.enable();f.post('LEAVE_REQUEST',f.leave(id));const before=f.journalRows();
 assert.equal(f.post('HR_REVIEW',{requestId:id,decision:'APPROVE'},4).code,'AUTH');assert.equal(f.post('HR_REVIEW',{requestId:id,decision:'APPROVE'},5).code,'AUTH');
 assert.equal(f.post('LEAVE_REQUEST',{...f.leave('QA_CANDIDATE_SPOOF_001'),employeeId:'OTHER'}).ok,false);assert.equal(f.journalRows(),before);
});
test('unknown notification outcome leaves application success and blocks another outbound attempt',()=>{
 const f=fixture(),id='QA_CANDIDATE_UNKNOWN_01';f.enable(true);f.setMode('unknown');
 const r=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);assert.equal(r.result.notification,'UNKNOWN');assert.equal(f.pushes.length,1);
 const before=f.journalRows();f.setMode('accepted');const again=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(again.ok,true);assert.equal(again.result.notification,'UNKNOWN');assert.equal(f.pushes.length,1);assert.equal(f.journalRows(),before);
});
test('recipient changes outside the two approved QA accounts cannot send',()=>{
 const f=fixture(),id='QA_CANDIDATE_ALLOW_001';f.enable(true);f.props.V2_QA_NOTIFY_TEST_RECIPIENTS=JSON.stringify([sub(4),sub(3),sub(5)]);
 const r=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);assert.equal(r.result.notification,'PENDING');assert.equal(f.pushes.length,0);assert.equal(f.botQueries(),0);
});
test('notification rejection is retained and never blindly retried',()=>{
 const f=fixture(),id='QA_CANDIDATE_REJECT_01';f.enable(true);f.setMode('rejected');const r=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);assert.equal(r.result.notification,'REJECTED');assert.equal(f.pushes.length,1);
 f.setMode('accepted');f.post('LEAVE_REQUEST',f.leave(id));assert.equal(f.pushes.length,1);
});
test('missed application rejection stays outside the normal-clock store',()=>{
 const f=fixture(),id='QA_CANDIDATE_MISS_001';f.enable(true);const normal=f.sheets.get('候選正常打卡').getDataRange().getValues();
 assert.equal(f.post('MISSING_REQUEST',{requestId:id,date:'2026-11-04',type:'下班',time:'17:31',reason:'synthetic'}).ok,true);
 assert.equal(f.post('HR_REVIEW',{requestId:id,decision:'REJECT'},3).ok,true);assert.equal(f.post('MISSING_STATUS',{requestId:id}).result.request.status,'REJECTED');assert.deepEqual(f.sheets.get('候選正常打卡').getDataRange().getValues(),normal);
});
test('GPS uses approved QA site from server and keeps one independent normal row',()=>{
 const f=fixture(),id='QA_GPS_CANDIDATE_OUT_01';f.enable();const format=f.context.Utilities.formatDate;f.context.Utilities.formatDate=(d,z,p)=>p==='HH:mm:ss'?'18:00:00':format(d,z,p);
 const before=f.sheets.get('候選正常打卡').getLastRow();const args={requestId:id,type:'下班',lat:25,lng:121,accuracy:10,capturedAt:Date.now()};
 assert.equal(f.post('GPS_CLOCK',args).ok,true);assert.equal(f.sheets.get('候選正常打卡').getLastRow(),before+1);assert.equal(f.post('GPS_CLOCK',args).result.duplicate,true);
 assert.equal(f.post('GPS_CLOCK',{...args,requestId:'QA_GPS_CANDIDATE_2OUT'}).reason,'ALREADY_CLOCKED');assert.equal(f.pushes.length,0);
 const saved=JSON.parse(f.sheets.get('候選正常打卡').getRange(before+1,2,1,1).getValues()[0][0]);assert.ok(!Object.hasOwn(saved,'lat'));assert.ok(!Object.hasOwn(saved,'lng'));
});
test('write response loss after physical append returns UNKNOWN; original lookup and replay create no second row',()=>{
 const f=fixture(),id='QA_CANDIDATE_PERSIST_01';f.enable();const sheet=f.sheets.get('候選交易流水'),get=sheet.getRange;let lose=true;
 sheet.getRange=(...args)=>{const range=get(...args),save=range.setValues;range.setValues=values=>{save(values);if(lose){lose=false;throw Error('SYNTHETIC_LOSS_AFTER_COMMIT');}};return range;};
 const before=f.journalRows(),r=f.post('LEAVE_REQUEST',f.leave(id));assert.equal(r.code,'UNKNOWN');assert.equal(r.persisted,null);assert.equal(f.journalRows(),before+1);
 assert.equal(f.post('LEAVE_STATUS',{requestId:id}).result.request.status,'PENDING');assert.equal(f.post('LEAVE_REQUEST',f.leave(id)).result.duplicate,true);assert.equal(f.journalRows(),before+1);
});
console.log(passed+'/'+passed+' offline candidate write/notification integration checks; no actual Google, LINE delivery or GPS');
