"use strict";
// Candidate normal-clock service. No public route, GPS hardware or real storage.
const tables=require('./V2_ProductionTables_CANDIDATE.js'),access=require('./V2_ProductionWorkflow_CANDIDATE.js');
const OPS=['GPS_CLOCK','GPS_STATUS','MY_CLOCKS'],TYPES=['上班','下班'],REQ=/^[A-Za-z0-9_-]{12,80}$/;
const error=code=>({ok:false,code});
const summary=r=>({requestId:r.requestId,kind:'CLOCK',date:r.date,time:r.time,type:r.type,source:r.source});
function create({verifyLine,loadTables,normalStore,clock,flags={}}){
 async function handle({operation,args={},credential}={}){
  if(!OPS.includes(operation))return error('OPERATION_DENIED');
  if(flags[operation]!==true)return error('FEATURE_DISABLED');
  const allowed=operation==='MY_CLOCKS'?[]:operation==='GPS_STATUS'?['requestId','type']:['requestId','type','lat','lng','accuracy','capturedAt'];
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k)))return error('INVALID_FORM_FIELDS');
  if(operation!=='MY_CLOCKS'&&(!REQ.test(args.requestId||'')||!TYPES.includes(args.type)))return error('CLOCK_INPUT_INVALID');
  let identity;
  try{identity=await verifyLine(credential);if(!identity||identity.source!=='VERIFIED_LINE_ID_TOKEN'||!/^U[0-9a-f]{32}$/i.test(identity.sub||''))throw Error('AUTH');}
  catch(_){return error('AUTH_REQUIRED');}
  try{return await normalStore[operation==='GPS_CLOCK'?'transaction':'read'](async tx=>{
   const data=await loadTables(),policy=access.compile(data.bindings),employee=policy.staff(identity.sub);
   if(!employee)return error('AUTH_REQUIRED');
   const now=clock.now();
   if(!now||!Number.isFinite(now.epochMs)||!/^\d{4}-\d{2}-\d{2}$/.test(now.date)||!/^\d{2}:\d{2}:\d{2}$/.test(now.time)||!now.utc)throw Error('CLOCK_CONFIG_INVALID');
   const rows=await tx.list();
   if(rows.some(r=>r.kind!=='CLOCK'||r.source!=='GPS'||!TYPES.includes(r.type)))throw Error('NORMAL_LEDGER_INVALID');
   const mine=rows.filter(r=>r.employeeId===employee.employeeId&&r.company===employee.company);
   if(operation==='MY_CLOCKS'){
    const month=now.date.slice(0,7),days=new Map();
    for(const row of mine.filter(r=>r.date.slice(0,7)===month)){
     const day=days.get(row.date)||{date:row.date,clockIn:'',clockOut:''},key=row.type==='上班'?'clockIn':'clockOut';
     if(day[key])throw Error('NORMAL_DUPLICATE');day[key]=row.time;days.set(row.date,day);
    }
    return {ok:true,readOnly:true,month,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
   }
   const originals=rows.filter(r=>r.requestId===args.requestId);
   if(originals.length>1)throw Error('NORMAL_DUPLICATE');
   if(originals.length){
    const original=originals[0];
    if(original.employeeId!==employee.employeeId||original.company!==employee.company)return error(operation==='GPS_STATUS'?'NOT_FOUND':'REQUEST_ID_CONFLICT');
    if(original.type!==args.type)return error('REQUEST_ID_CONFLICT');
    return {ok:true,readOnly:operation==='GPS_STATUS',duplicate:true,request:summary(original)};
   }
   if(operation==='GPS_STATUS')return error('NOT_FOUND');
   if(!Number.isFinite(args.capturedAt)||args.capturedAt<now.epochMs-120000||args.capturedAt>now.epochMs+15000)return error('GPS_EXPIRED');
   if(typeof args.lat!=='number'||typeof args.lng!=='number'||!Number.isFinite(args.lat)||!Number.isFinite(args.lng)||Math.abs(args.lat)>90||Math.abs(args.lng)>180)return error('GPS_INVALID');
   if(typeof args.accuracy!=='number'||!Number.isFinite(args.accuracy)||args.accuracy<=0||args.accuracy>150)return error('GPS_ACCURACY');
   const site=tables.nearest(employee,data.sites,args.lat,args.lng);
   if(!site)return error('SITE_NOT_FOUND');
   if(site.distance>site.radius)return error('OUT_OF_RANGE');
   if(mine.some(r=>r.date===now.date&&r.type===args.type))return error('ALREADY_CLOCKED');
   // Preserve the existing one-minute duplicate rule, even across punch types.
   if(mine.some(r=>r.date===now.date&&r.time.slice(0,5)===now.time.slice(0,5)))return error('SAME_MINUTE');
   const row={requestId:args.requestId,kind:'CLOCK',employeeId:employee.employeeId,company:employee.company,date:now.date,time:now.time,
    type:args.type,source:'GPS',siteCode:site.code,siteName:site.name,distanceMeters:Math.round(site.distance),accuracyMeters:Math.round(args.accuracy),utcTime:now.utc};
   await tx.create(row);
   return {ok:true,duplicate:false,request:summary(row)};
  });}catch(_){return {ok:false,code:'UNKNOWN',persisted:null};}
 }
 return Object.freeze({handle});
}
module.exports={create};

