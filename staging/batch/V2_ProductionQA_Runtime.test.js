"use strict";
// Synthetic Google API simulation for the generated synchronous admin harness.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'V2_ProductionQA_Runtime_GENERATED.gs'),'utf8');
function fixture(){
 const props={V2_MULTIUSER_QA_BOOK_ID:'SYN_NEW_BOOK',V2_BATCH_QA_BOOK_ID:'SYN_PHONE_BOOK',V2_BATCH_QA_SOURCE_BOOK_ID:'SYN_SOURCE_BOOK',V2_BATCH_QA_WRITE_ENABLED:'disabled',V2_QA_NOTIFY_ENABLED:'disabled'};
 const sheets=new Map();let title='YC_ATTENDANCE_V2_MULTIUSER_QA_ONLY',locked=false,writes=0;
 const book={getName:()=>title,getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{
  const cells=[];const sh={getLastRow:()=>cells.length,getLastColumn:()=>Math.max(0,...cells.map(r=>r.length)),
   getDataRange:()=>({getValues:()=>cells.map(r=>r.slice())}),getRange:(r,c,h,w)=>({
    getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>cells[r-1+i]?.[c-1+j]??'')),setNumberFormat:()=>{},
    setValues:values=>{writes++;for(let i=0;i<h;i++){cells[r-1+i]??=[];for(let j=0;j<w;j++)cells[r-1+i][c-1+j]=values[i][j];}}})};
  sheets.set(name,sh);return sh;
 }};
 const logs=[];const context=vm.createContext({URL,console:{log:x=>logs.push(x)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;}})},
  SpreadsheetApp:{openById:id=>{assert.equal(id,'SYN_NEW_BOOK');return book;},flush(){}},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
  Utilities:{formatDate:(_d,_zone,pattern)=>({'yyyy-MM-dd':'2026-11-04','HH:mm:ss':'17:00:00'}[pattern])}});
 vm.runInContext(source,context);return {context,props,book,sheets,logs,writes:()=>writes,setTitle:v=>{title=v;}};
}
if(require.main===module){
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}
test('generated functions are synchronous and full harness retains TEST001-only cloud writes',()=>{
 const f=fixture();const initialized=f.context.desktopMultiUserQaInitialize();assert.equal(initialized.initialized,true);assert.equal(typeof initialized.then,'undefined');
 assert.equal(f.context.v2MultiQaTables_(f.book).bindings.employees.length,2);
 const r=f.context.desktopMultiUserQaPersistenceTest();assert.equal(typeof r.then,'undefined');assert.equal(r.actualGooglePersistence,true);assert.equal(r.actualLineAuthentication,false);assert.equal(r.actualDeviceGPS,false);
 assert.equal(r.journalEntries,4);assert.equal(r.normalPunches,1);assert.equal(f.props.V2_MULTIUSER_QA_ENABLED,'disabled');
 assert.equal(f.sheets.get('員工資料').getLastRow(),2);assert.equal(f.sheets.get('候選交易流水').getLastRow(),5);
 const before=f.writes();const again=f.context.desktopMultiUserQaPersistenceTest();assert.equal(again.journalEntries,4);assert.equal(f.writes(),before);
 // These booleans describe the live harness contract; this invocation is mock-only.
});
test('wrong book title or active phone write window rejects before setup writes',()=>{
 const f=fixture();f.setTitle('FORMAL');assert.throws(()=>f.context.desktopMultiUserQaInitialize(),/TITLE_INVALID/);assert.equal(f.writes(),0);
 const g=fixture();g.props.V2_BATCH_QA_WRITE_ENABLED='enabled';assert.throws(()=>g.context.desktopMultiUserQaInitialize(),/READONLY/);assert.equal(g.writes(),0);
});
test('changed synthetic source rows are preserved and block initialization',()=>{
 const f=fixture();f.context.desktopMultiUserQaInitialize();f.sheets.get('員工資料').getRange(2,5,1,1).setValues([['OTHER_CO']]);
 assert.throws(()=>f.context.desktopMultiUserQaInitialize(),/FIXTURE_CHANGED/);
 assert.equal(f.sheets.get('員工資料').getRange(2,5,1,1).getValues()[0][0],'OTHER_CO');
});
test('no public route LINE transport trigger or production project mutation exists',()=>{
 assert.ok(!/function\s+(?:doGet|doPost)\s*\(/.test(source));assert.ok(!/UrlFetchApp|ScriptApp\.newTrigger/.test(source));
});
test('coerced initial coordinate sheet is retained while the new text-coordinate sheet is used',()=>{
 const f=fixture(),legacy=f.book.insertSheet('上班地點');legacy.getRange(1,1,2,1).setValues([['GPS中心點'],[25121]]);
 f.context.desktopMultiUserQaInitialize();assert.equal(legacy.getRange(2,1,1,1).getValues()[0][0],25121);
 assert.equal(f.context.v2MultiQaTables_(f.book).sites[0].lat,25);assert.equal(f.context.v2MultiQaTables_(f.book).sites[0].lng,121);
});
console.log(count+'/'+count+' offline synchronous runtime checks; no actual Google calls');
}
module.exports={fixture};

