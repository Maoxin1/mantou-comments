'use strict';
// Local candidate only. This profile never accepts either formal production
// alias and requires separately verified Vercel protection without bypasses.
const disabled=require('../index.cjs');
const {createPrivateAdminPage}=require('../src/private-admin-page.cjs');
const {createReaderAPI}=require('../src/reader-api.cjs');
const {createAcceptancePreview}=require('../src/acceptance-preview.cjs');
const {createPrivatePostgresqlAdapter}=require('../src/private-postgresql-adapter.cjs');
const PROJECT='prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q';
const HOST=/^mantou-comments-[a-z0-9]+-mantous-projects-af7e7067\.vercel\.app$/;
const PRIVATE=new Set(['/__private','/__private/access','/__private/login','/__private/logout']);
const PATHS=Object.freeze(['/p/20260803/','/works/mantou-checklist-pwa/']);
function createStagedFeedbackAcceptance(environment,dependencies={}){
  let administrator,reader,preview;
  const logEvent=dependencies.logEvent??(event=>console.info(JSON.stringify(event)));
  return async(req,res)=>{
    try{
      const env=environment;
      if(!env||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!==PROJECT||env.NODEJS_HELPERS!=='0'||env.PRIVATE_ADMIN_ENABLED!=='true'||!HOST.test(env.VERCEL_URL??'')||req.headers?.host!==env.VERCEL_URL||!['GET','POST'].includes(req.method))return disabled(req,res);
      if(typeof env.PRIVATE_ADMIN_EXPIRES_AT!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(env.PRIVATE_ADMIN_EXPIRES_AT))return disabled(req,res);
      const expiresAt=Date.parse(env.PRIVATE_ADMIN_EXPIRES_AT);
      if(!Number.isFinite(expiresAt)||new Date(expiresAt).toISOString().replace('.000Z','Z')!==env.PRIVATE_ADMIN_EXPIRES_AT.replace('.000Z','Z'))return disabled(req,res);
      if(Date.now()>=expiresAt){res.statusCode=403;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');return res.end(JSON.stringify({errno:403,errmsg:'Acceptance window is closed'}));}
      if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//'))return disabled(req,res);
      const origin='https://'+env.VERCEL_URL;
      const path=new URL(req.url,origin).pathname;
      const privateRoute=PRIVATE.has(req.url);
      const readerRoute=path==='/api/comment'||path==='/api/article';
      const previewPath=/^\/(?:en\/)?(?:p\/20260803|works\/mantou-checklist-pwa)\/$/.test(req.url)||/^\/(?:css|js|lib|images)\//.test(req.url)||/^\/(?:favicon(?:-\d+x\d+)?\.(?:ico|png)|apple-touch-icon\.png)$/.test(req.url);
      if(!privateRoute&&!readerRoute&&!previewPath)return disabled(req,res);
      if(!/^[A-Za-z0-9]{64}$/.test(env.PRIVATE_ADMIN_ACCESS_KEY??'')||!/^[A-Za-z0-9]{64}$/.test(env.JWT_TOKEN??''))return disabled(req,res);
      if(!administrator){
        const adapter=(dependencies.createAdapter??createPrivatePostgresqlAdapter)({environment:()=>env});
        const getModels=()=>adapter.getModels();
        // Validate the existing owner/admin configuration before exposing a
        // writer. No setup request is run and no account is created here.
        const nextAdministrator=(dependencies.createPrivatePage??createPrivateAdminPage)({origin,expiresAt,identity:{email:env.PRIVATE_ADMIN_EMAIL,displayName:env.PRIVATE_ADMIN_DISPLAY_NAME},ownerAccessKey:env.PRIVATE_ADMIN_ACCESS_KEY,jwtSecret:env.JWT_TOKEN,getModels,acquireBootstrap:()=>{throw new Error('Administrator creation is outside acceptance scope');},moderationEnabled:true,moderationPaths:PATHS});
        const nextReader=(dependencies.createReaderPage??createReaderAPI)({origin,expiresAt,allowedPaths:PATHS,getModels,maxCommentsPerPath:2});
        administrator=nextAdministrator;reader=nextReader;
        logEvent({event:'mantou_feedback_acceptance',version:1,phase:'configuration',outcome:'ready',allowedThreads:PATHS.length,commentsPerThread:2,moderationEnabled:true,readerIsGuest:true,outboundServices:0});
      }
      if(previewPath){
        preview??=(dependencies.createPreview??createAcceptancePreview)({origin});
        if(req.method!=='GET'||!preview.canServe(req.url))return disabled(req,res);
        return preview.serve(req,res);
      }
      return await(privateRoute?administrator:reader)(req,res);
    }catch{
      if(!res.headersSent)return disabled(req,res);
      if(!res.writableEnded)res.end();
    }
  };
}
module.exports=createStagedFeedbackAcceptance(process.env);
module.exports.createStagedFeedbackAcceptance=createStagedFeedbackAcceptance;
module.exports.ACCEPTANCE_PATHS=PATHS;
