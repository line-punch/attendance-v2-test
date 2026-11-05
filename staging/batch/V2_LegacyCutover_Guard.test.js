"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),g=require('./V2_LegacyCutover_Guard.cjs');
const original='function doGet(e) {\n    const p=e.parameter||{};const callback=p.callback;\n'+g.ANCHOR+'\n    calls.push(action);return output_({ok:true,action},callback);\n}\nfunction doPost(e) { return "unchanged postback"; }';
const changed=g.patch(original),props={},calls=[];
const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},calls,trim_:x=>String(x||'').trim(),output_:(x,callback)=>({x,callback})});vm.runInContext(changed,ctx);
assert.equal(ctx.doGet({parameter:{action:'clock'}}).x.ok,true);assert.equal(calls.length,1);
props.STAFF_LEGACY_WRITE_DISABLED='yes';for(const action of ['clock','leave','miss','bind','query','leaveHistory','missHistory','whoami'])assert.equal(ctx.doGet({parameter:{action,callback:'syntheticCallback'}}).x.ok,false);
assert.equal(calls.length,1);assert.equal(ctx.doPost({}),'unchanged postback');
delete props.STAFF_LEGACY_WRITE_DISABLED;assert.equal(ctx.doGet({parameter:{action:'query'}}).x.ok,true);
assert.throws(()=>g.patch(changed),/NOT_EXACT/);assert.throws(()=>g.patch(original.replace(g.ANCHOR,'changed source')),/NOT_EXACT/);
console.log('PASS offline default-off legacy guard, all old web routes, rollback flag, unchanged postback and source match; no production modification');

