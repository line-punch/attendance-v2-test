// Offline tests for unpublished V2 sandbox client. Run:
// node AttendanceV2_SandboxClient.test.js
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const match=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/);
if(!match)throw Error('LIFF inline script missing');
async function suite(){
 let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
 function browser(options={}){
  const nodes={},events={},forms=[],storage=new Map();
  const $=id=>nodes[id]||(nodes[id]={id,hidden:true,disabled:false,
    textContent:'',value:'',addEventListener(n,fn){this.listener=fn}});
  const listeners={},frames=[];
  const doc={
   getElementById:$,
   createElement(tag){
    const item={tag,style:{},children:[],setAttribute(){},remove(){},
      appendChild(child){this.children.push(child)}};
    if(tag==='iframe')item.contentWindow={};
    if(tag==='form')item.submit=()=>{
      const values=Object.fromEntries(item.children.map(x=>[x.name,x.value]));
      const call={op:values.operation,api:item.action,request:JSON.parse(values.payload)};
      forms.push(call);
      const frame=frames.find(x=>x.name===item.target);
      let result;
      if(call.op==='verify')result={ok:true,verified:true};
      else if(call.op==='whoami')result=browserState.bound?
        {ok:true,bound:true,employee:{name:'模擬員工甲',employeeId:'TEST001'}}:
        {ok:true,bound:false};
      else if(call.op==='bind'){browserState.bound=true;result={ok:true,bound:true}}
      else if(call.op==='todayAttendance')result=browserState.failToday
        ?{ok:false,error:'今日資料查詢尚未完成',code:'UNKNOWN'}
        :{ok:true,date:'2026/10/22',
          clockIn:browserState.history.clockIn,clockOut:browserState.history.clockOut,
          total:Number(!!browserState.history.clockIn)+Number(!!browserState.history.clockOut)};
      else if(call.op==='clock'){
        browserState.record=call.request;
        if(browserState.failUnknown)result={ok:false,code:'UNKNOWN',error:'結果未確認'};
        else result=browserState.failGPS?
          {ok:false,error:'超出測試打卡允許範圍',code:'OUT_OF_RANGE',persisted:false}:
          {ok:true,found:true,date:'2026/10/22',time:'12:34:56',
          type:call.request.type,message:'測試打卡成功'};
      }else if(call.op==='clockStatus')result={ok:true,found:!!browserState.record,
        date:'2026/10/22',time:'12:34:56',type:'上班'};
      else throw Error('Unexpected API operation '+call.op);
      Promise.resolve().then(()=>listeners.message?.({
        origin:'https://script.googleusercontent.com',
        source:frame.contentWindow,
        data:result.ok===false?
          {bridge:'YC_V2_STAGING_FORM_V1',nonce:values.nonce,ok:false,
            error:result.error,code:result.code,persisted:result.persisted}:
          {bridge:'YC_V2_STAGING_FORM_V1',nonce:values.nonce,ok:true,result}
      }));
    };
    return item;
   },
   body:{appendChild(item){if(item.tag==='iframe')frames.push(item)}}
  };
  const browserState={bound:!!(options&&options.bound),record:null,failGPS:false,failUnknown:false,failToday:false,history:(options&&options.history)||{clockIn:null,clockOut:null}};
  const storageAPI={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)};
  const win={addEventListener:(n,cb)=>listeners[n]=cb,
    removeEventListener:n=>{delete listeners[n]}};
  class MockURL {constructor(uri){this.protocol=uri.split(':')[0]+':';
    this.hostname=uri.split('/')[2]||''}}
  const scope={document:doc,window:win,sessionStorage:storageAPI,
    navigator:{geolocation:{getCurrentPosition:cb=>cb({coords:{
      latitude:25,longitude:121,accuracy:12}})}},
    liff:{async init(){},isLoggedIn:()=>true,
      getIDToken:()=> 'synthetic.jwt.token',login(){throw Error('unexpected login')}},
    Uint8Array,JSON,Object,Array,Promise,Math,Number,String,Error,Date,URL:MockURL,
    globalThis:{crypto:{getRandomValues}},
    crypto:{getRandomValues},
    setTimeout:(fn,ms)=>{if(ms!==45000)Promise.resolve().then(fn);return 1},
    clearTimeout(){}};
  let randomSequence=0;
  function getRandomValues(bytes){randomSequence++;
    for(let i=0;i<bytes.length;i++)bytes[i]=(i+11+randomSequence)%256;
    return bytes}
  const src=options&&options.today?match[1].replace('enableTodayQuery:false','enableTodayQuery:true'):match[1];
  vm.createContext(scope);vm.runInContext(src,scope);
  return {$,forms,storage,browserState,scope};
 }
 const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
 const a=browser(false);await settle();
 test('stage-4 unpublished feature supports isolated LINE, binding, and GPS clock',()=>{
   assert.ok(html.includes('enableDataTesting:true'));
   assert.ok(html.includes('enableBinding:true'));
   assert.ok(html.includes('enableClock:true'));
 });
 test('initial unbound TEST001 UI hides all GPS clock buttons',()=>{
   assert.deepEqual(a.forms.map(x=>x.op),['verify','whoami']);
   assert.equal(a.$('sandbox').hidden,false);
   assert.equal(a.$('bindPane').hidden,false);
   assert.equal(a.$('clockPane').hidden,true);
   assert.ok(a.$('bindState').textContent.includes('TEST001 尚未綁定'));
   assert.ok(a.$('status').textContent.includes('隔離資料服務連線成功'));
 });
 test('no clock calls before test employee is bound',()=>{
   assert.deepEqual(a.forms.map(x=>x.op),['verify','whoami']);
 });
 await test('single invitation binds TEST001 then displays clock UI',async()=>{
   a.$('inviteCode').value='AB'.repeat(16);
   await a.scope.bindSandbox();await settle();
   assert.ok(a.forms.some(x=>x.op==='bind' && x.request.invitationCode==='AB'.repeat(16)));
   assert.equal(a.$('clockPane').hidden,false);
   assert.equal(a.$('bindPane').hidden,true);
   assert.ok(a.$('bindState').textContent.includes('TEST001'));
   assert.equal(a.$('inviteCode').value,'');
 });
 const b=browser(true);await settle();
 test('data phase checks whoami after verified LINE login',()=>{
   assert.deepEqual(b.forms.map(x=>x.op),['verify','whoami']);
   assert.equal(b.$('bindPane').hidden,false);
 });
 b.$('inviteCode').value='AB'.repeat(16);
 await b.scope.bindSandbox();await settle();
 test('one-time invitation bind appears in test API POST',()=>{
   assert.ok(b.forms.some(x=>x.op==='bind'&&x.request.invitationCode==='AB'.repeat(16)));
   assert.equal(b.$('clockPane').hidden,false);
 });
 await b.scope.testClock('上班');await settle();
 test('GPS clock sends fresh timestamp and accuracy',()=>{
   const clock=b.forms.find(x=>x.op==='clock');
   assert.equal(clock.request.accuracy,12);
   assert.ok(Number.isFinite(clock.request.capturedAt));
   assert.equal(clock.api,'https://script.google.com/macros/s/AKfycbwifAR8KLSD11HlLZF4Yy1ROTrbZv2c0DUBqlOaXxzO6rTvDc_Mqs6R-UbThBBbhSQ1/exec');
   assert.ok(b.$('clockStatus').textContent.includes('測試打卡成功'));
 });
 test('success clears pending duplicate-protection state',()=>assert.equal(b.storage.size,0));
 b.browserState.failGPS=true;
 await b.scope.testClock('下班');await settle();
 test('known GPS denial clears pending and shows actionable error',()=>{
   assert.equal(b.storage.size,0);
   assert.ok(b.$('clockStatus').textContent.includes('打卡未寫入'));
 });
 await test('uncertain write reply keeps request ID and blocks new requests',async()=>{
   b.browserState.failGPS=false;b.browserState.failUnknown=true;
   await b.scope.testClock('下班');await settle();
   assert.equal(b.storage.size,1);
   const count=b.forms.filter(x=>x.op==='clock').length;
   await b.scope.testClock('下班');await settle();
   assert.equal(b.forms.filter(x=>x.op==='clock').length,count);
   assert.ok(b.$('clockStatus').textContent.includes('上一筆打卡尚未確認'));
 });
 await test('status query confirms original request and clears pending',async()=>{
   await b.scope.checkPendingClock();await settle();
   assert.equal(b.storage.size,0);
   assert.ok(b.$('clockStatus').textContent.includes('已確認打卡成功'));
 });

 test('today query is not published before new GAS redeployment',()=>{
   assert.ok(html.includes('enableTodayQuery:false'));
   assert.equal(a.forms.some(x=>x.op==='todayAttendance'),false);
   assert.equal(a.$('todayPane').hidden,true);
 });
 await test('returning bound iPhone auto-displays today in/out times without request ID',async()=>{
   const c=browser({bound:true,today:true,history:{
     clockIn:{time:'09:13:05',placeName:'測試場地'},
     clockOut:{time:'18:47:56',placeName:'測試場地'}
   }});
   await settle();
   assert.deepEqual(c.forms.map(x=>x.op),['verify','whoami','todayAttendance']);
   assert.equal(c.$('todayPane').hidden,false);
   assert.equal(c.$('clockPane').hidden,false);
   assert.ok(c.$('todayStatus').textContent.includes('上班：09:13:05'));
   assert.ok(c.$('todayStatus').textContent.includes('下班：18:47:56'));
   assert.equal(c.storage.size,0);
 });
 await test('manual today refresh shows newly completed shift',async()=>{
   const c=browser({bound:true,today:true,history:{
     clockIn:{time:'09:13:05',placeName:'測試場地'},clockOut:null
   }});
   await settle();
   assert.ok(c.$('todayStatus').textContent.includes('下班：尚未查到紀錄'));
   c.browserState.history.clockOut={time:'18:47:56',placeName:'測試場地'};
   await c.scope.refreshTodayAttendance();await settle();
   assert.ok(c.$('todayStatus').textContent.includes('下班：18:47:56'));
 });
 console.log('TOTAL '+passed+' passed');
}
suite().catch(e=>{console.error(e);process.exitCode=1});
