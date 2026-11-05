"use strict";
(function(root){
const BASE="https://liff.line.me/2009482137-XxVOIdbI";
const ID=/^V2_[A-Za-z0-9_-]{8,76}$/;
function read(href){
 const params=new URL(href).searchParams;
 if(!params.has("qaReviewId")&&!params.has("qaDecision"))return null;
 if(params.getAll("qaReviewId").length!==1||params.getAll("qaDecision").length!==1||
    !ID.test(params.get("qaReviewId")||"")||!["APPROVE","REJECT"].includes(params.get("qaDecision")))
  throw Error("審核連結無效，請保留原申請編號交由管理者核對。");
 return {requestId:params.get("qaReviewId"),decision:params.get("qaDecision")};
}
function uri(id,decision){
 if(!ID.test(id)||!["APPROVE","REJECT"].includes(decision))throw Error("QA_REVIEW_LINK_INVALID");
 return BASE+"?qaReviewId="+encodeURIComponent(id)+"&qaDecision="+decision;
}
const api={read,uri};
if(typeof module==="object"&&module.exports)module.exports=api;
else root.V2QAReviewEntry=api;
})(typeof window!=="undefined"?window:this);
