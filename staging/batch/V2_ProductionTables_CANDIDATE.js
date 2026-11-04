"use strict";
// Pure table adapter. No Sheets calls; only arrays supplied by a trusted server.
const access=require('./V2_ProductionWorkflow_CANDIDATE.js');
const HEADERS={employees:['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點'],
 sites:['地點代碼','地點名稱','公司','GPS中心點','容許距離'],
 assignments:['員工ID','員工姓名','通知主管1（userId）','通知主管2（userId）','審核主管（userId)']};
const text=v=>String(v==null?'':v).trim(),SUB=/^U[0-9a-f]{32}$/i;
function rows(table,headers){
 if(!Array.isArray(table)||!Array.isArray(table[0])||JSON.stringify(table[0].map(text))!==JSON.stringify(headers))throw Error('TABLE_HEADERS_INVALID');
 return table.slice(1).filter(r=>r.some(v=>text(v)!==''));
}
function parse(tables,{externalReviewers=[]}={}){
 const employees=rows(tables.employees,HEADERS.employees).map(r=>({employeeId:text(r[0]),lineSub:text(r[3]),company:text(r[4]),
  active:text(r[6])===''||text(r[6])==='在職',allowedCodes:text(r[7]).split(/[,，、\/\s]+/).filter(Boolean)}));
 // Unbound employees are retained for uniqueness checks but cannot sign in.
 const bySub=new Map(employees.filter(e=>e.lineSub).map(e=>[e.lineSub,e]));
 const sites=[],codes=new Set();
 for(const r of rows(tables.sites,HEADERS.sites)){
  const code=text(r[0]),coord=text(r[3]).replace(/^\(/,'').replace(/\)$/,'').split(',').map(text);
  const numeric=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const lat=Number(coord[0]),lng=Number(coord[1]),rawRadius=text(r[4])===''?50:Number(r[4]);
  if(!code||codes.has(code)||coord.length!==2||!coord.every(s=>numeric.test(s))||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||lat===0&&lng===0||!Number.isFinite(rawRadius)||rawRadius<=0)throw Error('SITE_CONFIG_INVALID');
  codes.add(code);sites.push({code,name:text(r[1]),company:text(r[2]),lat,lng,radius:Math.min(rawRadius,50),configuredRadius:rawRadius});
 }
 for(const e of employees)if(e.active&&e.allowedCodes.some(c=>!codes.has(c)))throw Error('EMPLOYEE_SITE_UNKNOWN');
 const external=new Map();
 for(const r of externalReviewers){if(!SUB.test(r.lineSub||'')||external.has(r.lineSub))throw Error('EXTERNAL_REVIEWER_INVALID');external.set(r.lineSub,{...r});}
 const reviewers=new Map(),assignments=[];
 for(const r of rows(tables.assignments,HEADERS.assignments)){
  const reviewerSub=text(r[4]),employeeId=text(r[0]),noticeSubs=[text(r[2]),text(r[3])].filter(Boolean);
  // A missing approver stays unassigned, rather than granting broad HR access.
  if(!reviewerSub){if(noticeSubs.length)throw Error('APPROVER_MISSING');continue;}
  const e=bySub.get(reviewerSub),reviewer=e?{reviewerId:e.employeeId,lineSub:e.lineSub,active:e.active}:external.get(reviewerSub);
  if(!reviewer)throw Error('APPROVER_BINDING_MISSING');
  reviewers.set(reviewerSub,reviewer);assignments.push({employeeId,reviewerSub,noticeSubs});
 }
 const bindings={employees,reviewers:[...reviewers.values()],assignments};
 access.compile(bindings); // Includes global IDs, repeated bindings and self-review.
 return {bindings,sites};
}
function nearest(employee,sites,lat,lng){
 const allowed=employee.allowedCodes||[];
 const candidates=sites.filter(s=>allowed.length?allowed.includes(s.code):!s.company||s.company===employee.company);
 const rad=Math.PI/180;
 return candidates.map(s=>{const a=(lat-s.lat)*rad,b=(lng-s.lng)*rad;
  const h=Math.sin(a/2)**2+Math.cos(s.lat*rad)*Math.cos(lat*rad)*Math.sin(b/2)**2;
  return {...s,distance:6371000*2*Math.asin(Math.min(1,Math.sqrt(h)))};
 }).sort((a,b)=>a.distance-b.distance)[0]||null;
}
module.exports={HEADERS,parse,nearest};

