import {env} from 'cloudflare:workers';
import {recordReview} from '../../../lib/delivery';
import {approvalJob,canEmail,ownerMailConfig,saveWithEmail,processEmails,type EmailConfig} from '../../../lib/email';
import {allowRequest} from '../../../lib/limits';
import {getUser} from '../../../lib/auth';
import {getDb} from '../../../db';
import {projects} from '../../../db/schema';
import {eq,and} from 'drizzle-orm';
import {z} from 'zod';
import type {Project} from '../../../lib/scopio';
const res=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){return handle(req,false)}
export async function POST(req:Request){return handle(req,true)}
async function handle(req:Request,write:boolean){try{
 if(write&&req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return res({error:'Invalid origin'},403);
 const u=await getUser();if(!u)return res({error:'Sign in with the client email to review this request.'},401);
 const url=new URL(req.url);const id=url.searchParams.get('project');const token=url.searchParams.get('token');if(!id||!token)return res({error:'Incomplete review link'},400);
 const db=getDb();const row=(await db.select().from(projects).where(eq(projects.id,id)))[0];if(!row)return res({error:'Request not found'},404);
 const p:Project=JSON.parse(row.data);const c=p.changes.find(c=>c.token===token);if(!c)return res({error:'This review link is no longer active. Ask the project owner for the latest link.'},404);if(u.email.toLowerCase()!==(c.clientEmail||p.email).toLowerCase())return res({error:'You are signed in with a different Google account. Switch to the client account that received this request, or ask the project owner to correct the address.'},403);
 if(!write){await recordReview(env.DB,row.owner,p.id,token);return res({name:p.name,client:p.client,currency:p.currency,change:c,brief:p.briefs.find(b=>b.id===c.briefId),feedback:p.feedback.find(f=>f.id===c.feedbackId)?.text});}
 if(!await allowRequest('review:'+u.userId,10))return res({error:'Please wait a minute before trying again.'},429);const raw=await req.text();if(raw.length>4096)return res({error:'Request is too large.'},413);const body=z.object({decision:z.enum(['Approved','Declined']),note:z.string().max(1000),confirmed:z.boolean().optional()}).parse(JSON.parse(raw));if(body.decision==='Approved'&&!body.confirmed)return res({error:'Confirm the deliverable, additional cost, and delivery impact before approving.'},400);if(c.status!=='Awaiting approval')return res({error:'A decision has already been recorded.'},409);
 c.status=body.decision;c.decidedAt=new Date().toISOString();c.decidedBy=u.email;c.note=body.note;p.revision=row.revision+1;p.events.unshift({id:crypto.randomUUID(),text:'Client '+c.status.toLowerCase()+' '+c.title,at:c.decidedAt,actor:u.email});
 const mailConfig:EmailConfig=c.emailProvider==='gmail'?await ownerMailConfig(env.DB,env,row.owner,true):env;const emailJob=c.emailRequested&&!p.sample&&p.ownerEmail&&canEmail(mailConfig,p.ownerEmail)&&(c.emailProvider!=='gmail'||mailConfig.provider==='gmail')?approvalJob(mailConfig,p,c,row.owner,'decision'):undefined;
 const updated=await saveWithEmail(env.DB,p,row.owner,row.revision,emailJob,{token,decision:body.decision});if(!updated)return res({error:'This request changed. Refresh before deciding.'},409);if(emailJob){try{await processEmails(env.DB,env,fetch,emailJob.id)}catch{console.error('Decision email deferred to scheduled retry.');}}return res({ok:true});
 }catch(e){return res({error:e instanceof z.ZodError||e instanceof SyntaxError?'Invalid review input.':'Unable to process review. Please try again.'},e instanceof z.ZodError||e instanceof SyntaxError?400:500)}}
