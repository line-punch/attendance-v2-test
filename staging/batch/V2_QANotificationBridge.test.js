"use strict";
const assert=require('node:assert/strict');
const bridge=require('./V2_QANotificationBridge.js'),core=require('./V2_BatchWorkflowCore.js');
const journal=require('./V2_BatchAppendJournal.js'),standard=require('./V2_OperationalExport.js');
const employee='U'+'1'.repeat(32),reviewer='U'+'3'.repeat(32);
const config={scope:'TEST001/TEST_CO',employee,reviewer,allowedTestRecipients:[employee,reviewer]};
async function exercise(kind,decision){
 const lines=[];
 const store=journal.make({withExclusive:async fn=>fn(),readRows:async()=>JSON.parse(JSON.stringify(lines)),
  appendRow:async row=>lines.push(row),utcNow:()=> '2026-11-04T00:30:00.000Z'});
 const staff={source:'VERIFIED_SERVER_BINDING',employeeId:'TEST001',company:'TEST_CO',active:true,role:'STAFF'};
 const service=core.create({store,calendar:{validateLeave:async()=>({ok:true,workingDays:2})},clock:{today:()=> '2026-11-04'},
  flags:Object.fromEntries(core.OPERATIONS.map(op=>[op,true])),identity:{verify:async token=>{
   if(token==='EMPLOYEE_FIXTURE')return staff;
   if(token==='REVIEWER_FIXTURE')return {...staff,employeeId:'QA_HR_TEST',role:'HR_OWNER'};
   throw Error('bad fixture token');}}});
 const id='QA_BRIDGE_'+kind+'_0001';
 const payload=kind==='LEAVE'?{requestId:id,leaveType:'事假',startDate:'2026-11-09',endDate:'2026-11-10',unit:'DAY',reason:'合成接線測試'}:
  {requestId:id,date:'2026-11-03',time:'08:30',type:'上班',reason:'合成接線測試'};
 const result=await service.handle({operation:kind==='LEAVE'?'LEAVE_REQUEST':'MISSING_REQUEST',payload,credential:'EMPLOYEE_FIXTURE'});
 assert.equal(result.ok,true);assert.equal(lines.length,1);
 const snapshot=()=>({ledger:[journal.HEADERS,...JSON.parse(JSON.stringify(lines))],normal:[standard.CLOCK_HEADERS]});
 const stale=snapshot(),pending=bridge.preview(stale,config);
 assert.equal(pending.plans.length,1);assert.equal(pending.delivery,'NOT_SENT');
 const actions=pending.plans[0].entries[0].message.contents.footer.contents;
 const data=actions[decision==='APPROVE'?0:1].action.data;
 const input={snapshot:stale,config,data,principal:{source:'VERIFIED_QA_LINE_EVENT',sub:reviewer,company:'TEST_CO'},service};
 const denied=await bridge.review({...input,credential:'EMPLOYEE_FIXTURE'});
 assert.equal(denied.code,'HR_ONLY');assert.equal(lines.length,1);
 const reviewed=await bridge.review({...input,credential:'REVIEWER_FIXTURE'});
 assert.equal(reviewed.ok,true);assert.equal(lines.length,2);
 const duplicate=await bridge.review({...input,credential:'REVIEWER_FIXTURE'});
 assert.equal(duplicate.duplicate,true);assert.equal(lines.length,2);
 const conflict=await bridge.review({...input,credential:'REVIEWER_FIXTURE',data:actions[decision==='APPROVE'?1:0].action.data});
 assert.equal(conflict.code,'REVIEW_CONFLICT');assert.equal(lines.length,2);
 const after=bridge.preview(snapshot(),config);
 assert.equal(after.skipped[0].reason,'ALREADY_REVIEWED');assert.equal(after.plans.length,1);
 assert.equal(after.plans[0].entries[0].to,employee);assert.equal(after.plans[0].entries[0].message.type,'text');
 assert.equal(snapshot().normal.length,1); // no normal attendance from missed/leave review
 console.log('PASS '+kind+' '+decision+': original -> card -> verified Core review -> employee result; replay/conflict protected');
}
(async()=>{await exercise('LEAVE','APPROVE');await exercise('MISSING','REJECT');
 console.log('2/2 offline workflow integration checks passed; no cloud or LINE calls');
})().catch(e=>{console.error(e);process.exitCode=1;});

