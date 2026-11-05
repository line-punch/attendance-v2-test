"use strict";
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture:google}=require('./V2_ProductionQA_Runtime.test.js');
const code=fs.readFileSync(__dirname+'/V2_StaffLive_Runtime_GENERATED.gs','utf8');
const sub=n=>'U'+String(n).repeat(32),token=n=>String(n).repeat(33)+'.synthetic.signature';
function fixture(){
 const f=google();f.setTitle('YC_ATTENDANCE_V2_STAFF_LIVE');
 Object.assign(f.props,{STAFF_SOURCE_BOOK_ID:'SYN_SOURCE',STAFF_DATA_BOOK_ID:'SYN_DATA',STAFF_CHANNEL_ID:'2009482137',STAFF_ENABLED:'enabled',STAFF_WRITE_ENABLED:'disabled',STAFF_NOTIFY_ENABLED:'disabled',STAFF_START_UTC:'2026-01-01T00:00:00Z',STAFF_LEGACY_CUTOVER_CONFIRMED:'no',STAFF_LIFF_URL:'https://liff.line.me/2009482137-Synthetic',STAFF_BOT_BASIC_ID:'@090opuod',STAFF_BOT_TOKEN:'SYNTHETIC_NO_REAL_CREDENTIAL'});
 vm.runInContext(code,f.context);
 function sheet(name,rows){const s=f.book.insertSheet(name);s.getRange(1,1,rows.length,rows[0].length).setValues(rows);return s;}
 const employees=sheet('員工資料',[['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點'],['SYN_A','合成員工甲','',sub(1),'合成甲公司','','在職','SITE_A'],['SYN_B','合成員工乙','',sub(2),'合成乙公司','','在職','SITE_B'],['SYN_M','合成主管','',sub(3),'合成甲公司','','在職','SITE_A']]);
 sheet('審核通知名單',[['員工ID','員工姓名','通知主管1（userId）','通知主管2（userId）','審核主管（userId)'],['SYN_A','合成員工甲',sub(3),'',sub(3)],['SYN_B','合成員工乙','','',sub(3)]]);
 sheet('上班地點',[['地點代碼','地點名稱','公司','GPS中心點','容許距離'],['SITE_A','合成地點甲','合成甲公司','25,121',50],['SITE_B','合成地點乙','合成乙公司','24,120',50]]);
 const ledger=sheet('V2_申請流水',[Array.from(f.context.V2StaffJournal.HEADERS)]),normal=sheet('V2_正常打卡',[['REQUEST_ID','ROW_JSON','UTC_TIME']]),notice=sheet('V2_通知流水',[['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']]);
 const source={getName:()=> 'LINE打卡系統',getSheetByName:n=>f.sheets.get(n)};
 f.context.SpreadsheetApp.openById=id=>{if(id==='SYN_SOURCE')return source;if(id==='SYN_DATA')return f.book;throw Error('Unexpected book');};
 let pushes=[],mode='ok',uuid=0;
 f.context.Utilities.getUuid=()=> '00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0');
 f.context.UrlFetchApp={fetch:(url,o)=>{
  if(url.endsWith('/verify')){assert.equal(o.payload.client_id,'2009482137');const n=[1,2,3,4].find(n=>token(n)===o.payload.id_token);return {getResponseCode:()=>n?200:401,getContentText:()=>JSON.stringify({iss:'https://access.line.me',aud:'2009482137',sub:sub(n),exp:Date.now()/1000+600,iat:Date.now()/1000-10})};}
  if(url.endsWith('/info'))return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({basicId:'@090opuod'})};
  if(url.endsWith('/push')){pushes.push(JSON.parse(o.payload));if(mode==='unknown')throw Error('SYNTHETIC_LOSS');return {getResponseCode:()=>200,getAllHeaders:()=>({'X-Line-Request-Id':'SYN_'+pushes.length})};}throw Error('Unexpected fetch');
 }};
 function call(op,args={},who=1,extra={}){return f.context.staffHandle_({nonce:'f'.repeat(40),operation:op,candidateRoute:'staff-v1',payload:JSON.stringify({idToken:token(who),args}),...extra});}
 function enable(notify=false){f.props.STAFF_WRITE_ENABLED='enabled';f.props.STAFF_LEGACY_CUTOVER_CONFIRMED='yes';f.props.STAFF_NOTIFY_ENABLED=notify?'enabled':'disabled';}
 const leave=id=>({requestId:id,leaveType:'事假',startDate:'2026-11-06',endDate:'2026-11-08',unit:'DAY',reason:'合成範圍，線下結算'});
 return {...f,call,enable,leave,ledger,normal,notice,employees,pushes,setMode:v=>{mode=v;}};
}
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
test('standalone release contains no QA admin init, old phone route or automatic triggers',()=>{assert.ok(!/function\s+(desktop|prepare)|ScriptApp\.newTrigger|v2BatchQASettings_/.test(code));});
test('default write gate and unconfirmed legacy cutover prevent all mutations',()=>{const f=fixture();assert.equal(f.call('LEAVE_REQUEST',f.leave('V2_SYN_LEAVE_001')).code,'DISABLED');f.props.STAFF_WRITE_ENABLED='enabled';assert.equal(f.call('LEAVE_REQUEST',f.leave('V2_SYN_LEAVE_001')).code,'DISABLED');assert.equal(f.ledger.getLastRow(),1);});
test('Chinese company leave persists requested dates without pretending payroll workday calculation',()=>{const f=fixture();f.enable();const id='V2_SYN_LEAVE_001';const r=f.call('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);const row=JSON.parse(f.ledger.getRange(2,4,1,1).getValues()[0][0]);assert.equal(row.company,'合成甲公司');assert.equal(row.body.workingDays,null);assert.equal(row.body.requestedCalendarDays,3);assert.equal(row.body.settlement,'OFFLINE_HR');assert.equal(f.call('LEAVE_REQUEST',f.leave(id)).result.duplicate,true);assert.equal(f.ledger.getLastRow(),2);});
test('cross employee lookup and spoofed scope cannot access or change another original',()=>{const f=fixture();f.enable();const id='V2_SYN_SCOPE_001';f.call('LEAVE_REQUEST',f.leave(id));assert.equal(f.call('LEAVE_STATUS',{requestId:id},2).ok,false);assert.equal(f.call('LEAVE_REQUEST',{...f.leave('V2_SYN_SCOPE_002'),employeeId:'SYN_B'}).ok,false);assert.equal(f.call('MY_LEAVES',{month:'2026-11'},4).code,'AUTH');});
test('official OA notifications use current employee and designated reviewer; approval result sends once',()=>{const f=fixture();f.enable(true);const id='V2_SYN_NOTIFY_001';assert.equal(f.call('LEAVE_REQUEST',f.leave(id)).ok,true);assert.equal(f.pushes.length,2);assert.ok(f.pushes[1].messages[0].contents.footer.contents[0].action.uri.startsWith(f.props.STAFF_LIFF_URL+'?qaReviewId='+id));assert.equal(f.call('HR_REVIEW',{requestId:id,decision:'APPROVE'},3).ok,true);assert.equal(f.pushes.length,3);assert.equal(f.pushes[2].to,sub(1));f.call('HR_REVIEW',{requestId:id,decision:'APPROVE'},3);assert.equal(f.pushes.length,3);assert.equal(f.normal.getLastRow(),1);});
test('unknown push result preserves original and blocks blind outbound retry',()=>{const f=fixture();f.enable(true);f.setMode('unknown');const id='V2_SYN_UNKNOWN_001';const r=f.call('LEAVE_REQUEST',f.leave(id));assert.equal(r.ok,true);assert.equal(r.result.notification,'UNKNOWN');f.setMode('ok');f.call('LEAVE_REQUEST',f.leave(id));assert.equal(f.pushes.length,1);assert.equal(f.ledger.getLastRow(),2);});
test('same original found after physical append response loss; no duplicate replay',()=>{const f=fixture();f.enable();const get=f.ledger.getRange;let once=true;f.ledger.getRange=(...a)=>{const range=get(...a),set=range.setValues;range.setValues=v=>{set(v);if(once){once=false;throw Error('SYN_LOSS');}};return range;};const id='V2_SYN_LOST_WRITE_001';assert.equal(f.call('LEAVE_REQUEST',f.leave(id)).code,'UNKNOWN');assert.equal(f.call('LEAVE_STATUS',{requestId:id}).result.request.status,'PENDING');assert.equal(f.call('LEAVE_REQUEST',f.leave(id)).result.duplicate,true);assert.equal(f.ledger.getLastRow(),2);});
test('GPS staff write uses company site and never creates leave/missing transactions',()=>{const f=fixture();f.enable();const r=f.call('GPS_CLOCK',{requestId:'V2_GPS_SYN_00001',type:'上班',lat:25,lng:121,accuracy:10,capturedAt:Date.now()});assert.equal(r.ok,true);assert.equal(f.normal.getLastRow(),2);assert.equal(f.ledger.getLastRow(),1);assert.equal(f.call('GPS_CLOCK',{requestId:'V2_GPS_SYN_00002',type:'上班',lat:25,lng:121,accuracy:10,capturedAt:Date.now()}).ok,false);assert.equal(f.normal.getLastRow(),2);});
test('source binding deactivation revokes subsequent access and QA route is rejected',()=>{const f=fixture();f.employees.getRange(2,7,1,1).setValues([['離職']]);assert.equal(f.call('MY_LEAVES',{month:'2026-11'}).code,'AUTH');assert.equal(f.call('MY_LEAVES',{month:'2026-11'},1,{candidateRoute:'v1'}).ok,false);});
console.log(passed+'/'+passed+' offline standalone staff release checks; no real LINE, Google or employee writes');

