"use strict";
// Offline administrator export only. No network, credentials, or source writes.
const journal=require('./V2_ProductionJournal_CANDIDATE.js');
const layout=require('./V2_ExistingSheetLayoutExport.js');
const csv=require('./V2_OperationalExport.js').csv;
const STATUS={PENDING:'待審核',APPROVED:'核准',REJECTED:'駁回'};
function tables(snapshot,{employees,reviewers=[]}={}){
 if(!snapshot||!Array.isArray(snapshot.ledger)||JSON.stringify(snapshot.ledger[0])!==JSON.stringify(journal.HEADERS)||!Array.isArray(snapshot.normal)||!Array.isArray(employees))throw Error('EXPORT_INPUT_INVALID');
 const roster=new Map(),names=new Map();
 for(const e of employees){
  if(!e||!e.employeeId||!e.company||typeof e.name!=='string'||!e.name.trim()||roster.has(e.employeeId))throw Error('EXPORT_ROSTER_INVALID');
  roster.set(e.employeeId,e);names.set(e.employeeId,e.name);
 }
 for(const r of reviewers){if(!r||!r.reviewerId||!r.name||names.has(r.reviewerId)&&names.get(r.reviewerId)!==r.name)throw Error('EXPORT_REVIEWER_INVALID');names.set(r.reviewerId,r.name);}
 const state=journal.decode(snapshot.ledger.slice(1)),first=new Map(),last=new Map();
 for(const e of snapshot.ledger.slice(1)){if(!first.has(e[1]))first.set(e[1],e[5]);last.set(e[1],e[5]);}
 const result=Object.fromEntries(Object.entries(layout.HEADERS).map(([k,v])=>[k,[v.slice()]]));
 function employee(row){const e=roster.get(row.employeeId);if(!e||e.company!==row.company)throw Error('EXPORT_EMPLOYEE_COMPANY_MISMATCH');return e;}
 const used=new Set(),daily=new Set();
 for(const row of snapshot.normal){
  const e=employee(row),key=[row.employeeId,row.date,row.type].join('|');
  if(row.kind!=='CLOCK'||row.source!=='GPS'||!['上班','下班'].includes(row.type)||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.time)||!row.requestId||used.has(row.requestId)||daily.has(key)||!Number.isFinite(row.distanceMeters)||row.distanceMeters<0)throw Error('EXPORT_NORMAL_INVALID');
  used.add(row.requestId);daily.add(key);
  result.clock.push([layout.localTimestamp(row.utcTime),row.date.replaceAll('-','/'),row.time,e.employeeId,e.name,row.type,row.siteCode||'',row.siteName||'','','距離：'+row.distanceMeters+'公尺',row.source]);
 }
 for(const row of state.latest.values()){
  const e=employee(row),body=row.body||{},status=STATUS[row.status];
  if(!status||!['LEAVE','MISSING'].includes(row.kind)||used.has(row.requestId))throw Error('EXPORT_REQUEST_INVALID');
  used.add(row.requestId);
  let reviewer='',reviewed='';
  if(row.status!=='PENDING'){reviewer=names.get(row.reviewedBy);if(!reviewer)throw Error('EXPORT_REVIEWER_UNMAPPED');reviewed=layout.localTimestamp(last.get(row.requestId));}
  const submitted=layout.localTimestamp(first.get(row.requestId));
  function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('EXPORT_DATE_INVALID');return s.replaceAll('-','/');}
  if(row.kind==='LEAVE'){
   let quantity;
   if(body.unit==='DAY'){if(!Number.isInteger(body.workingDays)||body.workingDays<1)throw Error('EXPORT_WORKDAYS_UNVERIFIED');quantity=body.workingDays+'天';}
   else if(body.unit==='HOURS'&&/^\d{2}:\d{2}$/.test(body.fromTime)&&/^\d{2}:\d{2}$/.test(body.toTime))quantity=body.fromTime+'-'+body.toTime;
   else throw Error('EXPORT_LEAVE_UNIT_INVALID');
   result.leaves.push([row.requestId,e.employeeId,e.name,body.leaveType,date(body.startDate),date(body.endDate),quantity,body.reason||'',status,submitted,reviewer,reviewed]);
  }else{
   if(!['上班','下班'].includes(body.type)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))throw Error('EXPORT_MISSING_INVALID');
   result.missing.push([row.requestId,e.employeeId,e.name,date(body.date),e.company,body.type,body.time,body.reason||'',status,submitted,reviewer,reviewed,row.status==='APPROVED'?date(body.date)+' '+body.time:'']);
  }
 }
 return {tables:result,normalCount:result.clock.length-1,leaveCount:result.leaves.length-1,missingCount:result.missing.length-1,excelProgramValidated:false};
}
module.exports={tables,csv};

