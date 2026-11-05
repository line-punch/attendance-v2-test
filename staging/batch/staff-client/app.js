"use strict";
/* TEST001 QA ONLY. NOT DEPLOYED. No production URLs or passwords embedded. */
(function(){
const LIFF_ID=String(window.V2_QA_LIFF_ID||"");
const BRIDGE="YC_V2_STAFF_V1";
const $=id=>document.getElementById(id);
if(window.V2_QA_ENDPOINT){$("endpoint").value=window.V2_QA_ENDPOINT;$("endpoint").readOnly=true;}
let loggedIn=false,busy=false,uiBusy=false,pendingWrite=null,draftOperation=null;
let reviewEntry=null,reviewLoaded=false,reviewLinkInvalid=false;
function renderStaffQueue(result){const box=$("staffPending");box.replaceChildren();const rows=result&&Array.isArray(result.pending)?result.pending:[];if(!rows.length){box.textContent="目前沒有待審核申請。";return;}for(const r of rows){const item=document.createElement("p"),button=document.createElement("button");item.textContent=r.employeeId+"｜"+(r.kind==="LEAVE"?"請假 "+r.startDate+"～"+r.endDate:"補打卡 "+r.date+" "+r.type+" "+r.time);button.type="button";button.textContent="查看這張申請";button.addEventListener("click",async()=>{if(busy||unknownWrite)return;reviewEntry={requestId:r.requestId,decision:"REVIEW"};reviewLoaded=false;$("hrRequestId").value=r.requestId;$("hrRequestId").readOnly=true;await execute("HR_STATUS");});box.append(item,button);}}
function prepareReviewEntry(){
 if(!window.V2QAReviewEntry||!window.location)return;
 try{
  const target=window.V2QAReviewEntry.read(window.location.href);if(!target)return;
  if(pendingWrite&&pendingWrite.operation==="HR_REVIEW"&&pendingWrite.requestId!==target.requestId)
   throw Error("尚有另一筆審核結果待核對，請先查原單，不能切換新審核。");
  reviewEntry=target;$("hrRequestId").value=target.requestId;$("hrRequestId").readOnly=true;
  $("reviewPanel").open=true;
  $("reviewTitle").textContent="主管審核";
  $("myLeaves").hidden=true;$("hrPending").hidden=true;
  $("hrStatus").textContent="查詢這張申請";
  $("hrApprove").textContent="確認核准";$("hrReject").textContent="確認駁回";
  $("identity").textContent=loggedIn?"已登入 LINE；仍需伺服器核對審核權限。":"請先登入 LINE，再查詢這張申請。";
  $("reviewHint").textContent="主管審核｜原單："+target.requestId+"。請先登入並按「查原審核單」，核對資料後再按「"+
   (target.decision==="APPROVE"?"核准":"駁回")+"」。開啟連結不會自動審核。";
 }catch(e){reviewLinkInvalid=true;status(e.message,"error");}
}
async function reviewFromButton(decision){
 if(reviewLinkInvalid){status("審核連結無效，不能送出。","error");return;}
 if(!reviewEntry||!reviewLoaded||$("hrRequestId").value!==reviewEntry.requestId){
  status("請先按「查原審核單」，由伺服器核對審核權限及原單後再處理。","error");return;
 }
 return execute("HR_REVIEW",{write:true,decision});
}
const writeButtons=new Set(["clockIn","clockOut","submitLeave","submitMissing","hrApprove","hrReject","newId","newLeave","newMissing"]);
let confirmedForms={};
try{confirmedForms=JSON.parse(sessionStorage.getItem("yc_staff_v2_confirmed_forms")||"{}")||{};}catch(_){}
const formConfig={LEAVE_REQUEST:["submitLeave","leaveReceipt","leaveFields"],MISSING_REQUEST:["submitMissing","missingReceipt","missingFields"]};
function confirmForm(op,id){
 if(!formConfig[op]||!/^[A-Za-z0-9_-]{12,80}$/.test(String(id||"")))return;
 confirmedForms[op]=id;
 try{sessionStorage.setItem("yc_staff_v2_confirmed_forms",JSON.stringify(confirmedForms));}catch(_){}
 const [button,receipt,fields]=formConfig[op];
 $(fields).hidden=true;
 $(button).setAttribute("data-confirmed","true");
 $(button).setAttribute("data-unavailable","true");$(button).disabled=true;
 $(button).textContent="已送出（請查看紀錄）";
 $(receipt).textContent="這筆申請已送出。編號："+id+"。另填一筆請按「新增申請」。";
}
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
   if(button.getAttribute&&button.getAttribute("data-confirmed")==="true")button.textContent="已送出（請查看紀錄）";
   button.setAttribute("aria-busy","false");button.setAttribute("data-state","idle");
   buttons.forEach((b,i)=>{b.disabled=(!writeButtons.has(b.id)&&previous[i])||!!(b.dataset&&b.dataset.unavailable==="true")||
    (unknownWrite&&writeButtons.has(b.id));});
  }
 });
}
try{
 const saved=sessionStorage.getItem("yc_staff_v2_pending_write");
 if(saved)pendingWrite=JSON.parse(saved);
}catch(_){pendingWrite={operation:"UNKNOWN",requestId:""};}
let unknownWrite=!!pendingWrite;
let clockType=pendingWrite&&pendingWrite.type||"上班";
const pages=["Clock","Leave","Missing","Hr"];
for(const page of pages){
 onAction("nav"+page,async()=>{
  for(const name of pages){
   $("page"+name).hidden=name!==page;
   $("nav"+name).setAttribute("aria-pressed",String(name===page));
  }
  if(page!=="Hr"){
   $("month").value=localToday().slice(0,7);
   $("missingMonth").value=localToday().slice(0,7);
   await (page==="Clock"?refreshStaffClocks():execute({Leave:"MY_LEAVES",Missing:"MY_MISSING"}[page]));
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
 sessionStorage.setItem("yc_staff_v2_pending_write",JSON.stringify(value));
 pendingWrite=value;unknownWrite=!!value;
}
function safeReadId(){
 try{return sessionStorage.getItem("yc_staff_v2_request_id")||""}
 catch(_){return "";}
}
function preserveId(value){
 try{sessionStorage.setItem("yc_staff_v2_request_id",value)}catch(_){}
}
$("requestId").value=safeReadId();
const today=localToday();
for(const field of ["start","end","missingDate"])$(field).value=today;
$("month").value=today.slice(0,7);
$("missingMonth").value=today.slice(0,7);
let submittedMonth=null;
for(const op of Object.keys(formConfig))if(confirmedForms[op])confirmForm(op,confirmedForms[op]);
function updateLeaveUnit(){
 const hours=$("unit").value==="HOURS";
 $("hourFields").hidden=!hours;
 $("fromTime").disabled=!hours;$("toTime").disabled=!hours;
}
$("unit").addEventListener("change",updateLeaveUnit);updateLeaveUnit();
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
 try{u=new URL(String(raw||"").trim())}catch(_){throw Error("請填寫系統的 /exec 網址")}
 if(u.protocol!=="https:"||u.hostname!=="script.google.com"||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(u.pathname)||
    u.search||u.hash||u.username||u.password)
  throw Error("不可使用非 Apps Script /exec 的網址");
 if(window.V2_QA_ENDPOINT&&u.href!==window.V2_QA_ENDPOINT)
  throw Error("只能連線到已核對的員工服務 後端");
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
  throw Error("LINE 尚未登入，不可呼叫 員工服務");
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
 if(operation==="MY_MISSING")return {month:$("missingMonth").value};
 if(operation==="MY_CLOCKS")return {};
 if(operation==="GPS_STATUS")return pendingWrite&&pendingWrite.operation==="GPS_CLOCK"?{requestId:pendingWrite.requestId,type:pendingWrite.type}:{requestId:requestId(),type:clockType};
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
 const titles=missing?["補卡日期","上班／下班","申請時間","送件日期","狀態","申請編號"]:
    ["開始日期","結束日期","假別","時段","送件日期","狀態","申請編號"];
 for(const title of titles){
  const cell=document.createElement("th");cell.textContent=title;head.appendChild(cell);
 }
 table.appendChild(head);
 const states={PENDING:"待審核",APPROVED:"已核准",REJECTED:"已退回"};
 for(const row of result.requests){
  // A mixed-kind response must never show another workflow in this table.
  if(row.kind!==(missing?"MISSING":"LEAVE"))continue;
  const tr=document.createElement("tr");
  const values=missing?[row.date,row.type,row.time,row.submittedAt||"—",row.legacyStatusLabel||states[row.status]||row.status,row.requestId]:
   [row.startDate,row.endDate,row.leaveType,row.legacyUnitLabel?row.legacyUnitLabel:row.unit==="HOURS"?
    (row.fromTime||"")+"～"+(row.toTime||""):"全天",row.submittedAt||"—",states[row.status]||row.status,row.requestId];
  for(const [index,value] of values.entries()){
   const td=document.createElement("td");td.textContent=String(value||"");
   td.setAttribute("data-label",titles[index]);tr.appendChild(td);
  }
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
  const params={nonce:n,operation:op,payload:JSON.stringify({idToken,args}),candidateRoute:"staff-v1"};
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
  if(!loggedIn||!liff.isLoggedIn())throw Error("請先登入 LINE");
  if(!$("confirmed").checked)throw Error("請確認使用員工服務 測試部署");
  if(write&&!$("writeConsent").checked)
   throw Error("請確認 系統寫入狀態");
  if(write&&unknownWrite)throw Error("前一筆寫入結果不明，先用原單號查詢，不能再送出");
  if(write&&formConfig[op]&&confirmedForms[op])
   throw Error("這筆申請已送出，請查看紀錄；另填一筆請按「新增申請」。");
  if(op==="LEAVE_PREVIEW"||formConfig[op]){
   const draft=op==="LEAVE_PREVIEW"?"LEAVE_REQUEST":op;
   if(!$("requestId").value.trim()||Object.values(confirmedForms).includes($("requestId").value.trim())||
      (draftOperation!==draft&&draftOperation!=="MANUAL")){
    const id="V2_"+freshHex(16);$("requestId").value=id;preserveId(id);
   }
   draftOperation=draft;
  }
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
   if(response.code==="AUTH"){
    loggedIn=false;$("identity").textContent="LINE 驗證未通過，請重新登入後再查詢。";
    $("login").textContent="重新登入 LINE";
   }
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
   status((response.code==="AUTH"?"LINE 驗證未通過，請按「重新登入 LINE」。":"系統回覆："+String(response.code||"UNKNOWN"))+
    "\n"+(response.persisted===null?"結果不明，請保留原編號查詢。":
      messages[response.reason]||(response.code==="DISABLED"?"目前尚未開放寫入，本次未寫入。":"本次未確認成功。"))+
    "\n原申請編號："+(args.requestId||"無"),response.persisted===null?"unknown":"error");
   return;
  }
  if(op==="HR_PENDING")renderStaffQueue(response.result);
  if(op==="MY_LEAVES"||op==="MY_MISSING")renderHistory(op,response.result);
  if(op==="MY_CLOCKS")renderClocks(response.result);
  const found=response.result&&response.result.request;
  if(op==="HR_STATUS"&&found&&!reviewEntry)reviewEntry={requestId:found.requestId,decision:"REVIEW"};
  if(op==="HR_STATUS"&&reviewEntry&&found&&found.requestId===reviewEntry.requestId){
   reviewLoaded=found.status==="PENDING"&&!unknownWrite;
   const labels={PENDING:"待審核",APPROVED:"核准",REJECTED:"駁回"};
   const detail=found.kind==="LEAVE"?"請假日期："+found.startDate+"～"+found.endDate+
    "\n假別："+found.leaveType+"\n時段："+(found.legacyUnitLabel||(found.unit==="DAY"?"全天":found.fromTime+"～"+found.toTime)):
    "補卡日期："+found.date+"\n類型："+found.type+"\n申請補登時間："+found.time;
   $("reviewHint").textContent=detail+"\n狀態："+(labels[found.status]||"待核對")+"\n原單："+found.requestId+
    (reviewLoaded?"\n已查得原單，請核對日期與內容後再選核准／駁回。":found.status==="PENDING"?
     "\n上次審核結果仍不明，請保留原單編號交由管理者核對，不要重送。":"\n此單已處理，請查看目前狀態，不要重複審核。");
  }
  if(op==="HR_REVIEW"&&reviewEntry&&found&&found.requestId===reviewEntry.requestId)reviewLoaded=false;
  if(pendingWrite&&found&&found.requestId===pendingWrite.requestId&&
     ((write&&op===pendingWrite.operation)||
      (op==="LEAVE_STATUS"&&pendingWrite.operation==="LEAVE_REQUEST")||
      (op==="MISSING_STATUS"&&pendingWrite.operation==="MISSING_REQUEST")||
      (op==="GPS_STATUS"&&pendingWrite.operation==="GPS_CLOCK")||
      (op==="HR_STATUS"&&pendingWrite.operation==="HR_REVIEW"&&["APPROVED","REJECTED"].includes(found.status))))
  {
   confirmForm(pendingWrite.operation,found.requestId);rememberWrite(null);writeStarted=false;
  }
  const summaries={MY_CLOCKS:"當月正常打卡紀錄已更新。",MY_LEAVES:"當月請假紀錄已更新。",
   MY_MISSING:"當月補打卡紀錄已更新。",LEAVE_REQUEST:"請假申請已送出。",MISSING_REQUEST:"補打卡申請已送出。",
   GPS_CLOCK:"打卡成功。",LEAVE_PREVIEW:"請假日期檢查完成。"};
  if(op==="LEAVE_REQUEST"||op==="MISSING_REQUEST"){
   const request=response.result&&response.result.request;
   if(request&&/^\d{4}-\d{2}-\d{2}$/.test(String(request.startDate||request.date||""))){
    const date=op==="LEAVE_REQUEST"?request.startDate:request.date;
    submittedMonth={operation:op==="LEAVE_REQUEST"?"MY_LEAVES":"MY_MISSING",month:date.slice(0,7)};
    $("viewSubmittedMonth").hidden=false;
    $("viewSubmittedMonth").textContent="查看 "+submittedMonth.month+" 紀錄";
    summaries[op]+="日期："+date+(request.endDate&&request.endDate!==date?"～"+request.endDate:"")+"。可按「查看該月紀錄」。";
   }
  }
  if(op==="MY_LEAVES"||op==="MY_MISSING")summaries[op]=response.result.month+" 紀錄已更新。";
  let success=summaries[op]||"查詢完成。";if(op==="GPS_CLOCK"&&found)success=found.type+"打卡成功："+found.time;if(["LEAVE_REQUEST","MISSING_REQUEST","HR_REVIEW"].includes(op)&&response.result.notification!=="ACCEPTED")success+=" 資料已保存，LINE通知尚未確認，請以紀錄狀態為準。";status(success,"success");
  return response;
 }catch(e){
  if(writeStarted)unknownWrite=true;
  status("⚠️ "+String(e&&e.message||e)+
   (writeStarted?"\n寫入結果未確認：保留原單號，先查詢，不要再次送出。":""),writeStarted?"unknown":"error");
 }finally{
  busy=false;
  document.querySelectorAll("button").forEach(b=>{b.disabled=b.dataset&&b.dataset.unavailable==="true"});
 }
}
async function refreshStaffClocks(){
 const previous=pendingWrite&&pendingWrite.operation==="GPS_CLOCK"?{...pendingWrite}:null;
 let confirmed=null;
 if(previous){
  const check=await execute("GPS_STATUS");
  const found=check&&check.ok===true&&check.result&&check.result.request;
  if(found&&found.requestId===previous.requestId)confirmed=found;
 }
 const history=await execute("MY_CLOCKS");
 if(previous){
  if(confirmed&&!pendingWrite){
   status("已確認剛才"+confirmed.type+"打卡成功："+confirmed.time+
    (history&&history.ok===true?"，當月紀錄已更新。":"；當月紀錄暫未更新，請稍後重新整理，不要重打。"),"success");
  }else{
   status("剛才的打卡結果仍未確認，請稍後重新整理當月紀錄，暫時不要再打一次。","unknown");
  }
 }
 return history;
}
async function init(){
 try{
  if(!/^2009482137-[A-Za-z0-9]+$/.test(LIFF_ID)||LIFF_ID==="2009482137-QgqJEHgA")
   throw Error("員工服務 LIFF 尚未設定；不可使用原 GPS LIFF");
  if(typeof liff==="undefined")throw Error("LINE SDK 尚未載入");
  await liff.init({liffId:LIFF_ID});
  loggedIn=liff.isLoggedIn()&&!!liff.getIDToken();
  $("identity").textContent=loggedIn?"已登入 LINE 帳號；仍需伺服器核對 員工綁定":
   "請按登入，完成 LINE 登入";
  prepareReviewEntry();
  if(new URL(window.location.href).searchParams.get("review")==="1"){$("reviewPanel").open=true;$("hrPending").hidden=false;if(loggedIn)await execute("HR_PENDING");}else if(!reviewEntry){const pageArg=new URL(window.location.href).searchParams.get("page")||"clock";const target={clock:"Clock",leave:"Leave",miss:"Missing",missing:"Missing",query:"Hr",hr:"Hr"}[pageArg]||"Clock";for(const name of pages){$("page"+name).hidden=name!==target;$("nav"+name).setAttribute("aria-pressed",String(name===target));}if(loggedIn&&target!=="Hr")await (target==="Clock"?refreshStaffClocks():execute({Leave:"MY_LEAVES",Missing:"MY_MISSING"}[target]));}
 }catch(e){loggedIn=false;$("identity").textContent=String(e.message||e)}
}
onAction("login",async()=>{
 if(typeof liff!=="undefined"&&(!loggedIn||!liff.isLoggedIn())){
  if(typeof liff.isInClient==="function"&&liff.isInClient()){
   status("請關閉此視窗，再從 LINE 開啟 員工入口以重新登入；尚未自動重送任何申請。");return;
  }
  if(liff.isLoggedIn()&&typeof liff.logout==="function")liff.logout();
  status("正在開啟 LINE 登入，請完成登入確認。","busy");liff.login({redirectUri:window.location.href});return;
 }
 await init();
 status(loggedIn?"LINE 登入已確認。":$("identity").textContent,loggedIn?"success":"error");
});
onAction("newId",()=>{
 if(unknownWrite){status("上次寫入結果不明，先用原單號查詢；暫不能換新編號");return}
 try{const id="V2_"+freshHex(16);$("requestId").value=id;preserveId(id);
  draftOperation="MANUAL";
  status("已建立新申請編號："+id+"\n不會自動送出");}
 catch(e){status(e.message)}
});
onAction("myClocks",refreshStaffClocks);
const binds=[
 ["preview","LEAVE_PREVIEW",false],
 ["leaveStatus","LEAVE_STATUS",false],
 ["submitLeave","LEAVE_REQUEST",true],
 ["submitMissing","MISSING_REQUEST",true],
 ["missingStatus","MISSING_STATUS",false],
 ["myLeaves","MY_LEAVES",false],
 ["myMissing","MY_MISSING",false],


 ["hrPending","HR_PENDING",false],
 ["hrStatus","HR_STATUS",false]
];
for(const [id,op,write] of binds)
 onAction(id,async()=>{
  const response=await execute(op,{write});
  if(!write||!formConfig[op]||!response||!response.result||!response.result.request)return;
  const date=response.result.request.startDate||response.result.request.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))return;
  const receipt=$("feedback").textContent;
  const leave=op==="LEAVE_REQUEST";
  $(leave?"month":"missingMonth").value=date.slice(0,7);
  const history=await execute(leave?"MY_LEAVES":"MY_MISSING");
  status(receipt+(history?"\n對應月份紀錄已自動更新。":"\n申請已成功送出；紀錄暫未更新，可稍後重新查詢，請勿重送。"),"success");
 });
for(const [id,op] of [["newLeave","LEAVE_REQUEST"],["newMissing","MISSING_REQUEST"]]){
 onAction(id,()=>{
  if(unknownWrite)throw Error("前一筆結果未確認，請先用原編號查詢。");
  const value="V2_"+freshHex(16);
  delete confirmedForms[op];
  sessionStorage.setItem("yc_staff_v2_confirmed_forms",JSON.stringify(confirmedForms));
  $("requestId").value=value;preserveId(value);
  draftOperation=op;
  $(formConfig[op][0]).setAttribute("data-confirmed","false");
  $(formConfig[op][0]).setAttribute("data-unavailable","false");
  $(formConfig[op][0]).textContent=op==="LEAVE_REQUEST"?"送出請假申請":"送出補打卡申請";
  $(formConfig[op][1]).textContent="填好內容後再送出；目前尚未送件。";
  $(formConfig[op][2]).hidden=false;
  status("已準備新的申請，尚未送出。");
 });
}
onAction("hrApprove",()=>reviewFromButton("APPROVE"));
onAction("hrReject",()=>reviewFromButton("REJECT"));
onAction("currentLeaves",()=>{
 return execute("MY_LEAVES");
});
onAction("viewSubmittedMonth",async()=>{
 if(!submittedMonth)return;
 const leave=submittedMonth.operation==="MY_LEAVES";
 for(const name of pages){$("page"+name).hidden=name!==(leave?"Leave":"Missing");
  $("nav"+name).setAttribute("aria-pressed",String(name===(leave?"Leave":"Missing")));}
 $(leave?"month":"missingMonth").value=submittedMonth.month;
 await execute(submittedMonth.operation);
});
for(const [id,type] of [["clockIn","上班"],["clockOut","下班"]]){
 onAction(id,async()=>{
  if(busy||unknownWrite){status("請先核對上一筆操作結果，不要再次送出。");return;}
  try{clockType=type;const id="V2_GPS_"+freshHex(16);$("requestId").value=id;preserveId(id);}
  catch(e){status(e.message);return;}
  const r=await execute("GPS_CLOCK",{write:true});if(r&&r.ok===true){const receipt=$("feedback").textContent;await execute("MY_CLOCKS");status(receipt,"success");}return r;
 });
}
if(unknownWrite)document.querySelectorAll("button").forEach(b=>{if(writeButtons.has(b.id))b.disabled=true;});
init();
})();

