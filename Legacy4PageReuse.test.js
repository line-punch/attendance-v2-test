// Offline checks for the original four-page UI reused with V2 isolation.
// Run from repo root: node Legacy4PageReuse.test.js
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/Legacy4PageReuse.html','utf8');
const js=fs.readFileSync(__dirname+'/Legacy4PageReuse.js','utf8');
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
async function asyncTest(name,fn){await fn();passed++;console.log('PASS '+name)}
function runtime(options={}){
  const els={},apiCalls=[],events=[],nodes=[];
  const el=id=>{
    if(!els[id]){
      const tags=new Set();
      els[id]={id,value:'',textContent:'',innerText:'',innerHTML:'',
       disabled:false,style:{},appendChild(x){nodes.push(x)},
       classList:{
         add:t=>tags.add(t),remove:t=>tags.delete(t),
         contains:t=>tags.has(t),toggle:(t,on)=>{
           const flag=on===undefined?!tags.has(t):!!on;
           if(flag)tags.add(t);else tags.delete(t);
         }
       }};
    }
    return els[id];
  };
  // Simulate the seven navigation buttons and their selected state.
  const navItems=['clock','miss','query','leave','annual','payslip','history'].map(page=>{
    const item={page,attributes:{'data-page':page},classList:null,
      getAttribute(k){return this.attributes[k]||null},
      setAttribute(k,v){this.attributes[k]=v},
      removeAttribute(k){delete this.attributes[k]}
    };
    const flags=new Set();
    item.classList={contains:k=>flags.has(k),toggle:(k,yes)=>yes?flags.add(k):flags.delete(k)};
    return item;
  });
  el('v2Navigation').querySelectorAll=()=>navItems;
  const document={
    getElementById:el,
    createElement(type){
      const node={type,style:{},value:'',name:'',target:'',
        setAttribute(){},remove(){},children:[],
        appendChild(c){this.children.push(c)},
        submit(){const p=Object.fromEntries(this.children.map(x=>[x.name,x.value]));
          events.push({action:this.action,method:this.method,...p});
        }
      };
      return node;
    },
    body:{appendChild(x){nodes.push(x)}}
  };
  const win={addEventListener(){},removeEventListener(){}};
  const liff={init:async()=>{},isLoggedIn:()=>false,login(){},getIDToken:()=>null};
  const context={document,window:win,location:{search:options.search||''},
    liff,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    navigator:{},globalThis:{crypto:{getRandomValues(x){x.fill(7);return x}}},
    crypto:{getRandomValues(x){x.fill(7);return x}},
    Uint8Array,URL,URLSearchParams,Intl,Date,Math,JSON,Object,String,Number,
    Array,Promise,Error,setTimeout,clearTimeout,console};
  vm.createContext(context);
  vm.runInContext(js,context);
  return {context,el,apiCalls,events,navItems};
}
const settle=async()=>{for(let i=0;i<25;i++)await Promise.resolve()};
(async()=>{
 test('preserves all four existing attendance form pages',()=>{
   for(const p of ['clock','miss','query','leave'])
     assert.ok(html.includes('id="page-'+p+'"'));
 });
 test('keeps existing form fields and original approved leave types',()=>{
   for(const id of ['missDate','missTime','missReason','queryMonth',
        'leaveDate','leaveType','leaveUnit','leaveReason','missHistory','leaveHistory'])
     assert.ok(html.includes('id="'+id+'"'));
   for(const type of ['事假','病假','特休','公假','婚假','喪假'])
     assert.ok(html.includes('value="'+type+'"'));
 });
 test('contains no legacy GAS or production LIFF endpoints',()=>{
   const all=html+js;
   assert.equal(all.includes('2009482137-QgqJEHgA'),false);
   assert.equal(all.includes('AKfycbxi93T80nRUb5UH47kFfcfM9BMP'),false);
   assert.equal(all.includes('jsonpRequest('),false);
   assert.ok(all.includes('2012136707-2dDU0aSJ'));
 });
 test('leave and missed punch submit buttons remain disabled',()=>{
   assert.ok(/onclick="submitMiss\(\)" disabled/.test(html));
   assert.ok(/onclick="submitLeave\(\)" disabled/.test(html));
 });
 test('all legacy inline callback function names have safe replacements',()=>{
   for(const f of ['showPage','bindEmployee','punch','submitMiss',
       'queryAttendance','toggleLeaveMode','submitLeave','loadMissHistory','loadLeaveHistory'])
     assert.ok(new RegExp('function '+f+'\\(').test(js));
 });
 const a=runtime({search:'?page=miss'});await settle();
 test('page parameter can open existing missed punch page',()=>{
   assert.equal(a.context.v2State?.page,undefined); // lexical state not exposed
   assert.ok(a.el('page-miss').classList.contains('active'));
   assert.equal(a.el('page-clock').classList.contains('active'),false);
 });
 test('new annual leave, payslip and history panels are present and explicitly marked as pending',()=>{
   for(const p of ['annual','payslip','history']){
     assert.ok(html.includes('id="page-'+p+'"'));
     assert.ok(html.includes('data-page="'+p+'"'));
   }
   for(const word of ['特休查詢建置中','薪資查詢建置中','歷史查詢建置中'])
     assert.ok(html.includes(word));
 });
 test('new modules navigate to real panes without any API requests',()=>{
   for(const p of ['annual','payslip','history']){
     a.context.showPage(p);
     assert.equal(a.el('page-'+p).classList.contains('active'),true);
     assert.equal(a.events.length,0);
     assert.equal(a.navItems.filter(x=>x.classList.contains('active')).length,1);
     assert.equal(a.navItems.find(x=>x.page===p).getAttribute('aria-current'),'page');
   }
 });
 test('all seven modules retain working back-and-forth navigation',()=>{
   for(const p of ['clock','miss','query','leave','annual','payslip','history']){
     a.context.showPage(p);
     assert.ok(a.el('page-'+p).classList.contains('active'));
     assert.equal(a.navItems.find(x=>x.page===p).classList.contains('active'),true);
   }
   a.context.showPage('does-not-exist');
   assert.ok(a.el('page-clock').classList.contains('active'));
 });
 test('future modules do not display fabricated special-leave or salary numbers',()=>{
   const placeholders=html.slice(html.indexOf('id="page-annual"'),html.indexOf('id="page-history"'));
   assert.equal(placeholders.includes('可用餘額：8'),false);
   assert.equal(placeholders.includes('月薪：'),false);
   assert.ok(placeholders.includes('尚未串接'));
 });
 test('v2 page select navigates without API writes',()=>{
   a.context.showPage('leave');
   assert.ok(a.el('page-leave').classList.contains('active'));
   assert.equal(a.events.length,0);
 });
 test('frontend identity cannot be forged by typing employee ID',()=>{
   a.el('empid').value='OTHER';
   a.context.bindEmployee();
   assert.ok(a.el('bindMsg').textContent.includes('邀請碼'));
   assert.equal(a.context.getActiveEmpid(),'');
 });
 await asyncTest('locked form submit functions never send to GAS',async()=>{
   await a.context.submitMiss();await a.context.submitLeave();
   assert.ok(a.el('missMsg').textContent.includes('尚未完成'));
   assert.ok(a.el('leaveMsg').textContent.includes('尚未完成'));
   assert.equal(a.events.length,0);
 });
 await asyncTest('legacy month query fails closed until integrated DATA TEST service ready',async()=>{
   a.el('queryMonth').value='202610';
   await a.context.queryAttendance();
   assert.ok(a.el('queryMsg').textContent.includes('請先登入'));
   assert.equal(a.events.length,0);
 });
 test('role protection rejects unapproved operations at the transport boundary',()=>{
   assert.ok(js.includes('const allowed=["whoami","todayAttendance","clock","clockStatus"'));
   assert.equal(js.includes('"submitLeave"'),false);
   assert.equal(js.includes('"submitMiss"'),false);
 });
 console.log('TOTAL '+passed+' passed');
})().catch(e=>{console.error(e);process.exitCode=1});
