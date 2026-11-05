"use strict";
const fs=require('node:fs'),path=require('node:path');
function build(endpoint,liff){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint||'')||!/^2009482137-[A-Za-z0-9]+$/.test(liff||'')||liff==='2009482137-QgqJEHgA')throw Error('NEW_STAFF_ENDPOINT_AND_LIFF_REQUIRED');
 const read=n=>fs.readFileSync(path.join(__dirname,'qa-candidate-workflow-client',n),'utf8');
 let app=read('app.js').replaceAll('YC_V2_BATCH_QA_V1','YC_V2_STAFF_V1').replaceAll('v2_candidate_phone_','yc_staff_v2_').replaceAll('candidateRoute:"v1"','candidateRoute:"staff-v1"').replaceAll('"QA_"','"V2_"').replaceAll('"QA_GPS_"','"V2_GPS_"');
 app=app.replaceAll('TEST001 LINE','LINE').replaceAll('TEST001 綁定','員工綁定').replaceAll('LINE 測試帳號','LINE 帳號').replaceAll('（獨立 QA）','').replaceAll('QA 回覆：','系統回覆：').replaceAll('QA 寫入尚未開放','目前尚未開放寫入').replaceAll('獨立 QA 的','系統的').replaceAll('主管審核（獨立 QA）','主管審核');
 let html=read('index.html').replaceAll('20261104candidateflow1','20261105staff1').replace('<title>TEST001｜候選整合驗收</title>','<title>YC/YT員工系統</title>').replace('員工打卡｜候選整合驗收','YC/YT員工系統');
 html=html.replace('<strong>TEST001 候選合成副本：集中整合驗收專用。</strong>非正式出勤；僅在管理者開啟本次測試窗口後送件或審核。','<strong>上下班打卡、請假與補打卡。</strong>請假及補打卡不限地點；人資結算仍由公司線下辦理。');
 html=html.replace('確認 TEST001 LINE 登入','確認 LINE 登入').replace('新增一筆測試申請','新增申請').replace('請假日期預檢（唯讀）','檢查請假日期').replace('QA 技術檢查（非員工功能）','主管審核').replace('人資待審核（需測試人資身分）','我的待審核申請').replace('查原審核單（唯讀，需測試人資身分）','查詢審核單').replace('人資核准（測試）','確認核准').replace('人資駁回（測試）','確認駁回').replace('詳細執行回覆（QA）','詳細處理結果');
 // Internal connection controls remain in DOM for the proven request flow,
 // but are configured by the release, never presented as staff decisions.
 html=html.replace('</style>','details:has(#endpoint),label:has(#confirmed),label:has(#writeConsent),section:has(>label>#writeConsent)>p{display:none}#reviewPanel:not([open]){display:none}</style>');
 const config='/* Public release identifiers only. No staff roster or tokens. */\nwindow.V2_QA_LIFF_ID='+JSON.stringify(liff)+';\nwindow.V2_QA_ENDPOINT='+JSON.stringify(endpoint)+';\nfor(const id of ["confirmed","writeConsent"]){document.getElementById(id).checked=true;}\n';
 const review=read('review-entry.js').replace('https://liff.line.me/2012136707-CgGNZAuq/candidate/','https://liff.line.me/'+liff).replace('/^QA_','/^V2_');
 return {'index.html':html,'app.js':app,'config.js':config,'review-entry.js':review};
}
if(require.main===module){const files=build(process.argv[2],process.argv[3]),dir=path.join(__dirname,'staff-client');fs.mkdirSync(dir,{recursive:true});for(const [n,s]of Object.entries(files))fs.writeFileSync(path.join(dir,n),s,'utf8');console.log('Built staff release client; not published');}
module.exports={build};

