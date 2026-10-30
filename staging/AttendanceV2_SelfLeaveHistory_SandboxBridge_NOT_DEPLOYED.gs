/**
 * TEST001 ONLY: read-only self-leave history adapter, NOT DEPLOYED.
 *
 * Requires original standalone TEST001 v2hrOnlyProps_(),
 * v2hrOnlySheet_(props,verifiedLineId), and pure
 * AttendanceV2SelfLeaveHistory.readOwnHistory from matching JS file.
 *
 * Input verifiedLineId MUST be obtained by server-side v2hrOnlyClaims_
 * after checking a LINE ID Token, never from browser body.
 * This module intentionally has NO doPost/doGet, no writes, no notifications.
 */
function v2hrSelfLeaveHistorySandboxCandidate_(verifiedLineId,body){
  if(typeof AttendanceV2SelfLeaveHistory==="undefined"||
     !AttendanceV2SelfLeaveHistory.readOwnHistory)
    throw Error("TEST001 本人假單查詢模型尚未安裝");
  if(!body||typeof body!=="object"||Array.isArray(body))
    throw Error("無效的本人假單查詢參數");
  // Only the month is caller-controlled. Never accept employeeId or company.
  var keys=Object.keys(body);
  if(keys.length!==1||keys[0]!=="month")
    throw Error("包含未授權的本人假單查詢欄位");
  if(typeof verifiedLineId!=="string"||
     !/^U[0-9a-f]{32}$/i.test(verifiedLineId))
    throw Error("LINE 測試身分尚未完成伺服器驗證");
  var book=v2hrOnlySheet_(v2hrOnlyProps_(),verifiedLineId);
  if(book.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("測試資料來源不符合預期");
  var sheet=book.getSheetByName("請假申請");
  if(!sheet)throw Error("TEST001 請假申請工作表不存在");
  if(sheet.getLastRow()>5001||sheet.getLastColumn()!==12)
    throw Error("TEST001 請假申請欄數或資料量異常");
  var columns=sheet.getRange(1,1,1,12).getDisplayValues()[0];
  var rows=[];
  if(sheet.getLastRow()>1){
    rows=sheet.getRange(2,1,sheet.getLastRow()-1,12).getValues();
    // Read-only normalization of date cells, no edits to Sheet.
    rows=rows.map(function(row){
      var copy=row.slice();
      [4,5].forEach(function(i){
        if(copy[i] instanceof Date)
          copy[i]=Utilities.formatDate(copy[i],"Asia/Taipei","yyyy-MM-dd");
      });
      return copy;
    });
  }
  var today=Utilities.formatDate(new Date(),"Asia/Taipei","yyyy-MM-dd");
  // Fixed only TEST001: no transition to live employees in this adapter.
  var r=AttendanceV2SelfLeaveHistory.readOwnHistory({
    trustedEmployeeId:"TEST001",trustedToday:today,
    requestedMonth:body.month,headers:columns,rows:rows
  });
  if(!r.ok)throw Error("TEST001 本人假單資料或期間未通過核對："+r.code);
  return r;
}
