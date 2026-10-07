'use strict';
// Shared reader implementation with separate protected and public factories.
// The caller must verify the exact protected deployment and supply its bounded
// thread allowlist and existing PostgreSQL models. No account/session, mail,
// webhook, avatar network, region or user-agent capability is supplied.
const { createRequire } = require('node:module');
const { projectPublicResponse } = require('./policy.cjs');
const {createReaderModelView}=require('./reader-model-view.cjs');
const MAX_BODY = 16384;
const BODY_TIMEOUT = 5000;
const id = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && Number(value)<=2147483647;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
class InputError extends Error { constructor(status=400) { super('Invalid reader request'); this.status=status; } }
function reply(res,status,data) {
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('content-security-policy',"default-src 'none'; frame-ancestors 'none'");
  res.end(JSON.stringify(data));
}
async function readJSON(req) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) throw new InputError(415);
  const length=req.headers['content-length'];
  if(req.headers['transfer-encoding']!==undefined || typeof length!=='string' || !/^(0|[1-9]\d*)$/.test(length)) throw new InputError();
  if(Number(length)>MAX_BODY) throw new InputError(413);
  const chunks=[];let size=0,timer;
  try { await Promise.race([(async()=>{for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new InputError(413);chunks.push(chunk);}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new InputError(408)),BODY_TIMEOUT);})]); }
  finally {clearTimeout(timer);}
  if(size!==Number(length))throw new InputError();
  let raw,value;
  try {raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));value=JSON.parse(raw);}catch{throw new InputError();}
  if(!value || typeof value!=='object' || Array.isArray(value))throw new InputError();
  // All accepted values are scalar strings. Detect duplicate decoded keys,
  // including escaped keys, rather than silently accepting JSON's last value.
  const keys=new Set();
  for(const token of raw.matchAll(/"(?:[^"\\]|\\.)*"/g)){
    if(raw.slice(token.index+token[0].length).trimStart().startsWith(':')){
      const key=JSON.parse(token[0]);if(keys.has(key))throw new InputError();keys.add(key);
    }
  }
  // PostgreSQL int4 object IDs are numeric in real responses; Waline returns
  // those IDs as numbers in reply bodies. Only these two scalar ID fields may
  // be numeric, and they are normalized for the adapter's integer fields.
  for(const key of ['pid','rid'])if(typeof value[key]==='number'){
    if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>2147483647)throw new InputError();
    value[key]=String(value[key]);
  }
  if(Object.values(value).some(v=>typeof v!=='string'))throw new InputError();
  return value;
}
function createReaderAPI({origin,expiresAt,allowedPaths,getModels,maxCommentsPerPath=2}={}) {
  let expected;try{expected=new URL(origin);}catch{}
  if(!expected || expected.protocol!=='https:' || expected.origin!==origin || expected.username || expected.password || !Number.isSafeInteger(expiresAt) || expiresAt<=Date.now() || expiresAt>Date.now()+86400000 || !Array.isArray(allowedPaths) || !allowedPaths.length || allowedPaths.length>8 || allowedPaths.some(p=>typeof p!=='string' || !/^\/(?:p|works)\/[^/?#\u0000-\u0020]+\/$/.test(p)) || typeof getModels!=='function' || !Number.isInteger(maxCommentsPerPath) || maxCommentsPerPath<1 || maxCommentsPerPath>4)throw new TypeError('Invalid protected reader configuration');
  return createReaderEngine({origin,expected,expiresAt,allowedPaths,getModels,maxCommentsPerPath,publicReader:false});
}

// Public routes accept only the configured blog origin. CORS never grants
// credentials or arbitrary origins; it is not a bot/rate-limiting mechanism.
function createPublicReaderAPI({origin,blogOrigin,allowedPaths,isThreadAllowed,getThreadRegistryVersion,getModels}={}) {
  let expected,blog;try{expected=new URL(origin);blog=new URL(blogOrigin);}catch{}
  if(!expected||!blog||expected.protocol!=='https:'||blog.protocol!=='https:'||expected.origin!==origin||blog.origin!==blogOrigin||origin===blogOrigin||typeof getModels!=='function'||!Array.isArray(allowedPaths)||!allowedPaths.length||allowedPaths.length>10000||new Set(allowedPaths).size!==allowedPaths.length||allowedPaths.some(p=>typeof p!=='string'||!/^\/(?:p|works)\/[A-Za-z0-9_-]+\/$/.test(p)))throw new TypeError('Invalid public reader configuration');
  if(isThreadAllowed!==undefined&&typeof isThreadAllowed!=='function')throw new TypeError('Invalid public discussion resolver');
  if(getThreadRegistryVersion!==undefined&&typeof getThreadRegistryVersion!=='function')throw new TypeError('Invalid discussion version reader');
  const engine=createReaderEngine({origin,expected,expiresAt:Infinity,allowedPaths,isThreadAllowed,getThreadRegistryVersion,getModels,maxCommentsPerPath:null,publicReader:true,blogOrigin});
  return async(req,res)=>{
    res.setHeader('vary','Origin');
    const headers=req.headers??{};
    if(headers.host!==expected.host||headers.authorization||(headers.origin!==undefined&&headers.origin!==blogOrigin)||(['POST','OPTIONS'].includes(req.method)&&headers.origin!==blogOrigin))return reply(res,403,{errno:403,errmsg:'Reader origin is not allowed'});
    if(headers.origin===blogOrigin){
      res.setHeader('access-control-allow-origin',blogOrigin);
      if(getThreadRegistryVersion)res.setHeader('access-control-expose-headers','x-discussion-registry-version');
    }
    if(req.method==='OPTIONS'){
      const method=headers['access-control-request-method'];
      const requested=headers['access-control-request-headers'];
      let url;try{if(typeof req.url==='string'&&req.url.startsWith('/')&&!req.url.startsWith('//'))url=new URL(req.url,origin);}catch{}
      const query=new Set(method==='POST'?['lang']:['url','path','type','page','pageSize','sortBy','lang']);
      if(!url||url.pathname!=='/api/comment'||[...url.searchParams.keys()].some(k=>!query.has(k)||url.searchParams.getAll(k).length!==1)||!['GET','POST'].includes(method)||(requested!==undefined&&(typeof requested!=='string'||requested.split(',').some(h=>h.trim().toLowerCase()!=='content-type'))))return reply(res,403,{errno:403,errmsg:'Preflight is not allowed'});
      res.statusCode=204;res.setHeader('cache-control','no-store');res.setHeader('access-control-allow-methods','GET, POST, OPTIONS');res.setHeader('access-control-allow-headers','Content-Type');return res.end();
    }
    return engine(req,res);
  };
}
function createReaderEngine({origin,expected,expiresAt,allowedPaths,isThreadAllowed,getThreadRegistryVersion,getModels,maxCommentsPerPath,publicReader,blogOrigin}) {
  const threads=new Set(allowedPaths);
  let corePromise,modelsPromise;
  const models=()=>modelsPromise??=Promise.resolve().then(getModels);
  const core=()=>corePromise??=models().then(store=>createRequire(require.resolve('@waline/vercel/package.json'))('@waline/core').createWalineCore({models:createReaderModelView(store),config:{audit:true,forceLogin:false,disableRegion:true,disableUserAgent:true},services:{markdown:{render:value=>escape(value).replace(/\r?\n/g,'<br>')}},logger:{debug(){},info(){},warn(){},error(){}}}));
  const thread=async(value,res)=>{if(typeof value!=='string'||(publicReader&&(value.length>200||!/^\/(?:p|works)\/[A-Za-z0-9_-]+\/$/.test(value))))throw new InputError();const allowed=isThreadAllowed?await isThreadAllowed(value):threads.has(value);if(allowed!==true)throw new InputError();if(publicReader&&getThreadRegistryVersion){const version=getThreadRegistryVersion();res.setHeader('x-discussion-registry-version',typeof version==='string'&&/^[a-f0-9]{40}$/.test(version)?version:'fallback');}return value;};
  const context=()=>({state:{oauthServices:[]},headers:{}});
  return async function protectedReaderAPI(req,res) {
    let attemptedWrite=false;
    try {
      if(Date.now()>=expiresAt || req.headers?.host!==expected.host || req.headers.authorization || (!publicReader&&req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])))throw new InputError(403);
      if(!['GET','POST'].includes(req.method))throw new InputError(405);
      const requestOrigin=publicReader?blogOrigin:origin;
      if(req.headers.origin && req.headers.origin!==requestOrigin)throw new InputError(403);
      if(req.method==='POST' && req.headers.origin!==requestOrigin)throw new InputError(403);
      if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//'))throw new InputError(404);
      const url=new URL(req.url,origin);
      if(!['/api/comment','/api/article'].includes(url.pathname))throw new InputError(404);
      if(publicReader&&url.pathname==='/api/article')throw new InputError(404);
      const allowedQuery=new Set(url.pathname==='/api/article'?['path','type','lang']:(req.method==='POST'?['lang']:['url','path','type','page','pageSize','sortBy','lang']));
      for(const key of url.searchParams.keys()){if(!allowedQuery.has(key)||url.searchParams.getAll(key).length!==1)throw new InputError();}
      if(req.method==='GET') {
        if(url.pathname==='/api/article') {
          if(url.searchParams.get('type')!=='reaction0')throw new InputError();
          const result=await (await core()).counter.get({path:await thread(url.searchParams.get('path'),res),type:['reaction0']},context());
          return reply(res,200,{errno:0,data:result});
        }
        if(url.searchParams.has('url')&&url.searchParams.has('path'))throw new InputError();
        const path=await thread(url.searchParams.get('url')??url.searchParams.get('path'),res);
        if(url.searchParams.has('type')) {
          if(url.searchParams.get('type')!=='count')throw new InputError();
          return reply(res,200,projectPublicResponse({errno:0,data:await(await core()).comment.count({url:path},context())}));
        }
        const positive=(name,fallback,max)=>{const value=url.searchParams.get(name);if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||Number(value)>max)throw new InputError();return Number(value);};
        // The public helper accepts display names; Waline's mounted editor
        // sends these three concrete order values. Keep both finite sets.
        const orders={latest:'insertedAt_desc',oldest:'insertedAt_asc',hottest:'like_desc',insertedAt_desc:'insertedAt_desc',insertedAt_asc:'insertedAt_asc',like_desc:'like_desc'};
        const requestedOrder=url.searchParams.get('sortBy')??'latest';
        const sort=Object.hasOwn(orders,requestedOrder)?orders[requestedOrder]:undefined;
        if(!sort)throw new InputError();
        const result=await(await core()).comment.list({path,page:positive('page',1,100),pageSize:positive('pageSize',5,20),sortBy:sort},context());
        return reply(res,200,projectPublicResponse({errno:0,data:result}));
      }
      // Reactions are read-only in this bounded comment acceptance. No counter
      // update route is exposed, and the acceptance preview hides its button.
      if(url.pathname==='/api/article')throw new InputError(405);
      const body=await readJSON(req);
      if(Object.keys(body).some(k=>!['nick','mail','link','comment','url','pid','rid','at','ua'].includes(k)))throw new InputError();
      if(!body.nick?.trim() || [...body.nick].length>255 || /[\u0000-\u001f\u007f]/.test(body.nick) || !body.comment?.trim() || [...body.comment].length>1000 || body.comment.includes('\0'))throw new InputError();
      if(body.mail && (body.mail.length>255 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(body.mail)))throw new InputError();
      if(body.link || (body.ua?.length??0)>2048 || (body.at!==undefined&&([...body.at].length>255||/[\u0000-\u001f\u007f]/.test(body.at))))throw new InputError();
      const path=await thread(body.url,res);
      const store=await models();
      if(maxCommentsPerPath!==null){
        const existing=await store.Comment.count({url:path});
        if(existing===null || existing===undefined || !Number.isSafeInteger(Number(existing)) || Number(existing)<0)throw new Error('Unavailable comment count');
        if(Number(existing)>=maxCommentsPerPath)throw new InputError(409);
      }
      const input={nick:body.nick.trim(),comment:body.comment,url:path,...(body.mail!==undefined?{mail:body.mail}:{})};
      if(body.pid){
        if(!id(body.pid)||!id(body.rid))throw new InputError();
        const [parent]=await store.Comment.select({objectId:body.pid},{limit:1});
        if(!parent)throw new InputError(404);
        if(parent.url!==path||parent.status!=='approved')throw new InputError(403);
        const root=parent.rid||parent.objectId;
        if(String(root)!==body.rid)throw new InputError();
        // The client's legacy mention hint is accepted but not stored. The
        // modern formatter derives reply_user from the verified parent IDs.
        Object.assign(input,{pid:body.pid,rid:body.rid});
      }else if(body.rid||body.at)throw new InputError();
      // No client cookie, token, role, IP, user agent or privilege is forwarded.
      // Even the operator's browser creates a guest waiting comment here.
      attemptedWrite=true;
      const result=await(await core()).comment.create(input,context());
      return reply(res,200,projectPublicResponse({errno:0,data:result}));
    }catch(error){
      const status=error instanceof InputError?error.status:(error?.code==='DUPLICATE_CONTENT'?400:503);
      const unknown=attemptedWrite&&status===503;
      reply(res,status,{errno:status,errmsg:unknown?'Comment result is unknown. Do not resubmit until an authorized read-only check resolves the outcome.':'The reader request could not be completed.'});
    }
  };
}
module.exports={createReaderAPI,createPublicReaderAPI};
