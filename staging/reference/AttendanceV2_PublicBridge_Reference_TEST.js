/**

 * Reference excerpt copied from previously published DATA_TEST_ONLY GitHub staging source.

 * NOT THE USER'S CURRENT APPS SCRIPT DEPLOYMENT. NEVER INSTALL THIS FILE.

 * Source: line-punch/line-punch/staging/AttendanceV2_SandboxDataService.gs

 * Branch: feature/v2-gps-boundary-regression-20261022

 * Original SHA: 784b1ad143f38f9622f8b6a086d7b8a00b3d9247

 * For local mock tests only. No secrets or real LINE tokens.

 */

const V2D_CHANNEL = '2012136707';
const V2D_REPLY_ORIGIN = 'https://line-punch.github.io';
const V2D_SHEET_NAME = 'YC_ATTENDANCE_V2_TEST_ONLY';
const V2D_EMPLOYEE_ID = 'TEST001';
const V2D_LOCATION_CODE = 'TESTSITE';
const V2D_INVITE_TTL_MS = 30 * 60 * 1000;


function v2dProperties_() {
  return PropertiesService.getScriptProperties();
}
function v2dTestSheet_() {
  const p=v2dProperties_();
  if(p.getProperty('ATTENDANCE_V2_DATA_TEST')!=='enabled' ||
     p.getProperty('LINE_LOGIN_CHANNEL_ID')!==V2D_CHANNEL) {
    throw Error('隔離測試服務尚未啟用或設定錯誤');
  }
  const id=String(p.getProperty('ATTENDANCE_V2_TEST_SHEET_ID')||'').trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw Error('測試試算表設定錯誤');
  const sheet=SpreadsheetApp.openById(id);
  if(!sheet || sheet.getId()!==id || sheet.getName()!==V2D_SHEET_NAME)
    throw Error('只允許指定的隔離測試資料庫');
  const employees=sheet.getSheetByName('員工資料');
  const locations=sheet.getSheetByName('上班地點');
  const clocks=sheet.getSheetByName('打卡紀錄');
  if(!employees || !locations || !clocks ||
     employees.getLastRow()!==2 ||
     String(employees.getRange(2,1).getValue())!==V2D_EMPLOYEE_ID ||
     String(employees.getRange(2,8).getValue())!==V2D_LOCATION_CODE)
    throw Error('測試資料結構不符合預期，已停止操作');
  return sheet;
}
function v2dLineClaims_(tokenInput) {
  const token=String(tokenInput||'');
  if(token.length<30 || token.length>8192 || token.split('.').length!==3)
    throw Error('LINE 登入資訊無效');
  const response=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'post', contentType:'application/x-www-form-urlencoded',
    payload:{id_token:token,client_id:V2D_CHANNEL},muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw Error('LINE 登入驗證失敗');
  let claims;
  try{claims=JSON.parse(response.getContentText())}
  catch(_){throw Error('LINE 驗證回應錯誤')}
  const now=Math.floor(Date.now()/1000);
  if(!claims || claims.iss!=='https://access.line.me' ||
     String(claims.aud)!==V2D_CHANNEL ||
     !/^U[0-9a-f]{32}$/i.test(String(claims.sub||'')) ||
     !Number.isFinite(Number(claims.exp)) || Number(claims.exp)<=now ||
     !Number.isFinite(Number(claims.iat)) || Number(claims.iat)>now+300)
    throw Error('LINE 驗證內容不符合規則');
  return String(claims.sub);
}
function v2dEmployee_(ss,lineUserId) {
  const sh=ss.getSheetByName('員工資料');
  const row=sh.getRange(2,1,1,8).getValues()[0];
  const linked=String(row[3]||'').trim();
  if(linked && linked!==lineUserId)
    return {bound:false,employeeRow:row};
  if(!linked)return {bound:false,employeeRow:row};
  if(String(row[6]||'').trim()!=='在職')
    throw Error('測試員工帳號已停用');
  return {bound:true,employeeRow:row,employeeId:V2D_EMPLOYEE_ID,
    name:String(row[1]||'模擬員工甲')};
}


function v2dDispatch_(params) {
  const ss=v2dTestSheet_();
  if(!params || typeof params!=='object')throw Error('無效請求');
  const nonce=String(params.nonce||'');
  if(!/^[0-9a-f]{40}$/.test(nonce))throw Error('無效請求識別碼');
  const operation=String(params.operation||'');
  if(!['whoami','bind','clock','clockStatus','todayAttendance'].includes(operation))
    throw Error('未提供此測試功能');
  const raw=String(params.payload||'');
  if(raw.length<30||raw.length>12000)throw Error('請求內容長度不正確');
  let data;
  try{data=JSON.parse(raw)}catch(_){throw Error('請求 JSON 格式錯誤')}
  if(!data||Array.isArray(data)||typeof data!=='object'||
    typeof data.idToken!=='string')throw Error('缺少 LINE 登入資料');
  // Authentication always occurs before dispatch.
  const lineUserId=v2dLineClaims_(data.idToken);
  if(operation==='whoami')return {nonce,result:v2dWhoami_(ss,lineUserId)};
  if(operation==='todayAttendance')return {nonce,result:v2dTodayAttendance_(ss,lineUserId)};
  if(operation==='bind')return {nonce,result:v2dBind_(ss,lineUserId,data)};
  if(operation==='clock')return {nonce,result:v2dClock_(ss,lineUserId,data,false)};
  return {nonce,result:v2dClock_(ss,lineUserId,data,true)};
}
function v2dResponse_(data) {
  // No LINE tokens, user IDs or stack traces ever echoed to caller.
  const js=JSON.stringify(data).replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>window.top.postMessage('+js+','+
    JSON.stringify(V2D_REPLY_ORIGIN)+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function v2dPublicFailure_(error) {
  // Only these deliberately known, pre-write validation failures may be
  // described as definitive. Any unexpected error remains UNKNOWN so the
  // operator can check the original request status, not blindly retry.
  const msg=String(error && error.message || '');
  const reasons={
    '邀請碼格式不正確':'BIND_FORMAT',
    '邀請碼不存在或已過期':'BIND_EXPIRED',
    '邀請碼不正確':'BIND_INVALID',
    '模擬員工已綁定其他測試帳號':'BIND_TAKEN',
    '模擬員工帳號不在職':'INACTIVE',
    'LINE 尚未綁定模擬員工':'NOT_BOUND',
    '尚未取得 GPS 定位':'GPS_MISSING',
    'GPS 座標無效':'GPS_INVALID',
    '定位精度不足，請重新定位':'GPS_ACCURACY',
    'GPS 定位已過期，請重新取得位置':'GPS_STALE',
    '測試場地尚未完成 GPS 設定':'SITE_NOT_READY',
    '超出測試打卡允許範圍':'OUT_OF_RANGE',
    '打卡類型錯誤':'TYPE_INVALID',
    '打卡請求編號無效':'REQUEST_ID_INVALID',
    '打卡請求編號類型不符':'REQUEST_ID_CONFLICT'
  };
  if(Object.prototype.hasOwnProperty.call(reasons,msg))
    return {code:reasons[msg],error:msg,persisted:false};
  if(/LINE 登入/.test(msg)||/LINE 驗證/.test(msg))
    return {code:'AUTH',error:'LINE 登入驗證失敗，請重新開啟測試入口',
      persisted:false};
  return {code:'UNKNOWN',error:'測試結果尚未確認，請查詢原請求或聯絡管理員'};
}
function doPost(e) {
  const params=(e&&e.parameter)||{},nonce=String(params.nonce||'');
  let reply;
  try{
    const data=v2dDispatch_(params);
    reply={bridge:'YC_V2_STAGING_FORM_V1',nonce:data.nonce,ok:true,
      result:data.result};
  }catch(error){
    reply={bridge:'YC_V2_STAGING_FORM_V1',nonce,ok:false,
      ...v2dPublicFailure_(error)};
  }
  return v2dResponse_(reply);
}
