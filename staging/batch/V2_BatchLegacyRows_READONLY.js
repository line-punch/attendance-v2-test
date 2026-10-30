"use strict";
/**
 * TEST001 STAGING ONLY — convert verified journal request into original
 * LINE clock-in HR 12-col leave and 11-col missed punch schema. NO WRITES.
 *
 * Based on established schema, pending live test-only sheet verification:
 *
 * 請假申請 A:L:
 *   申請單號 員工ID 姓名 假別 開始日期 結束日期 天數/時數 原因
 *   狀態 申請時間 審核人 審核時間
 *
 * 補打卡申請 A:K:
 *   申請單號 員工ID 姓名 日期 公司 班別 時間 原因
 *   狀態 審核人 審核時間
 *
 * The latter's "班別" is a legacy field; using 上班/下班 for it is a
 * candidate mapping and MUST be checked against the actual existing sheet
 * before any real integration. Never write into original sheets in this file.
 */
(function(root){
const LEAVE_HEAD=["申請單號","員工ID","姓名","假別","開始日期",
 "結束日期","天數/時數","原因","狀態","申請時間","審核人","審核時間"];
const MISSING_HEAD=["申請單號","員工ID","姓名","日期","公司","班別",
 "時間","原因","狀態","審核人","審核時間"];
const STATES={PENDING:"待審核",APPROVED:"已核准",REJECTED:"已駁回"};
const refuse=code=>({ok:false,code});
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
function transform(row,principal){
 if(!row||typeof row!=="object"||
    !["LEAVE","MISSING"].includes(row.kind)||
    !Object.prototype.hasOwnProperty.call(STATES,row.status)||
    !row.body||typeof row.body!=="object")
  return refuse("JOURNAL_ROW_INVALID");
 if(!principal||principal.source!=="VERIFIED_SERVER_BINDING"||
    principal.active!==true||principal.employeeId!==row.employeeId||
    principal.company!==row.company||
    typeof principal.displayName!=="string"||!principal.displayName.trim())
  return refuse("SERVER_SCOPE_UNVERIFIED");
 const b=row.body;
 if(typeof row.requestId!=="string"||
    !/^[A-Za-z0-9_-]{12,80}$/.test(row.requestId))
  return refuse("REQUEST_ID_INVALID");
 const displayStatus=STATES[row.status];
 let projected;
 if(row.kind==="LEAVE"){
  if(!["事假","病假","特休","公假","婚假","喪假"].includes(b.leaveType)||
     !DATE.test(b.startDate)||!DATE.test(b.endDate)||
     b.startDate>b.endDate||!["DAY","HOURS"].includes(b.unit))
   return refuse("LEAVE_FIELDS_INVALID");
  const quantity=b.unit==="HOURS"?
   String(b.fromTime||"")+"-"+String(b.toTime||""):
   String(b.workingDays||"")+"天";
  if(b.unit==="HOURS"&&
     (!TIME.test(b.fromTime)||!TIME.test(b.toTime)||b.fromTime>=b.toTime))
   return refuse("LEAVE_HOURS_INVALID");
  if(b.unit==="DAY"&&
     (!Number.isInteger(b.workingDays)||b.workingDays<1||b.workingDays>31))
   return refuse("LEAVE_DAYS_UNVERIFIED");
  projected=[
   row.requestId,row.employeeId,principal.displayName,b.leaveType,
   b.startDate,b.endDate,quantity,String(b.reason||""),
   displayStatus,String(row.submittedAt||""),String(row.reviewedBy||""),
   String(row.reviewedAt||"")
  ];
 }else{
  if(!DATE.test(b.date)||!TIME.test(b.time)||
     !["上班","下班"].includes(b.type)||!String(b.reason||"").trim())
   return refuse("MISSING_FIELDS_INVALID");
  projected=[
   row.requestId,row.employeeId,principal.displayName,b.date,row.company,
   b.type,b.time,b.reason,displayStatus,
   String(row.reviewedBy||""),String(row.reviewedAt||"")
  ];
 }
 return {ok:true,readOnly:true,
  targetSchema:row.kind==="LEAVE"?"LEAVE_12":"MISSING_11",
  headers:(row.kind==="LEAVE"?LEAVE_HEAD:MISSING_HEAD).slice(),
  values:projected};
}
const api=Object.freeze({transform,LEAVE_HEAD,MISSING_HEAD});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchLegacyRows=api;
})(typeof window!=="undefined"?window:this);
