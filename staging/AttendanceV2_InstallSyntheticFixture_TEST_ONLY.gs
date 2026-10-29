/**
 * DATA TEST ONLY — one-time synthetic fixture for the TWO new HR test tabs.
 * NOT DEPLOYED / NOT PRODUCTION / NOT A WEB ENDPOINT.
 *
 * Requires existing v2hrGuardTestSheet_(), v2hrCheckHeaders_(),
 * v2hrReadTestCalendarContext_(), all from the separate read-only file.
 * Must only be executed manually in YC_ATTENDANCE_V2_DATA_TEST_ONLY.
 *
 * Does NOT touch: 員工資料, 上班地點, 打卡紀錄, 工作日曆,
 * 補打卡申請, 請假申請, or any formal attendance/payroll system.
 */
function v2hrInstallSyntheticFixture_TEST_ONLY() {
  // Guard before checking or writing any target cells.
  var ss=v2hrGuardTestSheet_();
  var cal=ss.getSheetByName("公司工作日曆");
  var evt=ss.getSheetByName("特殊出勤事件");
  if(!cal||!evt)throw Error("缺少已建立的兩張隔離測試表，停止操作");
  v2hrCheckHeaders_(cal,1,V2HR_CAL_HEADERS);
  v2hrCheckHeaders_(cal,10,V2HR_YEAR_HEADERS);
  v2hrCheckHeaders_(evt,1,V2HR_EVENT_HEADERS);

  // Every value is fictitious. Never interpret this as an official Taiwan
  // holiday announcement, a real storm closure or real employee pay data.
  var holiday=[
    "2026-11-11","TEST_CO","","休假","虛構測試休假",
    "SYNTHETIC_TEST_ONLY","非官方行事曆","TEST-HR|2026-10-29 13:40:00"
  ];
  var annual=["2026","TEST_CO","已確認","TEST-HR","2026-10-29 13:40:00"];
  var storm=[
    "MOCK-STOP-20261112","2026-11-12","虛構颱風停班",
    "全公司","","全日","照常給薪","SYNTHETIC_TEST_ONLY",
    "已確認","TEST-HR","2026-10-29 13:40:00","",
    "純測試，不代表2026/11/12真的有颱風停班"
  ];

  // No partial overwrite even if one of the two test tabs contains data.
  // Both must be empty below the header; metadata J:N lives in the same tab.
  if(cal.getLastRow()!==1||evt.getLastRow()!==1)
    throw Error("已有測試資料：為避免覆蓋，拒絕再次匯入");
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error("測試表正被操作，停止匯入");
  try {
    // Re-check after locking to avoid two editor executions overwriting.
    v2hrGuardTestSheet_();
    if(cal.getLastRow()!==1||evt.getLastRow()!==1)
      throw Error("已有測試資料：為避免覆蓋，拒絕再次匯入");
    cal.getRange(2,1,1,8).setValues([holiday]);
    cal.getRange(2,10,1,5).setValues([annual]);
    evt.getRange(2,1,1,13).setValues([storm]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  var ctx=v2hrReadTestCalendarContext_(ss,{
    employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"
  });
  if(ctx.annualChecks.length!==1||ctx.calendarOverrides.length!==1||
     ctx.events.length!==1||ctx.annualChecks[0].status!=="CONFIRMED"||
     ctx.calendarOverrides[0].dayType!=="OFF"||
     ctx.events[0].scope!=="ALL"||ctx.events[0].payPolicy!=="PAID")
    throw Error("測試資料回讀結果不符合預期，請檢查新建工作表");
  var report={
    ok:true,synthetic:true,company:"TEST_CO",employeeId:"TEST001",
    annualYears:ctx.annualChecks.map(function(r){return r.year;}),
    calendarOverrides:ctx.calendarOverrides.length,
    companyStopEvents:ctx.events.length,
    message:"純模擬資料已寫入隔離測試表並讀回核對，不是正式請假或停班公告"
  };
  Logger.log(JSON.stringify(report));
  return report;
}
