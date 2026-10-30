"use strict";
// QA-only offline export adapter. Reads a downloaded snapshot; never mutates cloud data.
const journal=require("./V2_BatchAppendJournal.js");
const CLOCK_HEADERS=["REQUEST_ID","EMPLOYEE_ID","COMPANY","DATE","TIME","TYPE","SOURCE","SITE_CODE","SITE_NAME","DISTANCE_METERS","ACCURACY_METERS","UTC_TIME"];
function csv(table){
 return "\ufeff"+table.map(row=>row.map(value=>{
  let text=String(value??"");
  // Quoting alone does not stop Excel from evaluating employee-entered formulas.
  if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
 }).join(",")).join("\r\n")+"\r\n";
}
function tables({ledger,normal}){
 if(!Array.isArray(ledger)||JSON.stringify(ledger[0])!==JSON.stringify(journal.HEADERS)||
    !Array.isArray(normal)||JSON.stringify(normal[0])!==JSON.stringify(CLOCK_HEADERS))
  throw Error("QA_EXPORT_HEADERS_INVALID");
 const state=journal.decode(ledger.slice(1));
 const requests=Array.from(state.latest.values());
 if(requests.some(r=>r.employeeId!=="TEST001"||r.company!=="TEST_CO"))
  throw Error("QA_EXPORT_SCOPE_INVALID");
 const clock=[["原請求編號","員工編號","公司","日期","打卡時間","上班／下班","打卡來源","地點代碼","地點名稱","距離公尺","定位精度公尺","寫入UTC時間"]];
 for(const row of normal.slice(1)){
  if(row.length!==12||row[1]!=="TEST001"||row[2]!=="TEST_CO"||row[6]!=="GPS"||
     !/^\d{4}-\d{2}-\d{2}$/.test(String(row[3]))||
     !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(String(row[4]))||
     !["上班","下班"].includes(row[5]))throw Error("QA_EXPORT_NORMAL_ROW_INVALID");
  clock.push(row.slice());
 }
 const leaves=[["原申請編號","員工編號","公司","假別","開始日期","結束日期","單位","開始時間","結束時間","核對工作天數","原因","狀態","送件日期","審核日期","審核員工編號"]];
 const missing=[["原申請編號","員工編號","公司","補登日期","上班／下班","申請補登時間","原因","狀態","送件日期","審核日期","審核員工編號"]];
 for(const r of requests){
  const b=r.body,common=[r.requestId,r.employeeId,r.company];
  if(r.kind==="LEAVE")leaves.push([...common,b.leaveType,b.startDate,b.endDate,b.unit,
   b.fromTime||"",b.toTime||"",b.workingDays??"",b.reason||"",r.status,r.submittedAt,r.reviewedAt||"",r.reviewedBy||""]);
  else if(r.kind==="MISSING")missing.push([...common,b.date,b.type,b.time,b.reason||"",r.status,r.submittedAt,r.reviewedAt||"",r.reviewedBy||""]);
 }
 return {clock,leaves,missing};
}
module.exports={tables,csv,CLOCK_HEADERS};

