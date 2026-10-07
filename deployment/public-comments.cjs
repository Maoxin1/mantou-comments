'use strict';
// Explicit release profile. The repository's default index stays disabled.
const disabled=require('../index.cjs');
const {createPublicReaderAPI}=require('../src/reader-api.cjs');
const {createPrivateAdminPage}=require('../src/private-admin-page.cjs');
const {createPrivatePostgresqlAdapter}=require('../src/private-postgresql-adapter.cjs');
const {createPublishedThreadRegistry}=require('../src/published-thread-registry.cjs');
const THREADS=require('../config/published-threads.json');
const PROJECT='prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q';
const PUBLIC_HOSTS=new Set(['mantou-comments.vercel.app','mantou-comments-mantous-projects-af7e7067.vercel.app']);
const BLOG_ORIGIN='https://mantou-blog.pages.dev';
const GENERATED_HOST=/^mantou-comments-[a-z0-9]+-mantous-projects-af7e7067\.vercel\.app$/;
const PRIVATE=new Set(['/__private','/__private/access','/__private/login','/__private/logout']);
function createPublicComments(environment,dependencies={}){
  let adapter,registry;
  const readers=new Map(),administrators=new Map();
  const getModels=()=>{
    adapter??=(dependencies.createAdapter??createPrivatePostgresqlAdapter)({environment:()=>environment});
    return adapter.getModels();
  };
  const isThreadAllowed=value=>{
    registry??=(dependencies.createThreadRegistry??createPublishedThreadRegistry)({fallbackPaths:THREADS.paths,...(dependencies.fetchManifest?{fetchImpl:dependencies.fetchManifest}:{}),onRefresh:event=>console.info(JSON.stringify(event))});
    return registry.isAllowed(value);
  };
  return async(req,res)=>{
    try{
      const env=environment,host=req.headers?.host;
      // No unlisted alias, forwarded-host override, or request-derived
      // database configuration is accepted. A staged host remains protected by
      // Vercel until separate operator approval and domain verification.
      if(!env||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!==PROJECT||env.NODEJS_HELPERS!=='0'||env.PUBLIC_COMMENTS_ENABLED!=='true'||!(PUBLIC_HOSTS.has(host)||(GENERATED_HOST.test(env.VERCEL_URL??'')&&host===env.VERCEL_URL)))return disabled(req,res);
      if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//'))return disabled(req,res);
      const origin='https://'+host,path=new URL(req.url,origin).pathname;
      if(path==='/api/comment'){
        if(!readers.has(host))readers.set(host,(dependencies.createReader??createPublicReaderAPI)({origin,blogOrigin:BLOG_ORIGIN,allowedPaths:THREADS.paths,isThreadAllowed,getThreadRegistryVersion:()=>registry?.getVersion?.()??null,getModels}));
        return await readers.get(host)(req,res);
      }
      if(host!==env.VERCEL_URL||!GENERATED_HOST.test(host)||!(PRIVATE.has(req.url)||(req.method==='GET'&&req.url.startsWith('/__private?')))||!['GET','POST'].includes(req.method))return disabled(req,res);
      const expiry=env.PRIVATE_ADMIN_EXPIRES_AT;
      const expiresAt=typeof expiry==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiry)?Date.parse(expiry):NaN;
      if(env.PRIVATE_ADMIN_ENABLED!=='true'||!Number.isFinite(expiresAt)||new Date(expiresAt).toISOString().replace('.000Z','Z')!==expiry||Date.now()>=expiresAt||expiresAt>Date.now()+86400000){
        res.statusCode=403;res.setHeader('cache-control','no-store');res.setHeader('content-type','text/plain; charset=utf-8');return res.end('Administrator window is closed');
      }
      if(!/^[A-Za-z0-9]{64}$/.test(env.PRIVATE_ADMIN_ACCESS_KEY??'')||!/^[A-Za-z0-9]{64}$/.test(env.JWT_TOKEN??''))return disabled(req,res);
      if(!administrators.has(host))administrators.set(host,(dependencies.createPrivatePage??createPrivateAdminPage)({origin,expiresAt,identity:{email:env.PRIVATE_ADMIN_EMAIL,displayName:env.PRIVATE_ADMIN_DISPLAY_NAME},ownerAccessKey:env.PRIVATE_ADMIN_ACCESS_KEY,jwtSecret:env.JWT_TOKEN,getModels,acquireBootstrap:()=>{throw new Error('Administrator setup is disabled');},moderationEnabled:true,moderationPaths:null,setupEnabled:false}));
      return await administrators.get(host)(req,res);
    }catch{
      if(!res.headersSent)return disabled(req,res);
      if(!res.writableEnded)res.end();
    }
  };
}
module.exports=createPublicComments(process.env);
module.exports.createPublicComments=createPublicComments;
