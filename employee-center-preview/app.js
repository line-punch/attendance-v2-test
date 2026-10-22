"use strict";
/*
 * VISUAL PREVIEW ONLY. No LIFF SDK, no Google Apps Script URL, no network API,
 * no geolocation, no employee or payslip information. All actions are inert.
 */
const PREVIEW_PAGES=Object.freeze(["clock","miss","query","leave","annual","payslip","history"]);
const PREVIEW_TITLES=Object.freeze({
 clock:"正常打卡",miss:"補打卡",query:"出勤查詢",leave:"請假申請",
 annual:"特休查詢｜建置中",payslip:"薪資查詢｜建置中",history:"歷史紀錄｜建置中"
});
const el=id=>document.getElementById(id);
function showPage(page){
 const next=PREVIEW_PAGES.includes(page)?page:"clock";
 for(const name of PREVIEW_PAGES)el("page-"+name).classList.toggle("active",name===next);
 el("pageTitle").textContent=PREVIEW_TITLES[next]+"｜介面預覽";
 const parentTile=["annual","payslip","history"].includes(next)?"query":next;
 for(const item of el("v2Navigation").querySelectorAll("[data-page]")){
   const yes=item.getAttribute("data-page")===parentTile;
   item.classList.toggle("active",yes);
   if(yes)item.setAttribute("aria-current","page");
   else item.removeAttribute("aria-current");
 }
 // Avoid scrolling at startup; navigation is a real tap target.
}
function startV2Login(){
 el("v2Status").textContent="ℹ️ 這是員工 LINE 人資中心的畫面預覽。沒有連接 LINE、Google Sheet 或正式打卡功能。";
}
function bindEmployee(){
 el("bindMsg").textContent="首次綁定會由正式 V2 安全驗證流程處理；預覽不會綁定任何 LINE 帳號。";
}
function punch(type){
 el("msg").textContent="ℹ️ "+type+"打卡介面展示中。此頁沒有連接 GPS 或打卡資料庫，不會產生任何紀錄。";
}
function refreshV2Today(){
 el("v2Today").textContent="今日打卡紀錄將在正式串接後從本人資料查詢；預覽不顯示虛構打卡時間。";
}
function checkV2Pending(){
 el("msg").textContent="斷線後原請求查詢功能會接到安全後端；介面預覽不傳送資料。";
}
function submitMiss(){
 el("missMsg").textContent="補打卡申請送出建置中，預覽不儲存申請。";
}
function queryAttendance(){
 const month=el("queryMonth").value.trim();
 el("queryMsg").textContent=/^\d{6}$/.test(month)
  ?"近三個月查詢介面已保留，待安全資料服務串接。"
  :"請先填入 YYYYMM 格式月份（目前為介面預覽）。";
 el("queryList").textContent="本頁不讀取實際員工出勤資料。";
 el("queryList").classList.remove("hidden");
}
function toggleLeaveMode(){
 el("hourBox").classList.toggle("hidden",el("leaveUnit").value!=="時數");
}
function submitLeave(){
 el("leaveMsg").textContent="請假送出建置中，預覽不建立請假申請。";
}
function loadMissHistory(){
 el("missHistory").textContent="補打卡申請歷史介面保留，待安全查詢串接。";
}
function loadLeaveHistory(){
 el("leaveHistory").textContent="請假申請歷史介面保留，待安全查詢串接。";
}
(function initPreview(){
 const format=new Intl.DateTimeFormat("en-CA",{
  timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"
 });
 const parsed=d=>Object.fromEntries(format.formatToParts(d).map(p=>[p.type,p.value]));
 const today=parsed(new Date());
 const date=today.year+"-"+today.month+"-"+today.day;
 el("leaveDate").min=date;
 el("leaveDate").value=date;
 el("queryMonth").value=today.year+today.month;
 const yesterday=parsed(new Date(Date.now()-86400000));
 for(const [name,d] of [["今天",today],["昨天",yesterday]]){
  const option=document.createElement("option");
  option.value=d.year+"-"+d.month+"-"+d.day;
  option.textContent=name+"："+option.value;
  el("missDate").appendChild(option);
 }
 el("displayName").textContent="介面預覽（尚未登入）";
 el("v2Status").textContent="✅ 介面預覽已載入；未連接 LINE 或任何資料庫。";
 el("locationText").textContent="實際打卡時會即時取得 GPS 定位";
 el("msg").textContent="介面展示中，不會送出真實打卡。";
 el("v2Today").textContent="正式串接後顯示今日上班／下班時間";
 el("missMsg").textContent="原有補打卡表單已保留，送出功能建置中。";
 el("leaveMsg").textContent="原有請假表單與六種假別已保留，送出功能建置中。";
 el("queryMsg").textContent="原有三個月出勤查詢入口已保留，待資料串接。";
 let initial="clock";
 try{
   if(typeof location!=="undefined"){
     const selected=new URLSearchParams(location.search).get("page");
     if(PREVIEW_PAGES.includes(selected))initial=selected;
   }
 }catch(_){}
 showPage(initial);
})();
