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
const common=output;
output+=read('V2_ProductionQA_GASAdmin_CANDIDATE.gs');
fs.writeFileSync(path.join(__dirname,'V2_ProductionQA_Runtime_GENERATED.gs'),output,'utf8');
fs.writeFileSync(path.join(__dirname,'V2_CandidatePhone_Runtime_GENERATED.gs'),common.replace('ADMIN-ONLY QA RUNTIME. No public route; no LINE calls; TEST001/TEST_CO cloud writes only.','CANDIDATE READONLY PHONE RUNTIME. Verified QA LINE only; all phone writes disabled.')+'\n'+read('V2_CandidatePhone_ReadonlyPort.gs'),'utf8');
function wrap(name,source){return 'var '+name+'=(function(){var module={exports:{}};\n'+source+'\nreturn module.exports;})();\n';}
const review=read('qa-client/review-entry.js').replace('https://liff.line.me/2012136707-CgGNZAuq"','https://liff.line.me/2012136707-CgGNZAuq/candidate/"');
const plan=read('V2_QANotificationPlan.js').replace("const reviewEntry=require('./qa-client/review-entry.js');",'const reviewEntry=V2CandidateReviewEntry;');
const originalDispatch=read('V2_QANotificationDispatch.js');
if(!originalDispatch.includes('https://liff.line.me/2012136707-CgGNZAuq?'))throw Error('DISPATCH_ROUTE_CONTRACT_CHANGED');
const dispatch=originalDispatch.replace('https://liff.line.me/2012136707-CgGNZAuq?','https://liff.line.me/2012136707-CgGNZAuq/candidate/?');
const workflow=common.replace('ADMIN-ONLY QA RUNTIME. No public route; no LINE calls; TEST001/TEST_CO cloud writes only.','CANDIDATE WORKFLOW RUNTIME. TEST001 only; independent write and notification gates default off.')+
 wrap('V2CandidateReviewEntry',review)+wrap('V2CandidateNotificationPlan',plan)+wrap('V2CandidateNotificationDispatch',dispatch)+
 read('V2_CandidatePhone_WorkflowPort.gs')+'\n'+read('V2_CandidatePhone_NotificationPort.gs');
if(/\brequire\s*\(|function\s+desktopMultiUserQa/.test(workflow))throw Error('PHONE_WORKFLOW_MUST_EXCLUDE_ADMIN_OR_IMPORTS');
fs.writeFileSync(path.join(__dirname,'V2_CandidatePhone_Workflow_Runtime_GENERATED.gs'),workflow,'utf8');
console.log('Built synchronous admin-only QA runtime; no cloud calls or deployment');
