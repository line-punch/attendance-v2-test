"use strict";
// Offline adapter for a downloaded, validated TEST001 snapshot. No network.
const fs=require('node:fs');
const standard=require('./V2_OperationalExport.js');
const layout=require('./V2_ExistingSheetLayoutExport.js');
const snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const names=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const audit=standard.tables(snapshot), legacy=layout.tables(snapshot,{names});
const files={};
for(const [key,table] of Object.entries(audit))files['audit/'+key+'.csv']=standard.csv(table);
const labels={clock:'打卡紀錄',leaves:'請假申請',missing:'補打卡申請'};
for(const [key,table] of Object.entries(legacy.tables))files[labels[key]+'.csv']=standard.csv(table);
process.stdout.write(JSON.stringify({files,rows:Object.fromEntries(Object.entries(audit).map(([k,t])=>[k,t.length-1])),warnings:legacy.warnings,layoutMatched:true,excelProgramValidated:false}));

