/**
 * Batch TEST001 QA workbook preflight — READ ONLY, NOT INSTALLED.
 * OWNER-EDITOR invocation only, before V2_BATCH_QA_ENABLED is enabled.
 *
 * Never run in production "打卡系統" or in the already-verified GPS/V4 GAS.
 * No new sheet, write, deployment, token, account email or Sheet ID in logs.
 *
 * This verifies only that the signed-in editor and Apps Script effective user
 * have the same nonblank email. It DOES NOT independently prove legal/project
 * ownership; independently verify which Google account/project is open.
 */
function v2BatchQAOwnerPreflight_TEST_ONLY(){
  var report={ok:false,readOnly:true,qaOnly:true,accountConsistent:false,
    flagDisabled:false,workbookRecognized:false,headersMatch:false,
    reason:"UNVERIFIED"};
  var active=String(Session.getActiveUser().getEmail()||"").trim().toLowerCase();
  var effective=String(Session.getEffectiveUser().getEmail()||"").trim().toLowerCase();
  if(!active||!effective||active!==effective){
    report.reason="GOOGLE_ACCOUNT_CONTEXT_UNVERIFIED";
    Logger.log(JSON.stringify(report));return report;
  }
  report.accountConsistent=true;
  var props=PropertiesService.getScriptProperties();
  var flag=String(props.getProperty("V2_BATCH_QA_ENABLED")||"disabled");
  if(flag!=="disabled"){
    report.reason="QA_FLAG_NOT_DISABLED";
    Logger.log(JSON.stringify(report));return report;
  }
  report.flagDisabled=true;
  var id=String(props.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id)){
    report.reason="QA_WORKBOOK_NOT_CONFIGURED";
    Logger.log(JSON.stringify(report));return report;
  }
  var book;
  try{book=SpreadsheetApp.openById(id);}
  catch(_){
    report.reason="QA_WORKBOOK_UNAVAILABLE";
    Logger.log(JSON.stringify(report));return report;
  }
  if(!book||book.getId()!==id||
     book.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY"){
    report.reason="QA_WORKBOOK_MISMATCH";
    Logger.log(JSON.stringify(report));return report;
  }
  report.workbookRecognized=true;
  var sheet=book.getSheetByName("V2_交易流水_QA");
  if(!sheet||sheet.getLastColumn()!==8||
     sheet.getLastRow()<1||sheet.getLastRow()>10001){
    report.reason="QA_LEDGER_SHAPE_INVALID";
    Logger.log(JSON.stringify(report));return report;
  }
  var expected=["TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
    "UTC_TIME","PREV_HASH","CONTENT_HASH"];
  var head=sheet.getRange(1,1,1,8).getDisplayValues()[0];
  if(head.length!==expected.length||expected.some(function(x,i){return head[i]!==x})){
    report.reason="QA_LEDGER_HEADER_MISMATCH";
    Logger.log(JSON.stringify(report));return report;
  }
  report.headersMatch=true;report.ok=true;report.reason="PRECHECK_ONLY";
  // Never implicitly enable V2_BATCH_QA_ENABLED after a successful check.
  Logger.log(JSON.stringify(report));
  return report;
}
