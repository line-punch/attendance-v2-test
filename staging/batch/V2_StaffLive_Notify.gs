/** Event-scoped production notifications. No timer and no blind retry. */
function staffNotifyPlan_(cfg,book,id){
 if(!/^V2_[A-Za-z0-9_-]{8,76}$/.test(id||''))throw Error('STAFF_ORIGINAL_INVALID');
 var data=staffTables_(cfg),policy=V2StaffAccess.compile(data.bindings),sh=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),state=V2StaffJournal.decode(sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[]),row=state.latest.get(id);
 if(!row)throw Error('STAFF_ORIGINAL_NOT_FOUND');var rec=policy.notificationRecipients(row),base=String(cfg.p.getProperty('STAFF_LIFF_URL')||'');
 if(!/^https:\/\/liff\.line\.me\/2009482137-[A-Za-z0-9]+$/.test(base))throw Error('STAFF_REVIEW_LINK_INVALID');
 var entries=[],title=row.kind==='LEAVE'?'請假申請':'補打卡申請',body=row.body;
 var empSheet=SpreadsheetApp.openById(cfg.source).getSheetByName('員工資料'),names=empSheet.getDataRange().getValues().slice(1),person=names.filter(function(r){return String(r[0])===row.employeeId;});if(person.length!==1)throw Error('STAFF_NAME_MAPPING_INVALID');
 var detail=row.kind==='LEAVE'?body.startDate+'～'+body.endDate+' '+body.leaveType+' '+(body.unit==='DAY'?'全天':body.fromTime+'～'+body.toTime):body.date+' '+body.type+' '+body.time;
 var text=title+'\n員工：'+String(person[0][1])+'\n'+detail+'\n原單：'+id;
 state.events.filter(function(e){return e.requestId===id&&(e.type==='REVIEWED'||row.status==='PENDING');}).forEach(function(event){
  function add(role,to,message){if(!/^U[0-9a-f]{32}$/i.test(to||''))throw Error('STAFF_RECIPIENT_INVALID');entries.push({deliveryKey:event.eventKey+':'+role+':'+to,to:to,role:role,message:message});}
  if(event.type==='REVIEWED'){if(event.status!==row.status)throw Error('STAFF_STATE_INVALID');add('EMPLOYEE_RESULT',rec.employee,{type:'text',text:text+'\n結果：'+(row.status==='APPROVED'?'核准':'駁回')});}
  else{
   rec.noticeSubs.forEach(function(sub){add('MANAGER_NOTICE',sub,{type:'text',text:text});});
   function action(label,d){return {type:'button',style:d==='APPROVE'?'primary':'secondary',action:{type:'uri',label:label,uri:base+'?qaReviewId='+encodeURIComponent(id)+'&qaDecision='+d}};}
   add('REVIEWER_CARD',rec.reviewer,{type:'flex',altText:title,contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:text,wrap:true}]},footer:{type:'box',layout:'horizontal',contents:[action('核准','APPROVE'),action('駁回','REJECT')]}}});
  }
 });return entries;
}
function staffNotify_(cfg,book,id){
 var p=cfg.p;if(!staffCanWrite_(cfg)||p.getProperty('STAFF_NOTIFY_ENABLED')!=='enabled')return {status:'DISABLED'};
 var sheet=staffSheet_(book,'V2_通知流水',['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']);
 function load(key){var result=null,rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];rows.forEach(function(r){if(r[0]!==key)return;var v=JSON.parse(r[1]);if(v.deliveryKey!==r[0]||result&&(result.body!==v.body||result.retryKey!==v.retryKey))throw Error('STAFF_NOTIFY_CONFLICT');result=v;});return result;}
 function save(v){if(!staffCanWrite_(cfg)||p.getProperty('STAFF_NOTIFY_ENABLED')!=='enabled')throw Error('STAFF_NOTIFY_DISABLED');sheet.getRange(sheet.getLastRow()+1,1,1,3).setValues([[v.deliveryKey,JSON.stringify(v),new Date().toISOString()]]);SpreadsheetApp.flush();}
 var plan=staffNotifyPlan_(cfg,book,id),status='ACCEPTED';
 for(var i=0;i<plan.length;i++){
  var entry=plan[i];var r=staffLock_(function(){
   var fresh=staffNotifyPlan_(cfg,book,id).filter(function(e){return e.deliveryKey===entry.deliveryKey;});if(fresh.length!==1||JSON.stringify(fresh[0])!==JSON.stringify(entry))throw Error('STAFF_NOTIFY_STALE');
   var body=JSON.stringify({to:entry.to,messages:[entry.message]}),old=load(entry.deliveryKey);
   if(old){if(old.body!==body||old.to!==entry.to||old.role!==entry.role)throw Error('STAFF_NOTIFY_CONFLICT');return old.state==='ACCEPTED'?'ACCEPTED':old.state==='REJECTED'?'REJECTED':'UNKNOWN';}
   var token=p.getProperty('STAFF_BOT_TOKEN'),expected=p.getProperty('STAFF_BOT_BASIC_ID');if(!token||expected!=='@090opuod')throw Error('STAFF_BOT_UNCONFIGURED');
   var row={deliveryKey:entry.deliveryKey,to:entry.to,role:entry.role,body:body,retryKey:Utilities.getUuid(),state:'SENDING',firstAttemptUTC:new Date().toISOString()};save(row);if(JSON.stringify(load(entry.deliveryKey))!==JSON.stringify(row))throw Error('STAFF_NOTIFY_PERSISTENCE_UNKNOWN');
   try{
    var info=UrlFetchApp.fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});if(info.getResponseCode()!==200||JSON.parse(info.getContentText()).basicId!==expected)throw Error('STAFF_BOT_IDENTITY');
    var response=UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':row.retryKey},payload:body,muteHttpExceptions:true});
    var code=response.getResponseCode(),headers=response.getAllHeaders(),normalized={};Object.keys(headers).forEach(function(k){normalized[k.toLowerCase()]=String(headers[k]);});
    row.state=code>=200&&code<300||code===409&&normalized['x-line-accepted-request-id']?'ACCEPTED':code>=400&&code<500&&code!==409?'REJECTED':'UNKNOWN';row.httpStatus=code;row.lineRequestId=normalized['x-line-accepted-request-id']||normalized['x-line-request-id']||'';
   }catch(_){row.state='UNKNOWN';}
   save(row);return row.state;
  });if(r!=='ACCEPTED'){status=r;break;}
 }return {status:status};
}

