"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./V2_ProductionQA_Runtime.test.js');
const legacy=fs.readFileSync(path.join(__dirname,'V2_BatchQA_SYNC_FULL_BUNDLE_NOT_DEPLOYED.gs'),'utf8');
const phone=fs.readFileSync(path.join(__dirname,'V2_CandidatePhone_Runtime_GENERATED.gs'),'utf8');
const sub=n=>'U'+String(n).repeat(32),token=n=>String(n).repeat(33)+'.synthetic.signature';
function make(){
 const f=fixture();f.context.desktopMultiUserQaInitialize();f.context.desktopMultiUserQaPersistenceTest();
 Object.assign(f.props,{LINE_LOGIN_CHANNEL_ID:'2012136707',V2_BATCH_QA_ENABLED:'enabled',V2_BATCH_QA_SOURCE_BOOK_ID:'SYN_SOURCE_BOOK_12345678901234567890',V2_BATCH_QA_BOOK_ID:'SYN_PHONE_BOOK_12345678901234567890',V2_BATCH_QA_HR_LINE_SUB:sub(3),V2_CANDIDATE_PHONE_ENABLED:'enabled'});
 let staffSub=sub(4),verifies=0,opens=0;
 const open=f.context.SpreadsheetApp.openById;
 f.context.SpreadsheetApp.openById=id=>{opens++;if(id===f.props.V2_BATCH_QA_SOURCE_BOOK_ID)return {getName:()=> 'YC_ATTENDANCE_V2_TEST_ONLY',getSheetByName:name=>name==='上班地點'?f.sheets.get('上班地點_候選文字'):({getLastRow:()=>2,getRange:()=>({getValues:()=>[['TEST001','synthetic','',staffSub,'TEST_CO','','在職','TESTSITE']]})})};return open(id);};
 f.context.UrlFetchApp={fetch:(url,options)=>{verifies++;assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');assert.equal(options.payload.client_id,'2012136707');const match=[3,4,5].find(n=>options.payload.id_token===token(n));return {getResponseCode:()=>match?200:401,getContentText:()=>JSON.stringify({iss:'https://access.line.me',aud:'2012136707',sub:sub(match),iat:Math.floor(Date.now()/1000)-30,exp:Math.floor(Date.now()/1000)+600})};}};
 f.context.HtmlService={XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}})};
 vm.runInContext(legacy,f.context);vm.runInContext(phone,f.context);
 f.context.v2BatchCalendarQA_=()=>({validateLeave:()=>({ok:true,workingDays:1})});
 function post(operation,args={},who=4,extra={}){
  const params={nonce:'f'.repeat(40),operation,payload:JSON.stringify({idToken:token(who),args}),candidateRoute:'v1',...extra};
  const out=f.context.doPost({parameter:params});assert.equal(typeof out.then,'undefined');
  const m=out.html.match(/window\.top\.postMessage\((\{.*\}),"https:\/\/line-punch\.github\.io"\)/);assert.ok(m);return JSON.parse(m[1]);
 }
 return {...f,post,counts:()=>({verifies,opens,writes:f.writes()}),changeStaff:s=>{staffSub=s;}};
}
if(require.main===module){
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
test('phone runtime contains no public admin initializer and no write or LINE push path',()=>{
 assert.ok(!/function desktopMultiUserQa/.test(phone));assert.ok(!/UrlFetchApp\.fetch|message\/push|setValues\(|setProperty\(/.test(phone));
});
test('disabled candidate rejects before token validation or workbook access',()=>{
 const f=make();f.props.V2_CANDIDATE_PHONE_ENABLED='disabled';const before=f.counts();assert.equal(f.post('MY_LEAVES',{month:'2026-11'}).code,'DISABLED');assert.deepEqual(f.counts(),before);
});
test('actual server verifier contract binds staff without writing private subs into synthetic rows',()=>{
 const f=make(),before=f.writes();const r=f.post('MY_LEAVES',{month:'2026-11'});assert.equal(r.ok,true);assert.equal(r.result.total,1);assert.equal(r.result.requests[0].status,'APPROVED');assert.ok(f.counts().verifies>0);assert.equal(f.writes(),before);
 assert.equal(f.sheets.get('員工資料').getRange(2,4,1,1).getValues()[0][0],sub(1));
});
test('normal and missed monthly data are read from the candidate copy and remain separate',()=>{
 const f=make();assert.equal(f.post('MY_CLOCKS').result.days.length,1);const r=f.post('MY_MISSING',{month:'2026-11'});assert.equal(r.result.total,1);assert.equal(r.result.requests[0].status,'REJECTED');
});
test('designated reviewer can query an original; staff and unrelated LINE identity cannot',()=>{
 const f=make(),args={requestId:'QA_MULTIUSER_CLOUD_LEAVE_20261104'};
 assert.equal(f.post('HR_STATUS',args,3).result.request.status,'APPROVED');assert.equal(f.post('HR_STATUS',args,4).code,'AUTH');assert.equal(f.post('MY_LEAVES',{month:'2026-11'},5).code,'AUTH');
});
test('all candidate writes reject before identity or source access, regardless of old QA flags',()=>{
 const f=make();f.props.V2_BATCH_QA_WRITE_ENABLED='enabled';const before=f.counts();for(const op of ['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'])assert.equal(f.post(op,{}).code,'DISABLED');assert.deepEqual(f.counts(),before);
});
test('unexpected parameters cannot choose a different book, employee or role',()=>{
 const f=make(),before=f.writes();assert.equal(f.post('MY_LEAVES',{month:'2026-11'},4,{bookId:'FORMAL'}).ok,false);assert.equal(f.post('MY_LEAVES',{month:'2026-11',employeeId:'OTHER'}).ok,false);assert.equal(f.writes(),before);
});
test('LINE identity remains its verified subject after a binding changes during the request',()=>{
 const f=make(),original=f.context.v2CandidatePhoneData_;let loads=0;
 f.context.v2CandidatePhoneData_=function(...args){loads++;if(loads===2)f.changeStaff(sub(5));return original(...args);};
 assert.equal(f.post('MY_LEAVES',{month:'2026-11'},4).code,'AUTH');
});
console.log(passed+'/'+passed+' offline candidate phone bridge checks; fake LINE and Sheets only');
}
module.exports={make,sub,token};
