/**
 * DATA_TEST_ONLY — owner-run READ-ONLY editor preflight (NOT DEPLOYED).
 *
 * This function checks the current Apps Script EDITOR source and the
 * pre-existing TEST001 sandbox Sheet guard. It does not update any script,
 * sheet, project property or deployment. No LINE token is requested.
 *
 * IMPORTANT: GAS editor code can differ from currently deployed /exec
 * version. This check CANNOT establish the deployed revision.
 *
 * Prerequisite: original v2dTestSheet_ and v2dDispatch_ and doPost, plus
 * previously installed v2hrGuardTestSheet_. Never install in live project.
 */
function v2hrInspectTestRouting_TEST_ONLY() {
  var ss=v2hrGuardTestSheet_();
  if(typeof v2dDispatch_!=="function" ||
     typeof doPost!=="function" ||
     typeof v2dLineClaims_!=="function" ||
     typeof v2dResponse_!=="function" ||
     typeof v2dPublicFailure_!=="function")
    throw Error("TEST001 既有打卡後端函式不完整，停止後續串接");
  // Introspection is read-only. Never log script text, LINE tokens or URLs.
  var dispatchSource=Function.prototype.toString.call(v2dDispatch_);
  var postSource=Function.prototype.toString.call(doPost);
  var legacy=["whoami","bind","clock","clockStatus","todayAttendance"];
  var missing=legacy.filter(function(op){return dispatchSource.indexOf(op)<0;});
  if(missing.length)throw Error("TEST001 編輯器路由缺少既有功能，需核對後台");
  if(postSource.indexOf("v2dDispatch_")<0 ||
     postSource.indexOf("v2dResponse_")<0)
    throw Error("TEST001 原始 doPost 路由結構已變動，暫停串接");
  if(dispatchSource.indexOf("leaveStatus")>=0)
    throw Error("TEST001 編輯器已有假單查詢路由，先核對，避免重複加入");
  // A new property set to enabled would open the candidate earlier than
  // planned. Do NOT modify the property here; report and fail closed.
  var p=PropertiesService.getScriptProperties();
  if(p.getProperty("ATTENDANCE_V2_LEAVE_QUERY_TEST")==="enabled")
    throw Error("TEST001 假單查詢開關已開啟，先停止並核對權限");
  // Guard ensures the correct test Sheet and TEST001 fixture, not real HR.
  if(!ss || ss.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("不是指定 TEST001 隔離試算表");
  var summary={
    ok:true,synthetic:true,readOnly:true,
    editorSourceChecked:true,
    deployedRevisionVerified:false,
    existingOperations:legacy,
    leaveStatusRouteInExistingDispatch:false,
    leaveStatusFeatureEnabled:false,
    lineClaimsFunctionPresent:true,
    testSheetNameVerified:true,
    message:"TEST001 編輯器既有五項路由與安全鎖完整；部署版本仍須獨立確認。無任何寫入。"
  };
  Logger.log(JSON.stringify(summary));
  return summary;
}
