/** GENERATED QA-only notification helpers. No public route or auto sending. */
"use strict";
(function(root){
const BASE="https://liff.line.me/2012136707-CgGNZAuq";
const ID=/^QA_[A-Za-z0-9_-]{8,76}$/;
function read(href){
 const params=new URL(href).searchParams;
 if(!params.has("qaReviewId")&&!params.has("qaDecision"))return null;
 if(params.getAll("qaReviewId").length!==1||params.getAll("qaDecision").length!==1||
    !ID.test(params.get("qaReviewId")||"")||!["APPROVE","REJECT"].includes(params.get("qaDecision")))
  throw Error("審核連結無效，請保留原申請編號交由管理者核對。");
 return {requestId:params.get("qaReviewId"),decision:params.get("qaDecision")};
}
function uri(id,decision){
 if(!ID.test(id)||!["APPROVE","REJECT"].includes(decision))throw Error("QA_REVIEW_LINK_INVALID");
 return BASE+"?qaReviewId="+encodeURIComponent(id)+"&qaDecision="+decision;
}
const api={read,uri};
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2QAReviewEntry=api;
})(typeof window!=="undefined"?window:this);

var V2QANotificationPlan=(function(){
"use strict";
// Pure offline QA planning only. No LINE calls, credentials, Sheet writes or webhook.
const SUB=/^U[0-9a-f]{32}$/i, REQUEST=/^QA_[A-Za-z0-9_-]{8,100}$/;
const reviewEntry=V2QAReviewEntry;
function scope(row){
 if(!row||row.employeeId!=="TEST001"||row.company!=="TEST_CO"||
    !REQUEST.test(row.requestId)||!["LEAVE","MISSING"].includes(row.kind)||
    !["PENDING","APPROVED","REJECTED"].includes(row.status))throw Error("QA_SCOPE_INVALID");
}
function recipients(config){
 if(!config||config.scope!=="TEST001/TEST_CO"||!Array.isArray(config.allowedTestRecipients)||
    !SUB.test(config.employee)||!SUB.test(config.reviewer)||config.employee===config.reviewer)
  throw Error("QA_TEST_RECIPIENTS_REQUIRED");
 const allowed=new Set(config.allowedTestRecipients);
 const managers=[config.manager1,config.manager2].filter(Boolean);
 for(const sub of [config.employee,config.reviewer,...managers]){
  if(!SUB.test(sub)||!allowed.has(sub))throw Error("QA_RECIPIENT_NOT_ALLOWED");
 }
 return {managers:[...new Set(managers)],reviewer:config.reviewer,employee:config.employee};
}
function detail(row){
 const b=row.body||{};
 if(row.kind==="LEAVE"){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(b.endDate))throw Error("QA_DATE_REQUIRED");
  return "請假日期："+b.startDate+"～"+b.endDate;
 }
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!["上班","下班"].includes(b.type)||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time))throw Error("QA_DATE_REQUIRED");
 return "補卡："+b.date+" "+b.type+" "+b.time;
}
function callbackData(row,decision){
 return "qa=v2&decision="+decision+"&kind="+row.kind+"&requestId="+encodeURIComponent(row.requestId);
}
function plan(event,row,config){
 scope(row);const r=recipients(config);
 if(config.reviewMode&&config.reviewMode!=="LIFF")throw Error("QA_REVIEW_MODE_INVALID");
 const action=(label,decision)=>config.reviewMode==="LIFF"?
  {type:"uri",label,uri:reviewEntry.uri(row.requestId,decision)}:
  {type:"postback",label,data:callbackData(row,decision)};
 if(!event||event.requestId!==row.requestId||
    !/^[A-Za-z0-9_-]{8,160}$/.test(event.eventKey||""))throw Error("QA_EVENT_INVALID");
 const entries=[];
 function add(role,to,message){entries.push({
  deliveryKey:event.eventKey+":"+role+":"+to,role,to,message
 });}
 const title=row.kind==="LEAVE"?"請假申請":"補打卡申請";
 const text="【獨立 QA｜合成資料】\n"+title+"\n"+detail(row)+"\n原單："+row.requestId;
 if(event.type==="REVIEWED"){
  if(!["APPROVED","REJECTED"].includes(row.status)||event.status!==row.status)throw Error("QA_EVENT_STATE_MISMATCH");
  add("EMPLOYEE_RESULT",r.employee,{type:"text",text:text+"\n結果："+(row.status==="APPROVED"?"核准":"駁回")});
 }else{
  if(event.type!==(row.kind==="LEAVE"?"LEAVE_SUBMITTED":"MISSING_SUBMITTED")||row.status!=="PENDING")
   throw Error("QA_EVENT_STATE_MISMATCH");
  for(const manager of r.managers)add("MANAGER_NOTICE",manager,{type:"text",text});
  add("REVIEWER_CARD",r.reviewer,{type:"flex",altText:"獨立 QA "+title,
   contents:{type:"bubble",body:{type:"box",layout:"vertical",contents:[
    {type:"text",text,wrap:true}]},footer:{type:"box",layout:"horizontal",contents:[
     {type:"button",style:"primary",action:action("核准","APPROVE")},
     {type:"button",style:"secondary",action:action("駁回","REJECT")}
    ]}}});
 }
 // This object is a preview. No component may interpret it as delivery success.
 return {scope:"TEST001/TEST_CO",delivery:"NOT_SENT",requiresDedicatedVerifiedQARoute:true,entries};
}
function reviewCommand(data,row,principal,config){
 scope(row);const r=recipients(config);
 // Principal must come from the server's verified LINE transport, never a client field.
 if(!principal||principal.source!=="VERIFIED_QA_LINE_EVENT"||principal.sub!==r.reviewer||
    principal.company!=="TEST_CO")throw Error("QA_REVIEWER_REQUIRED");
 if(typeof data!=="string"||data.length>400)throw Error("QA_CALLBACK_INVALID");
 const parts=data.split("&"),values={};
 for(const part of parts){
  const pair=part.split("=");
  if(pair.length!==2||!["qa","decision","kind","requestId"].includes(pair[0])||
     Object.hasOwn(values,pair[0]))throw Error("QA_CALLBACK_INVALID");
  try{values[pair[0]]=decodeURIComponent(pair[1]);}catch(_){throw Error("QA_CALLBACK_INVALID");}
 }
 if(Object.keys(values).length!==4||values.qa!=="v2"||values.kind!==row.kind||
    values.requestId!==row.requestId||!["APPROVE","REJECT"].includes(values.decision))
  throw Error("QA_CALLBACK_INVALID");
 return {operation:"HR_REVIEW",args:{requestId:row.requestId,decision:values.decision}};
}
return {plan,reviewCommand};

})();
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

