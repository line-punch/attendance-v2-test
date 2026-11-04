"use strict";
// Deterministic GAS adapter build; no network or credentials.
const fs=require('node:fs'),path=require('node:path');
const folder=__dirname;
const read=name=>fs.readFileSync(path.join(folder,name),'utf8');
const plan=read('V2_QANotificationPlan.js')
 .replace("const reviewEntry=require('./qa-client/review-entry.js');","const reviewEntry=V2QAReviewEntry;")
 .replace('module.exports={plan,reviewCommand};','return {plan,reviewCommand};');
if(/require\(|module\.exports/.test(plan))throw Error('UNRESOLVED_NOTIFICATION_IMPORT');
const output='/** GENERATED QA-only notification helpers. No public route or auto sending. */\n'+
 read('qa-client/review-entry.js')+'\nvar V2QANotificationPlan=(function(){\n'+plan+'\n})();\n'+
 read('V2_QANotificationWorker_NOT_DEPLOYED.gs');
fs.writeFileSync(path.join(folder,'V2_QANotificationRuntime_GENERATED.gs'),output,'utf8');
console.log('Built QA notification helper runtime; no deployment or messages');

