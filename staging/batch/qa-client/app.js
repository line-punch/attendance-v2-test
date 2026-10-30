"use strict";
/* TEST001 QA ONLY. NOT DEPLOYED. No production URLs or passwords embedded. */
(function(){
const LIFF_ID=String(window.V2_QA_LIFF_ID||"");
const BRIDGE="YC_V2_BATCH_QA_V1";
const $=id=>document.getElementById(id);
if(window.V2_QA_ENDPOINT){$("endpoint").value=window.V2_QA_ENDPOINT;$("endpoint").readOnly=true;}
let loggedIn=false,busy=false,uiBusy=false,pendingWrite=null;
const writeButtons=new Set(["clockIn","clockOut","submitLeave","submitMissing","hrApprove","hrReject","newId"]);
function onAction(id,handler){
 const button=$(id);
 button.addEventListener("click",async()=>{
  if(uiBusy||busy)return;
  const label=button.textContent;
  const buttons=Array.from(document.querySelectorAll("button"));
  const previous=buttons.map(b=>b.disabled);
  uiBusy=true;
  buttons.forEach(b=>{b.disabled=true;});
  button.textContent="處理中…";
  button.setAttribute("aria-busy","true");button.setAttribute("data-state","busy");
  const progress="正在處理「"+label+"」，請稍候…";
  status(progress,"busy");
  try{await handler();if($("feedback").textContent===progress)
   status(unknownWrite?"仍有待核對的原申請，請先回查。":"已完成："+label,unknownWrite?"unknown":"success");}
  catch(e){status("⚠️ "+String(e&&e.message||e),"error");}
  finally{
   uiBusy=false;button.textContent=label;
   button.setAttribute("aria-busy","false");button.setAttribute("data-state","idle");
   buttons.forEach((b,i)=>{b.disabled=(!writeButtons.has(b.id)&&previous[i])||!!(b.dataset&&b.dataset.unavailable==="true")||
    (unknownWrite&&writeButtons.has(b.id));});
  }
 });
}
try{
 const saved=sessionStorage.getItem("v2_batch_qa_pending_write");
 if(saved)pendingWrite=JSON.parse(saved);
}catch(_){pendingWrite={operation:"UNKNOWN",requestId:""};}
let unknownWrite=!!pendingWrite;
let clockType=pendingWrite&&pendingWrite.type||"上班";
const pages=["Clock","Leave","Missing","Hr"];
for(const page of pages){
 onAction("nav"+page,()=>{
  for(const name of pages){
   $("page"+name).hidden=name!==page;
   $("nav"+name).setAttribute("aria-pressed",String(name===page));
  }
 });
}
function status(t,phase="info"){
 $("result").textContent=t;
 $("feedback").textContent=String(t).split("\n")[0];
 $("feedback").setAttribute("data-phase",phase);
}
function rememberWrite(value){
 // Persist BEFORE transmission; a reload must not permit a second write.
 sessionStorage.setItem("v2_batch_qa_pending_write",JSON.stringify(value));
 pendingWrite=value;unknownWrite=!!value;
}
function safeReadId(){
 try{return sessionStorage.getItem("v2_batch_qa_request_id")||""}
 catch(_){return "";}
}
function preserveId(value){
 try{sessionStorage.setItem("v2_batch_qa_request_id",value)}catch(_){}
}
$("requestId").value=safeReadId();
const today=localToday();
for(const field of ["start","end","missingDate"])$(field).value=today;
$("month").value=today.slice(0,7);
if(pendingWrite){
 if(pendingWrite.operation==="HR_REVIEW")
  $("hrRequestId").value=pendingWrite.requestId||"";
 else $("requestId").value=pendingWrite.requestId||$("requestId").value;
 status("上次寫入尚未核對，請保留原編號並先回查："+(pendingWrite.requestId||"需管理者核對"),"unknown");
}
function freshHex(byteCount){
 if(!window.crypto||typeof window.crypto.getRandomValues!=="function")
  throw Error("此裝置無法產生安全申請編號");
 return Array.from(window.crypto.getRandomValues(new Uint8Array(byteCount)),
  x=>x.toString(16).padStart(2,"0")).join("");
}
function validatedEndpoint(raw){
 let u;
 try{u=new URL(String(raw||"").trim())}catch(_){throw Error("請填寫獨立 QA 的 /exec 網址")}
 if(u.protocol!=="https:"||u.hostname!=="script.google.com"||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(u.pathname)||
    u.search||u.hash||u.username||u.password)
  throw Error("不可使用非 Apps Script /exec 的網址");
 if(window.V2_QA_ENDPOINT&&u.href!==window.V2_QA_ENDPOINT)
  throw Error("只能連線到已核對的獨立 QA 後端");
 return u.href;
}
function googleOrigin(input){
 try{
  const u=new URL(input);
  return u.protocol==="https:"&&
   (u.hostname==="script.google.com"||
    u.hostname==="script.googleusercontent.com"||
    u.hostname.endsWith(".googleusercontent.com"));
 }catch(_){return false}
}
function verifiedToken(){
 if(typeof liff==="undefined"||!loggedIn||!liff.isLoggedIn())
  throw Error("LINE 尚未登入，不可呼叫 QA 後端");
 const token=liff.getIDToken();
 if(!token)throw Error("無法取得 LINE 測試 ID Token");
 return token;
}
function requestId(){
 const value=$("requestId").value.trim();
 if(!/^[A-Za-z0-9_-]{12,80}$/.test(value))
  throw Error("請先產生有效的測試申請編號");
 preserveId(value);return value;
}
function requestBody(operation){
 if(["LEAVE_PREVIEW","LEAVE_REQUEST"].includes(operation))
  return {requestId:requestId(),leaveType:$("leaveType").value,
   startDate:$("start").value,endDate:$("end").value,
   unit:$("unit").value,fromTime:$("fromTime").value,
   toTime:$("toTime").value,reason:$("reason").value};
 if(operation==="MISSING_REQUEST")
  return {requestId:requestId(),date:$("missingDate").value,
   time:$("missingTime").value,type:$("missingType").value,
   reason:$("missingReason").value};
 if(operation==="LEAVE_STATUS"||operation==="MISSING_STATUS")
  return {requestId:requestId()};
 if(operation==="MY_LEAVES")return {month:$("month").value};
 if(operation==="MY_MISSING")return {month:localToday().slice(0,7)};
 if(operation==="MY_CLOCKS")return {};
 if(operation==="GPS_STATUS")return {requestId:requestId(),type:clockType};
 if(operation==="HR_PENDING")return {};
 if(operation==="HR_REVIEW"||operation==="HR_STATUS"){
  const id=$("hrRequestId").value.trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))
   throw Error("人資請填入原申請編號");
  return operation==="HR_STATUS"?{requestId:id}:{requestId:id,decision:this.decision};
 }
 throw Error("不支援的操作");
}
function localToday(){
 return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei"}).format(new Date());
}
function obtainGPS(){
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error("此裝置不支援定位"));return;}
  navigator.geolocation.getCurrentPosition(loc=>resolve({lat:loc.coords.latitude,
   lng:loc.coords.longitude,accuracy:loc.coords.accuracy,capturedAt:Date.now()}),
   ()=>reject(Error("無法取得定位，尚未送出打卡；請檢查 LINE 定位權限與訊號。")),
   {enableHighAccuracy:true,timeout:15000,maximumAge:0});
 });
}
function renderClocks(result){
 const target=$("clockHistory");target.textContent="";
 if(!result||!/^\d{4}-(0[1-9]|1[0-2])$/.test(result.month)||!Array.isArray(result.days)){
  target.textContent="打卡紀錄回覆格式錯誤，請重新查詢。";return;
 }
 const days=result.days.filter(day=>day&&typeof day.date==="string"&&
  day.date.startsWith(result.month+"-")&&(day.clockIn||day.clockOut))
  .sort((a,b)=>a.date.localeCompare(b.date));
 if(!days.length){
  const tr=document.createElement("tr"),td=document.createElement("td");
  td.setAttribute("colspan","3");td.textContent="本月尚無正常打卡紀錄。";
  tr.appendChild(td);target.appendChild(tr);return;
 }
 for(const day of days){
  const date=day.date;
  const tr=document.createElement("tr");
  for(const value of [date,day.clockIn||"",day.clockOut||""]){
   const td=document.createElement("td");td.textContent=String(value);tr.appendChild(td);
  }
  target.appendChild(tr);
 }
}
function renderHistory(operation,result){
 const target=operation==="MY_MISSING"?$("missingHistory"):$("leaveHistory");
 target.textContent="";
 if(!result||!Array.isArray(result.requests)){
  target.textContent="回覆格式不正確，尚無法顯示紀錄。";return;
 }
 if(!result.requests.length){target.textContent="此月份沒有紀錄。";return;}
 const missing=operation==="MY_MISSING";
 const table=document.createElement("table");
 const head=document.createElement("tr");
 for(const title of missing?["日期","上班／下班","申請時間","狀態"]:
    ["開始日期","結束日期","假別","時段","狀態"]){
  const cell=document.createElement("th");cell.textContent=title;head.appendChild(cell);
 }
 table.appendChild(head);
 const states={PENDING:"待審核",APPROVED:"已核准",REJECTED:"已退回"};
 for(const row of result.requests){
  // A mixed-kind response must never show another workflow in this table.
  if(row.kind!==(missing?"MISSING":"LEAVE"))continue;
  const tr=document.createElement("tr");
  const values=missing?[row.date,row.type,row.time,states[row.status]||row.status]:
   [row.startDate,row.endDate,row.leaveType,row.unit==="HOURS"?
    (row.fromTime||"")+"～"+(row.toTime||""):"全天",states[row.status]||row.status];
  for(const value of values){const td=document.createElement("td");td.textContent=String(value||"");tr.appendChild(td);}
  table.appendChild(tr);
 }
 target.appendChild(table);
}
function post(url,op,idToken,args){
 return new Promise((resolve,reject)=>{
  let n;
  try{n=freshHex(20)}catch(e){reject(e);return}
  const iframe=document.createElement("iframe");
  iframe.name="v2qa_"+n;iframe.style.display="none";
  iframe.setAttribute("aria-hidden","true");
  const form=document.createElement("form");
  form.method="POST";form.action=url;form.target=iframe.name;
  form.acceptCharset="UTF-8";form.style.display="none";
  const params={nonce:n,operation:op,payload:JSON.stringify({idToken,args})};
  for(const [key,value] of Object.entries(params)){
   const field=document.createElement("input");
   field.type="hidden";field.name=key;field.value=value;form.appendChild(field);
  }
  let finished=false,timeout=null;
  const done=(error,data)=>{
   if(finished)return;
   finished=true;clearTimeout(timeout);
   window.removeEventListener("message",receive);
   form.remove();iframe.remove();
   if(error)reject(error);else resolve(data);
  };
  function receive(event){
   if(!googleOrigin(event.origin)||!event.data||typeof event.data!=="object")return;
   const value=event.data;
   if(value.bridge!==BRIDGE||value.nonce!==n)return;
   done(null,value);
  }
  window.addEventListener("message",receive);
  document.body.appendChild(iframe);document.body.appendChild(form);
  timeout=setTimeout(()=>done(Error("45 秒內未收到有效回覆；保留原申請編號")),45000);
  try{form.submit()}catch(e){done(e)}
 });
}
async function execute(op,{write=false,decision=null}={}){
 if(busy)return;
 let writeStarted=false;
 try{
  if(!loggedIn||!liff.isLoggedIn())throw Error("請先登入 TEST001 LINE");
  if(!$("confirmed").checked)throw Error("請確認使用獨立 QA 測試部署");
  if(write&&!$("writeConsent").checked)
   throw Error("請確認 QA 寫入開關及獨立測試資料庫");
  if(write&&unknownWrite)throw Error("前一筆寫入結果不明，先用原單號查詢，不能再送出");
  const endpoint=validatedEndpoint($("endpoint").value);
  const token=verifiedToken();
  let args=op==="HR_REVIEW"?{
   requestId:$("hrRequestId").value.trim(),decision
  }:op==="GPS_CLOCK"?{requestId:requestId(),type:clockType}:requestBody(op);
  if(op==="GPS_CLOCK"){
   busy=true;document.querySelectorAll("button").forEach(b=>{b.disabled=true});
   status("正在取得新的 GPS 定位，尚未送出打卡…","busy");
   args={...args,...await obtainGPS()};
  }
  if(op==="HR_REVIEW"&&!/^[A-Za-z0-9_-]{12,80}$/.test(args.requestId))
   throw Error("缺少人資審核原單號");
  if(write){
   rememberWrite({operation:op,requestId:args.requestId,...(op==="GPS_CLOCK"?{type:args.type}:{})});
   writeStarted=true;
  }
  busy=true;
  document.querySelectorAll("button").forEach(b=>{if(b.id!=="login")b.disabled=true});
  status("操作執行中；請勿重複點擊。\n原申請編號："+(args.requestId||"無"),"busy");
  const response=await post(endpoint,op,token,args);
  if(response.ok!==true){
   if(write&&(response.code==="UNKNOWN"||response.persisted===null))
    unknownWrite=true;
   else if(write&&response.persisted===false)rememberWrite(null);
   const messages={ALREADY_CLOCKED:"今天已有同類型的正常打卡，請查看當月紀錄。",
    OUT_OF_RANGE:"目前定位超出打卡地點 50 公尺範圍，本次未寫入。",
    GPS_ACCURACY:"定位精度不足，本次未寫入，請確認精確位置與定位訊號。",
    GPS_EXPIRED:"定位已過期，本次未寫入，請重新取得定位。",
    GPS_INVALID:"定位資料無效，本次未寫入。",
    NOT_FOUND:"尚未查到原申請，不能因此判定先前寫入失敗；請保留原編號。",
    REQUEST_ID_CONFLICT:"此申請編號與原資料不一致，請保留編號交由管理者核對。",
    NON_WORKDAY_IN_RANGE:"申請範圍包含非工作日，請依工作日分開申請。",
    CALENDAR_OR_EVENT_REVIEW_REQUIRED:"該日期的行事曆或停班事件仍須人資核對，暫不能送件。",
    LEAVE_HOURS_INVALID:"指定時數只能申請單日，且結束時間須晚於開始時間。",
    LEAVE_DATES_INVALID:"請檢查開始與結束日期，結束日期不可早於開始日期。"};
   status("QA 回覆："+String(response.code||"UNKNOWN")+
    "\n"+(response.persisted===null?"結果不明，請保留原編號查詢。":
      messages[response.reason]||(response.code==="DISABLED"?"QA 寫入尚未開放，本次未寫入。":"本次未確認成功。"))+
    "\n原申請編號："+(args.requestId||"無"),response.persisted===null?"unknown":"error");
   return;
  }
  if(op==="MY_LEAVES"||op==="MY_MISSING")renderHistory(op,response.result);
  if(op==="MY_CLOCKS")renderClocks(response.result);
  const found=response.result&&response.result.request;
  if(pendingWrite&&found&&found.requestId===pendingWrite.requestId&&
     ((write&&op===pendingWrite.operation)||
      (op==="LEAVE_STATUS"&&pendingWrite.operation==="LEAVE_REQUEST")||
      (op==="MISSING_STATUS"&&pendingWrite.operation==="MISSING_REQUEST")||
      (op==="GPS_STATUS"&&pendingWrite.operation==="GPS_CLOCK")||
      (op==="HR_STATUS"&&pendingWrite.operation==="HR_REVIEW")))
   rememberWrite(null);
  status("TEST001 QA 已回覆成功（僅獨立技術測試）。\n"+
   JSON.stringify(response.result,null,2),"success");
 }catch(e){
  if(writeStarted)unknownWrite=true;
  status("⚠️ "+String(e&&e.message||e)+
   (writeStarted?"\n寫入結果未確認：保留原單號，先查詢，不要再次送出。":""),writeStarted?"unknown":"error");
 }finally{
  busy=false;
  document.querySelectorAll("button").forEach(b=>{b.disabled=b.dataset&&b.dataset.unavailable==="true"});
 }
}
async function init(){
 try{
  if(!/^2012136707-[A-Za-z0-9]+$/.test(LIFF_ID)||LIFF_ID==="2012136707-2dDU0aSJ")
   throw Error("獨立 QA LIFF 尚未設定；不可使用原 GPS LIFF");
  if(typeof liff==="undefined")throw Error("LINE SDK 尚未載入");
  await liff.init({liffId:LIFF_ID});
  loggedIn=liff.isLoggedIn()&&!!liff.getIDToken();
  $("identity").textContent=loggedIn?"已登入 LINE 測試帳號；仍需伺服器核對 TEST001 綁定":
   "請按登入，完成 LINE 測試登入";
 }catch(e){loggedIn=false;$("identity").textContent=String(e.message||e)}
}
onAction("login",async()=>{
 if(typeof liff!=="undefined"&&!liff.isLoggedIn()){
  status("正在開啟 LINE 登入，請完成登入確認。","busy");liff.login();return;
 }
 await init();
 status(loggedIn?"LINE 登入已確認。":$("identity").textContent,loggedIn?"success":"error");
});
onAction("newId",()=>{
 if(unknownWrite){status("上次寫入結果不明，先用原單號查詢；暫不能換新編號");return}
 try{const id="QA_"+freshHex(16);$("requestId").value=id;preserveId(id);
  status("已建立新測試申請編號："+id+"\n不會自動送出");}
 catch(e){status(e.message)}
});
const binds=[
 ["preview","LEAVE_PREVIEW",false],
 ["leaveStatus","LEAVE_STATUS",false],
 ["submitLeave","LEAVE_REQUEST",true],
 ["submitMissing","MISSING_REQUEST",true],
 ["missingStatus","MISSING_STATUS",false],
 ["myLeaves","MY_LEAVES",false],
 ["myMissing","MY_MISSING",false],
 ["myClocks","MY_CLOCKS",false],
 ["clockStatus","GPS_STATUS",false],
 ["hrPending","HR_PENDING",false],
 ["hrStatus","HR_STATUS",false]
];
for(const [id,op,write] of binds)
 onAction(id,()=>execute(op,{write}));
onAction("hrApprove",()=>execute("HR_REVIEW",{write:true,decision:"APPROVE"}));
onAction("hrReject",()=>execute("HR_REVIEW",{write:true,decision:"REJECT"}));
onAction("currentLeaves",()=>{
 $("month").value=localToday().slice(0,7);return execute("MY_LEAVES");
});
for(const [id,type] of [["clockIn","上班"],["clockOut","下班"]]){
 onAction(id,()=>{
  if(busy||unknownWrite){status("請先核對上一筆操作結果，不要再次送出。");return;}
  try{clockType=type;const id="QA_GPS_"+freshHex(16);$("requestId").value=id;preserveId(id);}
  catch(e){status(e.message);return;}
  return execute("GPS_CLOCK",{write:true});
 });
}
if(unknownWrite)document.querySelectorAll("button").forEach(b=>{if(writeButtons.has(b.id))b.disabled=true;});
init();
})();


