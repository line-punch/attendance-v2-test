"use strict";
// Deterministic synchronous GAS build for admin-only isolated synthetic tests.
const fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const modules=[['V2ProductionCore','V2_BatchWorkflowCore.js'],['V2ProductionJournal','V2_BatchAppendJournal.js'],
 ['V2ProductionAccess','V2_ProductionWorkflow_CANDIDATE.js'],['V2ProductionTables','V2_ProductionTables_CANDIDATE.js'],['V2ProductionClock','V2_ProductionClock_CANDIDATE.js']];
const deps={'./V2_BatchWorkflowCore.js':'V2ProductionCore','./V2_ProductionWorkflow_CANDIDATE.js':'V2ProductionAccess','./V2_ProductionTables_CANDIDATE.js':'V2ProductionTables'};
let output='/** GENERATED ADMIN-ONLY QA RUNTIME. No public route; no LINE calls; TEST001/TEST_CO cloud writes only. */\n';
for(const [name,file]of modules){
 let source=read(file).replace(/require\(['"]([^'"]+)['"]\)/g,(_,p)=>{if(!deps[p])throw Error('UNRESOLVED_DEPENDENCY');return deps[p];});
 // All supplied GAS adapters are strictly synchronous; do not use this build
 // with network promises or asynchronous libraries. Tests verify return values.
 source=source.replace(/\basync(?=\s|\()/g,'').replace(/\bawait\s+/g,'');
 if(/\brequire\s*\(|\bPromise\b|\.then\s*\(|\basync(?=\s|\()/.test(source))throw Error('ASYNC_OR_IMPORT_REMAINS');
 output+='var '+name+'=(function(){var module={exports:{}};\n'+source+'\nreturn module.exports;})();\n';
}
output+=read('V2_ProductionQA_GASAdmin_CANDIDATE.gs');
fs.writeFileSync(path.join(__dirname,'V2_ProductionQA_Runtime_GENERATED.gs'),output,'utf8');
console.log('Built synchronous admin-only QA runtime; no cloud calls or deployment');

