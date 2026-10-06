'use strict';
// One joined runtime/page/core/upstream-adapter path; only pg transport is fake.
// This is not PostgreSQL execution, durable storage or deployed-browser evidence.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {EventEmitter}=require('node:events');
const pg=require('pg');

test('private integration: protected runtime, setup, real core login and real upstream model adapter compose over fake pg only',async t=>{
 let row;const clients=[],statements=[];const OriginalClient=pg.Client;
 class FakeClient extends EventEmitter{
  constructor(options){super();this.options=options;this.readyForQuery=true;this.tx='I';this.ended=false;this.connection={stream:{encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3',destroy(){}}};clients.push(this);}
  async connect(){}getTransactionStatus(){return this.tx;}async end(){this.ended=true;}
  async query(sql,values){statements.push(sql);
   if(sql.startsWith('WITH bootstrap_target AS'))return{rows:[Object.fromEntries(['database_ok','role_ok','read_only_ok','table_ok','columns_ok','primary_key_ok','sequence_ok','privileges_ok'].map(k=>[k,true]))]};
   if(sql.startsWith('BEGIN'))this.tx='T';if(sql==='COMMIT'){this.tx='I';if(this.pending)row=this.pending;}if(sql==='ROLLBACK'){this.tx='I';this.pending=undefined;}
   if(sql==='SHOW transaction_read_only')return{rows:[{transaction_read_only:'off'}]};
   if(sql==='SELECT id FROM public.wl_users LIMIT 1')return{rows:row?[{id:row.id}]:[]};
   if(sql.startsWith('INSERT INTO public.wl_users')){this.pending={id:7,email:values[0],display_name:values[1],password:values[2],type:'administrator'};return{rows:[{id:7}]};}
   if(sql.includes('INFORMATION_SCHEMA.COLUMNS'))return{rows:['id','display_name','email','password','type','label','url','avatar','github','twitter','facebook','google','weibo','qq','oidc','huawei','2fa','createdat','updatedat'].map(column_name=>({column_name,data_type:column_name==='id'?'integer':'text',is_nullable:'YES'}))};
   if(sql.includes('pg_indexes'))return{rows:[]};
   if(/^SELECT .*FROM wl_users/.test(sql))return{rows:row?[{...row}]:[]};
   return{rows:[]};
  }
 }
 pg.Client=FakeClient;t.after(()=>{pg.Client=OriginalClient;});
 const restores=[];for(const[obj,key]of [[require('node:net').Socket.prototype,'connect'],[require('node:tls'),'connect'],[require('node:dns'),'lookup']]){const old=obj[key];obj[key]=()=>{throw Error('SYNTHETIC_NETWORK_FORBIDDEN');};restores.push(()=>{obj[key]=old;});}t.after(()=>restores.forEach(f=>f()));
 const host='mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app',origin='https://'+host;
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:host,NODEJS_HELPERS:'0',PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EMAIL:'synthetic-owner@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Synthetic Owner',PRIVATE_ADMIN_ACCESS_KEY:'SYNTHETIC_OWNER_KEY_abcdefghijklmnopqrstuvwxyz_1234567890',JWT_TOKEN:'SYNTHETIC_SIGNING_KEY_ABCDEFGHIJKLMNOPQRSTUVWXYZ_9876543210',PRIVATE_ADMIN_EXPIRES_AT:new Date(Math.floor((Date.now()+3600000)/1000)*1000).toISOString(),POSTGRES_HOST:'ep-synthetic-private-pooler.ap-southeast-1.aws.neon.tech',PGHOST_UNPOOLED:'ep-synthetic-private.ap-southeast-1.aws.neon.tech',POSTGRES_USER:'neondb_owner',POSTGRES_DATABASE:'neondb',POSTGRES_PASSWORD:'SYNTHETIC_ONLY'};
 const handler=require('../deployment/staged-private-admin.cjs').createStagedPrivateAdmin(env);
 async function call(url,cookie,body){const data=body?new URLSearchParams(body).toString():null;const req=Readable.from(data?[Buffer.from(data)]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host,...(cookie?{cookie}:{}),...(body?{origin,'content-type':'application/x-www-form-urlencoded','content-length':String(Buffer.byteLength(data))}:{})}});const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;this.writableEnded=true;}};await handler(req,res);return res;}
 const csrf=r=>r.text.match(/name="csrf" value="([^"]+)"/)[1];const getCookie=(r,name)=>r.headers['set-cookie'].find(v=>v.startsWith(name+'=')).split(';')[0];
 assert.equal((await call('/__private/access')).statusCode,200);assert.equal(clients.length,0);
 assert.equal((await call('/__private/setup')).statusCode,403);assert.equal(clients.length,0);
 const access=await call('/__private/access',null,{ownerAccessKey:env.PRIVATE_ADMIN_ACCESS_KEY});assert.equal(access.statusCode,303);const owner=getCookie(access,'__Host-mantou-owner');assert.equal(clients.length,0);
 const form=await call('/__private/setup',owner);assert.equal(form.statusCode,200);
 const created=await call('/__private/setup',owner,{csrf:csrf(form),password:'Synthetic-password-123',confirmPassword:'Synthetic-password-123'});assert.equal(created.statusCode,303);assert.equal(row.type,'administrator');assert.match(row.password,/^\$2[aby]\$10\$/);
 assert.equal((await call('/__private/setup',owner)).statusCode,409);
 const loginForm=await call('/__private/login',owner);const logged=await call('/__private/login',owner,{csrf:csrf(loginForm),password:'Synthetic-password-123'});assert.equal(logged.statusCode,303);
 const session=owner+'; '+getCookie(logged,'__Host-mantou-admin');const home=await call('/__private',session);assert.equal(home.statusCode,200);assert.match(home.text,/Signed in/);assert.doesNotMatch(home.text,/SYNTHETIC_|Synthetic-password|\$2[aby]\$/);
 const logout=await call('/__private/logout',session,{csrf:csrf(home)});assert.equal(logout.statusCode,303);assert.ok(logout.headers['set-cookie'].every(v=>/Max-Age=0/.test(v)));
 assert.equal((await call('/__private')).statusCode,403);
 assert.equal(statements.filter(s=>s.startsWith('INSERT INTO public.wl_users')).length,1);
 assert.ok(clients.every(c=>c.options.options.includes('search_path=pg_catalog,public')));
 assert.ok(clients.length>1);assert.ok(clients.every(c=>c.ended&&c.options.host===env.PGHOST_UNPOOLED&&c.options.ssl.rejectUnauthorized===true));
});
