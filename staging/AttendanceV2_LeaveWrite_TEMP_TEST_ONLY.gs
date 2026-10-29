/**
 * V2 TEST001 ONLY: exact ONE synthetic leave write + readback/idempotency.
 * This is an EDITOR-ONLY function, not a web endpoint. Never deploy it.
 *
 * It creates TEMPORARY "V2請假寫入測試" in the isolated Sheet, NOT the
 * original 請假申請 sheet. It does not change original clock/leave data.
 * Requires v2hrGuardTestSheet_, v2hrReadTestCalendarContext_,
 * v2hrVerifySyntheticRules_TEST_ONLY and v2hrValidateSyntheticLeaveRequest_.
 * All those helpers must already exist in the independent DATA_TEST project.
 *
 * Run v2hrRunSyntheticLeaveWrite_TEST_ONLY deliberately once. Never delete
 * or clear a test tab to force a rerun. Repeating with same data is safe.
 */
var V2HR_LEAVE_TEMP_TITLE = "V2請假寫入測試";
var V2HR_LEAVE_TEMP_REQUEST = "LEAVEV2_TEST_20261110_0001";
var V2HR_LEAVE_TEMP_HEADERS = [
  "申請單號","員工ID","姓名","假別","開始日期","結束日期",
  "天數/時數","原因","狀態","申請時間","審核人","審核時間"
];
function v2hrLeaveTempRequire_(ok,code) {
  if(!ok)throw Error("TEST001 模擬假單中止："+code);
}
function v2hrLeaveTempDate_(value) {
  return value instanceof Date
    ?Utilities.formatDate(value,"Asia/Taipei","yyyy-MM-dd")
    :String(value===null||value===undefined?"":value).trim().replace(/\//g,"-");
}
function v2hrLeaveTempFixedRow_() {
  return [V2HR_LEAVE_TEMP_REQUEST,"TEST001","模擬員工甲","事假",
    "2026-11-10","2026-11-10","1天","純測試：正常上班日事假",
    "待審核（測試）","SYNTHETIC_TEST_ONLY","",""];
}
function v2hrLeaveTempMatch_(row) {
  var expected=v2hrLeaveTempFixedRow_();
  if(!row||row.length<12)return false;
  for(var i=0;i<12;i++) {
    var value=(i===4||i===5)?v2hrLeaveTempDate_(row[i]):
      String(row[i]===null||row[i]===undefined?"":row[i]);
    if(value!==expected[i])return false;
  }
  return true;
}
function v2hrLeaveTempCheckSheet_(sheet) {
  if(!sheet)return null;
  var headers=sheet.getRange(1,1,1,12).getDisplayValues()[0];
  if(headers.some(function(v,i){return v!==V2HR_LEAVE_TEMP_HEADERS[i]}))
    throw Error("臨時測試分頁標題不符，拒絕修改");
  if(sheet.getLastRow()>2)throw Error("臨時測試分頁有額外資料，停止操作");
  if(sheet.getLastColumn()>12)throw Error("臨時測試分頁有額外欄位，停止操作");
  if(sheet.getLastRow()===2) {
    var old=sheet.getRange(2,1,1,12).getValues()[0];
    if(!v2hrLeaveTempMatch_(old))
      throw Error("測試單號已有不同內容，拒絕覆蓋");
    return old;
  }
  return null;
}
function v2hrLeaveTempPreflight_() {
  var ss=v2hrGuardTestSheet_();
  var check=v2hrVerifySyntheticRules_TEST_ONLY();
  v2hrLeaveTempRequire_(check && check.ok===true &&
    check.synthetic===true && check.readOnly===true &&
    check.checksPassed===6,"SYNTHETIC_FIXTURE_NOT_APPROVED");
  var ctx=v2hrReadTestCalendarContext_(ss,{
    employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"
  });
  ctx.today="2026-10-29"; // MOCK scenario date, never dynamic production calendar
  ctx.scheduledMinutesByDate={"2026-11-12":480};
  var result=v2hrValidateSyntheticLeaveRequest_({
    leaveType:"事假",unit:"全天",startDate:"2026-11-10",
    endDate:"2026-11-10",reason:"純測試：正常上班日事假"
  },ctx);
  v2hrLeaveTempRequire_(result && result.ok===true &&
    result.code==="DATE_RULES_PASSED","LEAVE_CALENDAR_NOT_VALIDATED");
  return ss;
}
/**
 * Separate READ-ONLY status checker. Can distinguish unknown write result
 * from a real accepted row without touching employee records.
 */
function v2hrReadSyntheticLeaveStatus_TEST_ONLY() {
  var ss=v2hrLeaveTempPreflight_();
  var sheet=ss.getSheetByName(V2HR_LEAVE_TEMP_TITLE);
  if(!sheet)return {ok:true,synthetic:true,readOnly:true,
    present:false,requestId:V2HR_LEAVE_TEMP_REQUEST};
  var old=v2hrLeaveTempCheckSheet_(sheet);
  return {ok:true,synthetic:true,readOnly:true,present:!!old,
    requestId:V2HR_LEAVE_TEMP_REQUEST};
}
/** Editor-only operation: one strictly fixed synthetic test application. */
function v2hrRunSyntheticLeaveWrite_TEST_ONLY() {
  var ss=v2hrLeaveTempPreflight_();
  // Inspect an existing temp sheet before taking the write lock.
  v2hrLeaveTempCheckSheet_(ss.getSheetByName(V2HR_LEAVE_TEMP_TITLE));
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))
    throw Error("隔離測試忙碌，請先用唯讀查詢核對原單號");
  try {
    // Both employee identity and approved test calendar are rechecked
    // inside lock, never accept client-supplied employeeId or dates.
    ss=v2hrLeaveTempPreflight_();
    var sheet=ss.getSheetByName(V2HR_LEAVE_TEMP_TITLE);
    var previous=v2hrLeaveTempCheckSheet_(sheet);
    if(previous) {
      var duplicate={ok:true,synthetic:true,alreadySubmitted:true,
        requestId:V2HR_LEAVE_TEMP_REQUEST,writeCount:0,
        message:"原測試單已存在，未重複寫入"};
      Logger.log(JSON.stringify(duplicate));
      return duplicate;
    }
    if(!sheet) {
      sheet=ss.insertSheet(V2HR_LEAVE_TEMP_TITLE);
      sheet.getRange(1,1,1,12).setValues([V2HR_LEAVE_TEMP_HEADERS]);
      sheet.setFrozenRows(1);
    }
    // No append to actual "請假申請", no approval or LINE notification.
    sheet.getRange(2,1,1,12).setValues([v2hrLeaveTempFixedRow_()]);
    SpreadsheetApp.flush();
    var written=v2hrLeaveTempCheckSheet_(sheet);
    if(!written)throw Error("寫入結果未確認；請使用唯讀狀態函式核對");
    var result={ok:true,synthetic:true,alreadySubmitted:false,
      requestId:V2HR_LEAVE_TEMP_REQUEST,writeCount:1,
      status:"待審核（測試）",
      message:"已寫入臨時隔離測試分頁並讀回，未修改真正請假申請"};
    Logger.log(JSON.stringify(result));
    return result;
  }finally {
    lock.releaseLock();
  }
}
