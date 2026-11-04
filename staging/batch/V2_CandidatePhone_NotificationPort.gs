/** Candidate-only original-scoped notification adapter. Gates default off.
 * Reuses already-authorized QA token/recipients privately; never formal webhook.
 */
function v2CandidateNotifyPlan_(book,id){
 if(!/^QA_[A-Za-z0-9_-]{8,76}$/.test(id||''))throw Error('CANDIDATE_ORIGINAL_REQUIRED');
 var config=v2BatchQASettings_(),data=v2CandidatePhoneData_(config,book),policy=V2ProductionAccess.compile(data.bindings);
 var sh=v2CandidatePhoneSheet_(book,'候選交易流水',V2ProductionJournal.HEADERS),state=V2ProductionJournal.decode(sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[]);
 state.latest.forEach(function(row){if(row.employeeId!=='TEST001'||row.company!=='TEST_CO')throw Error('CANDIDATE_SCOPE_INVALID');});
 var row=state.latest.get(id);if(!row)throw Error('CANDIDATE_ORIGINAL_MISSING');
 var recipients=policy.notificationRecipients(row),allowed;
 try{allowed=JSON.parse(PropertiesService.getScriptProperties().getProperty('V2_QA_NOTIFY_TEST_RECIPIENTS')||'null');}catch(_){throw Error('CANDIDATE_RECIPIENTS_INVALID');}
 if(!Array.isArray(allowed)||allowed.length!==2||new Set(allowed).size!==2||allowed.indexOf(recipients.employee)<0||allowed.indexOf(recipients.reviewer)<0||recipients.employee===recipients.reviewer)throw Error('CANDIDATE_RECIPIENTS_INVALID');
 var entries=[];
 state.events.filter(function(event){return event.requestId===id&&(event.type==='REVIEWED'||row.status==='PENDING');}).forEach(function(event){
  var planned=V2CandidateNotificationPlan.plan(event,row,{scope:'TEST001/TEST_CO',employee:recipients.employee,reviewer:recipients.reviewer,
   allowedTestRecipients:allowed,manager1:recipients.noticeSubs[0]||'',manager2:recipients.noticeSubs[1]||'',reviewMode:'LIFF'});
  planned.entries.forEach(function(entry){entries.push(entry);});
 });
 return {entries:entries,allowed:allowed};
}
function v2CandidateNotifyOriginal_(id){
 var p=PropertiesService.getScriptProperties();
 if(!v2CandidatePhoneWriteAllowed_()||p.getProperty('V2_CANDIDATE_NOTIFY_ENABLED')!=='enabled')return {status:'DISABLED',attempted:0};
 var book=v2CandidatePhoneBook_(),plan=v2CandidateNotifyPlan_(book,id),sheet=v2CandidatePhoneSheet_(book,'候選通知流水',['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']);
 var token=String(p.getProperty('V2_QA_NOTIFY_TOKEN')||''),bot=String(p.getProperty('V2_QA_NOTIFY_CONFIRMED_BOT_BASIC_ID')||'');
 if(token.length<30||!/^@[a-z0-9._-]{4,40}$/i.test(bot))throw Error('CANDIDATE_BOT_UNCONFIGURED');
 function read(key){
  if(sheet.getLastRow()>10001)throw Error('CANDIDATE_NOTIFY_MAX_ROWS');
  var found=null,rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
  rows.forEach(function(r){var row=JSON.parse(r[1]);if(r[0]!==row.deliveryKey||['SENDING','UNKNOWN','REJECTED','ACCEPTED'].indexOf(row.state)<0)throw Error('CANDIDATE_NOTIFY_LEDGER_INVALID');
   if(r[0]===key){if(found&&(found.body!==row.body||found.retryKey!==row.retryKey||found.to!==row.to||found.role!==row.role))throw Error('CANDIDATE_NOTIFY_LEDGER_CONFLICT');found=row;}});return found;
 }
 var attempts=0,status='ACCEPTED';
 for(var i=0;i<plan.entries.length;i++){
  var entry=plan.entries[i];
  var sender=V2CandidateNotificationDispatch.create({settings:{enabled:true,scope:'TEST001/TEST_CO',allowedTestRecipients:plan.allowed},uuid:function(){return Utilities.getUuid();},clock:function(){return new Date().toISOString();},
   io:{load:read,save:function(row){if(!v2CandidatePhoneWriteAllowed_()||p.getProperty('V2_CANDIDATE_NOTIFY_ENABLED')!=='enabled')throw Error('CANDIDATE_NOTIFY_DISABLED');sheet.getRange(sheet.getLastRow()+1,1,1,3).setValues([[row.deliveryKey,JSON.stringify(row),new Date().toISOString()]]);SpreadsheetApp.flush();},
    withExclusive:function(fn){return v2CandidatePhoneLock_(function(){
     if(!v2CandidatePhoneWriteAllowed_()||p.getProperty('V2_CANDIDATE_NOTIFY_ENABLED')!=='enabled')throw Error('CANDIDATE_NOTIFY_DISABLED');
     var current=v2CandidateNotifyPlan_(book,id).entries.filter(function(x){return x.deliveryKey===entry.deliveryKey;});
     if(current.length!==1||JSON.stringify(current[0])!==JSON.stringify(entry))throw Error('CANDIDATE_NOTIFY_STALE_PLAN');return fn();
    });}},
   transport:{push:function(body,headers){
    var info=UrlFetchApp.fetch('https://api.line.me/v2/bot/info',{method:'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true}),identity;
    try{identity=JSON.parse(info.getContentText());}catch(_){throw Error('CANDIDATE_BOT_UNVERIFIED');}
    if(info.getResponseCode()!==200||identity.basicId!==bot)throw Error('CANDIDATE_BOT_UNVERIFIED');
    var response=UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':headers['X-Line-Retry-Key']},payload:body,muteHttpExceptions:true});
    return {status:response.getResponseCode(),headers:response.getAllHeaders()};
   }}});
  var result=sender.send(entry);if(result.attempted)attempts++;
  if(result.status!=='ACCEPTED'){status=result.status;break;}
 }
 return {status:status,attempted:attempts,delivered:false};
}
