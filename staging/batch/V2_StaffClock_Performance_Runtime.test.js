'use strict';
// Reuse the complete standalone regression with only the adapter overridden.
const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
const filename=path.join(__dirname,'V2_StaffLive_Runtime.test.js');
const source=fs.readFileSync(filename,'utf8');
const anchor='vm.runInContext(code,f.context);';
if(!source.includes(anchor))throw Error('FIXTURE_ANCHOR_CHANGED');
const patched=source.replace(anchor,anchor+"vm.runInContext(fs.readFileSync(__dirname+'/V2_StaffClock_Performance_CANDIDATE.gs','utf8'),f.context);");
const testModule=new Module(filename,module);testModule.filename=filename;testModule.paths=module.paths;
testModule._compile(patched,filename);
