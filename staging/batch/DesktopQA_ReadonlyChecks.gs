/** Owner-only checks for the NEW QA project. No writes or notifications. */
function desktopQaDisabledSmokeTest() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty("V2_BATCH_QA_ENABLED") !== "disabled" ||
      p.getProperty("V2_BATCH_QA_WRITE_ENABLED") !== "disabled")
    throw Error("QA_FLAGS_MUST_BE_DISABLED");
  var nonce = "f".repeat(40);
  var reply = v2BatchQAHandleCandidate_({nonce:nonce});
  if (reply.ok !== false || reply.persisted !== null || reply.nonce !== nonce)
    throw Error("DISABLED_REPLY_UNEXPECTED");
  var html = doPost({parameter:{nonce:nonce}}).getContent();
  if (html.indexOf("YC_V2_BATCH_QA_V1") < 0 || html.indexOf(nonce) < 0)
    throw Error("HTML_BRIDGE_INVALID");
  var banner = doGet().getContent();
  if (banner.indexOf("TEST001") < 0) throw Error("QA_BANNER_INVALID");
  console.log("PASS_DISABLED_SMOKE: flags disabled; synchronous HTML bridge; QA banner. No Sheets writes or LINE requests.");
}

function desktopQaReadOnlyPreflight() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty("V2_BATCH_QA_ENABLED") !== "disabled" ||
      p.getProperty("V2_BATCH_QA_WRITE_ENABLED") !== "disabled")
    throw Error("QA_FLAGS_MUST_BE_DISABLED");
  var sourceId = p.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID");
  if (!sourceId) throw Error("QA_SOURCE_NOT_CONFIGURED");
  var source = SpreadsheetApp.openById(sourceId);
  if (source.getName() !== "YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("WRONG_SOURCE_BOOK");
  var staff = source.getSheetByName("員工資料");
  if (!staff || staff.getLastRow() !== 2) throw Error("TEST_ROSTER_SHAPE_INVALID");
  var row = staff.getRange(2,1,1,8).getDisplayValues()[0];
  if (row[0] !== "TEST001" || row[4] !== "TEST_CO" || row[6] !== "在職" || row[7] !== "TESTSITE")
    throw Error("TEST_ROSTER_SCOPE_INVALID");
  var expected = [
    ["公司工作日曆",1,["日期","公司","指定打卡地點","日別","原因","核對依據","備註","確認紀錄"]],
    ["公司工作日曆",10,["年度","公司","核對狀態","確認人","確認時間"]],
    ["特殊出勤事件",1,["事件單號","日期","類型","適用範圍","指定打卡地點","全日／部分","給薪處理","公告或佐證","核對狀態","確認人","確認時間","核定停班分鐘數","備註"]]
  ];
  expected.forEach(function(item){
    var sh = source.getSheetByName(item[0]);
    if (!sh || JSON.stringify(sh.getRange(1,item[1],1,item[2].length).getDisplayValues()[0]) !== JSON.stringify(item[2]))
      throw Error("SOURCE_HEADERS_UNVERIFIED");
  });
  console.log("PASS_SOURCE_READONLY: TEST001/TEST_CO roster and calendar headers verified. No writes.");
  var ledgerId = p.getProperty("V2_BATCH_QA_BOOK_ID");
  if (!ledgerId) { console.log("PENDING: distinct QA ledger not configured; keep both flags disabled."); return; }
  if (ledgerId === sourceId) throw Error("LEDGER_NOT_ISOLATED");
  var ledger = SpreadsheetApp.openById(ledgerId);
  if (ledger.getName() !== "YC_ATTENDANCE_V2_BATCH_QA_ONLY") throw Error("WRONG_QA_LEDGER");
  var sh = ledger.getSheetByName("V2_交易流水_QA");
  if (!sh || sh.getLastColumn() !== 8 || JSON.stringify(sh.getRange(1,1,1,8).getDisplayValues()[0]) !== JSON.stringify(V2BatchAppendJournal.HEADERS))
    throw Error("QA_LEDGER_HEADERS_INVALID");
  console.log("PASS_LEDGER_READONLY: distinct QA ledger with exact 8 headers. No writes.");
}
