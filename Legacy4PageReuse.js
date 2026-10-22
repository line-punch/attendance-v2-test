"use strict";
/**
 * Original four-page attendance UI, reused with ISOLATED V2 identity and POST.
 * Not deployed to GitHub Pages main. NEVER use old JSONP or production GAS.
 * No real employee database, notifications or applications can be written.
 */
const V2_REUSE=Object.freeze({
  liffId:"2012136707-2dDU0aSJ",
  verifyApi:"https://script.google.com/macros/s/AKfycbx2s-MtBVoHT2061E8XHNk92F9PhCbI0HtyKzQ7c5l5rasc__XZ84BL-A2HyxIyc6_OEw/exec",
  dataApi:"https://script.google.com/macros/s/AKfycbwifAR8KLSD11HlLZF4Yy1ROTrbZv2c0DUBqlOaXxzO6rTvDc_Mqs6R-UbThBBbhSQ1/exec",
  enableLegacyReads:false, // pending secure integrated DATA TEST GAS deployment
  enableClock:false,       // verified GPS test stays in existing V2 LIFF page
  allowedOrigins:["https://script.google.com"]
});
const v2State={initialized:false,employee:null,busy:false,pendingKey:"v2-legacy-ui-pending-clock",page:"clock"};
const $=id=>document.getElementById(id);
function v2Message(message){$("v2Status").textContent=message}
function v2IdToken(){
  if(!liff.isLoggedIn())throw Error("LINE 尚未登入");
  const t=liff.getIDToken();
  if(!t)throw Error("無法取得 LINE ID Token");
  return t;
}
function v2RandomId(){
  if(!globalThis.crypto||!crypto.getRandomValues)throw Error("瀏覽器不支援安全請求編號");
  const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);
  return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
function v2OriginOK(origin){
  if(V2_REUSE.allowedOrigins.includes(origin))return true;
  try {
    const parsed=new URL(origin);
    return parsed.protocol==="https:"&&
      (parsed.hostname==="script.googleusercontent.com"||
       parsed.hostname.endsWith(".googleusercontent.com"));
  }catch(_){return false}
}
function v2PostForm(api,operation,payload){
  return new Promise((resolve,reject)=>{
    let nonce;
    try{nonce=v2RandomId()}catch(e){reject(e);return}
    const iframe=document.createElement("iframe");
    iframe.name="v2_original_"+nonce;iframe.style.display="none";
    iframe.setAttribute("aria-hidden","true");
    const form=document.createElement("form");
    form.method="POST";form.action=api;form.target=iframe.name;
    form.style.display="none";form.acceptCharset="UTF-8";
    const fields={nonce,operation,payload:JSON.stringify(payload)};
    for(const key of Object.keys(fields)){
      const input=document.createElement("input");
      input.type="hidden";input.name=key;input.value=fields[key];form.appendChild(input);
    }
    let settled=false;
    const done=(error,value)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      window.removeEventListener("message",onMessage);
      form.remove();iframe.remove();
      if(error)reject(error);else resolve(value);
    };
    const onMessage=e=>{
      if(!v2OriginOK(e.origin)||!e.data||typeof e.data!=="object")return;
      const d=e.data;
      if(d.bridge!=="YC_V2_STAGING_FORM_V1"||d.nonce!==nonce)return;
      if(!d.ok){
        const e=Error(String(d.error||"結果未確認"));
        e.code=String(d.code||"UNKNOWN");
        e.persisted=d.persisted===false?false:null;
        done(e);
      }else done(null,d.result);
    };
    const timer=setTimeout(()=>done(Error("伺服器回覆逾時，結果未確認；請先查詢紀錄。")),45000);
    window.addEventListener("message",onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    try{form.submit()}catch(e){done(e)}
  });
}
function v2SafeCall(operation,payload){
  const allowed=["whoami","todayAttendance","clock","clockStatus",
    "monthQuery","missHistory","leaveHistory"];
  if(!allowed.includes(operation))return Promise.reject(Error("此操作尚未開放"));
  if(["monthQuery","missHistory","leaveHistory"].includes(operation)&&
     !V2_REUSE.enableLegacyReads)
    return Promise.reject(Error("原有查詢介面已保留，等隔離後端整批整合再開放"));
  if(operation==="clock"&&!V2_REUSE.enableClock)
    return Promise.reject(Error("整合測試版打卡尚未開放，請使用原 V2 GPS 測試頁"));
  return v2PostForm(V2_REUSE.dataApi,operation,
    Object.assign({idToken:v2IdToken()},payload||{}));
}
function getPage(){
  const page=new URLSearchParams(location.search).get("page");
  return ["clock","miss","query","leave"].includes(page)?page:"clock";
}
function showPage(page){
  const p=["clock","miss","query","leave"].includes(page)?page:"clock";
  v2State.page=p;
  const names={clock:"正常打卡",miss:"補打卡申請",query:"個人月查詢",leave:"請假系統"};
  for(const id of ["clock","miss","query","leave"]){
    $("page-"+id).classList.toggle("active",id===p);
  }
  $("pageTitle").textContent=names[p]+"｜V2 隔離介面";
}
function v2EmployeeInfo(){
  if(!v2State.employee){
    $("employeeInfoBox").classList.add("hidden");
    $("bindBox").classList.remove("hidden");
    $("bindMsg").textContent="請先在 V2 隔離登入測試頁完成一次性邀請碼綁定；這裡不接受舊的員工 ID 直接綁定。";
    return;
  }
  const e=v2State.employee;
  $("employeeInfoBox").classList.remove("hidden");
  $("bindBox").classList.add("hidden");
  $("employeeInfo").textContent="員工ID："+e.employeeId+"\n姓名："+e.name+
    (e.company?"\n公司："+e.company:"")+(e.department?"\n部門："+e.department:"");
}
async function v2Initialize(auto){
  if(v2State.busy)return;
  v2State.busy=true;$("v2Login").disabled=true;
  try{
    v2Message("正在連接隔離 LINE 身分驗證…");
    await liff.init({liffId:V2_REUSE.liffId});
    v2State.initialized=true;
    if(!liff.isLoggedIn()){
      v2Message("請點「驗證我的 LINE 測試身分」。");
      if(!auto)liff.login();
      return;
    }
    const token=v2IdToken();
    const verify=await v2PostForm(V2_REUSE.verifyApi,"verify",{idToken:token});
    if(!verify||!verify.ok||verify.verified!==true)
      throw Error("LINE 後端尚未確認身分");
    const identity=await v2SafeCall("whoami",{});
    if(!identity||!identity.ok)throw Error("無法確認隔離員工");
    v2State.employee=identity.bound?identity.employee:null;
    v2EmployeeInfo();
    try{
      const prof=await liff.getProfile();
      $("displayName").textContent=String(prof.displayName||"LINE 已驗證");
    }catch(_){$("displayName").textContent="LINE 已驗證"}
    v2Message(identity.bound?
      "✅ LINE 後端驗證成功，TEST001 隔離員工已綁定。":
      "✅ LINE 驗證成功，尚未綁定 TEST001。");
    if(identity.bound)await refreshV2Today();
  }catch(e){v2Message("⚠️ 隔離登入尚未完成："+String(e&&e.message||e))}
  finally{v2State.busy=false;$("v2Login").disabled=false}
}
function startV2Login(){return v2Initialize(false)}
function bindEmployee(){
  $("bindMsg").textContent="本頁不接受員工ID直接綁定。請使用 V2 測試入口的 32 位邀請碼。";
}
function getActiveEmpid(){
  return v2State.employee?v2State.employee.employeeId:"";
}
async function refreshV2Today(){
  if(!getActiveEmpid()){
    $("v2Today").textContent="請先登入並完成隔離員工綁定。";return
  }
  $("v2Today").textContent="正在核對今日打卡資料…";
  try{
    const r=await v2SafeCall("todayAttendance",{});
    const text=["今日打卡（"+r.date+"，台灣時間）"];
    text.push("上班："+(r.clockIn?r.clockIn.time+"（"+r.clockIn.placeName+"）":"尚未查到"));
    text.push("下班："+(r.clockOut?r.clockOut.time+"（"+r.clockOut.placeName+"）":"尚未查到"));
    text.push("尚未查到紀錄不代表正在處理中的請求失敗。");
    $("v2Today").textContent=text.join("\n");
  }catch(e){$("v2Today").textContent="⚠️ 今日查詢未完成："+e.message+"。不要直接重複打卡。"}
}
function v2Pending(){
  try{return JSON.parse(sessionStorage.getItem(v2State.pendingKey)||"null")}
  catch(_){return null}
}
function v2SetPending(obj){sessionStorage.setItem(v2State.pendingKey,JSON.stringify(obj))}
function v2ClearPending(){sessionStorage.removeItem(v2State.pendingKey)}
async function checkV2Pending(){
  if(!getActiveEmpid()){ $("msg").textContent="請先驗證身分";return }
  const p=v2Pending();
  if(!p){$("msg").textContent="目前沒有待確認的打卡；可使用今日紀錄查詢。";return}
  $("msg").textContent="正在核對原請求編號…";
  try{
    const r=await v2SafeCall("clockStatus",{type:p.type,requestId:p.requestId});
    if(r&&r.found){v2ClearPending();$("msg").textContent="✅ 已確認先前打卡成功："+r.date+" "+r.time+"｜"+r.type;await refreshV2Today()}
    else $("msg").textContent="尚未查到原請求，可能仍在處理；稍後再查。";
  }catch(e){$("msg").textContent="結果尚未確認："+e.message}
}
function v2FreshGPS(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(Error("手機不支援 GPS"));return}
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,
         accuracy:p.coords.accuracy,capturedAt:Date.now()}),
      e=>reject(Error(Number(e&&e.code)===1?"定位權限遭拒，請在 LINE 設定允許精確定位。":
        "GPS 尚未取得，請確認手機定位權限與訊號。")),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
}
async function punch(type){
  if(v2State.busy)return;
  if(!getActiveEmpid()){$("msg").textContent="請先驗證模擬員工身分";return}
  if(!V2_REUSE.enableClock){$("msg").textContent="本整合介面尚未開放打卡寫入，原本的 V2 隔離 GPS 測試不受影響。";return}
  if(v2Pending()){$("msg").textContent="上次打卡結果未確認，請先查詢原請求。";return}
  v2State.busy=true;
  try{
    $("msg").textContent="正在取得新的 GPS 定位…";
    const p=await v2FreshGPS(),req={type,requestId:v2RandomId(),...p};
    v2SetPending(req);
    $("msg").textContent="正在送出隔離打卡…";
    const r=await v2SafeCall("clock",req);
    if(r&&r.ok&&r.found){
      v2ClearPending();
      $("msg").textContent="✅ "+r.message+"｜"+r.date+" "+r.time+"｜"+r.type;
      await refreshV2Today();
    }else if(r&&r.code==="ALREADY_CLOCKED"){
      v2ClearPending();$("msg").textContent="今日已有同類型打卡，請查看今日紀錄。";
    }else $("msg").textContent="結果未確認，請先查詢原請求。";
  }catch(e){
    if(e.persisted===false){v2ClearPending();$("msg").textContent="❌ 打卡未寫入："+e.message}
    else $("msg").textContent="⚠️ 結果未確認："+e.message+"，請先查詢。";
  }finally{v2State.busy=false}
}
function toggleLeaveMode(){
  $("hourBox").classList.toggle("hidden",$("leaveUnit").value!=="時數");
}
function submitMiss(){
  $("missMsg").textContent="補打卡表單已保留；隔離安全寫入與主管審核尚未完成，暫不送出。";
}
function submitLeave(){
  $("leaveMsg").textContent="請假表單及假別已保留；隔離安全寫入與主管審核尚未完成，暫不送出。";
}
async function queryAttendance(){
  const month=$("queryMonth").value.trim(),out=$("queryList");
  if(!getActiveEmpid()){$("queryMsg").textContent="請先登入";return}
  out.classList.add("hidden");
  $("queryMsg").textContent="正在查詢…";
  try{
    const r=await v2SafeCall("monthQuery",{month});
    if(!r||!r.ok)throw Error("查詢失敗");
    $("queryMsg").textContent="✅ 查詢成功，整月總筆數："+r.total;
    out.textContent=r.data.length?r.data.map((v,i)=>(i+1)+". 日期："+v.date+
      "｜時間："+v.time+"｜類型："+v.type+"｜地點："+(v.placeName||"")).join("\n"):
      "查無資料";
    out.classList.remove("hidden");
  }catch(e){$("queryMsg").textContent="⚠️ "+e.message}
}
async function loadMissHistory(){
  if(!getActiveEmpid()){$("missHistory").textContent="請先登入";return}
  $("missHistory").textContent="正在查詢…";
  try{
    const r=await v2SafeCall("missHistory",{});
    $("missHistory").textContent=r.data.length?r.data.map((x,i)=>
      (i+1)+". 日期："+x.date+"｜類型："+x.type+"｜申請："+x.time+
      "｜狀態："+x.status+"\n原因："+x.reason).join("\n\n"):"目前沒有補打卡申請紀錄。";
  }catch(e){$("missHistory").textContent="⚠️ "+e.message}
}
async function loadLeaveHistory(){
  if(!getActiveEmpid()){$("leaveHistory").textContent="請先登入";return}
  $("leaveHistory").textContent="正在查詢…";
  try{
    const r=await v2SafeCall("leaveHistory",{});
    $("leaveHistory").textContent=r.data.length?r.data.map((x,i)=>
      (i+1)+". 日期："+x.date+"｜假別："+x.type+"｜區間："+x.range+
      "｜狀態："+x.status).join("\n"):"目前沒有請假申請紀錄。";
  }catch(e){$("leaveHistory").textContent="⚠️ "+e.message}
}
function v2InitializeInputs(){
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",
    year:"numeric",month:"2-digit",day:"2-digit"});
  const parts=Object.fromEntries(formatter.formatToParts(new Date()).map(p=>[p.type,p.value]));
  const today=parts.year+"-"+parts.month+"-"+parts.day;
  $("leaveDate").min=today;
  $("leaveDate").value=today;
  $("queryMonth").value=parts.year+parts.month;
  const d=new Date(Date.now()-86400000),prev=Object.fromEntries(formatter.formatToParts(d).map(p=>[p.type,p.value]));
  $("missDate").innerHTML="";
  for(const [label,value] of [["今天",today],["昨天",prev.year+"-"+prev.month+"-"+prev.day]]){
    const option=document.createElement("option");
    option.value=value;option.textContent=label+" "+value;$("missDate").appendChild(option);
  }
}
function initV2Reuse(){
  showPage(getPage());v2InitializeInputs();v2EmployeeInfo();
  // Automatic top-level LIFF check after redirect; no surprise login redirect.
  v2Initialize(true);
}
initV2Reuse();
