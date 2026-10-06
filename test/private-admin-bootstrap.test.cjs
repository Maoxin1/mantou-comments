'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const email='owner-fixture@example.invalid';
const input=()=>({email,displayName:'Fixture Owner',password:'synthetic-password-123',confirmPassword:'synthetic-password-123'});
function fixture({existing=false,fail,unverified=false}={}){
 const statements=[],values=[];let disposed=0,acquired=0;
 const client={connection:{stream:{encrypted:true,authorized:!unverified,getProtocol:()=> 'TLSv1.3'}},async query(sql,params){statements.push(sql);if(params)values.push(params);if(fail===sql)throw new Error('SYNTHETIC_SECRET private-host');if(sql==='SHOW transaction_read_only')return{rows:[{transaction_read_only:'off'}]};if(sql==='SELECT id FROM public.wl_users LIMIT 1')return{rows:existing?[{id:1}]:[]};if(sql.startsWith('INSERT INTO'))return{rows:[{id:1}]};return{rows:[]};}};
 return{statements,values,client,acquire:async()=>{acquired++;return{client,dispose:async()=>{disposed++;}};},counts:()=>({acquired,disposed})};
}
function make(f,options={}){return require('../src/private-admin-bootstrap.cjs').createPrivateAdministratorBootstrap({authorize:async()=>true,expectedEmail:email,acquire:f.acquire,...options});}
test('private bootstrap: authorization must be literal true before input or connection',async()=>{
 for(const authorize of [undefined,async()=>false,async()=>({ok:true}),async()=>{throw Error('SYNTHETIC_SECRET');}]){
  const f=fixture();let reads=0;const result=await make(f,{authorize})({readInput:()=>{reads++;return input();}});assert.equal(result.status,'denied');assert.equal(reads,0);assert.deepEqual(f.counts(),{acquired:0,disposed:0});
 }
});
test('private bootstrap: rejects identity mismatch, unknown role fields and invalid password before connecting',async()=>{
 for(const delta of [{email:'other@example.invalid'},{type:'administrator'},{password:'short',confirmPassword:'short'},{confirmPassword:'not same'},{password:'界'.repeat(25),confirmPassword:'界'.repeat(25)},{displayName:'bad\0name'}]){
 const f=fixture();const r=await make(f)({readInput:()=>({...input(),...delta})});assert.equal(r.status,'invalid_input');assert.equal(f.counts().acquired,0);}
});
test('private bootstrap: strict TLS gate prevents transaction statements',async()=>{
 const f=fixture({unverified:true});const r=await make(f)({readInput:input});assert.equal(r.status,'failed');assert.equal(r.stage,'tls');assert.deepEqual(f.statements,[]);assert.equal(f.counts().disposed,1);
});
test('private bootstrap: parameterized single-admin insert uses installed compatible bcrypt and commits',async()=>{
 const f=fixture();const r=await make(f)({readInput:input});assert.deepEqual(r,{status:'created',administratorId:1,cleanup:'confirmed'});
 assert.deepEqual(f.statements.slice(0,4),['BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE','SHOW transaction_read_only','LOCK TABLE public.wl_users IN EXCLUSIVE MODE','SELECT id FROM public.wl_users LIMIT 1']);
 assert.match(f.statements[4],/^INSERT INTO public\.wl_users \(email, display_name, password, type\) VALUES \(\$1, \$2, \$3, 'administrator'\) RETURNING id$/);assert.equal(f.statements.at(-1),'COMMIT');
 assert.equal(f.values.length,1);assert.equal(f.values[0][0],email);assert.equal(f.values[0][1],'Fixture Owner');assert.match(f.values[0][2],/^\$2[aby]\$10\$/);assert.equal(new(require('phpass').PasswordHash)().checkPassword(input().password,f.values[0][2]),true);assert.doesNotMatch(JSON.stringify(r),/synthetic-password|\$2|owner-fixture/);assert.deepEqual(f.counts(),{acquired:1,disposed:1});
});
test('private bootstrap: any existing user blocks creation without overwrite',async()=>{
 const f=fixture({existing:true});const r=await make(f)({readInput:input});assert.equal(r.status,'blocked_nonempty');assert.equal(f.statements.some(x=>x.startsWith('INSERT')),false);assert.equal(f.statements.at(-1),'ROLLBACK');assert.equal(f.counts().disposed,1);
});
test('private bootstrap: precommit errors roll back and never expose exception details',async()=>{
 const f=fixture({fail:'LOCK TABLE public.wl_users IN EXCLUSIVE MODE'});const r=await make(f)({readInput:input});assert.equal(r.status,'failed');assert.equal(f.statements.at(-1),'ROLLBACK');assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET|private-host/);assert.equal(f.counts().disposed,1);
});
test('private bootstrap: ambiguous COMMIT outcome never retries, rolls back or claims absence',async()=>{
 const f=fixture({fail:'COMMIT'});const r=await make(f)({readInput:input});assert.equal(r.status,'outcome_unknown');assert.equal(f.statements.filter(x=>x==='COMMIT').length,1);assert.equal(f.statements.includes('ROLLBACK'),false);assert.equal(f.counts().disposed,1);
});
test('private bootstrap: committed account is not reported absent when cleanup fails',async()=>{
 const f=fixture();const acquire=async()=>({client:f.client,dispose:async()=>{throw Error('SYNTHETIC_SECRET');}});const r=await make(f,{acquire})({readInput:input});assert.equal(r.status,'created');assert.equal(r.cleanup,'unconfirmed');assert.equal(r.administratorId,1);
});
test('private bootstrap: production entry remains inert and no secret input is configured on import',()=>{
 const fs=require('node:fs');assert.doesNotMatch(fs.readFileSync(require.resolve('../index.cjs'),'utf8'),/private-admin-bootstrap/);const m=require('../src/private-admin-bootstrap.cjs');assert.deepEqual(Object.keys(m),['createPrivateAdministratorBootstrap']);
});

test('private bootstrap: overrides inherited snapshot isolation before the locked emptiness recheck',async()=>{
 const f=fixture();await make(f)({readInput:input});assert.equal(f.statements[0],'BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE');
});
