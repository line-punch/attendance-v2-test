/** OWNER-ONLY TEST. Actual Sheets persistence, SYNTHETIC identity; NOT LINE authentication. */
function desktopQaJournalPersistenceTest() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('V2_BATCH_QA_ENABLED') !== 'disabled' ||
      p.getProperty('V2_BATCH_QA_WRITE_ENABLED') !== 'disabled')
    throw Error('QA_FLAGS_MUST_START_DISABLED');
  desktopQaReadOnlyPreflight();
  var id = 'QA_DESKTOP_JOURNAL_20261030_A';
  var priorIntent = p.getProperty('V2_DESKTOP_QA_REQUEST_ID');
  var sourceId = p.getProperty('V2_BATCH_QA_SOURCE_BOOK_ID');
  var ledgerId = p.getProperty('V2_BATCH_QA_BOOK_ID');
  if (!sourceId || !ledgerId || sourceId === ledgerId) throw Error('QA_NOT_ISOLATED');
  try {
    p.setProperty('V2_BATCH_QA_ENABLED', 'enabled');
    var io = v2BatchGASTestPort_();
    var journal = V2BatchAppendJournal.make(io);
    var old = journal.read(function(tx) { return tx.find(id); });
    if (old) {
      console.log('RECOVERED_ORIGINAL: ' + id + ' status=' + old.status + '. No new write.');
      return;
    }
    if (priorIntent) throw Error('PRIOR_INTENT_UNRESOLVED_CHECK_ORIGINAL_DO_NOT_RESUBMIT');
    p.setProperty('V2_DESKTOP_QA_REQUEST_ID', id);
    var ledger = SpreadsheetApp.openById(ledgerId).getSheetByName('V2_交易流水_QA');
    var before = ledger.getLastRow();
    var simulatedLostReplyIo = {
      withExclusive: io.withExclusive,
      readRows: io.readRows,
      utcNow: io.utcNow,
      appendRow: function(row) {
        io.appendRow(row); // real, isolated Sheets append + flush
        throw Error('SYNTHETIC_REPLY_LOSS_AFTER_REAL_PERSISTENCE');
      }
    };
    var principal = {source:'VERIFIED_SERVER_BINDING',active:true,
      employeeId:'TEST001',company:'TEST_CO',role:'STAFF'};
    var flags = {LEAVE_REQUEST:true,LEAVE_STATUS:true};
    var calendar = v2BatchCalendarQA_();
    var clock = {today:function() { return Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd'); }};
    function service(store) {
      return V2BatchWorkflowCore.create({identity:{verify:function(){return principal;}},
        store:store,calendar:calendar,clock:clock,flags:flags});
    }
    var request = {operation:'LEAVE_REQUEST',credential:'SYNTHETIC_OWNER_TEST_NO_LINE_TOKEN',
      payload:{requestId:id,leaveType:'事假',startDate:'2026-11-09',endDate:'2026-11-10',
        unit:'DAY',reason:'TEST001 synthetic desktop persistence test; no real leave'}};
    p.setProperty('V2_BATCH_QA_WRITE_ENABLED', 'enabled');
    var unknown = false;
    try { service(V2BatchAppendJournal.make(simulatedLostReplyIo)).handle(request); }
    catch(e) {
      if (e.code !== 'WRITE_OUTCOME_UNKNOWN') throw e;
      unknown = true;
    }
    if (!unknown) throw Error('EXPECTED_SYNTHETIC_UNKNOWN_NOT_OBSERVED');
    // Read ORIGINAL request before any repeat, after deliberately losing the reply.
    var found = journal.read(function(tx) { return tx.find(id); });
    if (!found || found.status !== 'PENDING' || found.company !== 'TEST_CO')
      throw Error('ORIGINAL_REQUEST_READBACK_FAILED_DO_NOT_RESUBMIT');
    console.log('PASS_REAL_SHEETS_RECOVERY: original ' + id + ' found PENDING after synthetic reply loss.');
    var duplicate = service(journal).handle(request);
    if (!duplicate.ok || duplicate.duplicate !== true || ledger.getLastRow() !== before + 1)
      throw Error('DUPLICATE_OR_ROW_COUNT_INVALID');
    console.log('PASS_REAL_SHEETS_DEDUP: one new ledger row; confirmed original replay made no second row.');
    console.log('LIMITATION: synthetic identity and reply loss; real LockService/Sheets, no real LINE verification or notification delivery.');
  } finally {
    p.setProperty('V2_BATCH_QA_WRITE_ENABLED', 'disabled');
    p.setProperty('V2_BATCH_QA_ENABLED', 'disabled');
    console.log('QA_FLAGS_RESTORED_DISABLED');
  }
}
