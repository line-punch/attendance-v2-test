function staffNormal_(cfg,book){
 var sh=staffSheet_(book,'V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']);
 function read(){var d=staffTables_(cfg),fresh=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues().map(function(r){var x=JSON.parse(r[1]);staffCheckRow_(x,d);if(x.requestId!==r[0]||x.kind!=='CLOCK'||x.source!=='GPS')throw Error('STAFF_NORMAL_INVALID');return x;}):[];return fresh.concat(staffLegacyClocks_(cfg,d));}
 function run(write,fn){return staffLock_(function(){return fn({list:read,create:function(x){if(!write||!staffCanWrite_(cfg))throw Error('STAFF_WRITE_DISABLED');staffCheckRow_(x,staffTables_(cfg));if(x.kind!=='CLOCK'||x.source!=='GPS'||read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_NORMAL_INVALID');sh.getRange(sh.getLastRow()+1,1,1,3).setValues([[x.requestId,JSON.stringify(x),new Date().toISOString()]]);SpreadsheetApp.flush();if(!read().some(function(r){return r.requestId===x.requestId;}))throw Error('STAFF_READBACK_UNKNOWN');}});});}
 return {read:function(fn){return run(false,fn);},transaction:function(fn){return run(true,fn);}};
}
