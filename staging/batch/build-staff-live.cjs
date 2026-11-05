"use strict";
const fs=require('node:fs'),path=require('node:path');const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const deps={'./V2_BatchWorkflowCore.js':'V2StaffCore','./V2_ProductionWorkflow_CANDIDATE.js':'V2StaffAccess','./V2_ProductionTables_CANDIDATE.js':'V2StaffTables'};
let output='/** GENERATED separate YC/YT staff service; all activation flags default OFF. */\n';
for(const [name,file] of [['V2StaffCore','V2_BatchWorkflowCore.js'],['V2StaffJournal','V2_ProductionJournal_CANDIDATE.js'],['V2StaffAccess','V2_ProductionWorkflow_CANDIDATE.js'],['V2StaffTables','V2_ProductionTables_CANDIDATE.js'],['V2StaffLegacyClocks','V2_StaffLegacyClocks.js'],['V2StaffClock','V2_ProductionClock_CANDIDATE.js']]){
 let s=read(file);
 if(name==='V2StaffCore'){
  const numeric='if(!Number.isInteger(v.workingDays)||v.workingDays<1||v.workingDays>31)';
  if(!s.includes(numeric))throw Error('LEAVE_CORE_CONTRACT_CHANGED');
  s=s.replace(numeric,'if(v.settlement!=="OFFLINE_HR"||v.workingDays!==null||!Number.isInteger(v.requestedCalendarDays)||v.requestedCalendarDays<1||v.requestedCalendarDays>31)')
   .replace('days:r.workingDays','days:null,requestedCalendarDays:r.requestedCalendarDays,settlement:r.settlement')
   .replace('body:{...parsed.data,workingDays:v.workingDays}','body:{...parsed.data,workingDays:null,requestedCalendarDays:v.requestedCalendarDays,settlement:"OFFLINE_HR"}')
   .replace('fromTime:row.body.fromTime||""','legacyUnitLabel:row.body.legacyUnitLabel||"",fromTime:row.body.fromTime||""')
   .replace('status:row.status,employeeId:row.employeeId','status:row.status,legacyStatusLabel:row.legacyStatusLabel||"",employeeId:row.employeeId');
 }
 if(name==='V2StaffClock')s=s.replace("r.source!=='GPS'","!['GPS','LINE'].includes(r.source)");
 s=s.replace(/require\(['"]([^'"]+)['"]\)/g,(_,p)=>{if(!deps[p])throw Error('IMPORT_UNRESOLVED');return deps[p];}).replace(/\basync(?=\s|\()/g,'').replace(/\bawait\s+/g,'');
 if(/\brequire\s*\(|\bPromise\b|\.then\s*\(/.test(s))throw Error('SYNC_BUILD_REQUIRED');
 output+='var '+name+'=(function(){var module={exports:{}};\n'+s+'\nreturn module.exports;})();\n';
}
const layout=require('./V2_ExistingSheetLayoutExport.js'),csv=require('./V2_OperationalExport.js').csv;
let exportCode=read('V2_ProductionExport_CANDIDATE.js').replace("const journal=require('./V2_ProductionJournal_CANDIDATE.js');",'const journal=V2StaffJournal;').replace("const layout=require('./V2_ExistingSheetLayoutExport.js');",'const layout={HEADERS:'+JSON.stringify(layout.HEADERS)+',localTimestamp:'+layout.localTimestamp.toString()+'};').replace("const csv=require('./V2_OperationalExport.js').csv;",'const csv='+csv.toString()+';');
if(/\brequire\s*\(/.test(exportCode))throw Error('EXPORT_IMPORT_REMAINS');
output+='var V2StaffExport=(function(){var module={exports:{}};\n'+exportCode+'\nreturn module.exports;})();\n';
output+=read('V2_StaffLive_Port.gs')+'\n'+read('V2_StaffLive_Notify.gs');
fs.writeFileSync(path.join(__dirname,'V2_StaffLive_Runtime_GENERATED.gs'),output,'utf8');
console.log('Built standalone staff runtime; no cloud calls, deployment or activation');

