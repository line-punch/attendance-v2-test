// Offline tests for unpublished V2 sandbox client. Run:
// node AttendanceV2_SandboxClient.test.js
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const match=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/);
if(!match)throw Error('LIFF inline script missing');
async function suite(){
 let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
 function browser(enableData){
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
      else if(call.op==='clock'){
        browserState.record=call.request;
        result=browserState.failGPS?
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
  const browserState={bound:false,record:null,failGPS:false};
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
  function getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(i+11)%256;return bytes}
  const src=enableData?match[1]
    .replace('enableDataTesting:false','enableDataTesting:true')
    .replace('__PENDING_V2_SANDBOX_DATA_EXEC_URL__','https://example.test/data'):match[1];
  vm.createContext(scope);vm.runInContext(src,scope);
  return {$,forms,storage,browserState,scope};
 }
 const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
 const a=browser(false);await settle();
 test('feature flag disabled by default',()=>assert.ok(html.includes('enableDataTesting:false')));
 test('verify-only page sends one request and hides data UI',()=>{
   assert.deepEqual(a.forms.map(x=>x.op),['verify']);
   assert.equal(a.$('sandbox').hidden,true);
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
   assert.equal(clock.api,'https://example.test/data');
   assert.ok(b.$('clockStatus').textContent.includes('測試打卡成功'));
 });
 test('success clears pending duplicate-protection state',()=>assert.equal(b.storage.size,0));
 b.browserState.failGPS=true;
 await b.scope.testClock('下班');await settle();
 test('known GPS denial clears pending and shows actionable error',()=>{
   assert.equal(b.storage.size,0);
   assert.ok(b.$('clockStatus').textContent.includes('打卡未寫入'));
 });
 console.log('TOTAL '+passed+' passed');
}
suite().catch(e=>{console.error(e);process.exitCode=1});
