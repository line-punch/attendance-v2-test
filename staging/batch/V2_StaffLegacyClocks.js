"use strict";
// Read-only legacy normal cards. Never consumes leave or missed applications.
const HEADERS=['時間戳記','日期','時間','員工ID','姓名','類型','地點代碼','地點名稱','GPS','備註','來源'];
function parse(tables,employees,month){
 const roster=new Map(employees.map(e=>[e.employeeId,e])),found=new Map();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('LEGACY_MONTH_INVALID');
 for(const table of tables){
  if(!Array.isArray(table)||JSON.stringify(table[0])!==JSON.stringify(HEADERS))throw Error('LEGACY_CLOCK_SCHEMA_INVALID');
  for(const r of table.slice(1)){
   const e=roster.get(String(r[3]||''));if(!e||String(r[10])!=='LINE')continue;
   const date=String(r[1]||'').replaceAll('/','-'),time=String(r[2]||'');if(date.slice(0,7)!==month)continue;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)||!['上班','下班'].includes(r[5])||!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(r[8]||'')))throw Error('LEGACY_CLOCK_ROW_INVALID');
   const coords=String(r[8]).split(',').map(Number);if(Math.abs(coords[0])>90||Math.abs(coords[1])>180)throw Error('LEGACY_CLOCK_ROW_INVALID');
   const id='V2_LEGACY_'+e.employeeId+'_'+date.replaceAll('-','')+'_'+time.replaceAll(':','')+'_'+(r[5]==='上班'?'IN':'OUT');
   const utc=String(r[0]||'');if(!Number.isFinite(Date.parse(utc)))throw Error('LEGACY_TIMESTAMP_INVALID');
   const m=String(r[9]||'').match(/距離[：:]\s*(\d+(?:\.\d+)?)\s*公尺/);
   const row={requestId:id,kind:'CLOCK',employeeId:e.employeeId,company:e.company,date,time,type:r[5],source:'LINE',legacy:true,siteCode:String(r[6]||''),siteName:String(r[7]||''),distanceMeters:m?Number(m[1]):null,accuracyMeters:null,utcTime:utc};
   const old=found.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('LEGACY_CLOCK_CONFLICT');found.set(id,row);
  }
 }
 return [...found.values()];
}
module.exports={HEADERS,parse};

