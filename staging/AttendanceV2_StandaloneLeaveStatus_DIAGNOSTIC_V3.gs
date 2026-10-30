/**
 * LINE V2 / TEST001 — STANDALONE LEAVE-STATUS-ONLY DIAGNOSTIC V3 CANDIDATE.
 * NOT DEPLOYED. Logs only safe stage labels on every POST, never real values.
 * Do NOT paste into production "打卡系統" or existing
 * YC_ATTENDANCE_V2_DATA_TEST_ONLY. Intended for a NEW standalone Apps Script
 * project only, with no employee write / invitation / payroll functions.
 *
 * The test Spreadsheet is selected ONLY from server-side Script Properties:
 *   V2HR_READONLY_TEST_ENABLED = enabled
 *   V2HR_TEST_SHEET_ID = [exact existing TEST001 isolated Sheet ID]
 *   LINE_LOGIN_CHANNEL_ID = 2012136707
 *
 * Public web-app execution (if approved later): run as deployment owner;
 * access "Anyone" only if full security tests pass. Every request verifies
 * LINE ID token against LINE, then TEST001 bound identity against Sheet.
 * The enabled flag defaults to OFF. Never upload IDs, tokens or credentials
 * to GitHub. The Google Sheet ID must not be in a client request.
 *
 * Only ONE operation: leaveStatus on the fixed SYNTHETIC request.
 * No writes, no push, no Clock / leave submission, no approve/reject.
 */
var V2HR_STANDALONE_CHANNEL="2012136707";
var V2HR_STANDALONE_SHEET="YC_ATTENDANCE_V2_TEST_ONLY";
var V2HR_STANDALONE_TITLE="V2請假寫入測試";
var V2HR_STANDALONE_REQUEST="LEAVEV2_TEST_20261110_0001";
var V2HR_STANDALONE_REPLY_ORIGIN="https://line-punch.github.io";
var V2HR_STANDALONE_HEADERS=[
  "申請單號","員工ID","姓名","假別","開始日期","結束日期",
  "天數/時數","原因","狀態","申請時間","審核人","審核時間"
];
var V2HR_STANDALONE_ROW=[
  V2HR_STANDALONE_REQUEST,"TEST001","模擬員工甲","事假",
  "2026-11-10","2026-11-10","1天","純測試：正常上班日事假",
  "待審核（測試）","SYNTHETIC_TEST_ONLY","",""
];

function v2hrOnlyProps_(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty("V2HR_READONLY_TEST_ENABLED")!=="enabled"||
     props.getProperty("LINE_LOGIN_CHANNEL_ID")!==V2HR_STANDALONE_CHANNEL)
    throw Error("TEST001 唯讀測試尚未啟用");
  return props;
}
function v2hrOnlyParse_(params) {
  if(!params||typeof params!=="object"||Array.isArray(params))
    throw Error("無效的測試請求");
  var nonce=String(params.nonce||"");
  if(!/^[0-9a-f]{40}$/.test(nonce))throw Error("無效的測試回覆編號");
  if(params.operation!=="leaveStatus")throw Error("非本測試查詢操作");
  var raw=params.payload;
  if(typeof raw!=="string"||raw.length<30||raw.length>12000)
    throw Error("無效的查詢資料長度");
  var body;
  try{body=JSON.parse(raw);}catch(_){throw Error("查詢 JSON 錯誤");}
  if(!body||typeof body!=="object"||Array.isArray(body))
    throw Error("無效的查詢 JSON");
  var keys=Object.keys(body);
  if(keys.length!==2||keys.indexOf("requestId")<0||keys.indexOf("idToken")<0)
    throw Error("查詢包含未授權欄位");
  if(body.requestId!==V2HR_STANDALONE_REQUEST)
    throw Error("非指定模擬請假單號");
  if(typeof body.idToken!=="string"||
     body.idToken.length<30||body.idToken.length>8192||
     body.idToken.split(".").length!==3)
    throw Error("LINE 登入資訊無效");
  return {nonce:nonce,token:body.idToken};
}
function v2hrOnlyClaims_(token) {
  var response=UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify",{
    method:"post",contentType:"application/x-www-form-urlencoded",
    payload:{id_token:token,client_id:V2HR_STANDALONE_CHANNEL},
    muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw Error("LINE 登入驗證失敗");
  var c;
  try{c=JSON.parse(response.getContentText());}catch(_){
    throw Error("LINE 驗證回應錯誤");
  }
  var now=Math.floor(Date.now()/1000);
  if(!c||c.iss!=="https://access.line.me"||
     String(c.aud)!==V2HR_STANDALONE_CHANNEL||
     !/^U[0-9a-f]{32}$/i.test(String(c.sub||""))||
     !Number.isFinite(Number(c.exp))||Number(c.exp)<=now||
     !Number.isFinite(Number(c.iat))||Number(c.iat)>now+300)
    throw Error("LINE 驗證內容不符合規則");
  return String(c.sub);
}
function v2hrOnlySheet_(props,verifiedLineId){
  var id=String(props.getProperty("V2HR_TEST_SHEET_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id))
    throw Error("TEST001 隔離試算表設定不完整");
  var book=SpreadsheetApp.openById(id);
  if(!book||book.getId()!==id||book.getName()!==V2HR_STANDALONE_SHEET)
    throw Error("禁止連接非指定 TEST001 隔離資料");
  var employees=book.getSheetByName("員工資料");
  if(!employees||employees.getLastRow()!==2)
    throw Error("TEST001 員工資料不符");
  var e=employees.getRange(2,1,1,8).getValues()[0];
  if(String(e[0])!=="TEST001"||String(e[4])!=="TEST_CO"||
     String(e[6])!=="在職"||String(e[7])!=="TESTSITE"||
     String(e[3])!==verifiedLineId)
    throw Error("未完成 TEST001 綁定身分驗證");
  return book;
}
function v2hrOnlyDate_(value){
  return value instanceof Date?
    Utilities.formatDate(value,"Asia/Taipei","yyyy-MM-dd"):
    String(value===null||value===undefined?"":value).trim().replace(/\//g,"-");
}
function v2hrOnlyQuery_(book){
  var sheet=book.getSheetByName(V2HR_STANDALONE_TITLE);
  if(!sheet)return {found:false,status:"NOT_FOUND_YET"};
  if(sheet.getLastRow()>2||sheet.getLastColumn()>12)
    throw Error("TEST001 模擬假單資料超出安全範圍");
  var headers=sheet.getRange(1,1,1,12).getDisplayValues()[0];
  if(headers.some(function(h,i){return h!==V2HR_STANDALONE_HEADERS[i];}))
    throw Error("TEST001 模擬假單欄位不符");
  if(sheet.getLastRow()===1)return {found:false,status:"NOT_FOUND_YET"};
  if(sheet.getLastRow()!==2)throw Error("TEST001 模擬假單筆數異常");
  var row=sheet.getRange(2,1,1,12).getValues()[0];
  for(var i=0;i<12;i++){
    var val=(i===4||i===5)?v2hrOnlyDate_(row[i]):
      String(row[i]===null||row[i]===undefined?"":row[i]);
    if(val!==V2HR_STANDALONE_ROW[i])
      throw Error("TEST001 模擬假單內容與預期不符");
  }
  return {found:true,status:"PENDING_REVIEW_TEST"};
}
/**
 * Diagnostic V3: fixed allowlisted stage labels only. Never log tokens,
 * users, sheet IDs, URLs, raw errors, or row values.
 * Preserve the same public response contract as V2.
 */
function v2hrOnlyStep_(code,callback){
  try{return callback();}
  catch(error){
    if(error&&typeof error==="object")error.v2hrStep=code;
    throw error;
  }
}
function v2hrOnlyLog_(error){
  var stage=error&&error.v2hrStep||"UNCLASSIFIED";
  var detail="";
  // More specific internal reason, but never a user ID / raw error string.
  var msg=String(error&&error.message||"");
  if(stage==="IDENTITY"&&msg==="未完成 TEST001 綁定身分驗證")
    detail="_BOUND_ACCOUNT_DENIED";
  else if(stage==="IDENTITY"&&msg==="TEST001 員工資料不符")
    detail="_TEST_EMPLOYEE_SHAPE";
  else if(stage==="IDENTITY"&&msg==="禁止連接非指定 TEST001 隔離資料")
    detail="_SHEET_WRONG_NAME";
  else if(stage==="IDENTITY"&&msg==="TEST001 隔離試算表設定不完整")
    detail="_SHEET_CONFIG_INVALID";
  var known=["INPUT","SETTINGS","LINE_VERIFY","IDENTITY","MOCK_LEAVE","UNCLASSIFIED"];
  if(known.indexOf(stage)<0)stage="UNCLASSIFIED";
  Logger.log("V2HR_DIAGNOSTIC="+stage+detail);
}
function v2hrOnlyDispatch_(params){
  var input=v2hrOnlyStep_("INPUT",function(){return v2hrOnlyParse_(params);});
  var props=v2hrOnlyStep_("SETTINGS",function(){return v2hrOnlyProps_();});
  var sub=v2hrOnlyStep_("LINE_VERIFY",function(){return v2hrOnlyClaims_(input.token);});
  var book=v2hrOnlyStep_("IDENTITY",function(){return v2hrOnlySheet_(props,sub);});
  var r=v2hrOnlyStep_("MOCK_LEAVE",function(){return v2hrOnlyQuery_(book);});
  Logger.log("V2HR_DIAGNOSTIC="+(r.found?"MOCK_FOUND":"MOCK_NOT_FOUND"));
  return {
    nonce:input.nonce,
    result:{
      ok:true,synthetic:true,readOnly:true,
      requestId:V2HR_STANDALONE_REQUEST,
      found:r.found,status:r.status
    }
  };
}
function v2hrOnlyPublicError_(error){
  // Never reveal Sheet ID, token, LINE ID, detailed exception or stack.
  var message=String(error&&error.message||"");
  if(/LINE 登入|LINE 驗證/.test(message))
    return {code:"AUTH",error:"LINE 測試身分無法確認",persisted:false};
  return {code:"UNKNOWN",
    error:"模擬假單查詢結果未確認，請保留原單號稍後查詢"};
}
function v2hrOnlyFrameReply_(data){
  var js=JSON.stringify(data).replace(/</g,"\\u003c")
    .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
  var html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>window.top.postMessage('+js+','+
    JSON.stringify(V2HR_STANDALONE_REPLY_ORIGIN)+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** The ONLY public web-app handler. */
function doPost(e){
  var params=e&&e.parameter||{},nonce=String(params.nonce||"");
  var reply;
  try{
    var data=v2hrOnlyDispatch_(params);
    reply={bridge:"YC_V2_STAGING_FORM_V1",nonce:data.nonce,
      ok:true,result:data.result};
  }catch(err){
    // Safe internal stage-only audit; the public reply stays identical to V2.
    v2hrOnlyLog_(err);
    reply={bridge:"YC_V2_STAGING_FORM_V1",nonce:nonce,ok:false};
    var publicError=v2hrOnlyPublicError_(err);
    reply.code=publicError.code;reply.error=publicError.error;
    reply.persisted=publicError.persisted===false?false:null;
  }
  return v2hrOnlyFrameReply_(reply);
}
function doGet(){
  return ContentService.createTextOutput(
    "TEST001 模擬假單唯讀查詢服務；沒有網頁操作入口。")
    .setMimeType(ContentService.MimeType.TEXT);
}
