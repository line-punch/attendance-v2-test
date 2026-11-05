"use strict";
const assert=require('node:assert/strict'),{build}=require('./build-staff-client.cjs');
assert.throws(()=>build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2012136707-Synthetic'),/REQUIRED/);
assert.throws(()=>build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2009482137-QgqJEHgA'),/REQUIRED/);
const a=build('https://script.google.com/macros/s/SYNTHETIC_ONLY/exec','2009482137-Synthetic');
assert.ok(a['app.js'].includes('candidateRoute:"staff-v1"'));
assert.ok(a['app.js'].includes('YC_V2_STAFF_V1'));
assert.ok(!a['app.js'].includes('v2_candidate_phone_'));
assert.ok(a['app.js'].includes('"V2_GPS_"'));
assert.ok(a['review-entry.js'].includes('/^V2_'));
assert.ok(a['index.html'].includes('<title>YC/YT員工系統</title>'));
assert.ok(!a['index.html'].includes('TEST001'));
assert.ok(!a['app.js'].includes('candidateRoute:"v1"'));
console.log('PASS offline staff frontend route, distinct storage, identity prefix and public display; no browser or LINE calls');

