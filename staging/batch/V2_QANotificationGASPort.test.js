"use strict";
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'V2_QANotificationGASPort_NOT_DEPLOYED.gs'),'utf8');
let calls=0,passed=0;
function context(props){return vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
 SpreadsheetApp:{openById(){calls++;throw Error('MUST_NOT_OPEN');}},UrlFetchApp:{fetch(){calls++;throw Error('MUST_NOT_SEND');}}});}
for(const props of [{},{V2_QA_NOTIFY_ENABLED:'enabled'},
 {V2_QA_NOTIFY_ENABLED:'enabled',V2_BATCH_QA_ENABLED:'enabled',V2_BATCH_QA_WRITE_ENABLED:'disabled'}]){
 const ctx=context(props);vm.runInContext(code,ctx);
 const result=ctx.v2QANotificationSendCandidate_({});assert.equal(result.status,'DISABLED');assert.equal(calls,0);passed++;
}
console.log('PASS '+passed+' disabled configurations never read Sheets or call LINE');
const ctx=context({V2_QA_NOTIFY_ENABLED:'enabled',V2_BATCH_QA_ENABLED:'enabled',V2_BATCH_QA_WRITE_ENABLED:'enabled',
 V2_BATCH_QA_SOURCE_BOOK_ID:'SAME_TEST_BOOK_ID_00000000',V2_BATCH_QA_BOOK_ID:'SAME_TEST_BOOK_ID_00000000'});
vm.runInContext(code,ctx);assert.throws(()=>ctx.v2QANotificationSendCandidate_({}),/BOOK_INVALID/);assert.equal(calls,0);
console.log('PASS shared source/destination is rejected before any external service');
console.log('4/4 offline GAS guard checks passed; no real Google or LINE calls');

