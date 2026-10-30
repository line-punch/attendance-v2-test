/**
 * V2 BATCH QA Calendar: TEST001 source workbook READ-ONLY adapter.
 * NOT INSTALLED / NOT DEPLOYED / NO PUBLIC WEB ENDPOINTS.
 *
 * Dependencies in the future standalone QA Apps Script bundle:
 *   AttendanceV2TwoSheetAdapter
 *   AttendanceV2CalendarService
 *
 * Properties (do not put IDs in GitHub or client payload):
 *   V2_BATCH_QA_ENABLED = enabled
 *   V2_BATCH_QA_SOURCE_BOOK_ID = already-existing TEST001 source spreadsheet
 *   V2_BATCH_QA_BOOK_ID = NEW, distinct QA technical ledger workbook
 *
 * Source columns as verified against existing V2 staged schema:
 * 公司工作日曆: A:H date overrides, J:N annual confirmations
 * 特殊出勤事件: A:M disaster exceptions
 * No writes to either sheet. No employee identity or secret in logs.
 */
function v2BatchCalendarQA_(){
  if(typeof AttendanceV2TwoSheetAdapter==="undefined"||
     typeof AttendanceV2CalendarService==="undefined")
    throw Error("QA_CALENDAR_DEPENDENCIES_MISSING");
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty("V2_BATCH_QA_ENABLED")!=="enabled")
    throw Error("QA_CALENDAR_DISABLED");
  var sourceId=String(props.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID")||"").trim();
  var ledgerId=String(props.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId)||
     !/^[A-Za-z0-9_-]{20,}$/.test(ledgerId)||
     sourceId===ledgerId)
    throw Error("QA_CALENDAR_SOURCE_NOT_ISOLATED");
  var book=SpreadsheetApp.openById(sourceId);
  if(!book||book.getId()!==sourceId||
     book.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("QA_CALENDAR_WRONG_SOURCE_BOOK");
  var employeeSheet=book.getSheetByName("員工資料");
  if(!employeeSheet||employeeSheet.getLastRow()!==2)
    throw Error("QA_CALENDAR_EMPLOYEE_SHAPE");
  var fixture=employeeSheet.getRange(2,1,1,8).getValues()[0];
  if(String(fixture[0])!=="TEST001"||String(fixture[4])!=="TEST_CO"||
     String(fixture[6])!=="在職"||String(fixture[7])!=="TESTSITE")
    throw Error("QA_CALENDAR_EMPLOYEE_MISMATCH");
  var calendar=book.getSheetByName("公司工作日曆");
  var events=book.getSheetByName("特殊出勤事件");
  if(!calendar||!events)throw Error("QA_CALENDAR_TEST_TABS_MISSING");
  var overrideHead=["日期","公司","指定打卡地點","日別","原因",
    "核對依據","備註","確認紀錄"];
  var annualHead=["年度","公司","核對狀態","確認人","確認時間"];
  var eventHead=["事件單號","日期","類型","適用範圍","指定打卡地點",
    "全日／部分","給薪處理","公告或佐證","核對狀態","確認人",
    "確認時間","核定停班分鐘數","備註"];
  function guardHeaders(sh,col,expected){
    var found=sh.getRange(1,col,1,expected.length).getDisplayValues()[0];
    if(found.length!==expected.length||
       expected.some(function(v,i){return found[i]!==v}))
      throw Error("QA_CALENDAR_HEADERS_UNVERIFIED");
  }
  guardHeaders(calendar,1,overrideHead);
  guardHeaders(calendar,10,annualHead);
  guardHeaders(events,1,eventHead);
  // The annual section J:N can legitimately make the sheet taller than A:H.
  // Read each area separately, reject malformed partial rows, never edit.
  function readArea(sh,col,width,maxNonempty){
    var last=sh.getLastRow();
    if(last>501||last<1)throw Error("QA_CALENDAR_ROW_LIMIT");
    if(last===1)return [];
    var data=sh.getRange(2,col,last-1,width).getValues();
    var nonempty=data.filter(function(row){
      var occupied=row.some(function(value){
        return value!==null&&value!==undefined&&String(value).trim()!=="";
      });
      if(occupied&&!String(row[0]===null||row[0]===undefined?"":row[0]).trim())
        throw Error("QA_CALENDAR_PARTIAL_ROW");
      return occupied;
    });
    if(nonempty.length>maxNonempty)throw Error("QA_CALENDAR_SECTION_LIMIT");
    return nonempty;
  }
  function asDate(v){
    return v instanceof Date?Utilities.formatDate(v,"Asia/Taipei","yyyy-MM-dd"):
      String(v===undefined||v===null?"":v).trim().replace(/\//g,"-");
  }
  function normalize(rows,idx){
    return rows.map(function(row){var copy=row.slice();copy[idx]=asDate(copy[idx]);return copy;});
  }
  var model=AttendanceV2TwoSheetAdapter;
  var exceptions=model.calendarRows(normalize(readArea(calendar,1,8,250),0),"TEST_CO");
  var annual=model.annualChecks(readArea(calendar,10,5,20));
  var special=model.eventRows(normalize(readArea(events,1,13,100),1),"TEST_CO");
  function validateLeave(data,principal,today){
    if(!data||!principal||
       principal.source!=="VERIFIED_SERVER_BINDING"||
       principal.active!==true||principal.employeeId!=="TEST001"||
       principal.company!=="TEST_CO"||
       !["STAFF","HR_OWNER"].includes(principal.role))
      return {ok:false,code:"QA_CALENDAR_IDENTITY_UNVERIFIED"};
    if(typeof today!=="string"||
       !AttendanceV2CalendarService.parseDate(today))
      return {ok:false,code:"QA_CALENDAR_TODAY_INVALID"};
    // Server-side month/day validation does not trust browser-prechecked values.
    var days=AttendanceV2CalendarService.dateRange(data.startDate,data.endDate);
    if(!days.ok)return {ok:false,code:days.code};
    if(days.days.length>31)return {ok:false,code:"RANGE_TOO_LONG"};
    var request={startDate:data.startDate,endDate:data.endDate,
      mode:data.unit,startTime:data.fromTime,endTime:data.toTime};
    var ctx={employee:{employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"},
      annualChecks:annual,calendarOverrides:exceptions,events:special,today:today};
    var result=AttendanceV2CalendarService.validateLeave(request,ctx);
    // Never return raw exceptions or other HR details to the client.
    return result.ok?
      {ok:true,workingDays:result.days.length}:
      {ok:false,code:result.code||"CALENDAR_UNVERIFIED"};
  }
  return Object.freeze({validateLeave:validateLeave});
}
