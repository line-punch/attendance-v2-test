"use strict";
// Local-only TEST001 simulator. It never calls LINE, GPS or Google Sheets.
(function(root){
function create(){
 const state={clock:[],leave:[],missed:[],reviews:[],synthetic:true};
 const clone=x=>JSON.parse(JSON.stringify(x));
 function add(collection,item){
   if(!item||typeof item.id!=="string"||item.id.length<5)
     return {ok:false,code:"INVALID_ID"};
   const existing=state[collection].find(x=>x.id===item.id);
   if(existing)return {ok:true,duplicate:true,item:clone(existing)};
   const value={...item,status:"PENDING"};
   state[collection].push(value);
   return {ok:true,duplicate:false,item:clone(value)};
 }
 function review(collection,id,choice){
   if(!["leave","missed"].includes(collection))return {ok:false,code:"INVALID_COLLECTION"};
   const row=state[collection].find(x=>x.id===id);
   if(!row)return {ok:false,code:"NOT_FOUND"};
   const next=choice==="APPROVE"?"APPROVED":choice==="REJECT"?"REJECTED":null;
   if(!next)return {ok:false,code:"INVALID_CHOICE"};
   if(row.status===next)return {ok:true,duplicate:true};
   if(row.status!=="PENDING")return {ok:false,code:"ALREADY_REVIEWED"};
   row.status=next;return {ok:true,duplicate:false};
 }
 return {add,review,snapshot:()=>clone(state)};
}
const api={create};
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2BatchDemo=api;
})(typeof window!=="undefined"?window:this);
