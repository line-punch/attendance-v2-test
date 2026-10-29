/**
 * TEST001 standalone READ-ONLY — owner-only editor diagnostic.
 *
 * Paste only in the NEW independent
 * YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST Apps Script editor.
 * Run only v2hrAuditStandaloneOwner_TEST_ONLY from the editor.
 *
 * NO doGet/doPost, new deployment, LINE token, network call or write.
 * Does not turn on V2HR_READONLY_TEST_ENABLED; safely works when disabled.
 * Returns only booleans and mismatched *column letters*, no Sheet ID,
 * employee names, LINE user IDs, tokens or actual values.
 *
 * This verifies SCRIPT EDITOR settings + test data. It DOES NOT prove
 * the deployed Web App revision nor the caller's LINE binding.
 */
function v2hrAuditStandaloneOwner_TEST_ONLY() {
  var out={
    ok:false,synthetic:true,readOnly:true,
    editorChecked:true,deployedRevisionVerified:false,
    enabledFlagStillDisabled:false,
    channelMatches:false,testSheetIdConfigured:false,
    standaloneCodePresent:false,
    spreadsheetOpened:false,sheetNameMatches:false,
    fixtureEmployeeMatches:false,
    lineBindingPresent:false,lineBindingFormatValid:false,
    mockLeaveSheetExists:false,oneMockLeaveRow:false,
    expectedHeadersMatch:false,expectedRowMatch:false,
    mismatchedColumns:[],errorCode:""
  };
  function finish(code) {
    out.errorCode=code||"";
    out.ok=out.enabledFlagStillDisabled&&out.channelMatches&&
      out.testSheetIdConfigured&&out.standaloneCodePresent&&
      out.spreadsheetOpened&&out.sheetNameMatches&&
      out.fixtureEmployeeMatches&&out.lineBindingPresent&&
      out.lineBindingFormatValid&&out.mockLeaveSheetExists&&
      out.oneMockLeaveRow&&out.expectedHeadersMatch&&
      out.expectedRowMatch;
    Logger.log(JSON.stringify(out));
    return out;
  }
  try {
    if(typeof v2hrOnlyDate_!=="function"||
       typeof v2hrOnlyDispatch_!=="function"||
       typeof doPost!=="function"||
       typeof V2HR_STANDALONE_ROW==="undefined"||
       typeof V2HR_STANDALONE_HEADERS==="undefined")
      return finish("MISSING_STANDALONE_CODE");
    out.standaloneCodePresent=true;
    var props=PropertiesService.getScriptProperties();
    // In this diagnostic mode the feature must remain DISABLED.
    out.enabledFlagStillDisabled=
      props.getProperty("V2HR_READONLY_TEST_ENABLED")==="disabled";
    if(!out.enabledFlagStillDisabled)return finish("FEATURE_NOT_DISABLED");
    out.channelMatches=
      props.getProperty("LINE_LOGIN_CHANNEL_ID")==="2012136707";
    if(!out.channelMatches)return finish("CHANNEL_CONFIG_MISMATCH");
    var id=String(props.getProperty("V2HR_TEST_SHEET_ID")||"").trim();
    out.testSheetIdConfigured=/^[A-Za-z0-9_-]{20,}$/.test(id);
    if(!out.testSheetIdConfigured)return finish("TEST_SHEET_ID_MISSING");
    var ss;
    try{ss=SpreadsheetApp.openById(id);}
    catch(_){return finish("TEST_SHEET_CANNOT_OPEN");}
    out.spreadsheetOpened=!!(ss&&ss.getId&&ss.getId()===id);
    if(!out.spreadsheetOpened)return finish("TEST_SHEET_ID_MISMATCH");
    out.sheetNameMatches=ss.getName()==="YC_ATTENDANCE_V2_TEST_ONLY";
    if(!out.sheetNameMatches)return finish("NOT_THE_ISOLATED_TEST_BOOK");

    var emp=ss.getSheetByName("員工資料");
    if(!emp||emp.getLastRow()!==2)return finish("TEST_EMPLOYEE_ROW_COUNT");
    var row=emp.getRange(2,1,1,8).getValues()[0];
    out.fixtureEmployeeMatches=
      String(row[0])==="TEST001"&&String(row[4])==="TEST_CO"&&
      String(row[6])==="在職"&&String(row[7])==="TESTSITE";
    if(!out.fixtureEmployeeMatches)return finish("TEST_EMPLOYEE_FIXTURE_MISMATCH");
    var linked=String(row[3]||"").trim();
    out.lineBindingPresent=linked.length>0;
    out.lineBindingFormatValid=/^U[0-9a-f]{32}$/i.test(linked);
    if(!out.lineBindingPresent||!out.lineBindingFormatValid)
      return finish("TEST_LINE_BINDING_MISSING_OR_INVALID");

    var sh=ss.getSheetByName("V2請假寫入測試");
    out.mockLeaveSheetExists=!!sh;
    if(!sh)return finish("MOCK_LEAVE_TAB_MISSING");
    out.oneMockLeaveRow=sh.getLastRow()===2&&sh.getLastColumn()===12;
    if(!out.oneMockLeaveRow)return finish("MOCK_LEAVE_SHAPE_MISMATCH");
    var headers=sh.getRange(1,1,1,12).getDisplayValues()[0];
    out.expectedHeadersMatch=headers.every(function(x,i){
      return x===V2HR_STANDALONE_HEADERS[i];
    });
    if(!out.expectedHeadersMatch)return finish("MOCK_LEAVE_HEADERS_MISMATCH");

    var data=sh.getRange(2,1,1,12).getValues()[0];
    for(var i=0;i<12;i++){
      var v=(i===4||i===5)?v2hrOnlyDate_(data[i]):
        String(data[i]===null||data[i]===undefined?"":data[i]);
      if(v!==V2HR_STANDALONE_ROW[i])
        out.mismatchedColumns.push(String.fromCharCode(65+i));
    }
    out.expectedRowMatch=out.mismatchedColumns.length===0;
    if(!out.expectedRowMatch)return finish("MOCK_LEAVE_CONTENT_MISMATCH");
    return finish("");
  }catch(_){
    // Never print exception messages: they can contain private URLs/IDs.
    return finish("DIAGNOSTIC_UNEXPECTED_ERROR");
  }
}
