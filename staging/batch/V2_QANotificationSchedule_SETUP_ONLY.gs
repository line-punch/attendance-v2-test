/** Final setup only: NOT INSTALLED. May require additional Google trigger authorization.
 * Do not install/execute before consolidated acceptance and explicit activation.
 */
function desktopQaInstallNotificationSchedule() {
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_QA_NOTIFY_AUTOMATION_APPROVED")!=="enabled"||
    p.getProperty("V2_QA_NOTIFY_ENABLED")!=="enabled")throw Error("QA_NOTIFY_SCHEDULE_NOT_APPROVED");
 var status=desktopQaNotificationQueueStatus();
 if(!status.writeEnabled||!status.reviewerConfigured||!status.recipientListConfigured||!status.notificationLedgerPresent)
  throw Error("QA_NOTIFY_SCHEDULE_NOT_READY");
 var handler="qaNotificationScheduledWorker";
 var existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;});
 if(existing.length>1)throw Error("QA_NOTIFY_DUPLICATE_SCHEDULE");
 if(existing.length===1)return {created:false,alreadyPresent:true};
 ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
 return {created:true,intervalMinutes:5};
}
function qaNotificationScheduledWorker() {
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty("V2_QA_NOTIFY_AUTOMATION_APPROVED")!=="enabled")return {status:"DISABLED",attempted:0};
 return desktopQaNotificationDrain();
}

