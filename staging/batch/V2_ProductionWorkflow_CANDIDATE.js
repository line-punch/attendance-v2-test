"use strict";
// Candidate only: no endpoint, real accounts, credentials, network or deployment.
// loadBindings and verifyLine must be trusted server adapters, never client fields.
const core=require('./V2_BatchWorkflowCore.js');
const SUB=/^U[0-9a-f]{32}$/i,ID=/^[A-Za-z0-9_-]{2,40}$/;
const HR=new Set(['HR_PENDING','HR_STATUS','HR_REVIEW']);
function compile(data){
 if(!data||!Array.isArray(data.employees)||!Array.isArray(data.reviewers)||!Array.isArray(data.assignments))throw Error('BINDINGS_INVALID');
 const employees=new Map(),staffBySub=new Map(),reviewers=new Map(),reviewerIds=new Set(),assignments=new Map();
 for(const raw of data.employees){
  const e={...raw};
  if(!ID.test(e.employeeId||'')||typeof e.company!=='string'||!e.company.trim()||!SUB.test(e.lineSub||'')||typeof e.active!=='boolean'||employees.has(e.employeeId)||staffBySub.has(e.lineSub))throw Error('EMPLOYEE_BINDING_INVALID');
  employees.set(e.employeeId,e);staffBySub.set(e.lineSub,e);
 }
 for(const raw of data.reviewers){
  const r={...raw};
  if(!ID.test(r.reviewerId||'')||!SUB.test(r.lineSub||'')||typeof r.active!=='boolean'||reviewers.has(r.lineSub)||reviewerIds.has(r.reviewerId)||
     employees.has(r.reviewerId)&&employees.get(r.reviewerId).lineSub!==r.lineSub)throw Error('REVIEWER_BINDING_INVALID');
  reviewers.set(r.lineSub,r);reviewerIds.add(r.reviewerId);
 }
 for(const raw of data.assignments){
  const a={...raw,noticeSubs:Array.isArray(raw.noticeSubs)?[...new Set(raw.noticeSubs)]:null};
  if(!employees.has(a.employeeId)||assignments.has(a.employeeId)||!reviewers.has(a.reviewerSub)||!a.noticeSubs||a.noticeSubs.length>2||a.noticeSubs.some(s=>!SUB.test(s))||employees.get(a.employeeId).lineSub===a.reviewerSub)throw Error('ASSIGNMENT_INVALID');
  assignments.set(a.employeeId,a);
 }
 function staff(sub){const e=staffBySub.get(sub);return e&&e.active?e:null;}
 function reviewer(sub){const r=reviewers.get(sub),e=staffBySub.get(sub);return r&&r.active&&(!e||e.active)?r:null;}
 function visible(sub,row,review){
  if(!row)return false;
  const e=employees.get(row.employeeId);
  if(!e||!e.active||e.company!==row.company)return false;
  if(!review)return !!staff(sub)&&e.lineSub===sub;
  const a=assignments.get(e.employeeId);
  return !!reviewer(sub)&&!!a&&a.reviewerSub===sub&&e.lineSub!==sub;
 }
 return {staff,reviewer,visible,reviewCompanies:sub=>[...new Set([...employees.values()].filter(e=>visible(sub,e,true)).map(e=>e.company))],
  notificationRecipients:row=>{
   const e=employees.get(row.employeeId),a=assignments.get(row.employeeId);
   if(!e||!e.active||e.company!==row.company||!a||!reviewer(a.reviewerSub))throw Error('RECIPIENT_BINDING_INVALID');
   return {employee:e.lineSub,reviewer:a.reviewerSub,noticeSubs:a.noticeSubs.slice()};
  }};
}
function create({verifyLine,loadBindings,store,calendar,clock,flags={}}){
 if(typeof verifyLine!=='function'||typeof loadBindings!=='function'||!store)throw Error('SERVER_ADAPTER_REQUIRED');
 async function handle({operation,payload={},credential}={}){
  if(!core.OPERATIONS.includes(operation))return {ok:false,code:'OPERATION_DENIED'};
  if(flags[operation]!==true)return {ok:false,code:'FEATURE_DISABLED'};
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return {ok:false,code:'INVALID_FORM_FIELDS'};
  let verified,policy;
  try{verified=await verifyLine(credential);if(!verified||verified.source!=='VERIFIED_LINE_ID_TOKEN'||!SUB.test(verified.sub||''))throw Error('AUTH');policy=compile(await loadBindings());}
  catch(_){return {ok:false,code:'AUTH_REQUIRED'};}
  const review=HR.has(operation),actor=review?policy.reviewer(verified.sub):policy.staff(verified.sub);
  if(!actor)return {ok:false,code:review?'HR_ONLY':'AUTH_REQUIRED'};
  // Recheck bindings inside every storage transaction/read. Never cache an
  // employee's earlier authorization over a changed supervisor assignment.
  const scoped={};
  for(const mode of ['read','transaction'])scoped[mode]=fn=>store[mode](async tx=>{
   const fresh=compile(await loadBindings());
   const allowed=row=>fresh.visible(verified.sub,row,review);
   const view={find:async id=>{const row=await tx.find(id);return allowed(row)?row:null;},
    list:async()=> (await tx.list()).filter(allowed)};
   if(mode==='transaction'){
    view.create=async row=>{if(!allowed(row))throw Error('SCOPE_DENIED');if(await tx.find(row.requestId))throw Error('REQUEST_ID_CONFLICT');return tx.create(row);};
    view.replace=async row=>{if(!allowed(row)||!allowed(await tx.find(row.requestId)))throw Error('SCOPE_DENIED');return tx.replace(row);};
    view.outbox=async event=>{if(!allowed(await tx.find(event.requestId)))throw Error('SCOPE_DENIED');return tx.outbox(event);};
   }
   return fn(view);
  });
  let companies=review?policy.reviewCompanies(verified.sub):[actor.company];
  if(review&&operation!=='HR_PENDING'){
   // Read only an authorized original; company is never taken from the phone.
   const row=await scoped.read(tx=>tx.find(payload&&payload.requestId));
   if(!row)return {ok:false,code:'NOT_FOUND'};
   companies=[row.company];
  }
  const pending=[];
  for(const company of companies){
   const principal={source:'VERIFIED_SERVER_BINDING',active:true,company,
    employeeId:review?actor.reviewerId:actor.employeeId,role:review?'HR_OWNER':'STAFF'};
   const service=core.create({identity:{verify:async()=>principal},store:scoped,calendar,clock,flags});
   const result=await service.handle({operation,payload,credential});
   if(operation!=='HR_PENDING'||!result.ok)return result;
   pending.push(...result.pending);
  }
  if(operation==='HR_PENDING'){
   if(Object.keys(payload||{}).length)return {ok:false,code:'INVALID_FORM_FIELDS'};
   return {ok:true,readOnly:true,pending};
  }
  return {ok:false,code:'NOT_FOUND'};
 }
 return Object.freeze({handle});
}
module.exports={compile,create};

