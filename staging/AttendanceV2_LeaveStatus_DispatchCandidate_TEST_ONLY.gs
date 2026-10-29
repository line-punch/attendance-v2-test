/**
 * V2 TEST001-only, PROPOSAL: internal authenticated leave-status dispatch.
 * NOT a deployed endpoint, NOT a second doPost/doGet.
 * Do not paste into the live "打卡系統".
 *
 * This can later be invoked from an explicitly reviewed DATA_TEST dispatcher:
 * - validates original frame nonce and operation first
 * - verifies LINE ID Token on SERVER using existing v2dLineClaims_
 * - checks TEST001 binding and guarded test sheet
 * - returns the same {nonce, result} envelope used by existing iframe bridge
 * - does not create/modify any leave, punch, schedule or payroll row
 */
function v2hrDispatchReadOnlyStatusCandidate_TEST_ONLY_(params) {
  var ss=v2hrGuardTestSheet_(); // existing TEST001 + script-properties gate
  if(!params || typeof params!=="object" || Array.isArray(params))
    throw Error("無效的 TEST001 查詢參數");
  var nonce=String(params.nonce||"");
  if(!/^[0-9a-f]{40}$/.test(nonce))
    throw Error("無效的測試回覆編號");
  if(params.operation!=="leaveStatus")
    throw Error("不支援此唯讀測試操作");
  var raw=params.payload;
  if(typeof raw!=="string"||raw.length<30||raw.length>12000)
    throw Error("TEST001 查詢資料長度不符");
  var data;
  try{data=JSON.parse(raw);}catch(_){throw Error("TEST001 查詢 JSON 不正確");}
  if(!data||Array.isArray(data)||typeof data!=="object"||
     typeof data.idToken!=="string")
    throw Error("缺少已驗證的 LINE 測試身分");
  // Explicitly reject client-supplied scope fields, not just ignore them.
  var fields=Object.keys(data);
  if(fields.some(function(x){return x!=="idToken"&&x!=="requestId";}))
    throw Error("包含未授權的請假查詢欄位");
  var lineUserId=v2dLineClaims_(data.idToken); // verify against LINE on server
  var result=v2hrLeaveStatusForVerifiedTester_TEST_ONLY_(ss,lineUserId,data);
  return {nonce:nonce,result:result};
}
