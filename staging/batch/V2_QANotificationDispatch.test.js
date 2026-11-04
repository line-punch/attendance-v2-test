"use strict";
const assert=require('node:assert/strict'),dispatch=require('./V2_QANotificationDispatch.js');
const to='U'+'2'.repeat(32),entry={deliveryKey:'QA_DISPATCH_TEST_001__V1:MANAGER_NOTICE:'+to,role:'MANAGER_NOTICE',to,message:{type:'text',text:'僅合成通知'}};
function fixture(options={}){
 const db=new Map();let calls=0,failSave=false,seen=[];
 const settings={enabled:options.enabled!==false,scope:'TEST001/TEST_CO',allowedTestRecipients:[to]};
 const io={withExclusive:fn=>fn(),load:key=>db.has(key)?JSON.parse(db.get(key)):null,save:row=>{
  if(failSave||options.failInitialSave)throw Error('synthetic persistence loss');db.set(row.deliveryKey,JSON.stringify(row));}};
 const adapter=dispatch.create({settings,io,uuid:()=> '123e4567-e89b-42d3-a456-426614174000',clock:()=> '2026-11-04T05:00:00.000Z',
  transport:{push:(body,headers)=>{calls++;seen.push({body,headers});
   assert.equal(io.load(entry.deliveryKey).state,'SENDING');
   if(options.failAfterSend)failSave=true;
   if(options.timeout)throw Error('synthetic timeout');
   return options.response||{status:200,headers:{'x-line-request-id':'LINE_SYNTHETIC_ACCEPTED'}};}}});
 return {adapter,db,io,seen,settings,calls:()=>calls};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('disabled sender never touches storage or transport',()=>{
 const f=fixture({enabled:false});assert.equal(f.adapter.send(entry).status,'DISABLED');assert.equal(f.calls(),0);assert.equal(f.db.size,0);
});
test('durable key precedes transport; accepted request is never sent twice',()=>{
 const f=fixture();assert.equal(f.adapter.send(entry).status,'ACCEPTED');assert.equal(f.adapter.send(entry).duplicate,true);assert.equal(f.calls(),1);
 assert.equal(f.seen[0].headers['X-Line-Retry-Key'],'123e4567-e89b-42d3-a456-426614174000');
});
test('timeout retains original key and body and blocks blind resend',()=>{
 const f=fixture({timeout:true});assert.equal(f.adapter.send(entry).status,'UNKNOWN');const original=f.io.load(entry.deliveryKey);
 assert.equal(f.adapter.send(entry).attempted,false);assert.equal(f.calls(),1);assert.deepEqual(f.io.load(entry.deliveryKey),original);
});
test('accepted response lost during persistence blocks another send after crash',()=>{
 const f=fixture({failAfterSend:true});assert.throws(()=>f.adapter.send(entry),/persistence loss/);
 assert.equal(f.io.load(entry.deliveryKey).state,'SENDING');assert.equal(f.adapter.send(entry).status,'UNKNOWN');assert.equal(f.calls(),1);
});
test('unconfirmed initial persistence and non-test recipient never transmit',()=>{
 const f=fixture({failInitialSave:true});assert.throws(()=>f.adapter.send(entry),/persistence loss/);assert.equal(f.calls(),0);
 const g=fixture();assert.throws(()=>g.adapter.send({...entry,to:'U'+'4'.repeat(32)}),/SCOPE_INVALID/);assert.equal(g.calls(),0);
});
test('same delivery key cannot change original message',()=>{
 const f=fixture();f.adapter.send(entry);assert.throws(()=>f.adapter.send({...entry,message:{type:'text',text:'changed'}}),/ORIGINAL_CONFLICT/);assert.equal(f.calls(),1);
});
test('409 requires original acceptance ID; 5xx is unknown and 4xx is not retried',()=>{
 for(const [response,state] of [[{status:409,headers:{'X-Line-Accepted-Request-Id':'ORIGINAL_ACCEPTED'}},'ACCEPTED'],
  [{status:409,headers:{}},'UNKNOWN'],[{status:503},'UNKNOWN'],[{status:403},'REJECTED']]){
  const f=fixture({response});assert.equal(f.adapter.send(entry).status,state);f.adapter.send(entry);assert.equal(f.calls(),1);
 }
});
test('postback reviewer card cannot enter live sender',()=>{
 const f=fixture();assert.throws(()=>f.adapter.send({...entry,role:'REVIEWER_CARD',deliveryKey:'QA_DISPATCH_TEST_001__V1:REVIEWER_CARD:'+to,
  message:{type:'flex',contents:{action:{type:'postback',data:'action=approve'}}}}),/LINK_REQUIRED/);assert.equal(f.calls(),0);
});
console.log(passed+'/'+passed+' offline sender checks passed; synthetic transport only');

