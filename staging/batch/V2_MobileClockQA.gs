/** Independent QA only. Source workbook is read-only; never use old GPS writes.
 * Adapted from the established TEST001 GPS freshness/distance/day-duplicate rules.
 * Normal punches have a separate table; leave/missing journals are never read.
 */
var V2_MOBILE_CLOCK_HEADERS_=["REQUEST_ID","EMPLOYEE_ID","COMPANY","DATE","TIME","TYPE","SOURCE","SITE_CODE","SITE_NAME","DISTANCE_METERS","ACCURACY_METERS","UTC_TIME"];
function v2MobileClockBook_(config){
 if(config.sourceId===config.ledgerId)throw Error("QA_SCOPE_UNVERIFIED");
 var book=SpreadsheetApp.openById(config.ledgerId);
 if(book.getId()!==config.ledgerId||book.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY")
  throw Error("QA_CLOCK_WRONG_BOOK");
 return book;
}
function v2MobileClockSheet_(config){
 var sh=v2MobileClockBook_(config).getSheetByName("V2_正常打卡_QA");
 if(!sh||sh.getLastColumn()!==V2_MOBILE_CLOCK_HEADERS_.length)
  throw Error("QA_CLOCK_SCHEMA_MISSING");
 var heads=sh.getRange(1,1,1,V2_MOBILE_CLOCK_HEADERS_.length).getValues()[0];
 if(JSON.stringify(heads)!==JSON.stringify(V2_MOBILE_CLOCK_HEADERS_))
  throw Error("QA_CLOCK_SCHEMA_INVALID");
 return sh;
}
// Owner-only setup. Creates a new QA tab, never clears or replaces existing data.
function desktopQaInstallNormalClockTab(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_BATCH_QA_ENABLED")!=="disabled"||
    p.getProperty("V2_BATCH_QA_WRITE_ENABLED")!=="disabled")throw Error("QA_MUST_BE_DISABLED");
 var config={sourceId:p.getProperty("V2_BATCH_QA_SOURCE_BOOK_ID"),ledgerId:p.getProperty("V2_BATCH_QA_BOOK_ID")};
 if(!config.sourceId||!config.ledgerId)throw Error("QA_SCOPE_UNVERIFIED");
 var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error("QA_BUSY");
 try{
  var book=v2MobileClockBook_(config),sh=book.getSheetByName("V2_正常打卡_QA");
  if(!sh){sh=book.insertSheet("V2_正常打卡_QA");sh.getRange(1,1,1,12).setValues([V2_MOBILE_CLOCK_HEADERS_]);SpreadsheetApp.flush();}
  v2MobileClockSheet_(config);console.log("QA_NORMAL_CLOCK_TAB_READY; existing data preserved");
 }finally{lock.releaseLock();}
}
function v2MobileClockSite_(config,lat,lng){
 var source=SpreadsheetApp.openById(config.sourceId);
 if(source.getId()!==config.sourceId||source.getName()!=="YC_ATTENDANCE_V2_TEST_ONLY")throw Error("QA_SOURCE_INVALID");
 var sheet=source.getSheetByName("上班地點");if(!sheet)throw Error("QA_SITE_MISSING");
 var sites=sheet.getDataRange().getValues().slice(1).filter(function(r){return String(r[0])==="TESTSITE";});
 if(sites.length!==1)throw Error("QA_SITE_INVALID");
 var row=sites[0],parts=String(row[3]).split(","),a=Number(parts[0]),b=Number(parts[1]),radius=Number(row[4]);
 if(parts.length!==2||!Number.isFinite(a)||!Number.isFinite(b)||a< -90||a>90||b< -180||b>180||
    (a===0&&b===0)||!Number.isFinite(radius)||radius!==50)throw Error("QA_SITE_INVALID");
 var rad=Math.PI/180,dLat=(lat-a)*rad,dLng=(lng-b)*rad;
 var h=Math.sin(dLat/2)**2+Math.cos(a*rad)*Math.cos(lat*rad)*Math.sin(dLng/2)**2;
 var distance=6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
 return {distance:distance,radius:radius,name:String(row[1]||"測試場地").slice(0,80)};
}
function v2MobileClockSummary_(row){
 return {requestId:String(row[0]),kind:"CLOCK",date:String(row[3]),time:String(row[4]),type:String(row[5]),source:String(row[6])};
}
function v2MobileClockHandle_(request,config){
 var fail=function(code){return {ok:false,code:code};};
 if(request.operation==="GPS_CLOCK"&&!config.writeEnabled)return fail("FEATURE_DISABLED");
 var p;
 try{p=v2BatchQAIdentity_(config).verify(request.token);}catch(_){return fail("AUTH_REQUIRED");}
 if(!p||p.source!=="VERIFIED_SERVER_BINDING"||p.active!==true||
    p.employeeId!=="TEST001"||p.company!=="TEST_CO"||p.role!=="STAFF")return fail("AUTH_REQUIRED");
 var input=request.args;
 var allowed=request.operation==="MY_CLOCKS"?[]:request.operation==="GPS_STATUS"?["requestId","type"]:
  ["requestId","type","lat","lng","accuracy","capturedAt"];
 if(!input||Object.keys(input).some(function(k){return allowed.indexOf(k)<0;}))return fail("INVALID_FORM_FIELDS");
 var today=Utilities.formatDate(new Date(),"Asia/Taipei","yyyy-MM-dd");
 if(request.operation!=="MY_CLOCKS"&&(!/^[A-Za-z0-9_-]{12,80}$/.test(String(input.requestId||""))||
    ["上班","下班"].indexOf(input.type)<0))return fail("CLOCK_INPUT_INVALID");
 var lock=null;
 if(request.operation==="GPS_CLOCK"){
  lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error("QA_BUSY");
 }
 try{
  var sheet=v2MobileClockSheet_(config),rows=sheet.getDataRange().getValues().slice(1);
  // Strict schema prevents manual/mixed workflow rows silently entering normal attendance.
  for(var i=0;i<rows.length;i++){
   var r=rows[i];
   if(r[3] instanceof Date)r[3]=Utilities.formatDate(r[3],"Asia/Taipei","yyyy-MM-dd");
   if(r[4] instanceof Date)r[4]=Utilities.formatDate(r[4],"Asia/Taipei","HH:mm:ss");
   if(String(r[1])!=="TEST001"||String(r[2])!=="TEST_CO"||String(r[6])!=="GPS"||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(r[3]))||
      !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(String(r[4]))||
      ["上班","下班"].indexOf(String(r[5]))<0)throw Error("QA_CLOCK_ROW_INVALID");
  }
  if(request.operation==="MY_CLOCKS"){
   var month=today.slice(0,7),days={};
   rows.filter(function(r){return String(r[3]).slice(0,7)===month;}).forEach(function(r){
    var day=String(r[3]),key=String(r[5])==="上班"?"clockIn":"clockOut";
    if(!days[day])days[day]={date:day,clockIn:"",clockOut:""};
    if(days[day][key])throw Error("QA_CLOCK_DUPLICATE");
    days[day][key]=String(r[4]);
   });
   return {ok:true,readOnly:true,month:month,days:Object.keys(days).sort().map(function(d){return days[d];})};
  }
  var found=rows.filter(function(r){return String(r[0])===input.requestId;});
  if(found.length>1)throw Error("QA_CLOCK_DUPLICATE");
  if(found.length){
   if(String(found[0][5])!==input.type)return fail("REQUEST_ID_CONFLICT");
   return {ok:true,readOnly:request.operation==="GPS_STATUS",duplicate:true,request:v2MobileClockSummary_(found[0])};
  }
  if(request.operation==="GPS_STATUS")return fail("NOT_FOUND");
  var nowMs=Date.now();
  if(typeof input.capturedAt!=="number"||!Number.isFinite(input.capturedAt)||input.capturedAt<nowMs-120000||input.capturedAt>nowMs+15000)
   return fail("GPS_EXPIRED");
  if(typeof input.lat!=="number"||typeof input.lng!=="number"||!Number.isFinite(input.lat)||!Number.isFinite(input.lng)||
     input.lat< -90||input.lat>90||input.lng< -180||input.lng>180)return fail("GPS_INVALID");
  if(typeof input.accuracy!=="number"||!Number.isFinite(input.accuracy)||input.accuracy<=0||input.accuracy>150)return fail("GPS_ACCURACY");
  var site=v2MobileClockSite_(config,input.lat,input.lng);
  if(site.distance>site.radius)return fail("OUT_OF_RANGE");
  if(rows.some(function(r){return String(r[3])===today&&String(r[5])===input.type;}))return fail("ALREADY_CLOCKED");
  var now=new Date(),time=Utilities.formatDate(now,"Asia/Taipei","HH:mm:ss");
  var row=[input.requestId,p.employeeId,p.company,today,time,input.type,"GPS","TESTSITE",site.name,
   Math.round(site.distance),Math.round(input.accuracy),now.toISOString()];
  sheet.appendRow(row);SpreadsheetApp.flush();
  return {ok:true,duplicate:false,request:v2MobileClockSummary_(row)};
 }finally{if(lock)lock.releaseLock();}
}

