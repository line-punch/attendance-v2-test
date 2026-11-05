// Isolated candidate only. Not installed or deployed.
// Snapshots live only inside one exclusive transaction, never across requests.
function staffNormal_(cfg,book){
 var sh=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 function run(write,fn){return staffLock_(function(){
  var data=null,legacy=null,normal=null;
  function read(){
   if(!data)data=staffTables_(cfg);
   if(normal===null){
    var count=sh.getLastRow()-1;
    normal=count>0?sh.getRange(2,1,count,3).getValues().map(function(r){
     var x=JSON.parse(r[1]);staffCheckRow_(x,data);
     if(x.requestId!==r[0]||x.kind!=='CLOCK'||x.source!=='GPS')throw Error('STAFF_NORMAL_INVALID');
     return x;
    }):[];
   }
   if(legacy===null)legacy=staffLegacyClocks_(cfg,data);
   return normal.concat(legacy);
  }
  return fn({list:read,create:function(x){
   if(!write||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');
   // Re-read current binding immediately before a write, as in the live adapter.
   staffCheckRow_(x,staffTables_(cfg));
   if(x.kind!=='CLOCK'||x.source!=='GPS'||read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_NORMAL_INVALID');
   var rowIndex=sh.getLastRow()+1,serialized=JSON.stringify(x),utc=new Date().toISOString();
   sh.getRange(rowIndex,1,1,3).setValues([[x.requestId,serialized,utc]]);
   SpreadsheetApp.flush();
   var saved=sh.getRange(rowIndex,1,1,3).getValues()[0];
   if(saved[0]!==x.requestId||saved[1]!==serialized||saved[2]!==utc)throw Error('STAFF_READBACK_UNKNOWN');
   normal=null;
  }});
 });}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
