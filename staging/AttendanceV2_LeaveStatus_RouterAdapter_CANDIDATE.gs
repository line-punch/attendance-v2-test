/**
 * V2 TEST001 — non-deployed integration adapter for existing DATA_TEST router.
 *
 * Existing data service source has:
 *  five ops whoami/bind/clock/clockStatus/todayAttendance in v2dDispatch_.
 *  doPost forwards the {nonce,result} envelope to v2dResponse_.
 *
 * This adapter is a CANDIDATE ONLY. It does not override doPost,
 * v2dDispatch_, or any existing function. The already-deployed GPS service
 * remains untouched. Caller must inject the ORIGINAL v2dDispatch_ function.
 *
 * After owner confirms actual editor source and takes a backup, the ONLY
 * candidate edit to the DATA_TEST doPost would be replacing its dispatch
 * call with v2hrRouteTestOnly_(params,v2dDispatch_).
 * DO NOT APPLY this change now or in the formal attendance project.
 */
function v2hrRouteTestOnly_(params,existingDispatch) {
  if(typeof existingDispatch!=="function")
    throw Error("找不到原 TEST001 打卡請求分派函式");
  if(!params || params.operation!=="leaveStatus")
    return existingDispatch(params); // preserve all original GPS behavior
  // Feature is CLOSED unless the owner explicitly enables it on a separate
  // authorized TEST001 deployment. A pasted file alone does NOT open access.
  if(typeof PropertiesService==="undefined" ||
     PropertiesService.getScriptProperties().getProperty(
       "ATTENDANCE_V2_LEAVE_QUERY_TEST")!=="enabled")
    throw Error("TEST001 假單唯讀查詢尚未開放");
  if(typeof v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_!=="function")
    throw Error("新的唯讀假單測試功能尚未就緒");
  return v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_(params);
}
