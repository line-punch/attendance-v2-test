// Standalone preview guardrails; safe in CI (no LINE/GAS network).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const code=fs.readFileSync(__dirname+'/app.js','utf8');
const PAGES=['clock','miss','query','leave','annual','payslip','history'];
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('all original four tabs and all three planned tabs exist',()=>{
 for(const name of PAGES){
   assert.ok(html.includes('id="page-'+name+'"'));
   assert.ok(html.includes('data-page="'+name+'"'));
 }
});
test('UI has visible coming-soon information without fabricated earnings',()=>{
 for(const text of ['特休查詢建置中','薪資查詢建置中','歷史查詢建置中'])
   assert.ok(html.includes(text));
 assert.ok(html.includes('不顯示推估餘額'));
 assert.ok(html.includes('未發布月份不顯示金額'));
});
test('legacy leave and missed-punch forms retain their input fields',()=>{
 for(const id of ['missDate','missType','missTime','missReason',
  'queryMonth','leaveDate','leaveUnit','leaveType','leaveReason',
  'missHistory','leaveHistory'])
   assert.ok(html.includes('id="'+id+'"'));
 for(const item of ['事假','病假','特休','公假','婚假','喪假'])
   assert.ok(html.includes('value="'+item+'"'));
});
test('preview cannot call LINE, Apps Script, GPS or unsafe JSONP',()=>{
 assert.ok(!html.includes('line-scdn.net/liff'));
 for(const forbidden of ['script.google.com','liff.','jsonp','fetch(',
   'XMLHttpRequest','getCurrentPosition','sendBeacon','WebSocket'])
   assert.ok(!code.includes(forbidden),forbidden);
 for(const prod of ['2009482137-QgqJEHgA','AKfycbxi93T80nRUb5UH47kFfcfM9BMP'])
   assert.ok(!html.includes(prod)&&!code.includes(prod));
});
test('form submission buttons are disabled in static preview',()=>{
 assert.ok(/onclick="submitMiss\(\)" disabled/.test(html));
 assert.ok(/onclick="submitLeave\(\)" disabled/.test(html));
});
function makePage(){
 const nodes={},buttons=[];
 const el=id=>{
  if(!nodes[id]){
   const cl=new Set();
   nodes[id]={id,value:'',textContent:'',disabled:false,
     min:'',appendChild(child){this.children=(this.children||[]).concat(child)},
     classList:{
       toggle(k,yes){if(yes)cl.add(k);else cl.delete(k)},
       contains(k){return cl.has(k)},
       add(k){cl.add(k)},remove(k){cl.delete(k)}
     }
   };
  }
  return nodes[id];
 };
 for(const page of PAGES){
  const attrs={'data-page':page},cls=new Set();
  buttons.push({getAttribute(k){return attrs[k]},setAttribute(k,v){attrs[k]=v},
   removeAttribute(k){delete attrs[k]},
   classList:{toggle(k,on){if(on)cls.add(k);else cls.delete(k)},contains:k=>cls.has(k)}});
 }
 el('v2Navigation').querySelectorAll=()=>buttons;
 const document={getElementById:el,createElement(tag){return {tag,value:'',textContent:''}}};
 const ctx={document,Intl,Date,Object,Array,JSON,String,Number,Math};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,el,buttons};
}
const p=makePage();
test('startup shows clock page and a trustworthy preview warning',()=>{
 assert.ok(p.el('page-clock').classList.contains('active'));
 assert.ok(p.el('v2Status').textContent.includes('未連接 LINE'));
 assert.ok(p.el('msg').textContent.includes('不會送出'));
});
test('seven navigation buttons open only their matching page',()=>{
 for(const page of PAGES){
  p.ctx.showPage(page);
  assert.ok(p.el('page-'+page).classList.contains('active'));
  assert.equal(PAGES.filter(x=>p.el('page-'+x).classList.contains('active')).length,1);
  assert.equal(p.buttons.filter(x=>x.classList.contains('active')).length,1);
 }
});
test('unknown tab falls back to clock without a request',()=>{
 p.ctx.showPage('unknown');
 assert.ok(p.el('page-clock').classList.contains('active'));
});
test('clock and application actions provide local explanations only',()=>{
 p.ctx.punch('上班');p.ctx.submitMiss();p.ctx.submitLeave();
 assert.ok(p.el('msg').textContent.includes('不會產生任何紀錄'));
 assert.ok(p.el('missMsg').textContent.includes('預覽不儲存'));
 assert.ok(p.el('leaveMsg').textContent.includes('預覽不建立'));
});
test('leave hour selector toggles the original hourly fields',()=>{
 p.el('leaveUnit').value='時數';
 p.ctx.toggleLeaveMode();
 assert.equal(p.el('hourBox').classList.contains('hidden'),false);
 p.el('leaveUnit').value='全天';
 p.ctx.toggleLeaveMode();
 assert.equal(p.el('hourBox').classList.contains('hidden'),true);
});
test('attendance month query returns placeholder, never fabricated rows',()=>{
 p.el('queryMonth').value='202610';
 p.ctx.queryAttendance();
 assert.ok(p.el('queryMsg').textContent.includes('待安全資料服務串接'));
 assert.ok(p.el('queryList').textContent.includes('不讀取實際員工'));
});
console.log('TOTAL '+passed+' passed');
