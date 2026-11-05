/** Remove this file before any Web App deployment. One-time, operator-only setup.
 * Creates a NEW empty data file. Existing source and test data are never edited.
 */
function prepareStaffRelease(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty('STAFF_WRITE_ENABLED')==='enabled'||p.getProperty('STAFF_NOTIFY_ENABLED')==='enabled')throw Error('STAFF_SETUP_REQUIRES_OFF');
 var source=p.getProperty('STAFF_SOURCE_BOOK_ID');if(!source||SpreadsheetApp.openById(source).getName()!=='LINE打卡系統')throw Error('STAFF_SOURCE_NOT_CONFIRMED');
 p.setProperty('STAFF_CHANNEL_ID','2009482137');p.setProperty('STAFF_ENABLED','disabled');p.setProperty('STAFF_WRITE_ENABLED','disabled');p.setProperty('STAFF_NOTIFY_ENABLED','disabled');p.setProperty('STAFF_LEGACY_CUTOVER_CONFIRMED','no');
 var id=p.getProperty('STAFF_DATA_BOOK_ID'),b;
 if(id){b=SpreadsheetApp.openById(id);if(b.getName()!=='YC_ATTENDANCE_V2_STAFF_LIVE'||id===source)throw Error('STAFF_TARGET_NOT_CONFIRMED');}
 else{b=SpreadsheetApp.create('YC_ATTENDANCE_V2_STAFF_LIVE');p.setProperty('STAFF_DATA_BOOK_ID',b.getId());}
 [['V2_申請流水',['TX_ID','REQUEST_ID','VERSION','ROW_JSON','OUTBOX_JSON','UTC_TIME','PREV_HASH','CONTENT_HASH']],['V2_正常打卡',['REQUEST_ID','ROW_JSON','UTC_TIME']],['V2_通知流水',['DELIVERY_KEY','STATE_JSON','UPDATED_UTC']]].forEach(function(x){var sh=b.getSheetByName(x[0]);if(!sh){sh=b.insertSheet(x[0]);sh.getRange(1,1,1,x[1].length).setValues([x[1]]);}else if(sh.getLastColumn()!==x[1].length||JSON.stringify(sh.getRange(1,1,1,x[1].length).getValues()[0])!==JSON.stringify(x[1]))throw Error('STAFF_EXISTING_DATA_PRESERVED_SCHEMA_MISMATCH');});
 SpreadsheetApp.flush();console.log(JSON.stringify({prepared:true,dataBookId:b.getId(),emptyEmployeeData:true,writesEnabled:false,notificationsEnabled:false,sourceEdited:false}));
}

