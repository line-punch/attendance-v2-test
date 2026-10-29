/**
 * LINE V2 / TEST001: editor-only LEAVE FORM DRY RUN, no sheets writes.
 * Requires AttendanceV2_TwoSheet_GAS_ReadOnly.gs and
 * AttendanceV2_ProbeSyntheticRules_TEST_ONLY.gs already installed.
 * No external endpoint is registered; run v2hrRunLeaveDryRun_TEST_ONLY only.
 */
function v2hrValidateSyntheticLeaveRequest_(form, context) {
  if(!form||typeof form!=="object"||Array.isArray(form))
    return {ok:false,code:"INVALID_FORM"};
  // Identity comes from a verified backend, never the LIFF form.
  var identityFields=["empid","employeeId","lineUserId","idToken","company","workplace"];
  if(identityFields.some(function(k){return Object.prototype.hasOwnProperty.call(form,k);}))
    return {ok:false,code:"UNTRUSTED_IDENTITY_FIELD"};
  var types=["事假","病假","特休","公假","婚假","喪假"];
  if(types.indexOf(String(form.leaveType||""))<0)
    return {ok:false,code:"LEAVE_TYPE_INVALID"};
  var unit=String(form.unit||"");
  var mode=unit==="全天"||unit==="DAY"?"DAY":
    unit==="時數"||unit==="HOURS"?"HOURS":"";
  if(!mode)return {ok:false,code:"LEAVE_MODE_INVALID"};
  var request={
    startDate:String(form.startDate||""),
    endDate:String(form.endDate||""),
    mode:mode,startTime:String(form.startTime||""),endTime:String(form.endTime||"")
  };
  var outcome=V2HR_TEST_RULES.validateLeave(request,context);
  return {ok:outcome.ok===true,code:outcome.code,
    blockedDates:(outcome.off||[]).map(function(x){return x.date;}),
    hrReviewCodes:(outcome.review||[]).map(function(x){return x.code;}),
    message:outcome.ok?
      "日期預檢通過；尚未檢查假別餘額、重複申請或寫入假單":
      "測試日期預檢結果，未送出請假申請"};
}
function v2hrRunLeaveDryRun_TEST_ONLY() {
  var preflight=v2hrVerifySyntheticRules_TEST_ONLY();
  if(!preflight||preflight.ok!==true||preflight.synthetic!==true||
      preflight.readOnly!==true||preflight.checksPassed!==6)
    throw Error("TEST001 模擬資料預檢未通過");
  var ss=v2hrGuardTestSheet_();
  var ctx=v2hrReadTestCalendarContext_(ss,{
    employeeId:"TEST001",company:"TEST_CO",workplace:"TESTSITE"
  });
  ctx.today="2026-10-29"; // mock reference, not the current date
  ctx.scheduledMinutesByDate={"2026-11-12":480};
  var cases=[
    ["WEEKDAY_ALLOWED","事假","全天","2026-11-10","2026-11-10","","","DATE_RULES_PASSED"],
    ["MOCK_HOLIDAY_BLOCKED","事假","全天","2026-11-11","2026-11-11","","","NON_WORKDAY_IN_RANGE"],
    ["CROSS_HOLIDAY_BLOCKED","病假","全天","2026-11-10","2026-11-11","","","NON_WORKDAY_IN_RANGE"],
    ["MOCK_STORM_NEEDS_HR","事假","全天","2026-11-12","2026-11-12","","","CALENDAR_OR_EVENT_REVIEW_REQUIRED"],
    ["WEEKEND_SPAN_BLOCKED","事假","全天","2026-11-13","2026-11-16","","","NON_WORKDAY_IN_RANGE"],
    ["FRIDAY_ALLOWED","特休","全天","2026-11-13","2026-11-13","","","DATE_RULES_PASSED"],
    ["HOURLY_ALLOWED","公假","時數","2026-11-10","2026-11-10","09:00","11:00","DATE_RULES_PASSED"],
    ["HOURLY_CROSS_DAY_BLOCKED","事假","時數","2026-11-10","2026-11-13","09:00","11:00","HOURS_MULTI_DAY"],
    ["HOURLY_REVERSED_BLOCKED","病假","時數","2026-11-10","2026-11-10","18:00","09:00","LEAVE_HOURS_INVALID"],
    ["BAD_DATE_BLOCKED","喪假","全天","2026-02-30","2026-03-01","","","BAD_DATE"],
    ["PAST_DATE_BLOCKED","婚假","全天","2026-10-26","2026-10-26","","","PAST_DATE"],
    ["NEXT_YEAR_UNVERIFIED","事假","全天","2026-12-31","2027-01-01","","","CALENDAR_OR_EVENT_REVIEW_REQUIRED"]
  ];
  var results=[];
  for(var i=0;i<cases.length;i++) {
    var c=cases[i];
    var result=v2hrValidateSyntheticLeaveRequest_({
      leaveType:c[1],unit:c[2],startDate:c[3],endDate:c[4],
      startTime:c[5],endTime:c[6]},ctx);
    if(result.code!==c[7])throw Error("請假測試 "+c[0]+
      " 預期 "+c[7]+" 實際 "+result.code);
    results.push({test:c[0],code:result.code});
  }
  var invalid=v2hrValidateSyntheticLeaveRequest_({
    leaveType:"補休",unit:"全天",
    startDate:"2026-11-10",endDate:"2026-11-10"},ctx);
  if(invalid.code!=="LEAVE_TYPE_INVALID")throw Error("未阻擋未設定假別");
  var forged=v2hrValidateSyntheticLeaveRequest_({
    leaveType:"事假",unit:"全天",
    startDate:"2026-11-10",endDate:"2026-11-10",employeeId:"TEST002"},ctx);
  if(forged.code!=="UNTRUSTED_IDENTITY_FIELD")throw Error("未阻擋偽造的身分欄位");
  var report={ok:true,synthetic:true,readOnly:true,leaveCasesPassed:cases.length+2,
    holidayBlocked:true,weekendBlocked:true,stormNeedsHR:true,
    statuses:results,
    message:"僅 TEST001 模擬請假預檢，未新增假單、推播或薪資資料"};
  Logger.log(JSON.stringify(report));
  return report;
}
