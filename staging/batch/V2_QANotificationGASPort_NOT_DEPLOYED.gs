/** QA-only candidate. NOT DEPLOYED. No trigger, doGet or doPost.
 * Requires V2_QANotificationDispatch.js in the same QA project.
 * No sheet is created automatically and all gates default disabled.
 */
function desktopQaNotificationDisabledCheck() {
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty("V2_QA_NOTIFY_ENABLED")==="enabled")throw Error("QA_NOTIFY_MUST_REMAIN_DISABLED");
 var result=v2QANotificationSendCandidate_(null);
 if(result.status!=="DISABLED"||result.attempted!==false)throw Error("QA_NOTIFY_DISABLED_CHECK_FAILED");
 console.log("PASS_QA_NOTIFY_DISABLED_NO_SHEETS_NO_LINE");
 return result;
}
function v2QANotificationSendCandidate_(entry) {
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty("V2_QA_NOTIFY_ENABLED")!=="enabled"||
    props.getProperty("V2_BATCH_QA_ENABLED")!=="enabled"||
    props.getProperty("V2_BATCH_QA_WRITE_ENABLED")!=="enabled")
  return {status:"DISABLED",attempted:false};
 var sourceId=props.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID");
 var bookId=props.getProperty("V2_BATCH_QA_BOOK_ID");
 if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId||"")||
    !/^[A-Za-z0-9_-]{20,}$/.test(bookId||"")||sourceId===bookId)
  throw Error("QA_NOTIFY_BOOK_INVALID");
 var source=SpreadsheetApp.openById(sourceId);
 if(source.getId()!==sourceId||source.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")throw Error("QA_NOTIFY_SOURCE_INVALID");
 var roster=source.getSheetByName("員工資料");
 if(!roster||roster.getLastRow()!==2)throw Error("QA_NOTIFY_ROSTER_INVALID");
 var employee=roster.getRange(2,1,1,8).getValues()[0];
 if(employee[0]!=="TEST001"||employee[4]!=="TEST_CO"||employee[6]!=="在職"||
    employee[7]!=="TESTSITE"||!/^U[0-9a-f]{32}$/i.test(String(employee[3])))
  throw Error("QA_NOTIFY_ROSTER_INVALID");
 var reviewer=props.getProperty("V2_BATCH_QA_HR_LINE_SUB")||"";
 var allowed;
 try{allowed=JSON.parse(props.getProperty("V2_QA_NOTIFY_TEST_RECIPIENTS")||"null");}
 catch(_){throw Error("QA_NOTIFY_RECIPIENTS_INVALID");}
 if(!/^U[0-9a-f]{32}$/i.test(reviewer)||reviewer===employee[3]||
    !Array.isArray(allowed)||allowed.length<2||allowed.length>4||
    allowed.some(function(x){return !/^U[0-9a-f]{32}$/i.test(String(x));})||
    allowed.indexOf(reviewer)<0||allowed.indexOf(employee[3])<0)
  throw Error("QA_NOTIFY_RECIPIENTS_INVALID");
 if(!entry||entry.role==="REVIEWER_CARD"&&entry.to!==reviewer||
    entry.role==="EMPLOYEE_RESULT"&&entry.to!==employee[3])throw Error("QA_NOTIFY_ROLE_INVALID");
 var expectedBot=String(props.getProperty("V2_QA_NOTIFY_CONFIRMED_BOT_BASIC_ID")||"");
 var token=String(props.getProperty("V2_QA_NOTIFY_TOKEN")||"");
 if(!/^@[a-z0-9._-]{4,40}$/i.test(expectedBot)||token.length<30)throw Error("QA_NOTIFY_TRANSPORT_UNCONFIGURED");
 var book=SpreadsheetApp.openById(bookId);
 if(book.getId()!==bookId||book.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY")throw Error("QA_NOTIFY_DESTINATION_INVALID");
 var sheet=book.getSheetByName("V2_通知流水_QA");
 var headers=["DELIVERY_KEY","STATE_JSON","UPDATED_UTC"];
 if(!sheet||sheet.getLastRow()<1||sheet.getLastColumn()!==3||
    JSON.stringify(sheet.getRange(1,1,1,3).getValues()[0])!==JSON.stringify(headers))
  throw Error("QA_NOTIFY_LEDGER_UNCONFIGURED");
 function load(key){
  var rows=sheet.getDataRange().getValues(),found=null;
  for(var i=1;i<rows.length;i++){
   var item;try{item=JSON.parse(rows[i][1]);}catch(_){throw Error("QA_NOTIFY_LEDGER_INVALID");}
   if(!item||item.deliveryKey!==rows[i][0]||
      ["SENDING","UNKNOWN","REJECTED","ACCEPTED"].indexOf(item.state)<0)
    throw Error("QA_NOTIFY_LEDGER_INVALID");
   if(rows[i][0]===key){
    if(found&&(found.body!==item.body||found.retryKey!==item.retryKey||
       found.to!==item.to||found.role!==item.role))throw Error("QA_NOTIFY_LEDGER_CONFLICT");
    found=item;
   }
  }
  return found;
 }
 var io={load:load,save:function(row){
   sheet.appendRow([row.deliveryKey,JSON.stringify(row),new Date().toISOString()]);SpreadsheetApp.flush();
  },withExclusive:function(fn){
   var lock=LockService.getScriptLock();
   if(!lock.tryLock(5000))throw Error("QA_NOTIFY_BUSY");
   try{return fn();}finally{lock.releaseLock();}
  }};
 var transport={push:function(body,extraHeaders){
  // Validate the configured OA identity before sending. Never log token or body.
  var info=UrlFetchApp.fetch("https://api.line.me/v2/bot/info",{
   method:"get",headers:{Authorization:"Bearer "+token},muteHttpExceptions:true});
  var bot;try{bot=JSON.parse(info.getContentText());}catch(_){throw Error("QA_NOTIFY_BOT_UNVERIFIED");}
  if(info.getResponseCode()!==200||!bot||bot.basicId!==expectedBot)throw Error("QA_NOTIFY_BOT_UNVERIFIED");
  var response=UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push",{
   method:"post",contentType:"application/json",headers:{Authorization:"Bearer "+token,
    "X-Line-Retry-Key":extraHeaders["X-Line-Retry-Key"]},payload:body,muteHttpExceptions:true});
  return {status:response.getResponseCode(),headers:response.getAllHeaders()};
 }};
 return V2QANotificationDispatch.create({io:io,transport:transport,
  settings:{enabled:true,scope:"TEST001/TEST_CO",allowedTestRecipients:allowed},
  uuid:function(){return Utilities.getUuid();},clock:function(){return new Date().toISOString();}
 }).send(entry);
}

