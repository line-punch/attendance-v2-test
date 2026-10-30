"use strict";
// QA-only local export. Headers and meanings were read from the existing
// bound Google Sheet and script; neither production file is written here.
const standard=require("./V2_OperationalExport.js");
const journal=require("./V2_BatchAppendJournal.js");
const HEADERS=Object.freeze({
 clock:["時間戳記","日期","時間","員工ID","姓名","類型","地點代碼","地點名稱","GPS","備註","來源"],
 leaves:["申請單號","員工ID","姓名","假別","開始日期","結束日期","天數/時數","原因","狀態","申請時間","審核人","審核時間"],
 missing:["申請單號","員工ID","姓名","日期","公司","班別","時間","原因","狀態","申請時間","審核人","審核時間","核定打卡時間"]
});
const LABELS={PENDING:"待審核",APPROVED:"核准",REJECTED:"駁回"};
function localTimestamp(utc){
 if(!/^\d{4}-\d{2}-\d{2}T/.test(String(utc))||!Number.isFinite(Date.parse(utc)))
  throw Error("TRUSTED_LEDGER_TIMESTAMP_REQUIRED");
 return new Date(Date.parse(utc)+8*3600000).toISOString().slice(0,19).replace("T"," ").replaceAll("-","/");
}
function date(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error("BUSINESS_DATE_REQUIRED");
 return value.replaceAll("-","/");
}
function tables(snapshot,{names}={}){
 // Reuse all scope, schema, GPS-row and journal-chain checks.
 standard.tables(snapshot);
 if(!names||typeof names.TEST001!=="string"||!names.TEST001.trim())throw Error("VERIFIED_QA_NAME_REQUIRED");
 const state=journal.decode(snapshot.ledger.slice(1)),first=new Map(),last=new Map();
 for(const entry of snapshot.ledger.slice(1)){
  if(!first.has(entry[1]))first.set(entry[1],entry[5]);last.set(entry[1],entry[5]);
 }
 const result=Object.fromEntries(Object.entries(HEADERS).map(([key,head])=>[key,[head.slice()]]));
 const warnings=[];
 for(const r of snapshot.normal.slice(1)){
  result.clock.push([localTimestamp(r[11]),date(r[3]),r[4],r[1],names.TEST001,r[5],r[7],r[8],
   "","距離："+r[9]+"公尺",r[6]]);
 }
 if(result.clock.length>1){
  warnings.push("GPS 座標未保存在 QA 正常打卡快照中，GPS 欄留白，不以地點座標或重新定位回填。");
  warnings.push("來源保留 QA 已記錄的 GPS；原正式程式目前填 LINE。兩者未擅自互換。");
 }
 for(const r of state.latest.values()){
  const b=r.body,label=LABELS[r.status];if(!label)throw Error("STATUS_NOT_VERIFIED");
  let reviewer="",reviewedAt="";
  if(r.status!=="PENDING"){
   if(!r.reviewedBy||!names[r.reviewedBy])throw Error("VERIFIED_REVIEWER_NAME_REQUIRED");
   reviewer=names[r.reviewedBy];reviewedAt=localTimestamp(last.get(r.requestId));
  }
  const submitted=localTimestamp(first.get(r.requestId));
  if(r.kind==="LEAVE"){
   let quantity;
   if(b.unit==="DAY"){
    if(!Number.isInteger(b.workingDays)||b.workingDays<1)throw Error("VERIFIED_WORKING_DAYS_REQUIRED");
    quantity=b.workingDays+"天";
   }else if(b.unit==="HOURS"&&/^\d{2}:\d{2}$/.test(b.fromTime)&&/^\d{2}:\d{2}$/.test(b.toTime)){
    quantity=b.fromTime+"-"+b.toTime;
   }else throw Error("LEAVE_UNIT_NOT_VERIFIED");
   result.leaves.push([r.requestId,r.employeeId,names.TEST001,b.leaveType,date(b.startDate),date(b.endDate),
    quantity,b.reason||"",label,submitted,reviewer,reviewedAt]);
  }else if(r.kind==="MISSING"){
   result.missing.push([r.requestId,r.employeeId,names.TEST001,date(b.date),r.company,b.type,b.time,
    b.reason||"",label,submitted,reviewer,reviewedAt,
    r.status==="APPROVED"?date(b.date)+" "+b.time:""]);
  }
 }
 return {tables:result,warnings,layoutMatched:true,excelProgramValidated:false};
}
module.exports={HEADERS,tables,localTimestamp};

