"use strict";
/*
 * V2 HR/PAYROLL RULE SPECIMEN (isolated; never called by production Apps Script).
 * No Google Sheets access. No LINE notification. No automatic HR approval.
 *
 * scheduledWorkMinutes: regular scheduled minutes (not always 8h)
 * actualWorkedMinutes: validated *actual* work, never synthesize punch times
 * stopEvent: {hrConfirmed,appliesToEmployee,protectedMinutes,eventId}
 * companyPaysStopMinutes: the employer's policy for eligible non-worked minutes
 * approvedLeaveOverlaps: flag prior approved leave for HR reconciliation
 */
function evaluateAttendanceException(p) {
  if(!p || !Number.isInteger(p.scheduledWorkMinutes) || p.scheduledWorkMinutes<0)
    throw new Error("scheduledWorkMinutes must be a nonnegative integer");
  const scheduled=p.scheduledWorkMinutes;
  const actual=p.actualWorkedMinutes;
  if(actual!==null && actual!==undefined && (!Number.isInteger(actual)||actual<0))
    throw new Error("actualWorkedMinutes must be a nonnegative integer or null");
  const hasActualWork=Number.isInteger(actual)&&actual>0;
  const event=p.stopEvent;
  const applicable=!!(event&&event.hrConfirmed===true&&event.appliesToEmployee===true);
  const covered=applicable&&scheduled>0?
    Math.min(scheduled,Math.max(0,Number.isInteger(event.protectedMinutes)?event.protectedMinutes:0)):0;
  const flags=[];
  const common={
    actualWorkedMinutes:actual===undefined?null:actual,
    scheduledWorkMinutes:scheduled,
    protectedNoWorkMinutes:0,
    paidStopMinutes:0,
    unresolvedScheduledMinutes:scheduled,
    absenceMinutes:null,
    fullAttendanceProtected:false,
    requiresHumanReview:false,
    eventId:applicable?String(event.eventId||""):""
  };

  if(scheduled===0){
    return {...common,status:hasActualWork?"WORK_ON_NONWORKDAY_REVIEW":"NONWORKDAY",
      unresolvedScheduledMinutes:0,requiresHumanReview:hasActualWork,
      flags:hasActualWork?["WORK_ON_UNSCHEDULED_DAY_REVIEW"]:[]};
  }
  if(!applicable||covered===0){
    return {...common,status:hasActualWork?"ACTUAL_WORK":"MISSING_PUNCH_REVIEW",
      requiresHumanReview:!hasActualWork||!!p.approvedLeaveOverlaps,
      flags:!hasActualWork?["NEVER_AUTO_MARK_ABSENT_BEFORE_HR_REVIEW"]:[]};
  }

  // Preserve actual work; do not equate typhoon work with overtime or auto-pay doubles.
  if(hasActualWork){
    flags.push("REVIEW_ACTUAL_WORK_AND_ANY_ADDITIONAL_PAYMENT");
    if(p.approvedLeaveOverlaps)flags.push("PREEXISTING_APPROVED_LEAVE_HR_REVIEW");
    return {...common,status:"DISASTER_ACTUAL_WORK_REVIEW",
      protectedNoWorkMinutes:0,unresolvedScheduledMinutes:Math.max(0,scheduled-actual),
      fullAttendanceProtected:true,requiresHumanReview:true,flags};
  }

  if(p.approvedLeaveOverlaps){
    return {...common,status:"DISASTER_APPROVED_LEAVE_CONFLICT",
      protectedNoWorkMinutes:covered,unresolvedScheduledMinutes:scheduled-covered,
      fullAttendanceProtected:true,requiresHumanReview:true,
      flags:["DO_NOT_AUTO_CANCEL_APPROVED_LEAVE","PAY_AND_LEAVE_RECONCILIATION_REQUIRED"]};
  }

  const partial=covered<scheduled;
  if(partial)flags.push("PARTIAL_SUSPENSION_REMAINING_TIME_NEEDS_REVIEW");
  if(!p.companyPaysStopMinutes)flags.push("WAGE_TREATMENT_HR_REVIEW");
  return {...common,
    status:partial?"DISASTER_PARTIAL_SUSPENSION_REVIEW":"DISASTER_NO_WORK",
    protectedNoWorkMinutes:covered,
    paidStopMinutes:p.companyPaysStopMinutes?covered:0,
    unresolvedScheduledMinutes:scheduled-covered,
    absenceMinutes:0,  // this means *protected portion only*. Unresolved remainder never becomes an automatic absence.
    fullAttendanceProtected:true,
    requiresHumanReview:partial||!p.companyPaysStopMinutes,
    flags};
}
if(typeof module==="object"&&module.exports)module.exports={evaluateAttendanceException};
