"use strict";
// Keep the tested QA journal unchanged; adapt company text in a separate build.
const fs=require('node:fs'),path=require('node:path');
const input=fs.readFileSync(path.join(__dirname,'V2_BatchAppendJournal.js'),'utf8');
const before='!/^[A-Za-z0-9_-]{2,40}$/.test(String(row.company||""))';
if(input.split(before).length!==2)throw Error('JOURNAL_COMPANY_CONTRACT_CHANGED');
const after='(typeof row.company!=="string"||row.company.length<1||row.company.length>80||row.company.trim()!==row.company||/[\\u0000-\\u001f\\u007f]/.test(row.company))';
fs.writeFileSync(path.join(__dirname,'V2_ProductionJournal_CANDIDATE.js'),
 '/** GENERATED formal candidate journal; not deployed. QA journal remains unchanged. */\n'+input.replace(before,after),'utf8');
console.log('Built separate production candidate journal; no cloud changes');

