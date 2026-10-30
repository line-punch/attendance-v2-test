"use strict";
const fs=require("node:fs"),path=require("node:path"),exp=require("./V2_OperationalExport.js");
const root=path.resolve(__dirname,"../.."),evidence=path.join(root,"evidence");
const snapshot=JSON.parse(fs.readFileSync(process.argv[2]||path.join(evidence,"qa-downloaded-records.json"),"utf8"));
const tables=exp.tables(snapshot),out=process.argv[3]||path.join(evidence,"operational-export-preview");
fs.mkdirSync(out,{recursive:true});
for(const [name,table] of Object.entries(tables))fs.writeFileSync(path.join(out,name+".csv"),exp.csv(table),"utf8");
console.log(JSON.stringify({source:"downloaded actual QA snapshot; synthetic employee only",
 rows:Object.fromEntries(Object.entries(tables).map(([name,t])=>[name,t.length-1])),
 note:"Candidate CSV fields; not yet matched to the user's Excel import schema."}));

