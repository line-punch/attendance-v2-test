'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const candidate=fs.readFileSync(__dirname+'/V2_StaffClock_Performance_CANDIDATE.gs','utf8');
const live=fs.readFileSync(__dirname+'/V2_StaffClock_PrePerf_FIXTURE.gs','utf8').split('function staffNormal_')[1];
function fixture(code){
 const rows=[['REQUEST_ID','ROW_JSON','UTC_TIME']],counts={bindings:0,legacy:0,readCells:0},state={enabled:true,company:'SYN_CO',corrupt:false};
 const sheet={getLastRow:()=>rows.length,getRange:(r,c,h,w)=>({getValues:()=>{counts.readCells+=h*w;return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>{const v=rows[r+i-1]?.[c+j-1]??'';return state.corrupt&&r>1&&c+j===2?'CORRUPT':v;}));},setValues:v=>v.forEach((row,i)=>rows[r+i-1]=row.slice())})};
 const ctx={staffSheet_:()=>sheet,staffLock_:fn=>fn(),staffTables_:()=>{counts.bindings++;return {company:state.company};},staffCanWrite_:()=>state.enabled,staffCheckRow_:(x,d)=>{if(x.company!==d.company)throw Error('STAFF_ROW_INVALID');},staffLegacyClocks_:()=>{counts.legacy++;return [];},SpreadsheetApp:{flush(){}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {store:ctx.staffNormal_({},{}),rows,counts,state};
}
const row={requestId:'V2_GPS_SYN_PERF_001',company:'SYN_CO',kind:'CLOCK',source:'GPS'};
const before=fixture('function staffNormal_'+live),after=fixture(candidate);
for(const f of [before,after])f.store.transaction(tx=>{assert.equal(tx.list().length,0);tx.create(row);assert.equal(tx.list().length,1);});
assert.equal(JSON.stringify(after.rows),JSON.stringify(before.rows.map((r,i)=>i?[r[0],r[1],after.rows[i][2]]:r)));
assert.ok(after.counts.bindings<before.counts.bindings);assert.ok(after.counts.legacy<before.counts.legacy);
const measured={baselineReads:{...before.counts},candidateReads:{...after.counts}};
assert.throws(()=>after.store.transaction(tx=>tx.create(row)),/NORMAL_INVALID/);
after.state.enabled=false;assert.throws(()=>after.store.transaction(tx=>tx.create({...row,requestId:'V2_GPS_SYN_PERF_002'})),/WRITE_DISABLED/);
after.state.company='OTHER';assert.throws(()=>after.store.read(tx=>tx.list()),/ROW_INVALID/);
const lost=fixture(candidate);lost.state.corrupt=true;
assert.throws(()=>lost.store.transaction(tx=>tx.create(row)),/READBACK_UNKNOWN/);
assert.equal(lost.rows.length,2);lost.state.corrupt=false;assert.equal(lost.store.read(tx=>tx.list())[0].requestId,row.requestId);
console.log(JSON.stringify({offlineOnly:true,noGoogleCalls:true,...measured,checks:'same rows, duplicate block, disabled write, fresh binding, failed readback and original recovery'}));
