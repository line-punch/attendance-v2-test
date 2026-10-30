"use strict";
/* TEST001 QA ONLY. NOT DEPLOYED. No production URLs or passwords embedded. */
(function(){
const LIFF_ID=String(window.V2_QA_LIFF_ID||"");
const BRIDGE="YC_V2_BATCH_QA_V1";
const $=id=>document.getElementById(id);
let loggedIn=false,busy=false,pendingWrite=null;
try{
 const saved=sessionStorage.getItem("v2_batch_qa_pending_write");
 if(saved)pendingWrite=JSON.parse(saved);
}catch(_){pendingWrite={operation:"UNKNOWN",requestId:""};}
let unknownWrite=!!pendingWrite;
function status(t){$("result").textContent=t;}
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
if(pendingWrite){
 if(pendingWrite.operation==="HR_REVIEW")
  $("hrRequestId").value=pendingWrite.requestId||"";
 else $("requestId").value=pendingWrite.requestId||$("requestId").value;
 status("上次寫入尚未核對，請保留原編號並先回查："+(pendingWrite.requestId||"需管理者核對"));
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
 if(operation==="HR_PENDING")return {};
 if(operation==="HR_REVIEW"||operation==="HR_STATUS"){
  const id=$("hrRequestId").value.trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))
   throw Error("人資請填入原申請編號");
  return operation==="HR_STATUS"?{requestId:id}:{requestId:id,decision:this.decision};
 }
 throw Error("不支援的操作");
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
  const args=op==="HR_REVIEW"?{
   requestId:$("hrRequestId").value.trim(),decision
  }:requestBody(op);
  if(op==="HR_REVIEW"&&!/^[A-Za-z0-9_-]{12,80}$/.test(args.requestId))
   throw Error("缺少人資審核原單號");
  if(write){
   rememberWrite({operation:op,requestId:args.requestId});
   writeStarted=true;
  }
  busy=true;
  document.querySelectorAll("button").forEach(b=>{if(b.id!=="login")b.disabled=true});
  status("操作執行中；請勿重複點擊。\n原申請編號："+(args.requestId||"無"));
  const response=await post(endpoint,op,token,args);
  if(response.ok!==true){
   if(write&&(response.code==="UNKNOWN"||response.persisted===null))
    unknownWrite=true;
   else if(write&&response.persisted===false)rememberWrite(null);
   status("QA 回覆："+String(response.code||"UNKNOWN")+
    "\n"+(response.persisted===null?"結果不明，請保留原編號查詢。":"本次未確認成功。")+
    "\n原申請編號："+(args.requestId||"無"));
   return;
  }
  const found=response.result&&response.result.request;
  if(pendingWrite&&found&&found.requestId===pendingWrite.requestId&&
     ((write&&op===pendingWrite.operation)||
      (op==="LEAVE_STATUS"&&pendingWrite.operation==="LEAVE_REQUEST")||
      (op==="MISSING_STATUS"&&pendingWrite.operation==="MISSING_REQUEST")||
      (op==="HR_STATUS"&&pendingWrite.operation==="HR_REVIEW")))
   rememberWrite(null);
  status("TEST001 QA 已回覆成功（僅獨立技術測試）。\n"+
   JSON.stringify(response.result,null,2));
 }catch(e){
  if(writeStarted)unknownWrite=true;
  status("⚠️ "+String(e&&e.message||e)+
   (writeStarted?"\n寫入結果未確認：保留原單號，先查詢，不要再次送出。":""));
 }finally{
  busy=false;
  document.querySelectorAll("button").forEach(b=>{b.disabled=false});
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
$("login").addEventListener("click",()=>{
 if(typeof liff!=="undefined"&&!liff.isLoggedIn()){liff.login();return}
 init();
});
$("newId").addEventListener("click",()=>{
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
 ["hrPending","HR_PENDING",false],
 ["hrStatus","HR_STATUS",false]
];
for(const [id,op,write] of binds)
 $(id).addEventListener("click",()=>execute(op,{write}));
$("hrApprove").addEventListener("click",()=>execute("HR_REVIEW",{write:true,decision:"APPROVE"}));
$("hrReject").addEventListener("click",()=>execute("HR_REVIEW",{write:true,decision:"REJECT"}));
init();
})();
