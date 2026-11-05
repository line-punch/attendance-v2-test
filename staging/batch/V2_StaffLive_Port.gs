/** Separate staff release. Existing employee/site/approver workbook is read-only.
 * Writes stay OFF until private activation. No public setup or token functions.
 */
var STAFF_OPS_=['LEAVE_PREVIEW','LEAVE_REQUEST','LEAVE_STATUS','MY_LEAVES','MISSING_REQUEST','MISSING_STATUS','MY_MISSING','HR_PENDING','HR_STATUS','HR_REVIEW','GPS_CLOCK','GPS_STATUS','MY_CLOCKS'];
function staffSettings_(){
 var p=PropertiesService.getScriptProperties(),source=p.getProperty('STAFF_SOURCE_BOOK_ID'),target=p.getProperty('STAFF_DATA_BOOK_ID');
 if(!source||!target||source===target||p.getProperty('STAFF_CHANNEL_ID')!=='2009482137')throw Error('STAFF_CONFIG_INVALID');
 return {p:p,source:source,target:target,enabled:p.getProperty('STAFF_ENABLED')==='enabled',write:p.getProperty('STAFF_WRITE_ENABLED')==='enabled'};
}
function staffBook_(cfg){var b=SpreadsheetApp.openById(cfg.target);if(b.getName()!=='YC_ATTENDANCE_V2_STAFF_LIVE')throw Error('STAFF_DATA_BOOK_INVALID');return b;}
function staffSheet_(book,name,headers){var sh=book.getSheetByName(name);if(!sh||sh.getLastColumn()!==headers.length||JSON.stringify(sh.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error('STAFF_SCHEMA_INVALID');return sh;}
function staffTables_(cfg){
 var b=SpreadsheetApp.openById(cfg.source);if(b.getName()!=='LINE打卡系統')throw Error('STAFF_SOURCE_INVALID');
 var raw={};[['employees','員工資料'],['assignments','審核通知名單'],['sites','上班地點']].forEach(function(pair){raw[pair[0]]=staffSheet_(b,pair[1],V2StaffTables.HEADERS[pair[0]]).getDataRange().getValues();});
 var data=V2StaffTables.parse(raw);
 if(data.bindings.employees.some(function(e){return e.employeeId==='TEST001'||e.company==='TEST_CO';}))throw Error('STAFF_TEST_DATA_FORBIDDEN');
 return data;
}
function staffLock_(fn){var l=LockService.getScriptLock();if(!l.tryLock(15000))throw Error('STAFF_BUSY');try{return fn();}finally{l.releaseLock();}}
function staffCanWrite_(cfg){
 var p=PropertiesService.getScriptProperties(),start=Date.parse(p.getProperty('STAFF_START_UTC')||'');
 return cfg.enabled&&p.getProperty('STAFF_WRITE_ENABLED')==='enabled'&&Number.isFinite(start)&&Date.now()>=start&&p.getProperty('STAFF_LEGACY_CUTOVER_CONFIRMED')==='yes';
}
function staffCheckRow_(row,data){var e=data.bindings.employees.filter(function(x){return x.employeeId===row.employeeId;});if(e.length!==1||e[0].company!==row.company||row.employeeId==='TEST001'||!/^V2_[A-Za-z0-9_-]{8,76}$/.test(row.requestId||'')||/^V2_(OLD|LEGACY)_/.test(row.requestId))throw Error('STAFF_ROW_INVALID');}
function staffJournal_(cfg,book){
 var sh=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),locked=false;
 return V2StaffJournal.make({withExclusive:function(fn){return staffLock_(function(){locked=true;try{return fn();}finally{locked=false;}});},
 readRows:function(){var r=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];var d=staffTables_(cfg);V2StaffJournal.decode(r).latest.forEach(function(x){staffCheckRow_(x,d);});return r;},
 appendRow:function(r){if(!locked||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');var row=JSON.parse(r[3]);staffCheckRow_(row,staffTables_(cfg));if(r.length!==8||r[1]!==row.requestId||r.some(function(x){return String(x).length>30000;}))throw Error('STAFF_ROW_INVALID');sh.getRange(sh.getLastRow()+1,1,1,8).setValues([r]);SpreadsheetApp.flush();},utcNow:function(){return new Date().toISOString();}});
}
function staffNormal_(cfg,book){
 var sh=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 function read(){var d=staffTables_(cfg),fresh=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var x=JSON.parse(r[1]);staffCheckRow_(x,d);if(x.requestId!==r[0]||x.kind!=='CLOCK'||x.source!=='GPS')throw Error('STAFF_NORMAL_INVALID');return x;}):[];return fresh.concat(staffLegacyClocks_(cfg,d));}
 function run(write,fn){return staffLock_(function(){return fn({list:read,create:function(x){if(!write||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');staffCheckRow_(x,staffTables_(cfg));if(x.kind!=='CLOCK'||x.source!=='GPS'||read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_NORMAL_INVALID');sh.getRange(sh.getLastRow()+1,1,1,3).setValues([[x.requestId,JSON.stringify(x),new Date().toISOString()]]);SpreadsheetApp.flush();if(!read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_READBACK_UNKNOWN');}});});}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
function staffLegacyClocks_(cfg,data){
 var b=SpreadsheetApp.openById(cfg.source),month=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM'),tables=[];
 ['打卡紀錄','打卡紀錄_歷史'].forEach(function(name){var sh=b.getSheetByName(name);if(!sh){if(name==='打卡紀錄')throw Error('STAFF_LEGACY_CLOCK_MISSING');return;}
  var values=sh.getDataRange().getValues();values.slice(1).forEach(function(r){if(r[0] instanceof Date)r[0]=r[0].toISOString();if(r[1] instanceof Date)r[1]=Utilities.formatDate(r[1],'Asia/Taipei','yyyy-MM-dd');if(r[2] instanceof Date)r[2]=Utilities.formatDate(r[2],'Asia/Taipei','HH:mm:ss');});tables.push(values);});
 return V2StaffLegacyClocks.parse(tables,data.bindings.employees,month);
}
function staffLegacyApplications_(cfg){
 var source=SpreadsheetApp.openById(cfg.source),employees=staffTables_(cfg).bindings.employees,byId={};employees.forEach(function(e){byId[e.employeeId]=e;});var result=[];
 [['請假申請','LEAVE',['申請單號','員工ID','姓名','假別','開始日期','結束日期','天數/時數','原因','狀態','申請時間','審核人','審核時間']],['補打卡申請','MISSING',['申請單號','員工ID','姓名','日期','公司','班別','時間','原因','狀態','申請時間','審核人','審核時間','核定打卡時間']]].forEach(function(pair){
  var sh=staffSheet_(source,pair[0],pair[2]),values=sh.getDataRange().getValues();
  function date(v,optional){var s=v instanceof Date?Utilities.formatDate(v,'Asia/Taipei','yyyy-MM-dd'):String(v||'').trim(),m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:$|[ T])/);if(!m){if(optional)return '';throw Error('STAFF_LEGACY_DATE_INVALID');}var y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),d=new Date(Date.UTC(y,month-1,day));if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==month||d.getUTCDate()!==day){if(optional)return '';throw Error('STAFF_LEGACY_DATE_INVALID');}return m[1]+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  function time(v){var s=v instanceof Date?Utilities.formatDate(v,'Asia/Taipei','HH:mm'):String(v||'').trim(),m=s.match(/^([0-2]?\d):([0-5]\d)(?::[0-5]\d)?$/);if(!m||Number(m[1])>23)throw Error('STAFF_LEGACY_TIME_INVALID');return String(Number(m[1])).padStart(2,'0')+':'+m[2];}
  values.slice(1).forEach(function(r){var e=byId[String(r[1]||'')];if(!e)return;var originalStatus=String(r[8]||'').trim(),status={待審核:'PENDING',核准:'APPROVED',已核准:'APPROVED',審核通過:'APPROVED',駁回:'REJECTED',已駁回:'REJECTED'}[originalStatus]||'LEGACY_REVIEW_REQUIRED';
   var id='V2_OLD_'+e.employeeId+'_'+String(r[0]);if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))throw Error('STAFF_LEGACY_ID_INVALID');var body;
   if(pair[1]==='LEAVE'){var qty=String(r[6]||''),h=qty.match(/^([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/);body={startDate:date(r[4]),endDate:date(r[5]),leaveType:String(r[3]||''),unit:h?'HOURS':'LEGACY',fromTime:h?h[1]:'',toTime:h?h[2]:'',legacyUnitLabel:qty,reason:String(r[7]||'')};}
   else{if(!['上班','下班'].includes(String(r[5])))throw Error('STAFF_LEGACY_MISSING_TYPE');body={date:date(r[3]),type:String(r[5]),time:time(r[6]),reason:String(r[7]||'')};}
   result.push({requestId:id,kind:pair[1],employeeId:e.employeeId,company:e.company,body:body,status:status,legacyStatusLabel:originalStatus||'舊狀態待核對',submittedAt:date(r[9],true),reviewedAt:date(r[11],true),fingerprint:'LEGACY_READONLY:'+id});
  });
 });return result;
}
function staffWorkflowStore_(cfg,book,operation){
 var base=staffJournal_(cfg,book);if(['MY_LEAVES','MY_MISSING','LEAVE_STATUS','MISSING_STATUS'].indexOf(operation)<0)return base;
 return {transaction:base.transaction,read:function(fn){return base.read(function(tx){var old=staffLegacyApplications_(cfg);return fn({find:function(id){return tx.find(id)||old.filter(function(r){return r.requestId===id;})[0]||null;},list:function(){return tx.list().concat(old);}});});}};
}
function staffClaims_(token){
 var r=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{method:'post',contentType:'application/x-www-form-urlencoded',payload:{id_token:token,client_id:'2009482137'},muteHttpExceptions:true}),c;
 if(r.getResponseCode()!==200)throw Error('STAFF_AUTH');try{c=JSON.parse(r.getContentText());}catch(_){throw Error('STAFF_AUTH');}
 var now=Math.floor(Date.now()/1000);if(c.iss!=='https://access.line.me'||String(c.aud)!=='2009482137'||!/^U[0-9a-f]{32}$/i.test(c.sub||'')||!Number.isFinite(Number(c.exp))||Number(c.exp)<=now||!Number.isFinite(Number(c.iat))||Number(c.iat)>now+300)throw Error('STAFF_AUTH');return {source:'VERIFIED_LINE_ID_TOKEN',sub:c.sub};
}
function staffCalendar_(){return {validateLeave:function(body){
 // The user settles HR offline. Store requested dates, never invent paid/working days.
 var days=(Date.parse(body.endDate+'T00:00:00Z')-Date.parse(body.startDate+'T00:00:00Z'))/86400000+1;
 return Number.isInteger(days)&&days>=1&&days<=31?{ok:true,workingDays:null,requestedCalendarDays:days,settlement:'OFFLINE_HR'}:{ok:false,code:'LEAVE_DATES_INVALID'};
}};}
function staffProjectViews_(cfg,book){
 return staffLock_(function(){if(!staffCanWrite_(cfg))throw Error('STAFF_PROJECTION_DISABLED');var source=SpreadsheetApp.openById(cfg.source),data=staffTables_(cfg),roster=source.getSheetByName('員工資料').getDataRange().getValues().slice(1).filter(function(r){return String(r[0]||'').trim();}).map(function(r){return {employeeId:String(r[0]).trim(),company:String(r[4]).trim(),name:String(r[1]).trim()};});
  var j=staffSheet_(book,'V2_申請流水',V2StaffJournal.HEADERS),n=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
  var snapshot={ledger:j.getDataRange().getValues(),normal:n.getLastRow()>1?n.getRange(2,1,n.getLastRow()-1,3).getValues().map(function(r){return JSON.parse(r[1]);}):[]};
  // These downloadable views cover NEW service records. Legacy stays read-only
  // in its original file and is queried by the employee bridge, never copied.
  var result=V2StaffExport.tables(snapshot,{employees:roster});
  [['clock','打卡紀錄'],['leaves','請假申請'],['missing','補打卡申請']].forEach(function(pair){var rows=result.tables[pair[0]],sh=book.getSheetByName(pair[1]);if(!sh)sh=book.insertSheet(pair[1]);if(sh.getLastRow()>rows.length)throw Error('STAFF_PROJECTION_SHRINK_REQUIRES_REVIEW');if(sh.getLastRow()&&JSON.stringify(sh.getRange(1,1,1,rows[0].length).getValues()[0])!==JSON.stringify(rows[0]))throw Error('STAFF_PROJECTION_SCHEMA_INVALID');sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);});SpreadsheetApp.flush();return {normal:result.normalCount,leaves:result.leaveCount,missing:result.missingCount};
 });
}
function staffRequest_(params){
 if(!params||Object.keys(params).some(function(k){return ['nonce','operation','payload','candidateRoute'].indexOf(k)<0;})||params.candidateRoute!=='staff-v1'||!/^[0-9a-f]{40}$/.test(params.nonce||'')||STAFF_OPS_.indexOf(params.operation)<0||typeof params.payload!=='string'||params.payload.length>12000)throw Error('STAFF_FORM');
 var x=JSON.parse(params.payload);if(!x||Object.keys(x).sort().join(',')!=='args,idToken'||typeof x.idToken!=='string'||x.idToken.length<30||x.idToken.length>8192||x.idToken.split('.').length!==3||!x.args||typeof x.args!=='object'||Array.isArray(x.args)||JSON.stringify(x.args).length>3500)throw Error('STAFF_FORM');return {op:params.operation,token:x.idToken,args:x.args};
}
function staffHandle_(params){
 var nonce=/^[0-9a-f]{40}$/.test(String(params&&params.nonce||''))?params.nonce:'';
 function fail(code,reason,persisted){return {bridge:'YC_V2_STAFF_V1',nonce:nonce,ok:false,code:code,reason:reason||'',persisted:persisted};}
 var req,cfg;try{cfg=staffSettings_();if(!cfg.enabled)return fail('DISABLED','',false);req=staffRequest_(params);}catch(_){return fail('REJECTED','CONFIG_OR_FORM',false);}
 var write=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(req.op)>=0;if(write&&!staffCanWrite_(cfg))return fail('DISABLED','',false);
 try{
  var book=staffBook_(cfg),flags={};STAFF_OPS_.forEach(function(op){flags[op]=['LEAVE_REQUEST','MISSING_REQUEST','HR_REVIEW','GPS_CLOCK'].indexOf(op)<0||staffCanWrite_(cfg);});
  var result;
  if(['GPS_CLOCK','GPS_STATUS','MY_CLOCKS'].indexOf(req.op)>=0){var now=new Date();result=V2StaffClock.create({verifyLine:staffClaims_,loadTables:function(){return staffTables_(cfg);},normalStore:staffNormal_(cfg,book),flags:flags,clock:{now:function(){return {epochMs:now.getTime(),date:Utilities.formatDate(now,'Asia/Taipei','yyyy-MM-dd'),time:Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss'),utc:now.toISOString()};}}}).handle({operation:req.op,args:req.args,credential:req.token});}
  else result=V2StaffAccess.create({verifyLine:staffClaims_,loadBindings:function(){return staffTables_(cfg).bindings;},store:staffWorkflowStore_(cfg,book,req.op),calendar:staffCalendar_(),flags:flags,clock:{today:function(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');}}}).handle({operation:req.op,payload:req.args,credential:req.token});
  if(result&&result.ok){if(write){try{staffProjectViews_(cfg,book);result.exportProjection='CURRENT';}catch(_){result.exportProjection='PENDING';}if(req.op!=='GPS_CLOCK'){try{result.notification=staffNotify_(cfg,book,req.args.requestId).status;}catch(_){result.notification='PENDING';}}}return {bridge:'YC_V2_STAFF_V1',nonce:nonce,ok:true,result:result};}
  if(result&&result.code==='UNKNOWN')return fail('UNKNOWN','',null);
  return fail(result&&['AUTH_REQUIRED','HR_ONLY'].indexOf(result.code)>=0?'AUTH':'REJECTED',result&&result.code||'',false);
 }catch(_){return fail('UNKNOWN','',null);}
}
function doPost(e){var reply=staffHandle_(e&&e.parameter||{}),js=JSON.stringify(reply).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+js+',"https://line-punch.github.io");</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}
function doGet(){return ContentService.createTextOutput('YC/YT員工系統｜三功能服務；請從 LINE 員工入口使用。');}

