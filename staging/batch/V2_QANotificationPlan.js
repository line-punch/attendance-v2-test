"use strict";
// Pure offline QA planning only. No LINE calls, credentials, Sheet writes or webhook.
const SUB=/^U[0-9a-f]{32}$/i, REQUEST=/^QA_[A-Za-z0-9_-]{8,100}$/;
function scope(row){
 if(!row||row.employeeId!=="TEST001"||row.company!=="TEST_CO"||
    !REQUEST.test(row.requestId)||!["LEAVE","MISSING"].includes(row.kind)||
    !["PENDING","APPROVED","REJECTED"].includes(row.status))throw Error("QA_SCOPE_INVALID");
}
function recipients(config){
 if(!config||config.scope!=="TEST001/TEST_CO"||!Array.isArray(config.allowedTestRecipients)||
    !SUB.test(config.employee)||!SUB.test(config.reviewer)||config.employee===config.reviewer)
  throw Error("QA_TEST_RECIPIENTS_REQUIRED");
 const allowed=new Set(config.allowedTestRecipients);
 const managers=[config.manager1,config.manager2].filter(Boolean);
 for(const sub of [config.employee,config.reviewer,...managers]){
  if(!SUB.test(sub)||!allowed.has(sub))throw Error("QA_RECIPIENT_NOT_ALLOWED");
 }
 return {managers:[...new Set(managers)],reviewer:config.reviewer,employee:config.employee};
}
function detail(row){
 const b=row.body||{};
 if(row.kind==="LEAVE"){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(b.endDate))throw Error("QA_DATE_REQUIRED");
  return "請假日期："+b.startDate+"～"+b.endDate;
 }
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!["上班","下班"].includes(b.type)||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time))throw Error("QA_DATE_REQUIRED");
 return "補卡："+b.date+" "+b.type+" "+b.time;
}
function callbackData(row,decision){
 return "qa=v2&decision="+decision+"&kind="+row.kind+"&requestId="+encodeURIComponent(row.requestId);
}
function plan(event,row,config){
 scope(row);const r=recipients(config);
 if(!event||event.requestId!==row.requestId||
    !/^[A-Za-z0-9_-]{8,160}$/.test(event.eventKey||""))throw Error("QA_EVENT_INVALID");
 const entries=[];
 function add(role,to,message){entries.push({
  deliveryKey:event.eventKey+":"+role+":"+to,role,to,message
 });}
 const title=row.kind==="LEAVE"?"請假申請":"補打卡申請";
 const text="【獨立 QA｜合成資料】\n"+title+"\n"+detail(row)+"\n原單："+row.requestId;
 if(event.type==="REVIEWED"){
  if(!["APPROVED","REJECTED"].includes(row.status)||event.status!==row.status)throw Error("QA_EVENT_STATE_MISMATCH");
  add("EMPLOYEE_RESULT",r.employee,{type:"text",text:text+"\n結果："+(row.status==="APPROVED"?"核准":"駁回")});
 }else{
  if(event.type!==(row.kind==="LEAVE"?"LEAVE_SUBMITTED":"MISSING_SUBMITTED")||row.status!=="PENDING")
   throw Error("QA_EVENT_STATE_MISMATCH");
  for(const manager of r.managers)add("MANAGER_NOTICE",manager,{type:"text",text});
  add("REVIEWER_CARD",r.reviewer,{type:"flex",altText:"獨立 QA "+title,
   contents:{type:"bubble",body:{type:"box",layout:"vertical",contents:[
    {type:"text",text,wrap:true}]},footer:{type:"box",layout:"horizontal",contents:[
     {type:"button",style:"primary",action:{type:"postback",label:"核准",data:callbackData(row,"APPROVE")}},
     {type:"button",style:"secondary",action:{type:"postback",label:"駁回",data:callbackData(row,"REJECT")}}
    ]}}});
 }
 // This object is a preview. No component may interpret it as delivery success.
 return {scope:"TEST001/TEST_CO",delivery:"NOT_SENT",requiresDedicatedVerifiedQARoute:true,entries};
}
function reviewCommand(data,row,principal,config){
 scope(row);const r=recipients(config);
 // Principal must come from the server's verified LINE transport, never a client field.
 if(!principal||principal.source!=="VERIFIED_QA_LINE_EVENT"||principal.sub!==r.reviewer||
    principal.company!=="TEST_CO")throw Error("QA_REVIEWER_REQUIRED");
 if(typeof data!=="string"||data.length>400)throw Error("QA_CALLBACK_INVALID");
 const parts=data.split("&"),values={};
 for(const part of parts){
  const pair=part.split("=");
  if(pair.length!==2||!["qa","decision","kind","requestId"].includes(pair[0])||
     Object.hasOwn(values,pair[0]))throw Error("QA_CALLBACK_INVALID");
  try{values[pair[0]]=decodeURIComponent(pair[1]);}catch(_){throw Error("QA_CALLBACK_INVALID");}
 }
 if(Object.keys(values).length!==4||values.qa!=="v2"||values.kind!==row.kind||
    values.requestId!==row.requestId||!["APPROVE","REJECT"].includes(values.decision))
  throw Error("QA_CALLBACK_INVALID");
 return {operation:"HR_REVIEW",args:{requestId:row.requestId,decision:values.decision}};
}
module.exports={plan,reviewCommand};

