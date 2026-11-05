"use strict";
const fs=require('node:fs'),path=require('node:path');
function build(endpoint,liff){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint||'')||!/^2009482137-[A-Za-z0-9]+$/.test(liff||'')||liff==='2009482137-QgqJEHgA')throw Error('NEW_STAFF_ENDPOINT_AND_LIFF_REQUIRED');
 const read=n=>fs.readFileSync(path.join(__dirname,'qa-candidate-workflow-client',n),'utf8');
 let app=read('app.js').replaceAll('YC_V2_BATCH_QA_V1','YC_V2_STAFF_V1').replaceAll('v2_candidate_phone_','yc_staff_v2_').replaceAll('candidateRoute:"v1"','candidateRoute:"staff-v1"').replaceAll('"QA_"','"V2_"').replaceAll('"QA_GPS_"','"V2_GPS_"');
 app=app.replaceAll('TEST001 LINE','LINE').replaceAll('TEST001 綁定','員工綁定').replaceAll('LINE 測試帳號','LINE 帳號').replaceAll('（獨立 QA）','').replaceAll('QA 回覆：','系統回覆：').replaceAll('QA 寫入尚未開放','目前尚未開放寫入').replaceAll('獨立 QA 的','系統的').replaceAll('主管審核（獨立 QA）','主管審核');
 app=app.replace('row.unit==="HOURS"?','row.legacyUnitLabel?row.legacyUnitLabel:row.unit==="HOURS"?').replace('(found.unit==="DAY"?"全天":found.fromTime+"～"+found.toTime)','(found.legacyUnitLabel||(found.unit==="DAY"?"全天":found.fromTime+"～"+found.toTime))');
 app=app.replace('states[row.status]||row.status','row.legacyStatusLabel||states[row.status]||row.status');
 const queueCode='function renderStaffQueue(result){const box=$("staffPending");box.replaceChildren();const rows=result&&Array.isArray(result.pending)?result.pending:[];if(!rows.length){box.textContent="目前沒有待審核申請。";return;}for(const r of rows){const item=document.createElement("p"),button=document.createElement("button");item.textContent=r.employeeId+"｜"+(r.kind==="LEAVE"?"請假 "+r.startDate+"～"+r.endDate:"補打卡 "+r.date+" "+r.type+" "+r.time);button.type="button";button.textContent="查看這張申請";button.addEventListener("click",async()=>{if(busy||unknownWrite)return;reviewEntry={requestId:r.requestId,decision:"REVIEW"};reviewLoaded=false;$("hrRequestId").value=r.requestId;$("hrRequestId").readOnly=true;await execute("HR_STATUS");});box.append(item,button);}}\n';
 app=app.replace('function prepareReviewEntry(){',queueCode+'function prepareReviewEntry(){').replace('  if(op==="MY_LEAVES"||op==="MY_MISSING")renderHistory(op,response.result);','  if(op==="HR_PENDING")renderStaffQueue(response.result);\n  if(op==="MY_LEAVES"||op==="MY_MISSING")renderHistory(op,response.result);');
 app=app.replace('if(reviewEntry&&(!reviewLoaded||$("hrRequestId").value!==reviewEntry.requestId)){','if(!reviewEntry||!reviewLoaded||$("hrRequestId").value!==reviewEntry.requestId){');
 app=app.replace('  const found=response.result&&response.result.request;','  const found=response.result&&response.result.request;\n  if(op==="HR_STATUS"&&found&&!reviewEntry)reviewEntry={requestId:found.requestId,decision:"REVIEW"};');
 const oldSuccess='  status((summaries[op]||"查詢完成。")+"\\n"+';
 // Actual source contains the QA suffix here; replace the whole stable block.
 const statusStart=app.indexOf('  status((summaries[op]||"查詢完成。")');
 const statusEnd=statusStart<0?-1:app.indexOf('  return response;',statusStart);
 if(statusStart<0||statusEnd<0)throw Error('STAFF_RECEIPT_CONTRACT_CHANGED');
 app=app.slice(0,statusStart)+'  let success=summaries[op]||"查詢完成。";if(op==="GPS_CLOCK"&&found)success=found.type+"打卡成功："+found.time;if(["LEAVE_REQUEST","MISSING_REQUEST","HR_REVIEW"].includes(op)&&response.result.notification!=="ACCEPTED")success+=" 資料已保存，LINE通知尚未確認，請以紀錄狀態為準。";status(success,"success");\n'+app.slice(statusEnd);
 app=app.replace('const receipt=$("result").textContent;','const receipt=$("feedback").textContent;');
 app=app.replace('onAction(id,()=>{\n  if(busy||unknownWrite)','onAction(id,async()=>{\n  if(busy||unknownWrite)').replace('return execute("GPS_CLOCK",{write:true});','const r=await execute("GPS_CLOCK",{write:true});if(r&&r.ok===true){const receipt=$("feedback").textContent;await execute("MY_CLOCKS");status(receipt,"success");}return r;');
 app=app.replace('/^2012136707-','/^2009482137-').replace('LIFF_ID==="2012136707-2dDU0aSJ"','LIFF_ID==="2009482137-QgqJEHgA"')
  .replaceAll('獨立 QA','員工服務').replaceAll('QA 入口','員工入口').replaceAll('QA 後端','員工服務').replaceAll('LINE 測試登入','LINE 登入').replaceAll('QA 寫入開關及獨立測試資料庫','系統寫入狀態').replaceAll('新測試申請','新申請');
 const pageRoute='prepareReviewEntry();\n  if(new URL(window.location.href).searchParams.get("review")==="1"){$("reviewPanel").open=true;$("hrPending").hidden=false;if(loggedIn)await execute("HR_PENDING");}else if(!reviewEntry){const pageArg=new URL(window.location.href).searchParams.get("page")||"clock";const target={clock:"Clock",leave:"Leave",miss:"Missing",missing:"Missing",query:"Hr",hr:"Hr"}[pageArg]||"Clock";for(const name of pages){$("page"+name).hidden=name!==target;$("nav"+name).setAttribute("aria-pressed",String(name===target));}if(loggedIn&&target!=="Hr")await execute({Clock:"MY_CLOCKS",Leave:"MY_LEAVES",Missing:"MY_MISSING"}[target]);}';
 if(!app.includes('  prepareReviewEntry();'))throw Error('STAFF_INIT_CONTRACT_CHANGED');
 app=app.replace('  prepareReviewEntry();','  '+pageRoute);
 let html=read('index.html').replaceAll('20261104candidateflow1','20261105staff1').replace('<title>TEST001｜候選整合驗收</title>','<title>YC/YT員工系統</title>').replace('員工打卡｜候選整合驗收','YC/YT員工系統');
 html=html.replace('<strong>TEST001 候選合成副本：集中整合驗收專用。</strong>非正式出勤；僅在管理者開啟本次測試窗口後送件或審核。','<strong>上下班打卡、請假與補打卡。</strong>請假及補打卡不限地點；人資結算仍由公司線下辦理。');
 html=html.replace('確認 TEST001 LINE 登入','確認 LINE 登入').replace('新增一筆測試申請','新增申請').replace('請假日期預檢（唯讀）','檢查請假日期').replace('QA 技術檢查（非員工功能）','主管審核').replace('人資待審核（需測試人資身分）','我的待審核申請').replace('查原審核單（唯讀，需測試人資身分）','查詢審核單').replace('人資核准（測試）','確認核准').replace('人資駁回（測試）','確認駁回').replace('詳細執行回覆（QA）','詳細處理結果');
 html=html.replace('<p id="reviewHint" role="status"></p>','<p id="reviewHint" role="status"></p><div id="staffPending" role="region" aria-label="我的待審核清單"></div>');
 // Internal connection controls remain in DOM for the proven request flow,
 // but are configured by the release, never presented as staff decisions.
 html=html.replace('</style>','details:has(#endpoint),label:has(#confirmed),label:has(#writeConsent),section:has(>label>#writeConsent)>p{display:none}#reviewPanel:not([open]){display:none}</style>');
 const config='/* Public release identifiers only. No staff roster or tokens. */\nwindow.V2_QA_LIFF_ID='+JSON.stringify(liff)+';\nwindow.V2_QA_ENDPOINT='+JSON.stringify(endpoint)+';\nfor(const id of ["confirmed","writeConsent"]){document.getElementById(id).checked=true;}\n';
 const review=read('review-entry.js').replace('https://liff.line.me/2012136707-CgGNZAuq/candidate/','https://liff.line.me/'+liff).replace('/^QA_','/^V2_');
 return {'index.html':html,'app.js':app,'config.js':config,'review-entry.js':review};
}
if(require.main===module){const files=build(process.argv[2],process.argv[3]),dir=path.join(__dirname,'staff-client');fs.mkdirSync(dir,{recursive:true});for(const [n,s]of Object.entries(files))fs.writeFileSync(path.join(dir,n),s,'utf8');console.log('Built staff release client; not published');}
module.exports={build};

