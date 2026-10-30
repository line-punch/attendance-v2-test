"use strict";
const assert=require("node:assert/strict");
const m=require("./V2_BatchRules.js");
const staff={verified:true,active:true,role:"STAFF",employeeId:"TEST001"};
const hr={verified:true,active:true,role:"HR_OWNER",employeeId:"HR_TEST"};
const flags={CLOCK_IN:true,LEAVE_PREVIEW:true,MY_LEAVES:true,HR_REVIEW:true};
const cfg={calendarConfirmed:true,offDays:["2026-11-11"],stormDays:["2026-11-12"]};
const tests=[
 ["exactly four employee tiles",()=>assert.deepEqual(m.TILE_NAMES,["我要打卡","忘記打卡","人資查詢","我要請假"])],
 ["unverified login blocked",()=>assert.equal(m.authorize("CLOCK_IN",{...staff,verified:false},flags).code,"LOGIN_REQUIRED")],
 ["inactive employee blocked",()=>assert.equal(m.authorize("CLOCK_IN",{...staff,active:false},flags).code,"LOGIN_REQUIRED")],
 ["staff has no HR approval permission",()=>assert.equal(m.authorize("HR_REVIEW",staff,flags).code,"HR_ONLY")],
 ["HR approval allowed with server verified role",()=>assert.equal(m.authorize("HR_REVIEW",hr,flags).ok,true)],
 ["unknown operation rejected",()=>assert.equal(m.authorize("anything",staff,flags).code,"UNKNOWN_OPERATION")],
 ["feature disabled by default",()=>assert.equal(m.authorize("CLOCK_OUT",staff,flags).code,"FEATURE_NOT_ENABLED")],
 ["verified clock-in allowed under feature flag",()=>assert.equal(m.authorize("CLOCK_IN",staff,flags).ok,true)],
 ["pending approval changes once",()=>{const r=m.reviewed("PENDING","APPROVE","HR_OWNER");assert.equal(r.status,"APPROVED");assert.equal(r.changed,true)}],
 ["same decision is idempotent",()=>assert.equal(m.reviewed("APPROVED","APPROVE","HR_OWNER").duplicate,true)],
 ["conflicting approval rejected",()=>assert.equal(m.reviewed("REJECTED","APPROVE","HR_OWNER").code,"ALREADY_REVIEWED")],
 ["non HR reviewer blocked",()=>assert.equal(m.reviewed("PENDING","APPROVE","STAFF").code,"HR_ONLY")],
 ["invalid approval state blocked",()=>assert.equal(m.reviewed("OTHER","REJECT","HR_OWNER").code,"CURRENT_STATE_INVALID")],
 ["unconfirmed annual calendar blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-11-10",endDate:"2026-11-10",unit:"DAY"}).code,"CALENDAR_NOT_APPROVED")],
 ["valid weekday accepted",()=>assert.equal(m.leaveCheck({startDate:"2026-11-10",endDate:"2026-11-10",unit:"DAY"},cfg).ok,true)],
 ["weekend crossing blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-11-13",endDate:"2026-11-16",unit:"DAY"},cfg).code,"NON_WORKDAY_REQUIRES_SPLIT")],
 ["fictional holiday blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-11-11",endDate:"2026-11-11",unit:"DAY"},cfg).code,"NON_WORKDAY_REQUIRES_SPLIT")],
 ["fictional storm requires HR review",()=>assert.equal(m.leaveCheck({startDate:"2026-11-12",endDate:"2026-11-12",unit:"DAY"},cfg).code,"NEEDS_HR_REVIEW")],
 ["approved government-style Saturday makeup workday allowed",()=>{
  const approved={...cfg,workDays:["2026-11-14"]};
  assert.equal(m.leaveCheck({startDate:"2026-11-14",endDate:"2026-11-14",unit:"DAY"},approved).ok,true);
 }],
 ["Sunday still blocked without approved makeup",()=>{
  assert.equal(m.leaveCheck({startDate:"2026-11-15",endDate:"2026-11-15",unit:"DAY"},cfg).code,"NON_WORKDAY_REQUIRES_SPLIT");
 }],
 ["conflicting work and off overrides rejected",()=>{
  const conflicting={...cfg,workDays:["2026-11-11"]};
  assert.equal(m.leaveCheck({startDate:"2026-11-11",endDate:"2026-11-11",unit:"DAY"},conflicting).code,"DAY_OVERRIDE_CONFLICT");
 }],
 ["two continuous workdays allowed",()=>assert.equal(m.leaveCheck({startDate:"2026-11-09",endDate:"2026-11-10",unit:"DAY"},cfg).workingDays,2)],
 ["hourly same-day allowed",()=>assert.equal(m.leaveCheck({startDate:"2026-11-10",endDate:"2026-11-10",unit:"HOURS",fromTime:"09:00",toTime:"11:00"},cfg).ok,true)],
 ["hourly multiple-day blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-11-09",endDate:"2026-11-10",unit:"HOURS",fromTime:"09:00",toTime:"11:00"},cfg).code,"HOURS_ONLY_ONE_DAY")],
 ["inverted hourly range blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-11-10",endDate:"2026-11-10",unit:"HOURS",fromTime:"16:00",toTime:"10:00"},cfg).code,"HOURS_INVALID")],
 ["a 31-day leave span is accepted only if it contains no off days",()=>{
   assert.equal(m.days("2026-11-01","2026-12-01").length,31);
 }],
 ["a 32-day leave span is rejected by calendar rule",()=>{
   assert.equal(m.days("2026-11-01","2026-12-02"),null);
   assert.equal(m.leaveCheck({startDate:"2026-11-01",endDate:"2026-12-02",unit:"DAY"},cfg).code,"DATES_INVALID_OR_OVER_31_DAYS");
 }],
 ["invalid date blocked",()=>assert.equal(m.leaveCheck({startDate:"2026-02-30",endDate:"2026-03-01",unit:"DAY"},cfg).code,"DATES_INVALID_OR_OVER_31_DAYS")],
 ["NFC never accepts unverified scan",()=>assert.equal(m.nfcPermitted({deviceConfirmed:true}),false)],
 ["NFC requires crypto and anti replay and location device check",()=>assert.equal(m.nfcPermitted({cryptogramVerified:true,replayChecked:true,deviceConfirmed:true}),true)],
 ["unknown result never asserts failure",()=>assert(m.feedback("UNKNOWN").includes("保留原單號"))],
 ["pending button shows feedback",()=>assert(m.feedback("WORKING").includes("執行中"))],
 ["contains all major operation contracts",()=>assert(["MY_LEAVES","HR_MONTH_CLOSE","MISSING_REQUEST","HR_DISASTER"].every(x=>m.OPS.includes(x)))]
];
let pass=0;
for(const [label,test] of tests)try{test();pass++;console.log("PASS",label)}
 catch(e){console.error("FAIL",label,e.stack);process.exitCode=1}
console.log(pass+"/"+tests.length+" PASSED");
