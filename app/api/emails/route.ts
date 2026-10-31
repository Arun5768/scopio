import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getUser} from '../../../lib/auth';
import {allowRequest} from '../../../lib/limits';
import {emailMode,canEmail,setupJob,deliveryTestJob,insertEmail,listEmails,retryEmail,processEmails,ownerMailConfig} from '../../../lib/email';
import {gmailConnection,pilotEmail,gmailAllowed,gmailReady,disconnectGmail} from '../../../lib/gmail';
const res=(v:unknown,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const u=await getUser();if(!u)return res({error:'Sign in to view email activity.'},401);
 const config=await ownerMailConfig(env.DB,env,u.userId);const canTest=emailMode(env)==='test'&&canEmail(env,u.email);const connection=await gmailConnection(env.DB,u.userId);
 const usage=await env.DB.prepare('SELECT hits FROM email_daily_usage WHERE id=?').bind(u.userId+':'+new Date().toISOString().slice(0,10)).first<{hits:number}>();
 return res({operator:pilotEmail(env,u.email),mode:emailMode(config),canTest,testRecipient:canTest?env.EMAIL_TEST_RECIPIENT:null,from:config.EMAIL_FROM,gmail:{available:gmailReady(env)&&await gmailAllowed(env.DB,env,u.email),access:env.GMAIL_ACCESS_MODE||'owner',status:connection?.status||'Not connected',email:connection?.email||null,remaining:Math.max(0,100-(usage?.hits||0))},items:await listEmails(env.DB,u.userId)});
}
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return res({error:'Invalid origin'},403);
 const u=await getUser();if(!u)return res({error:'Sign in to manage emails.'},401);
 if(!await allowRequest('email:'+u.userId,5))return res({error:'Please wait a minute before trying again.'},429);
 const raw=await req.text();if(raw.length>2048)return res({error:'Request is too large.'},413);
 const c=z.discriminatedUnion('action',[z.object({action:z.literal('test')}),z.object({action:z.literal('delivery_test')}),z.object({action:z.literal('gmail_test')}),z.object({action:z.literal('disconnect'),confirmed:z.literal(true)}),z.object({action:z.literal('retry'),id:z.string().min(1).max(256)})]).parse(JSON.parse(raw));
 if(c.action==='disconnect'){await disconnectGmail(env.DB,u.userId);return res({ok:true});}
 let id:string;
 if(c.action==='test'||c.action==='gmail_test'||c.action==='delivery_test'){
  const config=c.action==='gmail_test'?await ownerMailConfig(env.DB,env,u.userId):env;
  if(c.action==='gmail_test'?emailMode(config)!=='gmail'||!await gmailAllowed(env.DB,env,u.email):emailMode(config)!=='test'||!canEmail(config,u.email))return res({error:'Only the configured sender can send this setup test.'},403);
  const j=c.action==='delivery_test'?deliveryTestJob(config,u.userId,u.email):setupJob(config,u.userId,u.email);id=j.id;await insertEmail(env.DB,j).run();
 }else{id=c.id;if(!await retryEmail(env.DB,u.userId,id))return res({error:'This email cannot be retried automatically. For an uncertain Gmail result, check Sent and share the review link manually if needed.'},409)}
 try{await processEmails(env.DB,env,fetch,id)}catch{console.error('Email processing deferred to scheduled retry.');}
 return res({items:await listEmails(env.DB,u.userId)});
 }catch(e){return res({error:e instanceof z.ZodError?'Invalid email action.':'Could not process this email action.'},e instanceof z.ZodError||e instanceof SyntaxError?400:500)}}
