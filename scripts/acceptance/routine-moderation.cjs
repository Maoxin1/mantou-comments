'use strict';
// Isolated acceptance only. No production configuration is read or accepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{Readable}=require('node:stream');
if(process.env.MANTOU_LOCAL_ACCEPTANCE!=='1'||!process.env.MANTOU_ACCEPTANCE_OUTPUT||!process.env.MANTOU_BROWSER_MODULE)throw Error('Explicit isolated local acceptance settings required');
const E=path.resolve(process.env.MANTOU_ACCEPTANCE_OUTPUT),W=path.resolve(__dirname,'../..'),{createRequire}=require('node:module'),req=createRequire(path.join(W,'package.json'));
assert(E!==W&&!E.startsWith(W+path.sep),'Evidence and synthetic TLS fixture must stay outside the repository');
const pg=req('pg'),RealClient=pg.Client,{PasswordHash}=req('phpass');
const {chromium}=require(process.env.MANTOU_BROWSER_MODULE);
const cert=fs.readFileSync(path.join(E,'server.crt')),key=fs.readFileSync(path.join(E,'server.key'));
const HOST='mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app',ORIGIN='https://'+HOST,DBHOST='ep-maintenance-fixture.neon.tech';
const db='mantou_mod_fixture_'+Date.now(),password='Synthetic-only-password-123',output=path.join(E,'checks');fs.mkdirSync(output,{recursive:true});
const config={host:'127.0.0.1',port:55436,user:'neondb_owner',database:'postgres',ssl:{ca:cert,rejectUnauthorized:true,servername:DBHOST}};
const allSql=[],tls=[],results=[];let admin,browser,server,adapter,stale=false,handler;
const pass=x=>{results.push(x);console.log('PASS',x);};
async function connection(database=db){const c=new RealClient({...config,database});await c.connect();return c;}
const status=async id=>(await admin.query('SELECT status FROM wl_comment WHERE id=$1',[id])).rows[0]?.status;
class LoopbackClient extends RealClient{
 constructor(options){
  assert.equal(options.host,DBHOST);assert.equal(options.database,db);assert.equal(options.user,'neondb_owner');assert.equal(options.ssl.rejectUnauthorized,true);
  super({...options,host:'127.0.0.1',port:55436,ssl:{...options.ssl,ca:cert}});
 }
 async connect(){await super.connect();const s=this.connection.stream;assert(s.encrypted&&s.authorized);tls.push(s.getProtocol());}
 async query(sql,...rest){
  const text=typeof sql==='string'?sql:sql.text;allSql.push(text);
  if(stale&&/^UPDATE wl_comment SET status=E'approved' WHERE/.test(text)){stale=false;await admin.query("UPDATE wl_comment SET status='spam' WHERE id=104");}
  return super.query(sql,...rest);
 }
}
async function request(target,cookie,body,host=HOST){
 const raw=body===undefined?null:new URLSearchParams(body).toString(),r=Readable.from(raw===null?[]:[Buffer.from(raw)]);
 Object.assign(r,{url:target,method:raw===null?'GET':'POST',headers:{host,...(cookie?{cookie}:{}),...(raw===null?{}:{origin:'https://'+host,'content-type':'application/x-www-form-urlencoded','content-length':String(Buffer.byteLength(raw))})}});
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(text){this.text=text;this.writableEnded=true;}};await handler(r,res);return res;
}
const readerCount=async()=>{const r=await request('/api/comment?type=count&url='+encodeURIComponent('/p/synthetic/'),undefined,undefined,'mantou-comments.vercel.app');assert.equal(r.statusCode,200,r.text);return JSON.parse(r.text).data[0];};
const ids=async p=>(await p.locator('h3').allTextContents()).filter(x=>x.startsWith('Comment ')).map(x=>Number(x.slice(8)));
(async()=>{
 const root=await connection('postgres');await root.query('CREATE DATABASE '+db);await root.end();admin=await connection();
 await admin.query(`CREATE TABLE wl_users(id serial PRIMARY KEY,email varchar(255) NOT NULL DEFAULT '',display_name varchar(255) NOT NULL DEFAULT '',password varchar(255) NOT NULL DEFAULT '',type varchar(50) NOT NULL DEFAULT '',avatar text,url text,label text,"2fa" text);
 CREATE TABLE wl_comment(id integer PRIMARY KEY,comment text,nick text,url text,status text,mail text,ip text,link text,ua text,pid integer,rid integer,user_id integer,sticky integer DEFAULT 0,insertedat timestamp(0),createdat timestamp(0),updatedat timestamp(0));
 CREATE TABLE wl_counter(id serial PRIMARY KEY,url text,time integer);`);
 const hash=await new PasswordHash().hashPasswordAsync(password);await admin.query("INSERT INTO wl_users(email,display_name,password,type) VALUES($1,$2,$3,'administrator')",['synthetic-owner@example.invalid','Synthetic Owner',hash]);
 for(let id=101;id<=125;id++)await admin.query("INSERT INTO wl_comment(id,comment,nick,url,status,insertedat,createdat,updatedat) VALUES($1,$2,'Synthetic reader','/p/synthetic/','waiting','2026-10-07','2026-10-07','2026-10-07')",[id,'Synthetic item '+id]);
 pg.Client=LoopbackClient;
 const {createPrivatePostgresqlAdapter}=req('./src/private-postgresql-adapter.cjs');
 const environment={POSTGRES_HOST:DBHOST,POSTGRES_USER:'neondb_owner',POSTGRES_PASSWORD:'SYNTHETIC_ONLY',POSTGRES_DATABASE:db,VERCEL_ENV:'production',NODEJS_HELPERS:'0',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:HOST,PUBLIC_COMMENTS_ENABLED:'true',PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EMAIL:'synthetic-owner@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Synthetic Owner',PRIVATE_ADMIN_ACCESS_KEY:'A'.repeat(64),JWT_TOKEN:'B'.repeat(64),PRIVATE_ADMIN_EXPIRES_AT:new Date(Date.now()+3600000).toISOString().replace('.000Z','Z')};
 // Remove milliseconds while preserving the strict production parser's format.
 environment.PRIVATE_ADMIN_EXPIRES_AT=new Date(Math.floor((Date.now()+3600000)/1000)*1000).toISOString().replace('.000Z','Z');
 adapter=createPrivatePostgresqlAdapter({environment:()=>environment});
 handler=req('./deployment/public-comments.cjs').createPublicComments(environment,{createAdapter:()=>adapter,createThreadRegistry:()=>({isAllowed:p=>p==='/p/synthetic/',getVersion:()=>null})});
 server=https.createServer({key,cert},(r,s)=>{handler(r,s).catch(()=>{s.statusCode=500;s.end('Fixture request failed');});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(443,'127.0.0.1',resolve);});
 // Host mapping also covers redirects, which Playwright route.fetch cannot safely proxy.
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP '+HOST+' 127.0.0.1']});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
 await context.route('**/*',async route=>{assert.equal(new URL(route.request().url()).origin,ORIGIN);await route.continue();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>console.log('Browser',r.status(),new URL(r.url()).pathname));
 await page.goto(ORIGIN+'/__private/access');await page.locator('input[name=ownerAccessKey]').fill(environment.PRIVATE_ADMIN_ACCESS_KEY);await page.locator('button[type=submit]').click();
 assert.equal(await page.locator('input[name=password]').count(),1,JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,350),cookies:(await context.cookies()).map(x=>({name:x.name,domain:x.domain}))}));
 await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 assert.equal(new URL(page.url()).pathname,'/__private');assert.equal((await ids(page)).length,20);await page.screenshot({path:path.join(output,'comments-mobile.png'),fullPage:true});
 await page.getByRole('link',{name:'Next page',exact:true}).click();assert.deepEqual(await ids(page),[105,104,103,102,101]);assert.equal(await readerCount(),0);pass('real browser login and both queue pages over real PostgreSQL; pending comments remain private');
 const form=(id,action)=>page.locator(`form:has(input[name="objectId"][value="${id}"])${action==='approve'?':not(:has(input[name="action"]))':`:has(input[name="action"][value="${action}"])`}`);
 await form(105,'spam').locator('button').click();assert.equal(await status(105),'spam');assert.equal(new URL(page.url()).search,'?view=waiting&page=2');assert.deepEqual(await ids(page),[104,103,102,101]);assert.equal(await readerCount(),0);pass('page-two rejection commits to PostgreSQL, preserves page and remains private');
 await page.goto(ORIGIN+'/__private?view=spam&page=1');assert.deepEqual(await ids(page),[105]);assert.equal(await page.getByRole('button',{name:'Approve comment',exact:true}).count(),0);
 await form(105,'restore').locator('button').click();assert.equal(await status(105),'waiting');assert.equal(await readerCount(),0);pass('restore commits to waiting without publishing');
 await page.goto(ORIGIN+'/__private?view=waiting&page=2');stale=true;const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'),form(104,'approve').locator('button').click()]);assert.equal(response.status(),409);assert.equal(await status(104),'spam');assert.equal(await readerCount(),0);pass('real competing SQL update wins; stale approval returns 409 and cannot overwrite rejection');
 await page.goto(ORIGIN+'/__private?view=waiting&page=2');await form(103,'approve').locator('button').click();assert.equal(await status(103),'approved');assert.equal(await readerCount(),1);pass('separate explicit approval publishes only the selected synthetic comment');
 await page.setViewportSize({width:1280,height:900});await page.goto(ORIGIN+'/__private?view=spam&page=1');await page.screenshot({path:path.join(output,'comments-desktop.png'),fullPage:true});assert.deepEqual(errors,[]);
 for(const bad of ['?page=0','?page=10001','?view=approved','?page=1&page=2']){const r=await page.goto(ORIGIN+'/__private'+bad);assert.equal(r.status(),400);}
 pass('mobile/desktop real rendering, form navigation and malformed pagination checks pass without page errors');
 await adapter.close();const reopened=createPrivatePostgresqlAdapter({environment:()=>environment});
 for(const [id,expected] of [[103,'approved'],[104,'spam'],[105,'waiting']]){const rows=await reopened.getModels().Comment.select({objectId:id},{limit:1});assert.equal(rows[0].status,expected);}
 await reopened.close();adapter=null;assert(tls.length>0&&tls.every(x=>['TLSv1.2','TLSv1.3'].includes(x)));pass('fresh adapter and connections read committed states with verified TLS');
 assert(allSql.some(x=>/^UPDATE wl_comment SET status=E'spam' WHERE/.test(x)&&/status = E'waiting'/.test(x)&&/url = E'\/p\/synthetic\/'/.test(x)));
 fs.writeFileSync(path.join(E,'moderation-acceptance.json'),JSON.stringify({passed:true,db,postgresPort:55436,checks:results,tlsConnections:tls.length,transport:'real pg wire protocol over authenticated loopback TLS; only socket destination and test CA adapted in harness',scope:'synthetic local database and DNS-mapped loopback browser only; not Vercel protection, Neon hosted acceptance or production moderation evidence',expected:{103:'approved',104:'spam',105:'waiting'},databaseRetainedForRestartCheck:true},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await adapter?.close();await admin?.end();pg.Client=RealClient;});
