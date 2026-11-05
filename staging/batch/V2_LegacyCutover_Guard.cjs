"use strict";
// Prepare only. Never opens an existing project or changes its deployment.
const MARK='YC_STAFF_V2_LEGACY_CUTOVER_GUARD';
const ANCHOR='    const action = trim_(p.action);';
const INSERT=ANCHOR+'\n\n    // '+MARK+' — default OFF; old LINE postback handling is unchanged.\n    if (PropertiesService.getScriptProperties().getProperty("STAFF_LEGACY_WRITE_DISABLED") === "yes") {\n      return output_({ok:false, message:"此舊入口已切換，請回到 YC/YT員工系統的選單操作。"}, callback);\n    }';
function patch(source){
 if(typeof source!=='string'||source.includes(MARK)||source.split(ANCHOR).length!==2||!source.includes('function doGet(e) {')||!source.includes('function doPost(e) {'))throw Error('LEGACY_SOURCE_NOT_EXACT_OR_ALREADY_PATCHED');
 const post=source.slice(source.indexOf('function doPost(e) {')),out=source.replace(ANCHOR,INSERT);
 if(out.slice(out.indexOf('function doPost(e) {'))!==post)throw Error('LEGACY_POSTBACK_MUST_REMAIN_IDENTICAL');
 return out;
}
module.exports={patch,MARK,ANCHOR,INSERT};

