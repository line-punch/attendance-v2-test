/**
 * V2 HR calendar + disaster read-only bridge — TEST ONLY, NOT DEPLOYED.
 *
 * Install only alongside YC_ATTENDANCE_V2_DATA_TEST_ONLY in the independent
 * testing Apps Script project, AFTER code review. Do not install in live
 * "打卡系統" project, and do not expose new doGet/doPost handlers here.
 *
 * Depends on test service's v2dTestSheet_() and v2dEmployee_() functions.
 * Test data employee must be TEST001 in company TEST_CO. No real identities,
 * tokens or location details are emitted. Never modifies actual clock rows.
 *
 * Data sheets: 公司工作日曆 and 特殊出勤事件. The old test tab
 * 工作日曆 remains untouched for backwards compatibility.
 */

var V2HR_CALENDAR_TITLE = "公司工作日曆";
var V2HR_EVENTS_TITLE = "特殊出勤事件";
var V2HR_TEST_COMPANY = "TEST_CO";
var V2HR_TZ = "Asia/Taipei";
var V2HR_CAL_HEADERS = [
  "日期","公司","指定打卡地點","日別","原因","核對依據","備註","確認紀錄"
];
var V2HR_YEAR_HEADERS = ["年度","公司","核對狀態","確認人","確認時間"];
var V2HR_EVENT_HEADERS = [
  "事件單號","日期","類型","適用範圍","指定打卡地點","全日／部分",
  "給薪處理","公告或佐證","核對狀態","確認人","確認時間",
  "核定停班分鐘數","備註"
];

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

function v2hrTrim_(value){return value===null||value===undefined?"":String(value).trim();}
function v2hrDate_(value) {
  return value instanceof Date
    ? Utilities.formatDate(value,V2HR_TZ,"yyyy-MM-dd")
    : v2hrTrim_(value).replace(/\//g,"-");
}
function v2hrFixedRows_(sheet,startColumn,width,limit) {
  var last=sheet.getLastRow();
  if(last<2)return [];
  if(last>limit+1)throw Error("測試資料表超出預期筆數，停止讀取");
  return sheet.getRange(2,startColumn,last-1,width).getValues();
}
function v2hrCheckHeaders_(sheet,startColumn,headers) {
  var found=sheet.getRange(1,startColumn,1,headers.length).getDisplayValues()[0];
  if(found.some(function(x,i){return x!==headers[i];}))
    throw Error("資料表欄位與測試規格不一致："+sheet.getName());
}

/** Owner-only setup: adds EMPTY test tabs only. Never deletes or overwrites
 * the old 工作日曆 or any existing sheet. Not callable through dispatch.
 * Deliberately does not auto-approve annual calendars or storm events.
 */
function v2hrInstallEmptyTestTabs() {
  var ss=v2hrGuardTestSheet_();
  var cal=ss.getSheetByName(V2HR_CALENDAR_TITLE);
  var ev=ss.getSheetByName(V2HR_EVENTS_TITLE);
  // Reject existing nonmatching sheets BEFORE any additions.
  if(cal){
    v2hrCheckHeaders_(cal,1,V2HR_CAL_HEADERS);
    v2hrCheckHeaders_(cal,10,V2HR_YEAR_HEADERS);
  }
  if(ev)v2hrCheckHeaders_(ev,1,V2HR_EVENT_HEADERS);
  var created=[];
  if(!cal) {
    cal=ss.insertSheet(V2HR_CALENDAR_TITLE);
    cal.getRange(1,1,1,V2HR_CAL_HEADERS.length).setValues([V2HR_CAL_HEADERS]);
    cal.getRange(1,10,1,V2HR_YEAR_HEADERS.length).setValues([V2HR_YEAR_HEADERS]);
    cal.setFrozenRows(1);
    created.push(V2HR_CALENDAR_TITLE);
  }
  if(!ev) {
    ev=ss.insertSheet(V2HR_EVENTS_TITLE);
    ev.getRange(1,1,1,V2HR_EVENT_HEADERS.length).setValues([V2HR_EVENT_HEADERS]);
    ev.setFrozenRows(1);
    created.push(V2HR_EVENTS_TITLE);
  }
  SpreadsheetApp.flush();
  return {ok:true,created:created,calendarApproved:false,
    message:"僅建立空白隔離測試表。未核准年度與停班事件，沒有產生任何假單。"};
}

/** Authenticated test whoami read path. Caller MUST verify LINE ID Token
 * using v2dLineClaims_ BEFORE calling this function. Never trust empid
 * or company submitted by the phone.
 */
function v2hrVerifiedTestIdentity_(ss,lineUserId) {
  if(typeof v2dEmployee_!=="function")throw Error("缺少模擬員工身分查核");
  var emp=v2dEmployee_(ss,lineUserId);
  if(!emp || !emp.bound || emp.employeeId!=="TEST001")
    throw Error("沒有已綁定的隔離測試員工");
  return {employeeId:"TEST001",company:V2HR_TEST_COMPANY,
    workplace:"TESTSITE"};
}

/** Read-only adapter; same object shape as
 * staging/AttendanceV2_CalendarAndEventService.js.
 * Does not call SpreadsheetApp except through the explicit test guard.
 */
function v2hrReadTestCalendarContext_(ss,employee) {
  var calendar=ss.getSheetByName(V2HR_CALENDAR_TITLE);
  var events=ss.getSheetByName(V2HR_EVENTS_TITLE);
  if(!calendar||!events)throw Error("請先建立兩張隔離人資測試表");
  v2hrCheckHeaders_(calendar,1,V2HR_CAL_HEADERS);
  v2hrCheckHeaders_(calendar,10,V2HR_YEAR_HEADERS);
  v2hrCheckHeaders_(events,1,V2HR_EVENT_HEADERS);
  var annual=v2hrFixedRows_(calendar,10,5,20).filter(function(r){return v2hrTrim_(r[0]);}).map(function(r){
    return {year:v2hrTrim_(r[0]),company:v2hrTrim_(r[1]),
      status:v2hrTrim_(r[2])==="已確認"?"CONFIRMED":"PENDING",
      confirmedBy:v2hrTrim_(r[3]),confirmedAt:v2hrTrim_(r[4])};
  });
  var days=v2hrFixedRows_(calendar,1,8,250).filter(function(r){return v2hrTrim_(r[0]);}).map(function(r) {
    var audit=v2hrTrim_(r[7]).split("|");
    return {date:v2hrDate_(r[0]),company:v2hrTrim_(r[1])||V2HR_TEST_COMPANY,
      workplace:v2hrTrim_(r[2]),dayType:v2hrTrim_(r[3])==="上班"?"WORK":
      v2hrTrim_(r[3])==="休假"?"OFF":"UNKNOWN",
      reason:v2hrTrim_(r[4]),reference:v2hrTrim_(r[5]),
      status:audit.length===2&&audit[0]&&audit[1]?"CONFIRMED":"PENDING",
      confirmedBy:audit[0]||"",confirmedAt:audit[1]||""};
  });
  var eventRows=v2hrFixedRows_(events,1,13,100).filter(function(r){return v2hrTrim_(r[0]);}).map(function(r){
    var scope=v2hrTrim_(r[3]),target=v2hrTrim_(r[4]);
    var mapped=scope==="全公司"&&!target?"ALL":
      scope==="指定打卡地點"&&target?"WORKPLACE":"UNKNOWN";
    return {eventId:v2hrTrim_(r[0]),date:v2hrDate_(r[1]),company:V2HR_TEST_COMPANY,
      type:v2hrTrim_(r[2]),scope:mapped,workplace:mapped==="WORKPLACE"?target:"",
      period:v2hrTrim_(r[5])==="全日"?"FULL":v2hrTrim_(r[5])==="部分"?"PARTIAL":"UNKNOWN",
      payPolicy:v2hrTrim_(r[6])==="照常給薪"?"PAID":
        v2hrTrim_(r[6])==="另行核對"?"REVIEW":"UNKNOWN",
      reference:v2hrTrim_(r[7]),status:v2hrTrim_(r[8])==="已確認"?"CONFIRMED":"PENDING",
      confirmedBy:v2hrTrim_(r[9]),confirmedAt:v2hrTrim_(r[10]),
      protectedMinutes:Number(r[11])||0};
  });
  return {employee:employee,annualChecks:annual,calendarOverrides:days,events:eventRows};
}

/** No roster / real attendance / salary, or line ID is returned. */
function v2hrReadVerifiedTestSnapshot_(lineUserId) {
  var ss=v2hrGuardTestSheet_();
  var employee=v2hrVerifiedTestIdentity_(ss,lineUserId);
  var ctx=v2hrReadTestCalendarContext_(ss,employee);
  return {ok:true,source:"SANDBOX_TWO_SHEETS_ONLY",
    employeeId:"TEST001",company:ctx.employee.company,
    annualYears:ctx.annualChecks.filter(function(r){return r.status==="CONFIRMED";}).map(function(r){return r.year;}),
    holidayOverrideCount:ctx.calendarOverrides.length,
    reviewedEventCount:ctx.events.filter(function(r){return r.status==="CONFIRMED";}).length,
    message:"唯讀檢查完成；沒有任何請假、打卡、薪資寫入"};
}

/** Test-only API wrapper example. Do not add operation to dispatch until
 * the existing LINE identity and iframe reply path are fully regression tested.
 *
 *  if (operation === 'hrCalendarStatus')
 *    return {nonce,result:v2hrReadVerifiedTestSnapshot_(lineUserId)};
 */
