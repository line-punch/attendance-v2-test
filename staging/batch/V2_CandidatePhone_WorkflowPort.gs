/** Candidate workflow phone port. All functions private to server bridge.
 * TEST001-only, separate write gate; no public admin functions or triggers.
 */
function v2CandidatePhoneWriteAllowed_(){
 var p=PropertiesService.getScriptProperties();
 return p.getProperty('V2_CANDIDATE_PHONE_ENABLED')==='enabled'&&p.getProperty('V2_CANDIDATE_PHONE_WRITE_ENABLED')==='enabled'&&
  p.getProperty('V2_MULTIUSER_QA_ENABLED')!=='enabled'&&p.getProperty('V2_BATCH_QA_WRITE_ENABLED')==='disabled'&&p.getProperty('V2_QA_NOTIFY_ENABLED')!=='enabled';
}
function v2CandidatePhoneBook_(){
 var p=PropertiesService.getScriptProperties(),id=p.getProperty('V2_MULTIUSER_QA_BOOK_ID');
 if(!id||id===p.getProperty('V2_BATCH_QA_BOOK_ID')||id===p.getProperty('V2_BATCH_QA_SOURCE_BOOK_ID'))throw Error('CANDIDATE_SCOPE_INVALID');
 var book=SpreadsheetApp.openById(id);if(book.getName()!=='YC_ATTENDANCE_V2_MULTIUSER_QA_ONLY')throw Error('CANDIDATE_SCOPE_INVALID');return book;
}
function v2CandidatePhoneSheet_(book,name,headers){
 var sheet=book.getSheetByName(name);if(!sheet||sheet.getLastColumn()!==headers.length||JSON.stringify(sheet.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error('CANDIDATE_SCHEMA_INVALID');return sheet;
}
function v2CandidatePhoneLock_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('CANDIDATE_BUSY');try{return fn();}finally{lock.releaseLock();}}
function v2CandidatePhoneData_(config,book){
 config=v2BatchQASettings_(); // Re-read private role settings for each snapshot.
 var raw={};[['employees','員工資料'],['sites','上班地點_候選文字'],['assignments','審核通知名單']].forEach(function(pair){raw[pair[0]]=v2CandidatePhoneSheet_(book,pair[1],V2ProductionTables.HEADERS[pair[0]]).getDataRange().getValues();});
 if(raw.employees.length!==2||raw.employees[1][0]!=='TEST001'||raw.employees[1][4]!=='TEST_CO'||raw.sites.length!==2||raw.assignments.length!==2||raw.assignments[1][0]!=='TEST001')throw Error('CANDIDATE_SCOPE_INVALID');
 var source=SpreadsheetApp.openById(config.sourceId);
 if(source.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY')throw Error('CANDIDATE_SOURCE_INVALID');
 var staff=source.getSheetByName('員工資料');if(!staff||staff.getLastRow()!==2)throw Error('CANDIDATE_ROSTER_INVALID');
 var employee=staff.getRange(2,1,1,8).getValues()[0];
 if(employee[0]!=='TEST001'||employee[4]!=='TEST_CO'||employee[6]!=='在職'||employee[7]!=='TESTSITE'||!/^U[0-9a-f]{32}$/i.test(String(employee[3]||''))||!config.owner||config.owner===employee[3])throw Error('CANDIDATE_ROSTER_INVALID');
 // Bind actual verified QA accounts in memory. Do not rewrite synthetic rows
 // with private LINE subs, and do not accept identity fields from the phone.
 raw.employees[1]=raw.employees[1].slice();raw.employees[1][3]=String(employee[3]);
 raw.assignments[1]=raw.assignments[1].slice();raw.assignments[1][2]=config.owner;raw.assignments[1][3]='';raw.assignments[1][4]=config.owner;
 return V2ProductionTables.parse(raw,{externalReviewers:[{reviewerId:'QA_HR_TEST',lineSub:config.owner,active:true}]});
}
function v2CandidatePhoneJournal_(book){
 var sh=v2CandidatePhoneSheet_(book,'候選交易流水',V2ProductionJournal.HEADERS);
 var locked=false;
 return V2ProductionJournal.make({withExclusive:function(fn){return v2CandidatePhoneLock_(function(){locked=true;try{return fn();}finally{locked=false;}});},
  readRows:function(){var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];V2ProductionJournal.decode(rows).latest.forEach(function(row){if(row.employeeId!=='TEST001'||row.company!=='TEST_CO')throw Error('CANDIDATE_SCOPE_INVALID');});return rows;},
  appendRow:function(row){
   if(!locked||!v2CandidatePhoneWriteAllowed_())throw Error('CANDIDATE_WRITE_DISABLED');
   if(!Array.isArray(row)||row.length!==8||!/^QA_[A-Za-z0-9_-]{8,76}$/.test(row[1]||''))throw Error('CANDIDATE_ROW_INVALID');
   var original=JSON.parse(row[3]);if(original.requestId!==row[1]||original.employeeId!=='TEST001'||original.company!=='TEST_CO'||row.some(function(v){return String(v).length>30000;})||sh.getLastRow()>=10001)throw Error('CANDIDATE_SCOPE_INVALID');
   sh.getRange(sh.getLastRow()+1,1,1,8).setValues([row]);SpreadsheetApp.flush();
  },utcNow:function(){return new Date().toISOString();}});
}
function v2CandidatePhoneNormal_(book){
 var sh=v2CandidatePhoneSheet_(book,'候選正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 function read(){return sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var row=JSON.parse(r[1]);if(row.requestId!==r[0]||row.employeeId!=='TEST001'||row.company!=='TEST_CO'||row.kind!=='CLOCK'||row.source!=='GPS')throw Error('CANDIDATE_SCOPE_INVALID');return row;}):[];}
 function run(write,fn){return v2CandidatePhoneLock_(function(){return fn({list:read,create:function(row){
  if(!write||!v2CandidatePhoneWriteAllowed_())throw Error('CANDIDATE_WRITE_DISABLED');
  if(row.employeeId!=='TEST001'||row.company!=='TEST_CO'||row.kind!=='CLOCK'||row.source!=='GPS'||!/^QA_[A-Za-z0-9_-]{8,76}$/.test(row.requestId||'')||sh.getLastRow()>=10001)throw Error('CANDIDATE_SCOPE_INVALID');
  if(read().some(function(r){return r.requestId===row.requestId;}))throw Error('CANDIDATE_DUPLICATE');
  sh.getRange(sh.getLastRow()+1,1,1,3).setValues([[row.requestId,JSON.stringify(row),new Date().toISOString()]]);SpreadsheetApp.flush();
  if(!read().some(function(r){return r.requestId===row.requestId;}))throw Error('CANDIDATE_READBACK_UNCONFIRMED');
 }});});}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
function v2CandidatePhoneLiveSites_(config,data){
 var source=SpreadsheetApp.openById(config.sourceId);if(source.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY')throw Error('CANDIDATE_SOURCE_INVALID');
 var sheet=v2CandidatePhoneSheet_(source,'上班地點',V2ProductionTables.HEADERS.sites),rows=sheet.getDataRange().getValues().slice(1).filter(function(r){return String(r[0])==='TESTSITE';});
 if(rows.length!==1||Number(rows[0][4])!==50)throw Error('CANDIDATE_SITE_INVALID');
 var text=String(rows[0][3]).replace(/^\(/,'').replace(/\)$/,'').split(','),lat=Number(text[0]),lng=Number(text[1]);
 if(text.length!==2||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||lat===0&&lng===0)throw Error('CANDIDATE_SITE_INVALID');
 // Coordinates remain in server memory; normal rows store distance, not lat/lng.
 data.sites=[{code:'TESTSITE',name:String(rows[0][1]||'測試場地'),company:'TEST_CO',lat:lat,lng:lng,radius:50,configuredRadius:50}];return data;
}
function v2CandidatePhoneHandle_(params){
 var nonce=String(params&&params.nonce||''),bridge='YC_V2_BATCH_QA_V1';
 function fail(code,reason,persisted){return {bridge:bridge,nonce:/^[0-9a-f]{40}$/.test(nonce)?nonce:'',ok:false,code:code,reason:reason||'',persisted:persisted};}
 try{
  var p=PropertiesService.getScriptProperties();if(p.getProperty('V2_CANDIDATE_PHONE_ENABLED')!=='enabled')return fail('DISABLED','',false);
  if(!params||params.candidateRoute!=='v1'||Object.keys(params).some(function(k){return ['nonce','operation','payload','candidateRoute'].indexOf(k)<0;}))return fail('REJECTED','',false);
  var request=v2BatchQAParse_({nonce:params.nonce,operation:params.operation,payload:params.payload});
  var write=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(request.operation)>=0,writeAllowed=v2CandidatePhoneWriteAllowed_();
  if(write&&!writeAllowed)return fail('DISABLED','',false);
  var config=v2BatchQASettings_(),book=v2CandidatePhoneBook_();
  function verify(token){
   var sub=v2BatchQALineClaims_(token),data=v2CandidatePhoneData_(config,book);
   if(sub===data.bindings.employees[0].lineSub||data.bindings.reviewers.some(function(r){return r.active&&r.lineSub===sub;}))return {source:'VERIFIED_LINE_ID_TOKEN',sub:sub};
   throw Error('CANDIDATE_AUTH_REQUIRED');
  }
  var flags={};V2_BATCH_QA_OPS_.forEach(function(op){flags[op]=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(op)<0||writeAllowed;});
  var now=new Date(),result;
  if(['GPS_CLOCK','GPS_STATUS','MY_CLOCKS'].indexOf(request.operation)>=0){
   result=V2ProductionClock.create({verifyLine:verify,loadTables:function(){var data=v2CandidatePhoneData_(config,book);return request.operation==='GPS_CLOCK'?v2CandidatePhoneLiveSites_(config,data):data;},normalStore:v2CandidatePhoneNormal_(book),
    clock:{now:function(){return {epochMs:now.getTime(),date:Utilities.formatDate(now,'Asia/Taipei','yyyy-MM-dd'),time:Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss'),utc:now.toISOString()};}},flags:flags}).handle({operation:request.operation,args:request.args,credential:request.token});
  }else{
   result=V2ProductionAccess.create({verifyLine:verify,loadBindings:function(){return v2CandidatePhoneData_(config,book).bindings;},store:v2CandidatePhoneJournal_(book),calendar:v2BatchCalendarQA_(),
    clock:{today:function(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');}},flags:flags}).handle({operation:request.operation,payload:request.args,credential:request.token});
  }
  if(result&&result.ok===true){
   if(write&&request.operation!=='GPS_CLOCK'){
    try{result.notification=v2CandidateNotifyOriginal_(request.args.requestId).status;}
    catch(_){result.notification='PENDING';}
   }
   return {bridge:bridge,nonce:nonce,ok:true,result:result};
  }
  if(result&&result.code==='UNKNOWN')return fail('UNKNOWN','',null);
  return fail(result&&['AUTH_REQUIRED','HR_ONLY'].indexOf(result.code)>=0?'AUTH':'REJECTED',result&&['NOT_FOUND','REQUEST_ID_CONFLICT','ALREADY_CLOCKED','OUT_OF_RANGE','GPS_ACCURACY','GPS_EXPIRED','GPS_INVALID','NON_WORKDAY_IN_RANGE','CALENDAR_OR_EVENT_REVIEW_REQUIRED','LEAVE_HOURS_INVALID','LEAVE_DATES_INVALID','SAME_MINUTE'].indexOf(result.code)>=0?result.code:'',false);
 }catch(_){return fail('UNKNOWN','',null);}
}
