/** Admin-only real Google persistence test. Synthetic identity/calendar/GPS.
 * No doGet/doPost, UrlFetch, LINE delivery, trigger, formal IDs or data deletion.
 */
var V2_MULTI_QA_TITLE_='YC_ATTENDANCE_V2_MULTIUSER_QA_ONLY';
var V2_MULTI_NORMAL_HEAD_=['REQUEST_ID','ROW_JSON','UTC_TIME'];
function v2MultiQaBook_(){
 var p=PropertiesService.getScriptProperties(),id=p.getProperty('V2_MULTIUSER_QA_BOOK_ID');
 if(!id||id===p.getProperty('V2_BATCH_QA_BOOK_ID')||id===p.getProperty('V2_BATCH_QA_SOURCE_BOOK_ID'))throw Error('MULTI_QA_BOOK_NOT_ISOLATED');
 if(p.getProperty('V2_BATCH_QA_WRITE_ENABLED')!=='disabled'||p.getProperty('V2_QA_NOTIFY_ENABLED')==='enabled')throw Error('PHONE_QA_MUST_REMAIN_READONLY');
 var book=SpreadsheetApp.openById(id);if(book.getName()!==V2_MULTI_QA_TITLE_)throw Error('MULTI_QA_BOOK_TITLE_INVALID');
 return book;
}
function v2MultiQaAssert_(condition,label){if(!condition)throw Error('FAIL_'+label);}
function v2MultiQaSheet_(book,name,headers){
 var sh=book.getSheetByName(name);if(!sh||sh.getLastColumn()!==headers.length||JSON.stringify(sh.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error('MULTI_QA_SCHEMA_INVALID');return sh;
}
function v2MultiQaLock_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('MULTI_QA_BUSY');try{return fn();}finally{lock.releaseLock();}}
function desktopMultiUserQaInitialize(){
 var p=PropertiesService.getScriptProperties();if(p.getProperty('V2_MULTIUSER_QA_ENABLED')==='enabled')throw Error('MULTI_QA_SETUP_REQUIRES_DISABLED');
 var book=v2MultiQaBook_();
 var staff='U'+'1'.repeat(32),boss='U'+'3'.repeat(32);
 var definitions=[['員工資料',V2ProductionTables.HEADERS.employees,[['TEST001','純合成員工','',staff,'TEST_CO','','在職','TESTSITE']]],
  ['上班地點_候選文字',V2ProductionTables.HEADERS.sites,[['TESTSITE','純合成場地','TEST_CO','25.000000,121.000000',50]]],
  ['審核通知名單',V2ProductionTables.HEADERS.assignments,[['TEST001','純合成員工',boss,'',boss]]],
  ['候選交易流水',V2ProductionJournal.HEADERS,[]],['候選正常打卡',V2_MULTI_NORMAL_HEAD_,[]]];
 return v2MultiQaLock_(function(){
  definitions.forEach(function(item){
   var sh=book.getSheetByName(item[0]);
   if(!sh){sh=book.insertSheet(item[0]);sh.getRange(1,1,1,item[1].length).setValues([item[1]]);SpreadsheetApp.flush();}
   v2MultiQaSheet_(book,item[0],item[1]);
   if(item[2].length){
    if(sh.getLastRow()===1){
     if(item[0]==='上班地點_候選文字')sh.getRange(2,4,item[2].length,1).setNumberFormat('@');
     sh.getRange(2,1,item[2].length,item[1].length).setValues(item[2]);SpreadsheetApp.flush();
    }
    if(sh.getLastRow()!==item[2].length+1||JSON.stringify(sh.getRange(2,1,item[2].length,item[1].length).getValues())!==JSON.stringify(item[2]))throw Error('MULTI_QA_FIXTURE_CHANGED');
   }
  });
  console.log('MULTI_QA_INITIALIZED_TEST001_ONLY_NO_MESSAGES');return {initialized:true,cloudEmployees:1,messagesSent:0};
 });
}
function v2MultiQaTables_(book){
 var raw={};[['employees','員工資料'],['sites','上班地點_候選文字'],['assignments','審核通知名單']].forEach(function(pair){raw[pair[0]]=v2MultiQaSheet_(book,pair[1],V2ProductionTables.HEADERS[pair[0]]).getDataRange().getValues();});
 if(raw.employees.length!==2||raw.employees[1][0]!=='TEST001'||raw.employees[1][4]!=='TEST_CO'||raw.sites.length!==2||raw.assignments.length!==2)throw Error('MULTI_QA_CLOUD_SCOPE_INVALID');
 // Other identities exist in memory only, never in cloud employee or journal rows.
 raw.employees.push(['SYN_OTHER','記憶體合成人員','','U'+'2'.repeat(32),'SYN_OTHER_CO','','在職','TESTSITE']);
 return V2ProductionTables.parse(raw,{externalReviewers:[{reviewerId:'QA_HR_TEST',lineSub:'U'+'3'.repeat(32),active:true}]});
}
function v2MultiQaJournal_(book){
 var sh=v2MultiQaSheet_(book,'候選交易流水',V2ProductionJournal.HEADERS),locked=false;
 function check(row){if(row.employeeId!=='TEST001'||row.company!=='TEST_CO')throw Error('MULTI_QA_WRITE_SCOPE_DENIED');}
 return V2ProductionJournal.make({
  withExclusive:function(fn){return v2MultiQaLock_(function(){locked=true;try{return fn();}finally{locked=false;}});},
  readRows:function(){var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];V2ProductionJournal.decode(rows).latest.forEach(check);return rows;},
  appendRow:function(row){if(!locked)throw Error('MULTI_QA_LOCK_REQUIRED');check(JSON.parse(row[3]));if(PropertiesService.getScriptProperties().getProperty('V2_MULTIUSER_QA_ENABLED')!=='enabled')throw Error('MULTI_QA_WRITE_DISABLED');sh.getRange(sh.getLastRow()+1,1,1,8).setValues([row]);SpreadsheetApp.flush();},
  utcNow:function(){return new Date().toISOString();}});
}
function v2MultiQaNormal_(book,loseReply){
 var sh=v2MultiQaSheet_(book,'候選正常打卡',V2_MULTI_NORMAL_HEAD_);
 function read(){return sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var row=JSON.parse(r[1]);if(row.requestId!==r[0]||row.employeeId!=='TEST001'||row.company!=='TEST_CO'||row.kind!=='CLOCK'||row.source!=='GPS')throw Error('MULTI_QA_NORMAL_SCOPE_INVALID');return row;}):[];}
 function run(write,fn){return v2MultiQaLock_(function(){return fn({list:read,create:function(row){
  if(!write||PropertiesService.getScriptProperties().getProperty('V2_MULTIUSER_QA_ENABLED')!=='enabled')throw Error('MULTI_QA_WRITE_DISABLED');
  if(row.employeeId!=='TEST001'||row.company!=='TEST_CO'||row.kind!=='CLOCK'||row.source!=='GPS')throw Error('MULTI_QA_WRITE_SCOPE_DENIED');
  if(read().some(function(x){return x.requestId===row.requestId;}))throw Error('MULTI_QA_DUPLICATE');
  sh.getRange(sh.getLastRow()+1,1,1,3).setValues([[row.requestId,JSON.stringify(row),new Date().toISOString()]]);SpreadsheetApp.flush();
  if(!read().some(function(x){return x.requestId===row.requestId;}))throw Error('MULTI_QA_READBACK_UNCONFIRMED');
  if(loseReply){loseReply=false;throw Error('SYNTHETIC_REPLY_LOSS_AFTER_REAL_APPEND');}
 }});});}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
function desktopMultiUserQaPersistenceTest(){
 var p=PropertiesService.getScriptProperties(),book=v2MultiQaBook_(),passed=[];
 function verify(token){if(['staff','other','boss'].indexOf(token)<0)throw Error('SYNTHETIC_AUTH_FAILED');return {source:'VERIFIED_LINE_ID_TOKEN',sub:'U'+({staff:'1',other:'2',boss:'3'}[token]).repeat(32)};}
 function check(ok,label){v2MultiQaAssert_(ok,label);passed.push(label);}
 var flags={};V2ProductionCore.OPERATIONS.forEach(function(op){flags[op]=true;});
 var ledger=v2MultiQaJournal_(book),service=V2ProductionAccess.create({verifyLine:verify,loadBindings:function(){return v2MultiQaTables_(book).bindings;},store:ledger,
  calendar:{validateLeave:function(){return {ok:true,workingDays:1};}},clock:{today:function(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');}},flags:flags});
 function call(operation,payload,credential){return service.handle({operation:operation,payload:payload,credential:credential||'staff'});}
 var leaveId='QA_MULTIUSER_CLOUD_LEAVE_20261104',missId='QA_MULTIUSER_CLOUD_MISSING_20261104',clockId='QA_MULTIUSER_CLOUD_CLOCK_20261104';
 p.setProperty('V2_MULTIUSER_QA_ENABLED','enabled');
 try{
  var existing=call('LEAVE_STATUS',{requestId:leaveId});
  if(!existing.ok){check(existing.code==='NOT_FOUND','LEAVE_ORIGINAL_CHECK_'+existing.code);check(call('LEAVE_REQUEST',{requestId:leaveId,leaveType:'事假',startDate:'2026-11-05',endDate:'2026-11-05',unit:'DAY',reason:'TEST001 synthetic real Sheets persistence only'}).ok,'LEAVE_PERSISTED');}
  check(call('LEAVE_STATUS',{requestId:leaveId},'other').code==='NOT_FOUND','OTHER_IDENTITY_CANNOT_READ_LEAVE');
  check(call('HR_STATUS',{requestId:leaveId},'staff').code==='HR_ONLY','STAFF_CANNOT_QUERY_REVIEW');
  var review=call('HR_STATUS',{requestId:leaveId},'boss');check(review.ok,'ASSIGNED_BOSS_CAN_QUERY');
  if(review.request.status==='PENDING')check(call('HR_REVIEW',{requestId:leaveId,decision:'APPROVE'},'boss').ok,'LEAVE_APPROVED');
  var before=book.getSheetByName('候選交易流水').getLastRow();
  check(call('HR_REVIEW',{requestId:leaveId,decision:'APPROVE'},'boss').duplicate===true,'DUPLICATE_APPROVAL_ORIGINAL');
  check(book.getSheetByName('候選交易流水').getLastRow()===before,'DUPLICATE_APPROVAL_NO_APPEND');
  check(call('HR_REVIEW',{requestId:leaveId,decision:'REJECT'},'boss').code==='REVIEW_CONFLICT','OPPOSITE_REVIEW_REJECTED');
  existing=call('MISSING_STATUS',{requestId:missId});
  if(!existing.ok){check(existing.code==='NOT_FOUND','MISSING_ORIGINAL_CHECK');check(call('MISSING_REQUEST',{requestId:missId,date:'2026-11-04',type:'下班',time:'17:31',reason:'TEST001 synthetic missed application only'}).ok,'MISSING_PERSISTED');}
  review=call('HR_STATUS',{requestId:missId},'boss');if(review.request.status==='PENDING')check(call('HR_REVIEW',{requestId:missId,decision:'REJECT'},'boss').ok,'MISSING_REJECTED');
  check(call('MISSING_STATUS',{requestId:missId},'other').code==='NOT_FOUND','OTHER_IDENTITY_CANNOT_READ_MISSING');
  var now=new Date(),stamp={epochMs:now.getTime(),date:Utilities.formatDate(now,'Asia/Taipei','yyyy-MM-dd'),time:Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss'),utc:now.toISOString()};
  var normal=v2MultiQaNormal_(book,true),clockService=V2ProductionClock.create({verifyLine:verify,loadTables:function(){return v2MultiQaTables_(book);},normalStore:normal,clock:{now:function(){return stamp;}},flags:{GPS_CLOCK:true,GPS_STATUS:true,MY_CLOCKS:true}});
  function gps(op,args,credential){return clockService.handle({operation:op,args:args,credential:credential||'staff'});}
  var status=gps('GPS_STATUS',{requestId:clockId,type:'上班'});
  var clockInput={requestId:clockId,type:'上班',lat:25,lng:121,accuracy:10,capturedAt:stamp.epochMs};
  if(!status.ok){check(status.code==='NOT_FOUND','CLOCK_ORIGINAL_CHECK');var unknown=gps('GPS_CLOCK',clockInput);check(unknown.code==='UNKNOWN'&&unknown.persisted===null,'REAL_APPEND_SYNTHETIC_REPLY_LOSS');}
  check(gps('GPS_STATUS',{requestId:clockId,type:'上班'}).ok,'CLOCK_ORIGINAL_RECOVERED');
  check(gps('GPS_STATUS',{requestId:clockId,type:'上班'},'other').code==='NOT_FOUND','OTHER_IDENTITY_CANNOT_READ_CLOCK');
  before=book.getSheetByName('候選正常打卡').getLastRow();check(gps('GPS_CLOCK',clockInput).duplicate===true,'CLOCK_CONFIRMED_ORIGINAL_REPLAY');
  check(book.getSheetByName('候選正常打卡').getLastRow()===before,'CLOCK_REPLAY_NO_APPEND');
  var state=V2ProductionJournal.decode(book.getSheetByName('候選交易流水').getRange(2,1,book.getSheetByName('候選交易流水').getLastRow()-1,8).getValues());
  check(state.entries===4&&state.latest.size===2,'EXACT_TWO_ORIGINALS_FOUR_EVENTS');
  check(book.getSheetByName('候選正常打卡').getLastRow()===2,'EXACT_ONE_NORMAL_PUNCH');
  var result={passed:passed.length,checks:passed,cloudEmployee:'TEST001',cloudCompany:'TEST_CO',journalEntries:state.entries,applications:state.latest.size,normalPunches:1,
   actualGooglePersistence:true,actualLineAuthentication:false,actualDeviceGPS:false,calendarSynthetic:true,replyLossSynthetic:true,messagesSent:0,publicRouteAdded:false};
  console.log(JSON.stringify(result));return result;
 }finally{p.setProperty('V2_MULTIUSER_QA_ENABLED','disabled');console.log('MULTI_QA_DISABLED_PHONE_QA_UNCHANGED');}
}

