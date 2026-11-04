"use strict";
const assert=require('node:assert/strict'),n=require('./V2_QANotificationPlan.js');
const employee='U'+'1'.repeat(32),manager='U'+'2'.repeat(32),reviewer='U'+'3'.repeat(32);
const config={scope:'TEST001/TEST_CO',employee,manager1:manager,manager2:manager,reviewer,
 allowedTestRecipients:[employee,manager,reviewer]};
const row={employeeId:'TEST001',company:'TEST_CO',kind:'LEAVE',requestId:'QA_NOTICE_TEST_001',
 status:'PENDING',body:{startDate:'2026-11-09',endDate:'2026-11-10'}};
const event={type:'LEAVE_SUBMITTED',requestId:row.requestId,eventKey:row.requestId+'__V1'};
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('two identical notice managers get one text; reviewer gets approve/reject card',()=>{
 const p=n.plan(event,row,config);assert.equal(p.entries.length,2);
 assert.equal(p.entries[0].message.type,'text');
 const buttons=p.entries[1].message.contents.footer.contents;
 assert.deepEqual(buttons.map(b=>b.action.label),['核准','駁回']);
 assert.ok(buttons.every(b=>!b.action.data.includes('action=approve')));
 assert.equal(p.delivery,'NOT_SENT');assert.equal(p.requiresDedicatedVerifiedQARoute,true);
});
test('reviewer also receives a notice when assigned both roles, with distinct stable delivery keys',()=>{
 const c={...config,manager1:reviewer,manager2:manager};const a=n.plan(event,row,c),b=n.plan(event,row,c);
 assert.equal(a.entries.length,3);assert.equal(new Set(a.entries.map(e=>e.deliveryKey)).size,3);
 assert.deepEqual(a,b);
});
test('non-test employee, unlisted recipient and overlapping employee/reviewer fail closed',()=>{
 assert.throws(()=>n.plan(event,{...row,company:'REAL_CO'},config),/QA_SCOPE/);
 assert.throws(()=>n.plan(event,row,{...config,allowedTestRecipients:[employee,manager]}),/NOT_ALLOWED/);
 assert.throws(()=>n.plan(event,row,{...config,reviewer:employee}),/RECIPIENTS_REQUIRED/);
});
test('review result goes only to original employee; stale or mismatched event rejected',()=>{
 const reviewed={...row,status:'APPROVED'};
 const p=n.plan({...event,type:'REVIEWED',status:'APPROVED'},reviewed,config);
 assert.equal(p.entries.length,1);assert.equal(p.entries[0].to,employee);
 assert.throws(()=>n.plan(event,reviewed,config),/STATE_MISMATCH/);
 assert.throws(()=>n.plan({...event,requestId:'QA_OTHER_00001'},row,config),/EVENT_INVALID/);
});
test('only verified designated reviewer can map callback to existing HR_REVIEW command',()=>{
 const data=n.plan(event,row,config).entries[1].message.contents.footer.contents[0].action.data;
 const principal={source:'VERIFIED_QA_LINE_EVENT',sub:reviewer,company:'TEST_CO'};
 assert.deepEqual(n.reviewCommand(data,row,principal,config),{operation:'HR_REVIEW',args:{requestId:row.requestId,decision:'APPROVE'}});
 for(const p of [{...principal,sub:manager},{...principal,source:'CLIENT'},{...principal,company:'OTHER'}])
  assert.throws(()=>n.reviewCommand(data,row,p,config),/REVIEWER_REQUIRED/);
 for(const d of [data+'&qa=v2',data+'&action=approve',data.replace('QA_NOTICE_TEST_001','QA_OTHER_00001'),'action=approve&type=leave&no='+row.requestId])
  assert.throws(()=>n.reviewCommand(d,row,principal,config),/CALLBACK_INVALID/);
});
test('missed punch notice uses original date/time and remains separate from normal attendance',()=>{
 const missed={...row,kind:'MISSING',body:{date:'2026-11-03',time:'08:30',type:'上班'}};
 const p=n.plan({...event,type:'MISSING_SUBMITTED'},missed,config);
 assert.match(p.entries[0].message.text,/2026-11-03 上班 08:30/);
 assert.equal(p.entries[1].message.contents.footer.contents[1].action.data.includes('kind=MISSING'),true);
});
console.log(passed+'/'+passed+' offline checks passed; no LINE messages sent');

