"use strict";
/* TEST001 self-leave history UI controller. OFFLINE/NOT DEPLOYED.
 * Caller supplies authenticated query, auth-state and render callbacks.
 */
(function(root){
function create({query,isAuthenticated,onChange,enabled=false}={}){
 if(typeof query!=="function"||typeof isAuthenticated!=="function"||
    typeof onChange!=="function")throw Error("Missing callbacks");
 let busy=false,view=Object.freeze({phase:"IDLE",rows:[],month:null});
 const emit=v=>{view=Object.freeze(v);onChange(view);return view};
 async function load(month){
  if(busy)return {phase:"BUSY"};
  if(!enabled)return emit({phase:"DISABLED",rows:[],month:null});
  if(!isAuthenticated())return emit({phase:"AUTH_REQUIRED",rows:[],month:null});
  if(typeof month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
   return emit({phase:"INVALID_MONTH",rows:[],month:null});
  busy=true;emit({phase:"LOADING",rows:[],month});
  try{
   const r=await query({month}); // never send employeeId/company from browser
   if(!r||r.ok!==true||r.readOnly!==true||r.month!==month||
      !Array.isArray(r.records)||!Array.isArray(r.availableMonths)||
      !r.availableMonths.includes(month)||!Number.isInteger(r.total)||
      r.total!==r.records.length)
    return emit({phase:"UNKNOWN",rows:[],month});
   const ok=new Set(["PENDING","APPROVED","REJECTED"]);
   const rows=[];
   for(const x of r.records){
    if(!x||typeof x.requestId!=="string"||typeof x.leaveType!=="string"||
       typeof x.startDate!=="string"||typeof x.endDate!=="string"||
       typeof x.quantity!=="string"||!ok.has(x.status))
     return emit({phase:"UNKNOWN",rows:[],month});
    rows.push({requestId:x.requestId,leaveType:x.leaveType,
      startDate:x.startDate,endDate:x.endDate,quantity:x.quantity,status:x.status});
   }
   return emit({phase:rows.length?"FOUND":"EMPTY",rows,month});
  }catch(error){
   if(error&&["AUTH","NOT_BOUND"].includes(error.code))
    return emit({phase:"AUTH_REQUIRED",rows:[],month:null});
   return emit({phase:"UNKNOWN",rows:[],month});
  }finally{busy=false;}
 }
 return Object.freeze({load,getState:()=>view,isBusy:()=>busy});
}
const api=Object.freeze({create});
if(typeof module==="object"&&module.exports)module.exports=api;
else root.AttendanceV2SelfLeaveClient=api;
})(typeof window!=="undefined"?window:this);
