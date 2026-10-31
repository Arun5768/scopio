import {env} from 'cloudflare:workers';
import {approvalJob,canEmail,emailMode,ownerMailConfig,saveWithEmail,processEmails,type EmailJob} from '../../../lib/email';
import {getUser} from '../../../lib/auth';
import { getDb } from '../../../db';
import { projects } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {allowRequest} from '../../../lib/limits';
import { analyze, sampleBrief, type Project } from '../../../lib/scopio';
const res=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const str=(max=200)=>z.string().trim().min(1).max(max);
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:str(100),client:str(100),email:z.string().email().max(200),budget:z.number().min(0).max(1e8),rate:z.number().min(0).max(1e5),currency:z.enum(['USD','INR','EUR','GBP']),brief:str(20000),sample:z.boolean().optional()}),
 z.object({action:z.literal('client'),client:str(100),email:z.string().trim().email().max(200)}),
 z.object({action:z.literal('feedback'),text:str(5000),source:str(100)}),
 z.object({action:z.literal('brief'),content:str(20000),approvedBy:str(200)}),
 z.object({action:z.literal('resolve'),feedbackId:str()}),
 z.object({action:z.literal('change'),feedbackId:str(),changeId:z.string().uuid().optional(),title:str(200),description:str(5000),hours:z.number().min(0.25).max(10000),rate:z.number().min(0).max(1e5),days:z.number().int().min(0).max(3650)}),
 z.object({action:z.literal('submit'),changeId:str()}),
 z.object({action:z.literal('send_email'),changeId:str()}),
 z.object({action:z.literal('withdraw'),changeId:str()}),
 z.object({action:z.literal('demo_decide'),changeId:str(),decision:z.enum(['Approved','Declined']),note:z.string().max(1000)})
]);
export async function GET(){const u=await getUser();if(!u)return res({error:'Sign in to open your workspace.'},401);const rows=await getDb().select().from(projects).where(eq(projects.owner,u.userId));return res({user:{name:u.displayName,email:u.email},projects:rows.map(r=>({...JSON.parse(r.data),revision:r.revision}))});}
export async function POST(req:Request){
 try {
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return res({error:'Invalid origin'},403);
 const u=await getUser();if(!u)return res({error:'Sign in to save your work.'},401);
 if(!await allowRequest('write:'+u.userId,60))return res({error:'Too many changes in a minute. Please wait and try again.'},429);
 const body=await req.text();if(new TextEncoder().encode(body).length>65536)return res({error:'Request is too large.'},413);
 let json:unknown;try{json=JSON.parse(body)}catch{return res({error:'Invalid JSON'},400)}
 const raw=z.record(z.unknown()).parse(json);const c=command.parse(raw);const db=getDb();const now=new Date().toISOString();
 const event=(text:string)=>({id:crypto.randomUUID(),text,at:now,actor:u.displayName});
 if(c.action==='create'){
  const existing=await db.select({id:projects.id}).from(projects).where(eq(projects.owner,u.userId)).limit(100);if(existing.length>=100)return res({error:'The current release supports up to 100 projects per account.'},409);
  const p:Project={id:crypto.randomUUID(),ownerEmail:u.email,revision:1,name:c.name,client:c.client,email:c.email,budget:c.budget,rate:c.rate,currency:c.currency,sample:!!c.sample,briefs:[{id:crypto.randomUUID(),content:c.sample?sampleBrief:c.brief,createdAt:now,approvedBy:u.displayName+' (recorded by owner)'}],feedback:[],changes:[],events:[event(c.sample?'Example project created':'Project created; initial brief recorded')]};
  if(c.sample){for(const text of ['Can we also add Google login so customers can save their favorite projects?','Could we update the colors and typography in the visual design?','Can you make the website feel more premium?'])p.feedback.push({id:crypto.randomUUID(),text,source:'Example client feedback',createdAt:now,briefId:p.briefs[0].id,...analyze(text,p.briefs[0].content)});}
  await db.insert(projects).values({id:p.id,owner:u.userId,data:JSON.stringify(p),revision:1,updatedAt:now});return res({project:p},201);
 }
 const id=z.string().uuid().parse(raw.projectId);const revision=z.number().int().positive().parse(raw.revision);
 const row=(await db.select().from(projects).where(and(eq(projects.id,id),eq(projects.owner,u.userId))))[0];if(!row)return res({error:'Project not found'},404);
 if(row.revision!==revision)return res({error:'This project changed in another session. Refresh and try again.'},409);
 const p:Project=JSON.parse(row.data);p.ownerEmail=u.email;let emailJob:EmailJob|undefined;const latest=p.briefs.at(-1)!;
 if(p.events.length>=2000)return res({error:'This project has reached the current release activity limit. Export it and start a new project.'},409);
 if(c.action==='client'){if(p.changes.some(x=>x.status==='Awaiting approval'))return res({error:'Withdraw pending requests before changing the client email.'},409);for(const change of p.changes){if(change.token&&!change.clientEmail)change.clientEmail=p.email;}p.client=c.client;p.email=c.email.toLowerCase();p.events.unshift(event('Client contact updated; existing decision recipients preserved'));}
 if(c.action==='feedback'){p.feedback.unshift({id:crypto.randomUUID(),text:c.text,source:c.source,createdAt:now,briefId:latest.id,...analyze(c.text,latest.content)});p.events.unshift(event('Feedback captured and checked against brief v'+p.briefs.length));}
 if(c.action==='brief'){p.briefs.push({id:crypto.randomUUID(),content:c.content,createdAt:now,approvedBy:c.approvedBy});p.events.unshift(event('Brief v'+p.briefs.length+' recorded; earlier versions preserved'));}
 if(c.action==='resolve'){const f=p.feedback.find(f=>f.id===c.feedbackId);if(!f)return res({error:'Feedback not found'},404);f.resolved=!f.resolved;p.events.unshift(event(f.resolved?'Feedback marked reviewed':'Feedback reopened'));}
 if(c.action==='change'){const f=p.feedback.find(f=>f.id===c.feedbackId);if(!f)return res({error:'Feedback not found'},404);const draft=c.changeId?p.changes.find(x=>x.id===c.changeId):undefined;if(c.changeId&&(!draft||draft.status!=='Draft'))return res({error:'Only drafts can be edited'},409);if(p.changes.some(x=>x.feedbackId===f.id&&x.status!=='Declined'&&x.id!==c.changeId))return res({error:'This feedback already has an active change request.'},409);if(draft){draft.title=c.title;draft.description=c.description;draft.hours=c.hours;draft.rate=c.rate;draft.days=c.days;}else p.changes.unshift({id:crypto.randomUUID(),feedbackId:f.id,title:c.title,description:c.description,hours:c.hours,rate:c.rate,days:c.days,status:'Draft',createdAt:now,briefId:f.briefId});p.events.unshift(event('Change request drafted: '+c.title));}
 if(c.action==='submit'||c.action==='withdraw'||c.action==='demo_decide'||c.action==='send_email'){
 const change=p.changes.find(x=>x.id===c.changeId);if(!change)return res({error:'Change request not found'},404);
 if(c.action==='submit'){if(change.status!=='Draft')return res({error:'Only drafts can be submitted'},409);change.status='Awaiting approval';change.token=crypto.randomUUID();change.clientEmail=p.email.toLowerCase();p.events.unshift(event('Approval link prepared: '+change.title));}
 if(c.action==='send_email'){if(p.sample)return res({error:'Example projects never send client emails.'},403);if(change.status!=='Awaiting approval')return res({error:'Prepare an approval link first.'},409);const mailConfig=await ownerMailConfig(env.DB,env,u.userId);if(!canEmail(mailConfig,change.clientEmail||p.email)||(emailMode(mailConfig)==='test'&&!canEmail(mailConfig,u.email)))return res({error:'Connect Gmail in Email activity to send to clients. Resend is currently limited to the test address.'},403);if(change.emailRequested)return res({project:{...p,revision:row.revision},notice:'An email was already requested. Check Email activity for its status.'});change.emailRequested=true;change.emailProvider=mailConfig.provider||'resend';emailJob=approvalJob(mailConfig,p,change,u.userId,'approval');p.events.unshift(event('Approval email requested: '+change.title));}
 if(c.action==='withdraw'){if(change.status!=='Awaiting approval')return res({error:'Only pending requests can be withdrawn'},409);change.status='Draft';delete change.token;delete change.emailRequested;delete change.emailProvider;p.events.unshift(event('Approval request withdrawn: '+change.title));}
 if(c.action==='demo_decide'){if(!p.sample)return res({error:'Real client decisions must be made by the designated client.'},403);if(change.status!=='Awaiting approval')return res({error:'This request is not awaiting approval'},409);change.status=c.decision;change.decidedAt=now;change.decidedBy='Example client (simulated by owner)';change.note=c.note;p.events.unshift(event('DEMO: client '+c.decision.toLowerCase()+' '+change.title));}
 }
 p.revision=revision+1;const saved=await saveWithEmail(env.DB,p,u.userId,revision,emailJob);if(!saved)return res({error:'Concurrent update. Refresh and try again.'},409);if(emailJob){try{await processEmails(env.DB,env,fetch,emailJob.id)}catch{console.error('Email processing deferred to scheduled retry.');}}return res({project:p});
 }catch(e){if(e instanceof z.ZodError)return res({error:e.issues.map(x=>x.path.join('.')+': '+x.message).join('; ')},400);console.error('Project request failed.');return res({error:'Could not save your changes. Please try again.'},500);}
}
