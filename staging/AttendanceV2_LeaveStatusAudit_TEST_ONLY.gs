/**
 * TEST001 ONLY — editor-side read-only confirmation of the mock leave.
 * Depends on AttendanceV2_LeaveWrite_TEMP_TEST_ONLY.gs already installed.
 * Does NOT write any cells or modify existing sheets / punch data.
 *
 * Run ONLY: v2hrAuditSyntheticLeaveStatus_TEST_ONLY
 */
function v2hrAuditSyntheticLeaveStatus_TEST_ONLY() {
  var status=v2hrReadSyntheticLeaveStatus_TEST_ONLY();
  if(!status || status.ok!==true || status.synthetic!==true ||
     status.readOnly!==true || status.present!==true ||
     status.requestId!=="LEAVEV2_TEST_20261110_0001")
    throw Error("TEST001 假單查詢未確認存在；請勿重複送單或清空分頁");
  var ss=v2hrGuardTestSheet_();
  var sheet=ss.getSheetByName(V2HR_LEAVE_TEMP_TITLE);
  if(!sheet || sheet.getLastRow()!==2 || sheet.getLastColumn()!==12)
    throw Error("臨時測試分頁筆數／欄數異常，請人資核對");
  var row=v2hrLeaveTempCheckSheet_(sheet);
  if(!row || String(row[8])!=="待審核（測試）")
    throw Error("TEST001 測試假單狀態不一致，停止核對");
  var report={
    ok:true,synthetic:true,readOnly:true,present:true,
    requestId:status.requestId,
    applicationCount:1,
    approvalStatus:"待審核（測試）",
    message:"已獨立查到原測試假單一筆；沒有重新送單或寫入任何資料"
  };
  Logger.log(JSON.stringify(report));
  return report;
}
