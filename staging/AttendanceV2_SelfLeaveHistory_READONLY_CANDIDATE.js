"use strict";
/* V2 SELF leave history – pure JavaScript, staging only. NO DEPLOYMENT.
 * Original 12-column schema: A request ID, B employee ID, C name,
 * D leave type, E start, F end, G quantity, H reason, I review status,
 * J submitted time, K reviewer, L reviewed time.
 * Only trusted SERVER identity may select employee records.
 * No network, spreadsheet writes, LINE IDs, reasons or names in response.
 */
(function(root){
const H=["申請單號","員工ID","姓名","假別","開始日期","結束日期",
 "天數/時數","原因","狀態","申請時間","審核人","審核時間"];
const bad=code=>({ok:false,readOnly:true,code});
function isoDate(s){
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const y=+s.slice(0,4),m=+s.slice(5,7),d=+s.slice(8,10);
 if(y<1900||y>2100||m<1||m>12)return null;
 const t=new Date(Date.UTC(y,m-1,d));
 return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d?t:null;
}
function normalizedDate(value){
 if(typeof value!=="string")return null;
 const x=value.trim().replace(/\//g,"-");
 return isoDate(x)?x:null;
}
function allowedMonths(trustedToday){
 const today=isoDate(trustedToday);
 if(!today)return null;
 return [0,-1,-2].map(d=>new Date(Date.UTC(today.getUTCFullYear(),
  today.getUTCMonth()+d,1)).toISOString().slice(0,7));
}
function bounds(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
 const d=isoDate(month+"-01");if(!d)return null;
 return [month+"-01",new Date(Date.UTC(d.getUTCFullYear(),
  d.getUTCMonth()+1,0)).toISOString().slice(0,10)];
}
function state(raw){
 const s=String(raw??"").trim();
 const mapping={"待審核":"PENDING","待審核（測試）":"PENDING",
 "已核准":"APPROVED","核准":"APPROVED",
 "已駁回":"REJECTED","駁回":"REJECTED"};
 return Object.prototype.hasOwnProperty.call(mapping,s)?mapping[s]:null;
}
function readOwnHistory(data){
 if(!data||!/^[-_A-Za-z0-9]{2,40}$/.test(String(data.trustedEmployeeId||"")))
  return bad("SERVER_IDENTITY_UNVERIFIED");
 const months=allowedMonths(data.trustedToday);
 if(!months)return bad("TRUSTED_TODAY_MISSING");
 if(typeof data.requestedMonth!=="string"||!months.includes(data.requestedMonth))
  return bad("MONTH_OUT_OF_RANGE");
 if(!Array.isArray(data.headers)||data.headers.length!==12||
    data.headers.some((h,i)=>h!==H[i]))return bad("SHEET_HEADERS_MISMATCH");
 if(!Array.isArray(data.rows)||data.rows.length>5000)return bad("SHEET_SCAN_LIMIT");
 const [start,end]=bounds(data.requestedMonth);
 let result=[],seen=new Set();
 for(const row of data.rows){
  if(!Array.isArray(row)||row.length!==12)return bad("MALFORMED_ROW");
  if(String(row[1]??"").trim()!==data.trustedEmployeeId)continue;
  const id=String(row[0]??"").trim();
  if(!/^[-_A-Za-z0-9]{8,100}$/.test(id))return bad("MALFORMED_OWN_ID");
  const from=normalizedDate(row[4]),to=normalizedDate(row[5]);
  if(!from||!to||from>to)return bad("MALFORMED_OWN_DATES");
  if(to<start||from>end)continue;
  if(seen.has(id))return bad("DUPLICATE_OWN_REQUEST");
  seen.add(id);
  const review=state(row[8]);
  if(!review)return bad("UNKNOWN_OWN_STATUS");
  const type=String(row[3]??"").trim(),quantity=String(row[6]??"").trim();
  if(!type||type.length>30||!quantity||quantity.length>40)
   return bad("MALFORMED_OWN_DETAILS");
  result.push({requestId:id,leaveType:type,startDate:from,endDate:to,
   quantity,status:review});
  if(result.length>100)return bad("TOO_MANY_OWN_LEAVES");
 }
 result.sort((a,b)=>b.startDate.localeCompare(a.startDate)||
  b.requestId.localeCompare(a.requestId));
 return {ok:true,readOnly:true,month:data.requestedMonth,
  availableMonths:months,found:result.length>0,total:result.length,
  records:result};
}
const api=Object.freeze({H,readOwnHistory,allowedMonths,state});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.AttendanceV2SelfLeaveHistory=api;
})(typeof window!=="undefined"?window:this);
