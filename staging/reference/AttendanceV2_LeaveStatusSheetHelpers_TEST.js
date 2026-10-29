/**
 * Offline-only reference excerpt from successful TEST001 testing helpers.
 * NEVER paste or deploy: this reference is for synthetic public attack tests.
 * Source SHA: c4e8d11da9f8acc352224cf76419f83852468f2f and 4f33975e21bc890a54a34946138c5beac9385986.
 */
var V2HR_TEST_COMPANY="TEST_CO";
var V2HR_LEAVE_TEMP_TITLE = "V2請假寫入測試";
var V2HR_LEAVE_TEMP_REQUEST = "LEAVEV2_TEST_20261110_0001";
var V2HR_LEAVE_TEMP_HEADERS = [
  "申請單號","員工ID","姓名","假別","開始日期","結束日期",
  "天數/時數","原因","狀態","申請時間","審核人","審核時間"
];

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

function v2hrGuardTestSheet_() {
  // This existing guard checks script properties, exact ID/name, channel,
  // and the presence of the isolated TEST001 fixture.
  if(typeof v2dTestSheet_ !== "function") throw Error("缺少獨立資料測試安全檢查");
  var ss=v2dTestSheet_();
  if(!ss || ss.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("禁止使用非隔離資料表");
  if(!ss.getSheetByName("員工資料") ||
     String(ss.getSheetByName("員工資料").getRange(2,1).getValue())!=="TEST001" ||
     String(ss.getSheetByName("員工資料").getRange(2,5).getValue())!==V2HR_TEST_COMPANY)
    throw Error("測試員工或公司與預期不符");
  return ss;
}
