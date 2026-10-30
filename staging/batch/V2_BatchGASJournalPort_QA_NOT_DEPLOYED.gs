/**
 * TEST001-only Google Apps Script port for V2_BatchAppendJournal.js.
 *
 * STAGING ONLY / NOT INSTALLED / NOT DEPLOYED.
 * Do NOT paste into an existing DATA_TEST_ONLY or formal clock-in project.
 * This code is for a *separate* QA technical workbook that already exists,
 * with a test-only sheet named V2_交易流水_QA and exact 8 headers. No tabs
 * created, no Sheet cleared, no existing row edited.
 *
 * ScriptProperties (all required; values NOT included in this source):
 *   V2_BATCH_QA_ENABLED = enabled
 *   V2_BATCH_QA_BOOK_ID = exact separate QA workbook ID
 *
 * Danger: a Google Sheet is not an ACID database. Append may persist then
 * fail; caller must query by the ORIGINAL request ID before trying again.
 * Must never place this port on a public doPost without server-side TEST001
 * binding and HR authorization already proven.
 *
 * Interface returned:
 *   withExclusive(fn) => Promise result (script lock)
 *   readRows()       => Promise 2D journal rows
 *   appendRow(row)   => Promise write after verifying exactly 8 fields
 *   utcNow()         => UTC ISO string
 */
function v2BatchGASTestPort_(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty("V2_BATCH_QA_ENABLED")!=="enabled")
    throw Error("V2_BATCH_QA_DISABLED");
  var id=String(props.getProperty("V2_BATCH_QA_BOOK_ID")||"").trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id))
    throw Error("V2_BATCH_QA_BOOK_NOT_CONFIGURED");
  // All mutation in this port is deliberately bound to a new QA workbook.
  var ss=SpreadsheetApp.openById(id);
  if(!ss||ss.getId()!==id||ss.getName()!=="YC_ATTENDANCE_V2_BATCH_QA_ONLY")
    throw Error("V2_BATCH_QA_WRONG_WORKBOOK");
  var sh=ss.getSheetByName("V2_交易流水_QA");
  if(!sh)throw Error("V2_BATCH_QA_LEDGER_TAB_MISSING");
  var required=["TX_ID","REQUEST_ID","VERSION","ROW_JSON","OUTBOX_JSON",
    "UTC_TIME","PREV_HASH","CONTENT_HASH"];
  function verify(){
    if(sh.getLastColumn()!==8||sh.getLastRow()<1||
       sh.getLastRow()>10001)
      throw Error("V2_BATCH_QA_SHAPE_INVALID");
    var head=sh.getRange(1,1,1,8).getDisplayValues()[0];
    for(var i=0;i<8;i++){
      if(head[i]!==required[i])throw Error("V2_BATCH_QA_HEADER_MISMATCH");
    }
  }
  verify();
  var lock=null;
  return {
    withExclusive:async function(fn){
      // When public API is introduced, use an exclusive lock that covers
      // the entire read->validate->append->readback transaction.
      var acquired=LockService.getScriptLock();
      if(!acquired.tryLock(20000))throw Error("V2_BATCH_QA_BUSY");
      lock=acquired;
      try{
        verify();
        return await fn();
      } finally {
        lock=null;
        acquired.releaseLock();
      }
    },
    readRows:async function(){
      if(!lock)throw Error("V2_BATCH_QA_LOCK_REQUIRED");
      verify();
      var count=sh.getLastRow()-1;
      if(count===0)return [];
      return sh.getRange(2,1,count,8).getValues().map(function(row){
        var v=row.slice();
        // Column C version is a number. Other journal fields are text.
        for(var i=0;i<8;i++){
          if(i!==2)v[i]=String(v[i]===null||v[i]===undefined?"":v[i]);
        }
        return v;
      });
    },
    appendRow:async function(row){
      if(!lock)throw Error("V2_BATCH_QA_LOCK_REQUIRED");
      verify();
      if(!Array.isArray(row)||row.length!==8||
         typeof row[0]!=="string"||!Number.isInteger(row[2])||
         row.some(function(v,i){return i!==2&&typeof v!=="string"}))
        throw Error("V2_BATCH_QA_APPEND_INVALID");
      // Large JSON cells are not safely within Google Sheet cell limits.
      if(row.some(function(v){return String(v).length>30000}))
        throw Error("V2_BATCH_QA_CELL_TOO_LONG");
      var dest=sh.getLastRow()+1;
      if(dest>10001)throw Error("V2_BATCH_QA_MAX_ROWS");
      // Exactly ONE new row contains both request state and outbox event.
      // If Sheets writes then fails, no cleanup or blind retry is allowed.
      sh.getRange(dest,1,1,8).setValues([row]);
      SpreadsheetApp.flush();
    },
    utcNow:function(){return new Date().toISOString()}
  };
}
