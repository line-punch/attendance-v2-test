"use strict";
/**
 * V2 test-only leave status UI controller CANDIDATE (not wired to LINE).
 *
 * Future integration after a separately tested backend deployment:
 *   const ctl = V2LeaveStatusClient.create({
 *     isAuthenticated: () => boundTEST001,
 *     query: ({requestId}) => sandboxCall("leaveStatus",{requestId}),
 *     onChange: renderStatus
 *   });
 *
 * Neither this module nor the candidate preview contains an Apps Script URL,
 * LINE ID Token, credentials, or a live network operation.
 */
(function(root){
  function create(options){
    if(!options || typeof options.query!=="function" ||
       typeof options.isAuthenticated!=="function"||
       typeof options.onChange!=="function")
      throw Error("Missing status query dependencies");
    var busy=false,last={state:"IDLE",message:"尚未查詢",requestId:null};
    function publish(x){last=Object.freeze(x);options.onChange(last);return last;}
    async function queryLeave(requestId){
      if(busy)return {state:"BUSY",message:"正在查詢，請勿重複按下"};
      if(!options.isAuthenticated())
        return publish({state:"AUTH_REQUIRED",message:"請先驗證 TEST001 的 LINE 測試身分",requestId:null});
      if(typeof requestId!=="string" || !/^LEAVEV2_TEST_[A-Z0-9_]{10,60}$/.test(requestId))
        return publish({state:"INVALID_ID",message:"無效的模擬假單編號",requestId:null});
      busy=true;publish({state:"QUERYING",message:"正在查詢原假單編號…",requestId});
      try{
        // Caller provides its existing identity-verified TEST001 sandboxCall.
        // No employeeId, company, GPS, token or spreadsheet ID is submitted.
        var res=await options.query({requestId});
        if(!res || res.ok!==true || res.readOnly!==true || res.synthetic!==true||
           res.requestId!==requestId)
          return publish({state:"UNKNOWN",message:"查詢結果尚未確認，請稍後用相同單號再查詢",requestId});
        if(res.found===true && res.status==="PENDING_REVIEW_TEST")
          return publish({state:"FOUND",message:"已確認假單存在，狀態：待審核（測試）",requestId});
        if(res.found===false && res.status==="NOT_FOUND_YET")
          return publish({state:"NOT_FOUND_YET",
            message:"目前尚未查到此單，並不表示送單失敗。請保留單號並稍後查詢。",requestId});
        return publish({state:"UNKNOWN",message:"伺服器回覆無法確認，請勿直接重新送單",requestId});
      }catch(e){
        if(e && (e.code==="AUTH"||e.code==="NOT_BOUND"))
          return publish({state:"AUTH_REQUIRED",message:"LINE 測試身分已失效，請重新驗證",requestId});
        return publish({state:"UNKNOWN",
          message:"查詢連線未完成，結果不明；請保留原單號並稍後重查",requestId});
      }finally{busy=false;}
    }
    return Object.freeze({queryLeave,getState:()=>last,isBusy:()=>busy});
  }
  var api=Object.freeze({create});
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.V2LeaveStatusClient=api;
})(typeof window!=="undefined"?window:this);
