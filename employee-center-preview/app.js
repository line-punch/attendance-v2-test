"use strict";
/* UI PREVIEW ONLY. No LINE, GPS, Apps Script, network or real employee data. */
const $ = id => document.getElementById(id);
const PAGE_NAMES = ["clock","miss","query","leave"];
const todayParts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"})
  .formatToParts(new Date()).reduce((o,p)=>(o[p.type]=p.value,o),{});
const todayIso = todayParts.year+"-"+todayParts.month+"-"+todayParts.day;
const months = Array.from({length:3},(_,i)=>{
  const date=new Date(Date.UTC(Number(todayParts.year),Number(todayParts.month)-1-i,15));
  const yy=date.getUTCFullYear();
  const mm=String(date.getUTCMonth()+1).padStart(2,"0");
  return {key:String(yy)+mm,label:yy+"年"+Number(mm)+"月"};
});
let selectedQuery = "attendance";
function dateStr(month,day){return month.slice(0,4)+"/"+month.slice(4)+"/"+String(day).padStart(2,"0");}
function demoDays(month) {
  const maxDay=month===months[0].key?Number(todayParts.day):24;
  return [...new Set([Math.max(1,maxDay-2),Math.max(1,maxDay-1),maxDay])].reverse();
}
function dataForMonth(month){
  const d=demoDays(month);
  return d.map((day,i)=>({date:dateStr(month,day),in:i===1?"":"08:23:52",out:i===0?"":(i===1?"17:37:56":"17:41:06")}));
}
function buildTable(target,headers,rows){
  const node=$(target); node.replaceChildren();
  const wrap=document.createElement("table"),thead=document.createElement("thead"),tr=document.createElement("tr");
  headers.forEach(s=>{const th=document.createElement("th");th.textContent=s;tr.appendChild(th);});
  thead.appendChild(tr);wrap.appendChild(thead);
  const body=document.createElement("tbody");
  rows.forEach(row=>{
    const t=document.createElement("tr");
    row.forEach(cell=>{
      const td=document.createElement("td");
      if(cell&&typeof cell==="object"&&cell.status){
        const span=document.createElement("span");
        span.className="pill "+(cell.status==="核准"?"good":cell.status==="駁回"?"bad":"wait");
        span.textContent=cell.status;td.appendChild(span);
      }else td.textContent=cell===undefined||cell===null||cell===""?"—":String(cell);
      t.appendChild(td);
    });
    body.appendChild(t);
  });
  wrap.appendChild(body);node.appendChild(wrap);
}
function showPage(page) {
  const chosen=PAGE_NAMES.includes(page)?page:"clock";
  PAGE_NAMES.forEach(p=>{$("page-"+p).classList.toggle("active",p===chosen);});
  document.querySelectorAll("#mainNav [data-page]").forEach(node=>{
    const active=node.dataset.page===chosen;
    node.classList.toggle("active",active);
    if(active)node.setAttribute("aria-current","page");
    else node.removeAttribute("aria-current");
  });
  if(chosen==="clock")renderMonthlyClock();
  if(chosen==="query")renderQuery();
}
function renderMonthlyClock(){
  $("clockMonth").textContent=months[0].label+"（示意）";
  buildTable("clockTable",["日期","上班","下班"],dataForMonth(months[0].key).map(r=>[r.date,r.in,r.out]));
}
function renderMiss(){
  const m=months[0].key,d=demoDays(m);
  const rows=[
    [dateStr(m,d[0]),"下班","17:37",{status:"審核中"}],
    [dateStr(m,d[Math.min(1,d.length-1)]),"上班","08:30",{status:"核准"}],
    [dateStr(m,d[d.length-1]),"下班","17:30",{status:"駁回"}]
  ];
  buildTable("missTable",["日期","類型","補卡時間","申請狀態"],rows);
}
function renderLeave(){
  const m=months[0].key,d=demoDays(m);
  buildTable("leaveTable",["申請日期","假別","區間","狀態"],[
    [dateStr(m,d[0]),"事假","1天",{status:"審核中"}],
    [dateStr(m,d[d.length-1]),"特休","1天",{status:"核准"}]
  ]);
}
function renderQuery(){
  document.querySelectorAll("[data-query]").forEach(node=>{
    node.classList.toggle("selected",node.dataset.query===selectedQuery);
    node.setAttribute("aria-pressed",node.dataset.query===selectedQuery?"true":"false");
  });
  const month=$("queryMonth").value||months[0].key;
  $("queryStatus").textContent="查詢月份："+(months.find(x=>x.key===month)||months[0]).label+"｜純示意、唯讀，未連接員工資料。";
  if(selectedQuery==="attendance"){
    const rows=dataForMonth(month).map(r=>[r.date,r.in,r.out]);
    buildTable("queryResult",["日期","上班","下班"],rows);
  } else if(selectedQuery==="miss"){
    const d=demoDays(month);
    buildTable("queryResult",["補卡日期","類型","申請補登","審核"],[
      [dateStr(month,d[0]),"上班","08:30",{status:"核准"}],
      [dateStr(month,d[d.length-1]),"下班","17:30",{status:"審核中"}]
    ]);
  } else if(selectedQuery==="leave"){
    const d=demoDays(month);
    buildTable("queryResult",["日期","假別","區間","審核"],[
      [dateStr(month,d[0]),"事假","1天",{status:"審核中"}],
      [dateStr(month,d[d.length-1]),"特休","1天",{status:"核准"}]
    ]);
  }else{
    $("queryResult").replaceChildren();
    const box=document.createElement("div");
    box.className="box";
    box.textContent="本人基本資料：員工姓名、公司、部門、在職狀態。預覽不顯示任何真實員工資料，正式版將由 LINE 身分驗證後唯讀取得。";
    $("queryResult").appendChild(box);
  }
}
function updateLeave(){
  const start=$("leaveStart").value,end=$("leaveEnd").value;
  $("leaveEnd").min=start||todayIso;
  $("leaveHours").hidden=$("leaveUnit").value!=="時數";
  let msg="請先選擇開始與結束日期。";
  if(start&&end){
    if(end<start) msg="結束日期不可早於開始日期。";
    else {
      const days=Math.round((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000)+1;
      msg="已選擇 "+days+" 個曆日。實際請假工作日與時數，正式版需依公司工作日曆及假別規則計算，不以曆日直接扣假。";
      if(days>1&&$("leaveUnit").value==="時數")msg+=" 跨日指定時段的計算規則尚需後端核定。";
    }
  }
  $("leaveSummary").textContent=msg;
}
function safePreviewSubmit(kind){
  let id=kind==="miss"?"missStatus":"leaveStatus";
  let message="";
  if(kind==="miss"){
    message=(!$("missType").value||!$("missTime").value||!$("missReason").value.trim())?
      "請先填寫類型、補登時間和原因（預覽不送出）。":
      "✅ 已確認表單填寫完整；此為純介面預覽，沒有建立申請、也不會發送主管通知。";
  }else{
    const start=$("leaveStart").value,end=$("leaveEnd").value;
    message=(!start||!end||end<start||!$("leaveType").value)?
      "請填妥有效日期範圍與假別（預覽不送出）。":
      ($("leaveUnit").value==="時數"&&(!$("leaveStartTime").value||!$("leaveEndTime").value))?
      "指定時段需填開始與結束時間（預覽不送出）。":
      "✅ 表單示意完成；此頁不寫入 Google Sheet、不會發送 LINE 通知。";
  }
  $(id).textContent=message;
}
function init(){
  document.querySelectorAll("#mainNav [data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
  document.querySelectorAll("[data-demo-punch]").forEach(b=>b.addEventListener("click",()=>{
    $("clockStatus").textContent="已按下「"+b.dataset.demoPunch+"打卡」（僅測試按鈕回饋）。尚未連接 GPS／後端，不能視為打卡成功。";
  }));
  $("clockRefresh").addEventListener("click",()=>{
    renderMonthlyClock();
    $("clockStatus").textContent="已更新介面中的示意資料。正式版才會從伺服器讀回實際紀錄。";
  });
  document.querySelectorAll("[data-query]").forEach(b=>b.addEventListener("click",()=>{
    selectedQuery=b.dataset.query;renderQuery();
  }));
  $("queryMonth").addEventListener("change",renderQuery);
  $("missSubmit").addEventListener("click",()=>safePreviewSubmit("miss"));
  $("leaveSubmit").addEventListener("click",()=>safePreviewSubmit("leave"));
  ["leaveStart","leaveEnd","leaveUnit"].forEach(id=>$(id).addEventListener("change",updateLeave));
  $("leaveStart").min=todayIso;$("leaveEnd").min=todayIso;
  $("leaveStart").value=todayIso;$("leaveEnd").value=todayIso;
  const yesterday=new Date(Date.parse(todayIso+"T00:00:00Z")-86400000);
  const yesterdayIso=yesterday.getUTCFullYear()+"-"+String(yesterday.getUTCMonth()+1).padStart(2,"0")+"-"+String(yesterday.getUTCDate()).padStart(2,"0");
  [["今天",todayIso],["昨天",yesterdayIso]].forEach(pair=>{
    const option=document.createElement("option");
    option.value=pair[1];option.textContent=pair[0]+"："+pair[1];
    $("missDate").appendChild(option);
  });
  months.forEach(m=>{
    const opt=document.createElement("option");
    opt.value=m.key;opt.textContent=m.label;
    $("queryMonth").appendChild(opt);
  });
  renderMiss();renderLeave();updateLeave();
  let initial="clock";
  try{const requested=new URLSearchParams(location.search).get("page");
      if(PAGE_NAMES.includes(requested))initial=requested;
  }catch(_){}
  showPage(initial);
}
document.addEventListener("DOMContentLoaded",init);
