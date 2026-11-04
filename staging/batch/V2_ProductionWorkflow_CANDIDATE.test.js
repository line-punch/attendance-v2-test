"use strict";
// Entirely offline synthetic multi-employee checks. No real HR data or decisions.
const assert=require('node:assert/strict'),candidate=require('./V2_ProductionWorkflow_CANDIDATE.js'),core=require('./V2_BatchWorkflowCore.js');
const sub=n=>'U'+String(n).repeat(32),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const bindings={employees:[
  {employeeId:'SYN_A',company:'CO_A',lineSub:sub(1),active:true},
  {employeeId:'SYN_B',company:'CO_A',lineSub:sub(2),active:true},
  {employeeId:'SYN_C',company:'CO_B',lineSub:sub(3),active:true}],
  reviewers:[{reviewerId:'SYN_M1',lineSub:sub(4),active:true},{reviewerId:'SYN_M2',lineSub:sub(5),active:true}],
  assignments:[{employeeId:'SYN_A',reviewerSub:sub(4),noticeSubs:[sub(4),sub(4)]},
   {employeeId:'SYN_B',reviewerSub:sub(5),noticeSubs:[]},{employeeId:'SYN_C',reviewerSub:sub(4),noticeSubs:[]}]};
 let db={rows:[],events:[]},verifies=0,loads=0,changeOnNextStorage=null;
 const store={};
 for(const mode of ['read','transaction'])store[mode]=async fn=>{
  if(changeOnNextStorage){changeOnNextStorage();changeOnNextStorage=null;}
  const backup=clone(db),tx={find:async id=>clone(db.rows.find(r=>r.requestId===id)||null),list:async()=>clone(db.rows)};
  if(mode==='transaction')Object.assign(tx,{create:async row=>{assert.ok(!db.rows.some(r=>r.requestId===row.requestId));db.rows.push(clone(row));},
   replace:async row=>{const i=db.rows.findIndex(r=>r.requestId===row.requestId);assert.ok(i>=0);db.rows[i]=clone(row);},outbox:async e=>db.events.push(clone(e))});
  try{return await fn(tx);}catch(e){db=backup;throw e;}
 };
 const flags=Object.fromEntries(core.OPERATIONS.map(op=>[op,true]));
 const app=candidate.create({verifyLine:async token=>{verifies++;if(!/^[1-5]$/.test(token))throw Error('bad token');return {source:'VERIFIED_LINE_ID_TOKEN',sub:sub(token)};},
  loadBindings:async()=>{loads++;return clone(bindings);},store,flags,
  calendar:{validateLeave:async()=>({ok:true,workingDays:1})},clock:{today:()=> '2026-11-04'}});
 const call=(operation,payload={},credential='1')=>app.handle({operation,payload,credential});
 const leave=(requestId)=>({requestId,leaveType:'事假',startDate:'2026-11-05',endDate:'2026-11-05',unit:'DAY',reason:'synthetic'});
 return {bindings,call,leave,flags,db:()=>clone(db),counts:()=>({verifies,loads}),onStorage:fn=>{changeOnNextStorage=fn;}};
}
const tests=[];function test(name,fn){tests.push([name,fn]);}
test('employee IDs are globally unique even across companies; duplicate LINE binding fails closed',()=>{
 const f=fixture();f.bindings.employees[1].employeeId='SYN_A';assert.throws(()=>candidate.compile(f.bindings),/EMPLOYEE/);
 const g=fixture();g.bindings.employees[1].lineSub=sub(1);assert.throws(()=>candidate.compile(g.bindings),/EMPLOYEE/);
});
test('missing reviewer, repeated mapping and self-review are rejected',()=>{
 const f=fixture();f.bindings.assignments[0].reviewerSub=sub(9);assert.throws(()=>candidate.compile(f.bindings),/ASSIGNMENT/);
 const g=fixture();g.bindings.assignments.push(g.bindings.assignments[0]);assert.throws(()=>candidate.compile(g.bindings),/ASSIGNMENT/);
 const h=fixture();h.bindings.reviewers[0].lineSub=sub(1);h.bindings.assignments[0].reviewerSub=sub(1);assert.throws(()=>candidate.compile(h.bindings),/ASSIGNMENT/);
});
test('unverified credential and disabled operation perform no data mutation',async()=>{
 const f=fixture();assert.equal((await f.call('MY_LEAVES',{month:'2026-11'},'bad')).code,'AUTH_REQUIRED');
 f.flags.LEAVE_REQUEST=false;const before=f.counts();assert.equal((await f.call('LEAVE_REQUEST',f.leave('SYN_LEAVE_DISABLED_01'))).code,'FEATURE_DISABLED');assert.deepEqual(f.counts(),before);assert.equal(f.db().rows.length,0);
});
test('staff monthly records and original lookup remain personal within the same company',async()=>{
 const f=fixture();await f.call('LEAVE_REQUEST',f.leave('SYN_LEAVE_EMPLOYEE_A1'));
 await f.call('LEAVE_REQUEST',f.leave('SYN_LEAVE_EMPLOYEE_B1'),'2');
 assert.equal((await f.call('MY_LEAVES',{month:'2026-11'})).total,1);
 assert.equal((await f.call('LEAVE_STATUS',{requestId:'SYN_LEAVE_EMPLOYEE_B1'})).code,'NOT_FOUND');
 assert.equal((await f.call('HR_REVIEW',{requestId:'SYN_LEAVE_EMPLOYEE_A1',decision:'APPROVE'})).code,'HR_ONLY');
});
test('client cannot select another employee, company or role',async()=>{
 const f=fixture();const r=await f.call('LEAVE_REQUEST',{...f.leave('SYN_LEAVE_SPOOFED_01'),employeeId:'SYN_B',company:'CO_B',role:'HR_OWNER'});
 assert.equal(r.ok,false);assert.equal(f.db().rows.length,0);
});
test('same-company reviewer sees only assigned requests; another reviewer cannot approve',async()=>{
 const f=fixture();await f.call('LEAVE_REQUEST',f.leave('SYN_REVIEW_ASSIGN_A1'));await f.call('LEAVE_REQUEST',f.leave('SYN_REVIEW_ASSIGN_B1'),'2');
 const list=await f.call('HR_PENDING',{},'4');assert.deepEqual(list.pending.map(x=>x.employeeId),['SYN_A']);
 assert.equal((await f.call('HR_STATUS',{requestId:'SYN_REVIEW_ASSIGN_B1'},'4')).code,'NOT_FOUND');
 assert.equal((await f.call('HR_REVIEW',{requestId:'SYN_REVIEW_ASSIGN_B1',decision:'APPROVE'},'4')).code,'NOT_FOUND');assert.equal(f.db().events.length,2);
});
test('one assigned reviewer can handle assigned employees across companies without seeing others',async()=>{
 const f=fixture();await f.call('LEAVE_REQUEST',f.leave('SYN_CROSSCOMPANY_A1'));await f.call('LEAVE_REQUEST',f.leave('SYN_CROSSCOMPANY_B1'),'2');await f.call('LEAVE_REQUEST',f.leave('SYN_CROSSCOMPANY_C1'),'3');
 const list=await f.call('HR_PENDING',{},'4');assert.deepEqual(list.pending.map(x=>x.employeeId).sort(),['SYN_A','SYN_C']);
 const r=await f.call('HR_REVIEW',{requestId:'SYN_CROSSCOMPANY_C1',decision:'APPROVE'},'4');assert.equal(r.ok,true);assert.equal(f.db().rows[2].reviewedBy,'SYN_M1');
});
test('duplicate approval is idempotent and opposite decision conflicts',async()=>{
 const f=fixture(),id='SYN_IDEMPOTENT_REVIEW_01';await f.call('LEAVE_REQUEST',f.leave(id));
 const p={requestId:id,decision:'APPROVE'};assert.equal((await f.call('HR_REVIEW',p,'4')).ok,true);
 const before=f.db();assert.equal((await f.call('HR_REVIEW',p,'4')).duplicate,true);assert.deepEqual(f.db(),before);
 assert.equal((await f.call('HR_REVIEW',{...p,decision:'REJECT'},'4')).code,'REVIEW_CONFLICT');assert.deepEqual(f.db(),before);
});
test('supervisor reassignment is checked inside storage before review mutation',async()=>{
 const f=fixture(),id='SYN_REASSIGNED_REVIEW_01';await f.call('LEAVE_REQUEST',f.leave(id));
 f.onStorage(()=>{f.bindings.assignments[0].reviewerSub=sub(5);});
 assert.equal((await f.call('HR_REVIEW',{requestId:id,decision:'APPROVE'},'4')).code,'NOT_FOUND');assert.equal(f.db().rows[0].status,'PENDING');
});
test('inactive employee data and inactive reviewer are unavailable',async()=>{
 const f=fixture(),id='SYN_INACTIVE_ACCESS_01';await f.call('LEAVE_REQUEST',f.leave(id));f.bindings.employees[0].active=false;
 assert.equal((await f.call('MY_LEAVES',{month:'2026-11'})).code,'AUTH_REQUIRED');assert.equal((await f.call('HR_STATUS',{requestId:id},'4')).code,'NOT_FOUND');
 f.bindings.reviewers[0].active=false;assert.equal((await f.call('HR_PENDING',{},'4')).code,'HR_ONLY');
});
test('foreign request ID collision cannot overwrite another employee original',async()=>{
 const f=fixture(),id='SYN_FOREIGN_COLLISION_01';await f.call('LEAVE_REQUEST',f.leave(id));const before=f.db();
 await assert.rejects(f.call('LEAVE_REQUEST',f.leave(id),'2'),/REQUEST_ID_CONFLICT/);assert.deepEqual(f.db(),before);
});
test('notification mapping deduplicates notices but keeps reviewer role distinct',async()=>{
 const f=fixture();await f.call('LEAVE_REQUEST',f.leave('SYN_NOTICE_MAPPING_01'));
 const r=candidate.compile(f.bindings).notificationRecipients(f.db().rows[0]);assert.deepEqual(r,{employee:sub(1),reviewer:sub(4),noticeSubs:[sub(4)]});
});
test('missed punch remains its own application and only its assigned reviewer may reject',async()=>{
 const f=fixture(),id='SYN_MISSING_REVIEW_01';
 const r=await f.call('MISSING_REQUEST',{requestId:id,date:'2026-11-04',type:'下班',time:'17:31',reason:'synthetic'});
 assert.equal(r.ok,true);assert.equal((await f.call('MY_LEAVES',{month:'2026-11'})).total,0);
 assert.equal((await f.call('MY_MISSING',{month:'2026-11'})).total,1);
 assert.equal((await f.call('HR_REVIEW',{requestId:id,decision:'REJECT'},'5')).code,'NOT_FOUND');
 assert.equal((await f.call('HR_REVIEW',{requestId:id,decision:'REJECT'},'4')).ok,true);
 assert.equal(f.db().rows[0].kind,'MISSING');assert.equal(f.db().rows[0].status,'REJECTED');
});
test('malformed payload is rejected before token or source reads',async()=>{
 const f=fixture();for(const payload of [null,[],1,'bad'])assert.equal((await f.call('HR_PENDING',payload,'4')).code,'INVALID_FORM_FIELDS');
 assert.deepEqual(f.counts(),{verifies:0,loads:0});
});
test('a supervisor may also be an employee but cannot review their own application or remain active after leaving',async()=>{
 const f=fixture();f.bindings.employees.push({employeeId:'SYN_M1',company:'CO_A',lineSub:sub(4),active:true});
 f.bindings.assignments.push({employeeId:'SYN_M1',reviewerSub:sub(5),noticeSubs:[]});
 const id='SYN_MANAGER_OWN_LEAVE_01';assert.equal((await f.call('LEAVE_REQUEST',f.leave(id),'4')).ok,true);
 assert.equal((await f.call('MY_LEAVES',{month:'2026-11'},'4')).total,1);
 assert.equal((await f.call('HR_REVIEW',{requestId:id,decision:'APPROVE'},'4')).code,'NOT_FOUND');
 assert.equal((await f.call('HR_REVIEW',{requestId:id,decision:'APPROVE'},'5')).ok,true);
 f.bindings.employees[3].active=false;assert.equal((await f.call('HR_PENDING',{},'4')).code,'HR_ONLY');
});
(async()=>{for(const [name,fn]of tests){await fn();console.log('PASS '+name);}console.log(tests.length+'/'+tests.length+' offline synthetic candidate checks; no real accounts, decisions or deployment');})().catch(e=>{console.error(e);process.exitCode=1;});

