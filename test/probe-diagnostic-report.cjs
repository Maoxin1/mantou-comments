'use strict';
const {EventEmitter}=require('node:events');
const scenario=process.argv[2],network=[],logs=[];let connects=0,closes=0;
for(const [label,o,k]of[['net',require('node:net').Socket.prototype,'connect'],['tls',require('node:tls'),'connect'],['dns',require('node:dns'),'lookup']])o[k]=()=>{network.push(label);throw new Error('No network permitted');};
for(const k of ['log','warn','error','info','debug','trace'])console[k]=(...args)=>logs.push(args.map(String).join(' '));
class FakePool extends EventEmitter{async connect(){connects++;const error=new Error('SYNTHETIC_SECRET synthetic-private');error.code={'report-auth':'28P01','report-tls':'ERR_TLS_CERT_ALTNAME_INVALID','report-network':'ENOTFOUND'}[scenario];throw error;}async end(){closes++;}}
require('pg').Pool=FakePool;
const environment={POSTGRES_HOST:'ep-synthetic-private.ap-southeast-1.aws.neon.tech',POSTGRES_USER:'synthetic-private',POSTGRES_PASSWORD:'SYNTHETIC_SECRET',POSTGRES_DATABASE:'synthetic-private',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app'};
const response={statusCode:0,setHeader(){},end(body){this.body=body;}};
require('../deployment/staged-readonly.cjs').createStagedHandler(environment)({method:'POST',url:'/__diagnostics/report',headers:{host:environment.VERCEL_URL,origin:`https://${environment.VERCEL_URL}`,'content-length':'0'}},response).then(()=>process.stdout.write(JSON.stringify({http:response.statusCode,html:response.body,connects,closes,network,logs}))).catch(()=>{process.stderr.write('Synthetic report probe failed');process.exitCode=1;});
