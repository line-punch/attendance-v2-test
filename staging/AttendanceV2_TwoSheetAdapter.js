"use strict";
/* V2 isolated Sheet-to-rule mapper. Pure JS; NO spreadsheet access.
 * All real range reads must be performed by an authorized server.
 * Inputs are headerless row arrays from verified sheets (never public files).
 */
(function(root){
  function required(v){return typeof v==="string" && v.trim()!=="";}
  function str(v){return v===null||v===undefined?"":String(v).trim();}
  function date(v){return str(v).replaceAll("/","-");}
  function status(v){return str(v)==="已確認"?"CONFIRMED":"PENDING";}
  function toScope(v){
    return {"全公司":"ALL","指定打卡地點":"WORKPLACE"}[str(v)]||"UNKNOWN";
  }
  // 「公司工作日曆」A:H - only date exceptions need rows.
  function calendarRows(rows, fallbackCompany){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>{
      const raw=str(r[3]);const dayType=raw==="上班"?"WORK":raw==="休假"?"OFF":"UNKNOWN";
      const audit=str(r[7]); // read-only audit stamp: "人名|ISO timestamp"; no write by this adapter
      const parts=audit.split("|");
      return {date:date(r[0]),company:str(r[1])||fallbackCompany,
        workplace:str(r[2]),dayType,reason:str(r[4]),reference:str(r[5]),
        status:parts.length===2&&required(parts[0])&&required(parts[1])?"CONFIRMED":"PENDING",
        confirmedBy:parts[0]||"",confirmedAt:parts[1]||""};
    });
  }
  // 「公司工作日曆」J:N - annual approval in SAME sheet (not monthly).
  // J year, K company, L approval status, M confirmer, N confirmation time.
  function annualChecks(rows){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>({
      year:str(r[0]),company:str(r[1]),status:status(r[2]),
      confirmedBy:str(r[3]),confirmedAt:str(r[4])
    }));
  }
  // 「特殊出勤事件」A:M
  // A event ID, B date, C type, D scope, E optional workplace code,
  // F FULL/PARTIAL, G paid/review, H evidence, I confirmation, J confirmer,
  // K confirmed at, L partial approved minutes, M note.
  function eventRows(rows,activeCompany){
    return (rows||[]).filter(r=>Array.isArray(r)&&str(r[0])).map(r=>{
      const requestedScope=toScope(r[3]),target=str(r[4]),period=str(r[5]);
      // Fail closed: old personal IDs or unintended values in E must not
      // silently change a supposed whole-company event into broad coverage.
      const scope=requestedScope==="ALL"&&target?"UNKNOWN":requestedScope;
      return {eventId:str(r[0]),date:date(r[1]),company:activeCompany,type:str(r[2]),
        scope,workplace:scope==="WORKPLACE"?target:"",
        period:period==="全日"?"FULL":period==="部分"?"PARTIAL":"UNKNOWN",
        payPolicy:str(r[6])==="照常給薪"?"PAID":str(r[6])==="另行核對"?"REVIEW":"UNKNOWN",
        reference:str(r[7]),status:status(r[8]),confirmedBy:str(r[9]),
        confirmedAt:str(r[10]),protectedMinutes:Number(str(r[11])||0),note:str(r[12])};
    });
  }
  const api=Object.freeze({calendarRows,annualChecks,eventRows});
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.AttendanceV2TwoSheetAdapter=api;
})(typeof window!=="undefined"?window:this);
