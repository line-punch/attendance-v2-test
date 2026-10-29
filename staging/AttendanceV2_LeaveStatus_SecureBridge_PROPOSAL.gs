/**
 * V2 TEST001 — proposal for authenticated, READ-ONLY leave status query.
 *
 * NOT DEPLOYED. This is a helper, not a doGet/doPost; there is no new public
 * API route. Do NOT edit the working v2dDispatch_ or GPS code yet.
 *
 * When a separate data-TEST deployment is authorized later:
 *  1. Existing v2dDispatch_ validates a nonce + LINE idToken through
 *     v2dLineClaims_, obtaining verified lineUserId.
 *  2. A new explicitly whitelisted operation can call
 *     v2hrLeaveStatusForVerifiedTester_TEST_ONLY_(ss,lineUserId,payload).
 *  3. Return only small sanitized status, no LINE idToken/GPS or raw rows.
 * Current live/test deployment remains untouched.
 */
function v2hrLeaveStatusForVerifiedTester_TEST_ONLY_(ss,lineUserId,payload) {
  // First: validate the exact independent TEST001 spreadsheet, script
  // properties and mock employee. Reject a caller-selected spreadsheet.
  var permitted=v2hrGuardTestSheet_();
  if(!ss||ss!==permitted)throw Error("TEST001 資料表權限或來源不符");
  if(typeof v2dEmployee_!=="function")throw Error("無法核對已綁定測試員工");
  var emp=v2dEmployee_(ss,lineUserId);
  if(!emp||emp.bound!==true||emp.employeeId!=="TEST001")
    throw Error("未完成 TEST001 模擬員工身分驗證");
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw Error("無效的假單查詢內容");

  // Only requestId comes from the phone. No employee/company/LINE user ID,
  // date, email or spreadsheet ID may be used to change the query's scope.
  var allowedFields=["requestId","idToken"];
  var keys=Object.keys(payload);
  if(keys.some(function(k){return allowedFields.indexOf(k)<0;}))
    throw Error("假單查詢包含未授權欄位");
  if(String(payload.requestId||"")!==V2HR_LEAVE_TEMP_REQUEST)
    throw Error("非此模擬測試假單編號");

  var sheet=ss.getSheetByName(V2HR_LEAVE_TEMP_TITLE);
  // "not found" does NOT mean a submitted request definitively failed.
  // Caller should retain the original requestId and check again if needed.
  if(!sheet)return {
    ok:true,synthetic:true,readOnly:true,found:false,
    requestId:V2HR_LEAVE_TEMP_REQUEST,status:"NOT_FOUND_YET"
  };
  var row=v2hrLeaveTempCheckSheet_(sheet); // rejects unexpected content/rows
  if(!row)return {
    ok:true,synthetic:true,readOnly:true,found:false,
    requestId:V2HR_LEAVE_TEMP_REQUEST,status:"NOT_FOUND_YET"
  };
  return {
    ok:true,synthetic:true,readOnly:true,found:true,
    requestId:V2HR_LEAVE_TEMP_REQUEST,
    status:"PENDING_REVIEW_TEST",
    message:"已確認原模擬假單存在，不能重複送出"
  };
}
