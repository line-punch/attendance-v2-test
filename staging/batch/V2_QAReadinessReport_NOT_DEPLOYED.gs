/** Admin-only read-only readiness report. Never sends, writes, or changes flags. */
function desktopQaReadinessReport() {
 var ctx=v2QANotificationContext_(),p=ctx.p,checks=[];
 function add(name,passed,action){checks.push({item:name,passed:!!passed,remaining:passed?"":action});}
 add("三介面後端",typeof V2BatchWorkflowCore!=="undefined"&&typeof v2MobileClockHandle_==="function","安裝既有三介面同步服務");
 add("主管通知與審核計畫",typeof V2QANotificationPlan!=="undefined"&&typeof V2QANotificationDispatch!=="undefined"&&typeof v2QANotificationSendCandidate_==="function","安裝通知計畫、送出器與 QA 轉接程式");
 add("通知流水表",!!ctx.book.getSheetByName("V2_通知流水_QA"),"準備獨立 QA 通知流水表");
 var normal=ctx.book.getSheetByName("V2_正常打卡_QA");
 add("正常打卡獨立表",!!normal&&normal.getLastColumn()===12,"核對正常打卡專用表頭");
 var reviewer=p.getProperty("V2_BATCH_QA_HR_LINE_SUB")||"";
 add("測試審核身分",/^U[0-9a-f]{32}$/i.test(reviewer)&&reviewer!==ctx.employee,"最後集中設定與員工不同的測試審核帳號");
 var allowed=null,managers=null;
 try{allowed=JSON.parse(p.getProperty("V2_QA_NOTIFY_TEST_RECIPIENTS")||"null");}catch(_){}
 try{managers=JSON.parse(p.getProperty("V2_QA_NOTIFY_MANAGERS")||"null");}catch(_){}
 add("測試通知白名單",Array.isArray(allowed)&&allowed.length>=2&&allowed.length<=4&&
  allowed.every(function(s){return /^U[0-9a-f]{32}$/i.test(String(s));})&&
  allowed.indexOf(ctx.employee)>=0&&allowed.indexOf(reviewer)>=0,
  "最後集中核對只含測試帳號的收件人白名單");
 add("通知主管對應",Array.isArray(managers)&&managers.length<=2&&Array.isArray(allowed)&&
  managers.every(function(s){return allowed.indexOf(s)>=0;}),"最後集中設定最多兩位測試通知主管（可明確指定空名單）");
 add("通知 OA 確認",/^@[a-z0-9._-]{4,40}$/i.test(p.getProperty("V2_QA_NOTIFY_CONFIRMED_BOT_BASIC_ID")||""),"最後集中確認通知 OA");
 add("私有通知憑證",String(p.getProperty("V2_QA_NOTIFY_TOKEN")||"").length>=30,"最後集中設定私有憑證，不放在前端或 GitHub");
 var originalCount=0;ctx.state.latest.forEach(function(){originalCount++;});
 var result={scope:"TEST001/TEST_CO QA only",originalApplications:originalCount,journalEntries:ctx.state.entries,
  normalPunches:normal?Math.max(0,normal.getLastRow()-1):null,
  writeEnabled:p.getProperty("V2_BATCH_QA_WRITE_ENABLED")==="enabled",
  notificationEnabled:p.getProperty("V2_QA_NOTIFY_ENABLED")==="enabled",
  automationApproved:p.getProperty("V2_QA_NOTIFY_AUTOMATION_APPROVED")==="enabled",
  readyToEnableQA:checks.every(function(c){return c.passed;}),checks:checks,
  messagesSent:0,modified:false,productionSwitched:false};
 console.log(JSON.stringify(result));return result;
}

