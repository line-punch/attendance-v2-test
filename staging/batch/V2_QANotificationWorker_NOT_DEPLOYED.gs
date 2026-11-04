/** Admin-only QA outbox worker. No public endpoint or automatic trigger. */
function v2QANotificationContext_() {
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_BATCH_QA_ENABLED")!=="enabled")throw Error("QA_DISABLED");
 var sourceId=p.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID"),bookId=p.getProperty("V2_BATCH_QA_BOOK_ID");
 if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId||"")||!bookId||sourceId===bookId)throw Error("QA_SCOPE_INVALID");
 var source=SpreadsheetApp.openById(sourceId),book=SpreadsheetApp.openById(bookId);
 if(source.getId()!==sourceId||source.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY"||
    book.getId()!==bookId||book.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY")throw Error("QA_SCOPE_INVALID");
 var roster=source.getSheetByName("員工資料");
 if(!roster||roster.getLastRow()!==2)throw Error("QA_ROSTER_INVALID");
 var employee=roster.getRange(2,1,1,8).getValues()[0];
 if(employee[0]!=="TEST001"||employee[4]!=="TEST_CO"||employee[6]!=="在職"||employee[7]!=="TESTSITE")throw Error("QA_ROSTER_INVALID");
 var ledger=book.getSheetByName("V2_交易流水_QA");
 if(!ledger||ledger.getLastRow()>10001||ledger.getLastColumn()!==8)throw Error("QA_LEDGER_INVALID");
 var rows=ledger.getDataRange().getValues();
 if(JSON.stringify(rows.shift())!==JSON.stringify(V2BatchAppendJournal.HEADERS))throw Error("QA_LEDGER_INVALID");
 var state=V2BatchAppendJournal.decode(rows);
 state.latest.forEach(function(row){if(row.employeeId!=="TEST001"||row.company!=="TEST_CO")throw Error("QA_SCOPE_INVALID");});
 return {p:p,book:book,state:state,employee:String(employee[3]||"")};
}
function v2QANotificationPlans_(ctx) {
 var reviewer=ctx.p.getProperty("V2_BATCH_QA_HR_LINE_SUB")||"",allowed,managers;
 try{
  allowed=JSON.parse(ctx.p.getProperty("V2_QA_NOTIFY_TEST_RECIPIENTS")||"null");
  managers=JSON.parse(ctx.p.getProperty("V2_QA_NOTIFY_MANAGERS")||"null");
 }catch(_){throw Error("QA_NOTIFY_RECIPIENTS_UNCONFIGURED");}
 if(!Array.isArray(managers)||managers.length>2)throw Error("QA_NOTIFY_RECIPIENTS_UNCONFIGURED");
 var config={scope:"TEST001/TEST_CO",employee:ctx.employee,reviewer:reviewer,
  allowedTestRecipients:allowed,manager1:managers[0]||"",manager2:managers[1]||"",reviewMode:"LIFF"};
 var plans=[];
 ctx.state.events.forEach(function(event){
  var row=ctx.state.latest.get(event.requestId);
  if(event.type!=="REVIEWED"&&row.status!=="PENDING")return;
  V2QANotificationPlan.plan(event,row,config).entries.forEach(function(entry){plans.push(entry);});
 });
 return plans;
}
function v2QANotificationCurrentEntry_(entry) {
 var plans=v2QANotificationPlans_(v2QANotificationContext_());
 var expected=plans.filter(function(x){return x.deliveryKey===entry.deliveryKey;});
 if(expected.length!==1||JSON.stringify(expected[0])!==JSON.stringify(entry))throw Error("QA_NOTIFY_STALE_OR_CHANGED_PLAN");
 return true;
}
function desktopQaNotificationQueueStatus() {
 var ctx=v2QANotificationContext_(),counts={pendingApplications:0,reviewedApplications:0,journalEntries:ctx.state.entries};
 ctx.state.latest.forEach(function(row){counts[row.status==="PENDING"?"pendingApplications":"reviewedApplications"]++;});
 counts.notificationEnabled=ctx.p.getProperty("V2_QA_NOTIFY_ENABLED")==="enabled";
 counts.writeEnabled=ctx.p.getProperty("V2_BATCH_QA_WRITE_ENABLED")==="enabled";
 counts.reviewerConfigured=!!ctx.p.getProperty("V2_BATCH_QA_HR_LINE_SUB");
 counts.recipientListConfigured=!!ctx.p.getProperty("V2_QA_NOTIFY_TEST_RECIPIENTS");
 counts.notificationLedgerPresent=!!ctx.book.getSheetByName("V2_通知流水_QA");
 console.log(JSON.stringify(counts));return counts;
}
function desktopQaNotificationInitializeLedger() {
 var ctx=v2QANotificationContext_(),headers=["DELIVERY_KEY","STATE_JSON","UPDATED_UTC"];
 var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw Error("QA_NOTIFY_BUSY");
 try{
  var sheet=ctx.book.getSheetByName("V2_通知流水_QA");
  if(!sheet){sheet=ctx.book.insertSheet("V2_通知流水_QA");sheet.getRange(1,1,1,3).setValues([headers]);SpreadsheetApp.flush();}
  if(sheet.getLastColumn()!==3||sheet.getLastRow()<1||
     JSON.stringify(sheet.getRange(1,1,1,3).getValues()[0])!==JSON.stringify(headers))throw Error("QA_NOTIFY_LEDGER_INVALID");
  console.log("QA_NOTIFY_LEDGER_READY_NO_MESSAGES_SENT");return {ready:true,messagesSent:0};
 }finally{lock.releaseLock();}
}
function desktopQaNotificationDrain() {
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_QA_NOTIFY_ENABLED")!=="enabled"||p.getProperty("V2_BATCH_QA_WRITE_ENABLED")!=="enabled")
  return {status:"DISABLED",attempted:0};
 var ctx=v2QANotificationContext_(),entries=v2QANotificationPlans_(ctx);
 var sheet=ctx.book.getSheetByName("V2_通知流水_QA"),states={};
 if(!sheet||sheet.getLastRow()>10001)throw Error("QA_NOTIFY_LEDGER_UNCONFIGURED");
 var history=sheet.getDataRange().getValues();
 if(JSON.stringify(history.shift())!==JSON.stringify(["DELIVERY_KEY","STATE_JSON","UPDATED_UTC"]))throw Error("QA_NOTIFY_LEDGER_INVALID");
 history.forEach(function(row){
  var value;try{value=JSON.parse(row[1]);}catch(_){throw Error("QA_NOTIFY_LEDGER_INVALID");}
  if(!value||row[0]!==value.deliveryKey||["ACCEPTED","UNKNOWN","SENDING","REJECTED"].indexOf(value.state)<0)throw Error("QA_NOTIFY_LEDGER_INVALID");
  states[value.deliveryKey]=value.state;
 });
 var attempts=0,counts={ACCEPTED:0,UNKNOWN:0,REJECTED:0,DISABLED:0};
 for(var i=0;i<entries.length&&attempts<5;i++){
  if(states[entries[i].deliveryKey]==="ACCEPTED")continue;
  if(states[entries[i].deliveryKey]){
   counts[states[entries[i].deliveryKey]==="REJECTED"?"REJECTED":"UNKNOWN"]++;break;
  }
  var result=v2QANotificationSendCandidate_(entries[i]);counts[result.status]++;
  if(result.attempted)attempts++;
  if(result.status==="UNKNOWN"||result.status==="REJECTED")break;
 }
 // No employee names, user IDs, message text, token or reasons are logged.
 console.log(JSON.stringify({attempted:attempts,states:counts}));return {attempted:attempts,states:counts};
}

