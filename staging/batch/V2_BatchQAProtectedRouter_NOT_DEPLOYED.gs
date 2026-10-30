/**
 * LINE attendance V2 BATCH — TEST001 QA protected operation router.
 *
 * NOT DEPLOYED. THERE IS NO PUBLIC doPost/doGet.
 * This is an async implementation candidate, not a Web App entrypoint:
 * Google's Web App handlers must return HtmlOutput/TextOutput directly;
 * async Promise-to-HtmlOutput delivery needs independent runtime testing.
 *
 * Dependencies in the same future stand-alone QA GAS project:
 *   V2BatchWorkflowCore, V2BatchAppendJournal
 *   v2BatchGASTestPort_(), v2BatchCalendarQA_()
 *
 * NEVER install in formal "打卡系統" or the GPS v2 or V4 projects.
 * QA properties all server-side:
 * V2_BATCH_QA_ENABLED = disabled|enabled
 * V2_BATCH_QA_WRITE_ENABLED = disabled|enabled
 * V2_BATCH_QA_SOURCE_BOOK_ID = isolated TEST001 Sheet ID
 * V2_BATCH_QA_BOOK_ID = separate technical QA-only workbook ID
 * LINE_LOGIN_CHANNEL_ID = 2012136707
 * V2_BATCH_QA_HR_LINE_SUB = private TEST-only verified owner LINE sub
 *
 * HR's LINE sub must differ from the TEST001 employee binding. No real
 * employee account or official HR roster is read/modified by this router.
 */
var V2_BATCH_QA_CHANNEL_="2012136707";
var V2_BATCH_QA_OPS_=[
 "LEAVE_PREVIEW","LEAVE_REQUEST","LEAVE_STATUS","MY_LEAVES",
 "MISSING_REQUEST","MISSING_STATUS","HR_PENDING","HR_REVIEW"
];
var V2_BATCH_QA_WRITES_=["LEAVE_REQUEST","MISSING_REQUEST","HR_REVIEW"];
function v2BatchQASettings_(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_BATCH_QA_ENABLED")!=="enabled"||
    p.getProperty("LINE_LOGIN_CHANNEL_ID")!==V2_BATCH_QA_CHANNEL_)
  throw Error("QA_DISABLED");
 var sourceId=String(p.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID")||"").trim();
 var ledgerId=String(p.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
 if(!/^[A-Za-z0-9_-]{20,}$/.test(sourceId)||
    !/^[A-Za-z0-9_-]{20,}$/.test(ledgerId)||
    ledgerId===sourceId)throw Error("QA_SCOPE_UNVERIFIED");
 var owner=String(p.getProperty("V2_BATCH_QA_HR_LINE_SUB")||"").trim();
 if(owner&&!/^U[0-9a-f]{32}$/i.test(owner))throw Error("QA_OWNER_CONFIG_INVALID");
 return {sourceId:sourceId,ledgerId:ledgerId,
  writeEnabled:p.getProperty("V2_BATCH_QA_WRITE_ENABLED")==="enabled",
  owner:owner};
}
function v2BatchQAParse_(params){
 if(!params||typeof params!=="object"||Array.isArray(params)||
    Object.keys(params).some(function(k){
      return ["nonce","operation","payload"].indexOf(k)<0;
    }))throw Error("QA_INPUT_INVALID");
 var nonce=String(params.nonce||"");
 var op=String(params.operation||"");
 if(!/^[0-9a-f]{40}$/.test(nonce)||V2_BATCH_QA_OPS_.indexOf(op)<0)
  throw Error("QA_INPUT_INVALID");
 if(typeof params.payload!=="string"||params.payload.length>12000||
    params.payload.length<35)throw Error("QA_PAYLOAD_INVALID");
 var input;
 try{input=JSON.parse(params.payload)}catch(_){throw Error("QA_PAYLOAD_INVALID")}
 if(!input||Array.isArray(input)||typeof input!=="object"||
    Object.keys(input).length!==2||
    !Object.prototype.hasOwnProperty.call(input,"idToken")||
    !Object.prototype.hasOwnProperty.call(input,"args"))
  throw Error("QA_PAYLOAD_INVALID");
 if(typeof input.idToken!=="string"||input.idToken.length<30||
    input.idToken.length>8192||input.idToken.split(".").length!==3||
    !input.args||typeof input.args!=="object"||Array.isArray(input.args)||
    JSON.stringify(input.args).length>3500)
  throw Error("QA_PAYLOAD_INVALID");
 return {nonce:nonce,operation:op,token:input.idToken,args:input.args};
}
function v2BatchQALineClaims_(token){
 var response=UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify",{
  method:"post",contentType:"application/x-www-form-urlencoded",
  payload:{id_token:token,client_id:V2_BATCH_QA_CHANNEL_},
  muteHttpExceptions:true
 });
 if(response.getResponseCode()!==200)throw Error("QA_LINE_AUTH_FAILED");
 var claims;
 try{claims=JSON.parse(response.getContentText())}
 catch(_){throw Error("QA_LINE_AUTH_FAILED")}
 var now=Math.floor(Date.now()/1000);
 if(!claims||claims.iss!=="https://access.line.me"||
    String(claims.aud)!==V2_BATCH_QA_CHANNEL_||
    !/^U[0-9a-f]{32}$/i.test(String(claims.sub||""))||
    !Number.isFinite(Number(claims.exp))||Number(claims.exp)<=now||
    !Number.isFinite(Number(claims.iat))||Number(claims.iat)>now+300)
  throw Error("QA_LINE_AUTH_FAILED");
 return String(claims.sub);
}
function v2BatchQAIdentity_(settings){
 return {verify:async function(token){
  var sub=v2BatchQALineClaims_(token);
  var book=SpreadsheetApp.openById(settings.sourceId);
  if(!book||book.getId()!==settings.sourceId||
     book.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")
    throw Error("QA_ROSTER_WRONG_BOOK");
  var staff=book.getSheetByName("員工資料");
  if(!staff||staff.getLastRow()!==2)throw Error("QA_ROSTER_INVALID");
  var row=staff.getRange(2,1,1,8).getValues()[0];
  if(String(row[0])!=="TEST001"||String(row[4])!=="TEST_CO"||
     String(row[6])!=="在職"||String(row[7])!=="TESTSITE"||
     !/^U[0-9a-f]{32}$/i.test(String(row[3]||"")))
    throw Error("QA_ROSTER_INVALID");
  // Never give the test employee account HR rights by accidental overlap.
  if(settings.owner&&String(row[3])===settings.owner)
    throw Error("QA_ROLE_OVERLAP");
  if(sub===String(row[3]))
   return {source:"VERIFIED_SERVER_BINDING",active:true,
     employeeId:"TEST001",company:"TEST_CO",role:"STAFF"};
  if(settings.owner&&sub===settings.owner)
   return {source:"VERIFIED_SERVER_BINDING",active:true,
     employeeId:"QA_HR_TEST",company:"TEST_CO",role:"HR_OWNER"};
  throw Error("QA_LINE_BINDING_MISSING");
 }};
}
/**
 * This method returns a Promise for tests/QA editor use ONLY.
 * Do not publish it as a public Web App handler until a separate, tested
 * synchronous HtmlOutput bridge is available. The async runtime is not a
 * guarantee that an Apps Script doPost will await a Promise.
 */
async function v2BatchQAHandleCandidate_(params){
 var nonce=String(params&&params.nonce||"");
 try{
  if(typeof V2BatchWorkflowCore==="undefined"||
     typeof V2BatchAppendJournal==="undefined"||
     typeof v2BatchGASTestPort_!=="function"||
     typeof v2BatchCalendarQA_!=="function")
    throw Error("QA_DEPENDENCIES_MISSING");
  var config=v2BatchQASettings_();
  var request=v2BatchQAParse_(params);
  var flags={};
  V2_BATCH_QA_OPS_.forEach(function(op){
    flags[op]=V2_BATCH_QA_WRITES_.indexOf(op)<0||config.writeEnabled;
  });
  // Lazily open durable QA workbook only after LINE identity checks in Core;
  // the port also independently checks the test-only feature flag and book.
  var ledger={
    read:function(callback){
      return V2BatchAppendJournal.make(v2BatchGASTestPort_()).read(callback);
    },
    transaction:function(callback){
      return V2BatchAppendJournal.make(v2BatchGASTestPort_()).transaction(callback);
    }
  };
  var calendar=v2BatchCalendarQA_(); // isolated source, read only
  var service=V2BatchWorkflowCore.create({
    identity:v2BatchQAIdentity_(config),
    store:ledger,calendar:calendar,
    clock:{today:function(){
      return Utilities.formatDate(new Date(),"Asia/Taipei","yyyy-MM-dd");
    }},
    flags:flags
  });
  var result=await service.handle({
    operation:request.operation,payload:request.args,credential:request.token
  });
  if(result&&result.ok===true)
    return {bridge:"YC_V2_BATCH_QA_V1",nonce:request.nonce,
      ok:true,result:result};
  return {bridge:"YC_V2_BATCH_QA_V1",nonce:request.nonce,
    ok:false,code:result&&result.code==="AUTH_REQUIRED"?"AUTH":
      result&&result.code==="FEATURE_DISABLED"?"DISABLED":"REJECTED",
    persisted:false};
 }catch(_){
  // In particular, the write may already have committed before an exception.
  // Public callers must always check original requestId; never claim false.
  return {bridge:"YC_V2_BATCH_QA_V1",nonce:/^[0-9a-f]{40}$/.test(nonce)?nonce:"",
    ok:false,code:"UNKNOWN",persisted:null};
 }
}
