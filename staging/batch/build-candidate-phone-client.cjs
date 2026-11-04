"use strict";
const fs=require('node:fs'),path=require('node:path');
function build(endpoint){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(endpoint))throw Error('CANDIDATE_ENDPOINT_INVALID');
 const read=name=>fs.readFileSync(path.join(__dirname,'qa-client',name),'utf8');
 if(read('config.js').includes(JSON.stringify(endpoint)))throw Error('MUST_USE_DISTINCT_CANDIDATE_DEPLOYMENT');
 let app=read('app.js').replaceAll('v2_batch_qa_','v2_candidate_phone_');
 const params='const params={nonce:n,operation:op,payload:JSON.stringify({idToken,args})};';
 if(!app.includes(params))throw Error('CLIENT_POST_CONTRACT_CHANGED');
 app=app.replace(params,'const params={nonce:n,operation:op,payload:JSON.stringify({idToken,args}),candidateRoute:"v1"};');
 if(!app.includes('liff.login();'))throw Error('CLIENT_LOGIN_CONTRACT_CHANGED');
 app=app.replace('liff.login();','liff.login({redirectUri:window.location.href});');
 const execute='async function execute(op,{write=false,decision=null}={}){';
 if(!app.includes(execute))throw Error('CLIENT_EXECUTE_CONTRACT_CHANGED');
 app=app.replace(execute,execute+'\n if(write){status("候選版目前只開放登入與查詢，尚未開放送件或審核。","error");return;}');
 const html=read('index.html').replaceAll('20261104l','20261104candidate2').replace('<title>TEST001｜員工打卡 QA</title>','<title>TEST001｜候選版唯讀驗收</title>')
 .replace('員工打卡｜獨立 QA','員工打卡｜候選版唯讀驗收')
 .replace('<strong>獨立 QA 測試頁，TEST001 專用。</strong>資料不計入正式出勤。','<strong>TEST001 候選合成副本：目前僅測試登入與查詢。</strong>畫面顯示管理者合成資料，非實際出勤；送件、審核及通知均未開放。');
 const config='/* Dedicated candidate endpoint. Public IDs only; no credentials. */\nwindow.V2_QA_LIFF_ID="2012136707-CgGNZAuq";\nwindow.V2_QA_ENDPOINT='+JSON.stringify(endpoint)+';\n'+
 '(function(){for(const id of ["clockIn","clockOut","submitLeave","submitMissing","hrApprove","hrReject","newId","newLeave","newMissing"]){const b=document.getElementById(id);if(b){b.disabled=true;b.dataset.unavailable="true";}}const c=document.getElementById("writeConsent");if(c){c.disabled=true;c.checked=false;}})();\n';
 return {'index.html':html,'app.js':app,'config.js':config,'review-entry.js':read('review-entry.js').replace('https://liff.line.me/2012136707-CgGNZAuq"','https://liff.line.me/2012136707-CgGNZAuq/candidate/"')};
}
if(require.main===module){const files=build(process.argv[2]||'');const folder=path.join(__dirname,'qa-candidate-client');fs.mkdirSync(folder,{recursive:true});for(const [name,data]of Object.entries(files))fs.writeFileSync(path.join(folder,name),data,'utf8');console.log('Built distinct candidate read-only client; original QA client unchanged');}
module.exports={build};

