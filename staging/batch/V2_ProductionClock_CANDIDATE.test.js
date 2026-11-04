"use strict";
// Offline synthetic fixtures only: no LINE, Google, real employees or device GPS.
const assert=require('node:assert/strict'),tables=require('./V2_ProductionTables_CANDIDATE.js'),clockModule=require('./V2_ProductionClock_CANDIDATE.js');
const sub=n=>'U'+String(n).repeat(32),copy=x=>JSON.parse(JSON.stringify(x));
function raw(){return {employees:[tables.HEADERS.employees.slice(),
 ['SYN_A','合成甲','',sub(1),'CO_A','','在職','SITE_A'],
 ['SYN_B','合成乙','',sub(2),'CO_B','','在職','SITE_B'],
 ['SYN_M','合成主管','',sub(3),'CO_A','','',''],
 ['SYN_UNBOUND','未綁定合成人員','','','CO_A','','在職','SITE_A']],
 sites:[tables.HEADERS.sites.slice(),['SITE_A','合成場地甲','CO_A','(25,121)',100],['SITE_B','合成場地乙','CO_B','24,120',50]],
 assignments:[tables.HEADERS.assignments.slice(),['SYN_A','合成甲',sub(3),sub(3),sub(3)],['SYN_B','合成乙','','',sub(3)]]};}
function fixture(){
 const source=raw(),rows=[];let afterAppend=false,reads=0,writes=0;
 const now={epochMs:Date.parse('2026-11-04T09:00:00Z'),date:'2026-11-04',time:'17:00:00',utc:'2026-11-04T09:00:00Z'};
 const flags={GPS_CLOCK:true,GPS_STATUS:true,MY_CLOCKS:true};
 const io=async fn=>{reads++;return fn({list:async()=>copy(rows),create:async r=>{assert.ok(!rows.some(x=>x.requestId===r.requestId));rows.push(copy(r));writes++;if(afterAppend){afterAppend=false;throw Error('SIMULATED_LOST_REPLY_AFTER_COMMIT');}}});};
 const app=clockModule.create({verifyLine:async token=>{if(!['1','2','3'].includes(token))throw Error('auth');return {source:'VERIFIED_LINE_ID_TOKEN',sub:sub(token)};},
  loadTables:async()=>tables.parse(source),normalStore:{read:io,transaction:io},clock:{now:()=>({...now})},flags});
 const input=(id='SYN_GPS_CLOCK_0001',extra={})=>({requestId:id,type:'上班',lat:25,lng:121,accuracy:10,capturedAt:now.epochMs,...extra});
 return {source,rows,now,flags,input,call:(operation,args={},credential='1')=>app.handle({operation,args,credential}),counts:()=>({reads,writes}),loseReply:()=>{afterAppend=true;}};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('exact observed headers map fields without exporting names or phone suffix',()=>{
 const data=tables.parse(raw());assert.equal(data.bindings.employees.length,4);assert.equal(data.bindings.reviewers[0].reviewerId,'SYN_M');
 assert.equal(data.bindings.employees[2].active,true);assert.equal(data.bindings.employees[3].lineSub,'');
 assert.equal(data.sites[0].radius,50);assert.equal(data.sites[0].configuredRadius,100);
 assert.ok(!JSON.stringify(data.bindings).includes('合成甲'));assert.ok(!Object.hasOwn(data.bindings.employees[0],'phone'));
});
test('unknown headers duplicate employees and malformed GPS centers fail closed',()=>{
 let t=raw();t.employees[0][0]='unexpected';assert.throws(()=>tables.parse(t),/HEADERS/);
 t=raw();t.employees[1][0]='SYN_B';assert.throws(()=>tables.parse(t),/EMPLOYEE/);
 t=raw();t.sites[1][3]='25junk,121';assert.throws(()=>tables.parse(t),/SITE/);
 t=raw();t.sites[1][4]=-1;assert.throws(()=>tables.parse(t),/SITE/);
});
test('unbound employee does not disable bound staff and cannot be forged through input',async()=>{
 const f=fixture();assert.equal((await f.call('GPS_CLOCK',f.input())).ok,true);
 assert.equal((await f.call('GPS_CLOCK',{...f.input('SYN_GPS_SPOOFED_01'),employeeId:'SYN_UNBOUND'})).code,'INVALID_FORM_FIELDS');assert.equal(f.rows.length,1);
});
test('employee list and original status cannot expose another company normal punch',async()=>{
 const f=fixture();await f.call('GPS_CLOCK',f.input());await f.call('GPS_CLOCK',f.input('SYN_GPS_CLOCK_0002',{lat:24,lng:120}),'2');
 const result=await f.call('MY_CLOCKS');assert.deepEqual(result.days,[{date:'2026-11-04',clockIn:'17:00:00',clockOut:''}]);
 assert.equal((await f.call('GPS_STATUS',{requestId:'SYN_GPS_CLOCK_0002',type:'上班'})).code,'NOT_FOUND');assert.equal(f.rows.length,2);
});
test('month view shows only real dates and never accepts a missed-application row as normal attendance',async()=>{
 const f=fixture();assert.deepEqual((await f.call('MY_CLOCKS')).days,[]);await f.call('GPS_CLOCK',f.input());
 assert.equal((await f.call('MY_CLOCKS')).days.length,1);f.rows.push({kind:'MISSING',source:'GPS',type:'上班'});
 assert.equal((await f.call('MY_CLOCKS')).code,'UNKNOWN');assert.equal(f.counts().writes,1);
});
test('50m cap rejects a synthetic 70m position despite a legacy 100m site setting',async()=>{
 const f=fixture();const r=await f.call('GPS_CLOCK',f.input('SYN_GPS_TOO_FAR_001',{lat:25+70/111195}));
 assert.equal(r.code,'OUT_OF_RANGE');assert.equal(f.rows.length,0);
 const near=await f.call('GPS_CLOCK',f.input('SYN_GPS_NEARBY_0001',{lat:25+40/111195}));assert.equal(near.ok,true);
});
test('freshness accuracy and invalid coordinates refuse writes',async()=>{
 for(const [extra,code]of [[{capturedAt:0},'GPS_EXPIRED'],[{accuracy:151},'GPS_ACCURACY'],[{accuracy:0},'GPS_ACCURACY'],[{lat:NaN},'GPS_INVALID'],[{lng:181},'GPS_INVALID']]){
  const f=fixture();assert.equal((await f.call('GPS_CLOCK',f.input(undefined,extra))).code,code);assert.equal(f.rows.length,0);
 }
});
test('same original returns its durable punch even if GPS later expired; new same-day type is blocked',async()=>{
 const f=fixture();await f.call('GPS_CLOCK',f.input());const again=await f.call('GPS_CLOCK',f.input(undefined,{capturedAt:0}));
 assert.equal(again.ok,true);assert.equal(again.duplicate,true);assert.equal(f.rows.length,1);
 assert.equal((await f.call('GPS_CLOCK',f.input('SYN_GPS_NEW_ID_0001'))).code,'ALREADY_CLOCKED');
 assert.equal((await f.call('GPS_CLOCK',f.input(undefined,{type:'下班'}))).code,'REQUEST_ID_CONFLICT');
});
test('up/down punch in same minute is blocked; later clock-out keeps the actual server time',async()=>{
 const f=fixture();await f.call('GPS_CLOCK',f.input());
 assert.equal((await f.call('GPS_CLOCK',f.input('SYN_GPS_OUT_SAME_01',{type:'下班'}))).code,'SAME_MINUTE');
 f.now.epochMs+=60000;f.now.time='17:01:00';f.now.utc='2026-11-04T09:01:00Z';
 assert.equal((await f.call('GPS_CLOCK',f.input('SYN_GPS_OUT_LATER01',{type:'下班'}))).ok,true);
 assert.equal((await f.call('MY_CLOCKS')).days[0].clockOut,'17:01:00');assert.equal(f.rows.length,2);
});
test('disabled operation inactive staff and invalid token do not create normal rows',async()=>{
 const f=fixture();f.flags.GPS_CLOCK=false;assert.equal((await f.call('GPS_CLOCK',f.input())).code,'FEATURE_DISABLED');assert.equal(f.counts().reads,0);
 f.flags.GPS_CLOCK=true;assert.equal((await f.call('GPS_CLOCK',f.input(),'bad')).code,'AUTH_REQUIRED');
 f.source.employees[1][6]='離職';assert.equal((await f.call('GPS_CLOCK',f.input())).code,'AUTH_REQUIRED');assert.equal(f.rows.length,0);
});
test('unknown post-append response is recovered by original ID without another write',async()=>{
 const f=fixture();f.loseReply();const r=await f.call('GPS_CLOCK',f.input());assert.equal(r.code,'UNKNOWN');assert.equal(r.persisted,null);
 assert.equal((await f.call('GPS_STATUS',{requestId:'SYN_GPS_CLOCK_0001',type:'上班'})).ok,true);
 assert.equal((await f.call('GPS_CLOCK',f.input())).duplicate,true);assert.equal(f.counts().writes,1);
});
test('allowed codes accept established separators; blank uses company; unknown code rejects config',()=>{
 const t=raw();t.employees[1][7]='SITE_A，SITE_B / SITE_A';const data=tables.parse(t),e=data.bindings.employees[0];
 assert.equal(tables.nearest(e,data.sites,24,120).code,'SITE_B');e.allowedCodes=[];
 assert.equal(tables.nearest(e,data.sites,24,120).code,'SITE_A');
 t.employees[1][7]='UNKNOWN';assert.throws(()=>tables.parse(t),/SITE_UNKNOWN/);
});
test('external approver requires an explicit private binding and blank assignment grants no review authority',()=>{
 const t=raw();t.assignments[1][4]=sub(9);assert.throws(()=>tables.parse(t),/APPROVER_BINDING/);
 const data=tables.parse(t,{externalReviewers:[{reviewerId:'SYN_EXTERNAL',lineSub:sub(9),active:true}]});assert.equal(data.bindings.assignments[0].reviewerSub,sub(9));
 t.assignments[1][2]='';t.assignments[1][3]='';t.assignments[1][4]='';assert.equal(tables.parse(t).bindings.assignments.length,1);
});
(async()=>{for(const [name,fn]of tests){await fn();console.log('PASS '+name);}console.log(tests.length+'/'+tests.length+' offline synthetic table/GPS checks; no real GPS or Google writes');})().catch(e=>{console.error(e);process.exitCode=1;});

