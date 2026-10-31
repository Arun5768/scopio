import type {Project, Change} from './scopio';
import {gmailConnection,gmailReady,gmailAllowed,sendGmail,type GmailEnv} from './gmail';

export type EmailConfig = GmailEnv & {RESEND_API_KEY?:string; EMAIL_FROM?:string; EMAIL_MODE?:string; EMAIL_TEST_RECIPIENT?:string; provider?:string};
export type EmailJob = {id:string;owner:string;project_id:string|null;change_id:string|null;review_token:string|null;kind:string;recipient:string;subject:string;payload:string;created_at:string;provider?:string};
export type EmailRow = EmailJob & {status:string;attempts:number;first_attempt:number|null;next_attempt:number;lease_until:number;provider_id:string|null;error:string|null;sent_at:string|null};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function emailMode(e:EmailConfig){return e.provider==='gmail'?'gmail':e.RESEND_API_KEY&&e.EMAIL_FROM&&(e.EMAIL_MODE==='test'||e.EMAIL_MODE==='live')?e.EMAIL_MODE:'disabled'}
export function canEmail(e:EmailConfig,to:string){return ['gmail','live'].includes(emailMode(e))||emailMode(e)==='test'&&!!e.EMAIL_TEST_RECIPIENT&&to.toLowerCase()===e.EMAIL_TEST_RECIPIENT.toLowerCase()}
export async function ownerMailConfig(db:D1Database,e:EmailConfig,owner:string,includePaused=false):Promise<EmailConfig>{
 if(gmailReady(e)){const c=await gmailConnection(db,owner);if(c&&await gmailAllowed(db,e,c.email)&&(c.status==='Connected'||includePaused&&c.status==='Reconnect required'))return {...e,provider:'gmail',EMAIL_FROM:`Scopio <${c.email}>`}}
 return e;
}
function message(e:EmailConfig,to:string,subject:string,body:string,link:string,label:string){
 return JSON.stringify({from:e.EMAIL_FROM,to:[to],subject,text:body+'\n\n'+label+': '+link,html:`<div style="background:#f7f3e8;padding:32px;font-family:Arial,sans-serif;color:#182119"><div style="max-width:560px;margin:auto"><p style="font-size:28px;font-weight:bold">scopio<span style="color:#f47735">.</span></p><h1 style="font-size:28px">${escape(subject)}</h1><p style="white-space:pre-line;line-height:1.7">${escape(body)}</p><p style="margin:28px 0"><a href="${escape(link)}" style="background:#c4ed85;color:#182119;padding:14px 20px;border-radius:8px;display:inline-block;text-decoration:none;font-weight:bold">${escape(label)}</a></p><p style="font-size:12px;color:#596153">Every request. Clearly agreed.<br>This is a project notification from Scopio.</p></div></div>`});
}
export function approvalJob(e:EmailConfig,p:Project,c:Change,owner:string,kind:'approval'|'decision'):EmailJob{
 const to=kind==='approval'?(c.clientEmail||p.email):p.ownerEmail!;
 if(p.sample||!c.token||!to||!canEmail(e,to))throw Error('Email is not available for this recipient.');
 const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency}).format(c.hours*c.rate);
 const subject=kind==='approval'?`Approval requested: ${c.title}`:`${c.status}: ${c.title}`;
 const body=kind==='approval'?`${p.client}, a change request is ready for your review.\n\nProject: ${p.name}\nChange: ${c.title}\nAdditional cost: ${amount}\nEstimated effort: ${c.hours} hours\nDelivery impact: +${c.days} days\n\nReview the deliverable and acceptance criteria before deciding. Sign in with Google using ${to}. Nothing is agreed until you approve.`:`The client ${c.status.toLowerCase()} a change request.\n\nProject: ${p.name}\nChange: ${c.title}\nAdditional cost: ${amount}\nDecision by: ${c.decidedBy}\n\nOpen your workspace for the full decision record.`;
 const link=kind==='approval'?`${e.APP_ORIGIN}/review?project=${p.id}&token=${c.token}`:e.APP_ORIGIN+'/workspace';
 return {id:`${kind}/${p.id}/${c.token}`,owner,project_id:p.id,change_id:c.id,review_token:c.token,kind,recipient:to,subject,payload:message(e,to,subject,body,link,kind==='approval'?'Review change request':'Open workspace'),created_at:new Date().toISOString(),provider:e.provider||'resend'};
}
export function setupJob(e:EmailConfig,owner:string,to:string):EmailJob{
 if(emailMode(e)==='gmail')return {id:'gmail-setup/'+owner,owner,project_id:null,change_id:null,review_token:null,kind:'gmail_setup',recipient:to,subject:'Scopio Gmail connection ready',payload:message(e,to,'Scopio Gmail connection ready','Your Scopio Gmail connection is working. Approval emails can now be sent from your connected Gmail account to your clients. Your workspace keeps a record of each send attempt.',e.APP_ORIGIN+'/workspace?tab=email','Open email activity'),created_at:new Date().toISOString(),provider:'gmail'};
 if(emailMode(e)!=='test'||!canEmail(e,to))throw Error('Setup tests are restricted to the configured test account.');
 const subject='Scopio email is connected';
 return {id:'setup/'+owner,owner,project_id:null,change_id:null,review_token:null,kind:'setup',recipient:to,subject,payload:message(e,to,subject,'Your Scopio email connection is working.\n\nFree test mode is active. Emails can currently be sent only to your configured test address. Verify a sender domain before emailing real clients.',e.APP_ORIGIN+'/workspace','Open workspace'),created_at:new Date().toISOString()};
}
export function deliveryTestJob(e:EmailConfig,owner:string,to:string):EmailJob{
 if(emailMode(e)!=='test'||!canEmail(e,to))throw Error('Delivery tests are restricted to the configured test account.');
 const subject='Scopio delivery tracking check';
 return {id:'delivery-setup/'+owner,owner,project_id:null,change_id:null,review_token:null,kind:'delivery_setup',recipient:to,subject,payload:message(e,to,subject,'This test checks Scopio’s delivery tracking.',e.APP_ORIGIN+'/workspace','Open workspace'),created_at:new Date().toISOString(),provider:'resend'};
}
export function insertEmail(db:D1Database,j:EmailJob,condition?:{projectId:string;data:string;revision:number}){
 const values=[j.id,j.owner,j.project_id,j.change_id,j.review_token,j.kind,j.recipient,j.subject,j.payload,Date.now(),j.created_at,j.provider||'resend'];
 const base='INSERT OR IGNORE INTO email_outbox (id,owner,project_id,change_id,review_token,kind,recipient,subject,payload,next_attempt,created_at,provider) ';
 return condition?db.prepare(base+'SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND data=? AND revision=?)').bind(...values,condition.projectId,condition.data,condition.revision):db.prepare(base+'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values);
}
// D1 batches commit the project change and its email together. A stale revision queues nothing.
export async function saveWithEmail(db:D1Database,p:Project,owner:string,expected:number,j?:EmailJob,receipt?:{token:string;decision:string}){
 const data=JSON.stringify(p);
 const statements=[db.prepare('UPDATE projects SET data=?,revision=?,updated_at=? WHERE id=? AND owner=? AND revision=? RETURNING id').bind(data,p.revision,new Date().toISOString(),p.id,owner,expected)];
 if(j)statements.push(insertEmail(db,j,{projectId:p.id,data,revision:p.revision}));
 if(receipt)statements.push(db.prepare("UPDATE email_outbox SET reviewed_at=COALESCE(reviewed_at,?),client_decision=?,decided_at=? WHERE owner=? AND project_id=? AND review_token=? AND kind='approval' AND EXISTS (SELECT 1 FROM projects WHERE id=? AND data=? AND revision=?)").bind(new Date().toISOString(),receipt.decision,new Date().toISOString(),owner,p.id,receipt.token,p.id,data,p.revision));
 const result=await db.batch(statements);return result[0].results.length>0;
}
export async function listEmails(db:D1Database,owner:string){
 return (await db.prepare("SELECT o.id,o.project_id,o.change_id,o.kind,o.recipient,o.subject,o.status,o.attempts,CASE WHEN o.status='Sending' THEN NULL ELSE o.error END AS error,o.created_at,o.sent_at,o.provider,o.reviewed_at,o.client_decision,o.decided_at,d.state AS delivery_state,d.event_at AS delivery_at FROM email_outbox o LEFT JOIN email_delivery d ON o.provider='resend' AND o.provider_id=d.provider_id WHERE o.owner=? ORDER BY o.created_at DESC LIMIT 100").bind(owner).all()).results;
}
export function retrySafe(row:Pick<EmailRow,'first_attempt'>,now=Date.now()){return row.first_attempt===null||now-row.first_attempt<23*60*60*1000}
export async function retryEmail(db:D1Database,owner:string,id:string){
 const r=await db.prepare("UPDATE email_outbox SET status='Queued',next_attempt=?,error=NULL WHERE id=? AND owner=? AND ((provider='gmail' AND status IN ('Failed','Paused')) OR (provider='resend' AND status='Failed' AND (first_attempt IS NULL OR first_attempt>?))) RETURNING id").bind(Date.now(),id,owner,Date.now()-23*3600000).all();return r.results.length>0;
}
export async function processEmails(db:D1Database,e:EmailConfig,transport:typeof fetch=fetch,onlyId?:string){
 if(emailMode(e)==='disabled'&&!gmailReady(e))return;
 const now=Date.now();
 const rows=(await db.prepare("SELECT * FROM email_outbox WHERE ((status='Queued' AND next_attempt<=?) OR (status='Sending' AND lease_until<?))"+(onlyId?' AND id=?':'')+' ORDER BY next_attempt LIMIT 10').bind(now,now,...(onlyId?[onlyId]:[])).all<EmailRow>()).results;
 for(const row of rows){
  const lock=crypto.randomUUID();
  const claimed=await db.prepare("UPDATE email_outbox SET status='Sending',lease_until=?,error=? WHERE id=? AND ((status='Queued' AND next_attempt<=?) OR (status='Sending' AND lease_until<?)) RETURNING id").bind(Date.now()+120000,lock,row.id,now,now).all();
  if(!claimed.results.length)continue;
  const finish=async(status:string,error:string|null,providerId:string|null=null,next=Date.now())=>{await db.prepare('UPDATE email_outbox SET status=?,error=?,provider_id=COALESCE(?,provider_id),next_attempt=?,lease_until=0,sent_at=CASE WHEN ?=\'Accepted\' THEN ? ELSE sent_at END WHERE id=? AND error=?').bind(status,error,providerId,next,status,new Date().toISOString(),row.id,lock).run()};
  if(row.provider!=='gmail'&&!canEmail(e,row.recipient)){await finish('Failed','This recipient is not enabled in the current email mode.');continue}
  if(row.provider!=='gmail'){
   const suppressed=await db.prepare("SELECT 1 FROM email_outbox o JOIN email_delivery d ON o.provider_id=d.provider_id WHERE o.provider='resend' AND o.owner=? AND lower(o.recipient)=lower(?) AND d.state IN ('Bounced','Complaint') LIMIT 1").bind(row.owner,row.recipient).first();
   if(suppressed){await finish('Failed','This recipient previously bounced or reported spam. Use a corrected address or share the review link.');continue}
  }
  if(row.project_id){
   const project=await db.prepare('SELECT data FROM projects WHERE id=? AND owner=?').bind(row.project_id,row.owner).first<{data:string}>();
   const p:Project|undefined=project?JSON.parse(project.data):undefined;const c=p?.changes.find(x=>x.id===row.change_id&&x.token===row.review_token);
   if(!p||p.sample||!c||(row.kind==='approval'?c.status!=='Awaiting approval':!['Approved','Declined'].includes(c.status))){await finish('Cancelled','The request was withdrawn, decided, or is no longer available.');continue}
  }
  if(row.provider==='gmail'&&row.status==='Sending'&&row.first_attempt!==null){await finish('Unknown','A Gmail send was interrupted. Check Gmail Sent; Scopio will not automatically repeat it.');continue}
  if(row.provider!=='gmail'&&!retrySafe(row)){await finish('Unknown','Retry window ended. Check Resend before sending again to avoid a duplicate.');continue}
  const attempts=row.attempts+1;
  await db.prepare('UPDATE email_outbox SET attempts=?,first_attempt=COALESCE(first_attempt,?) WHERE id=? AND error=?').bind(attempts,Date.now(),row.id,lock).run();
  if(row.provider==='gmail'){
   const result=await sendGmail(db,e,{...row,attempts},transport);await finish(result.status,result.error,result.id||null,result.next||Date.now());continue;
  }
  try{
   const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+e.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':row.id},body:row.payload,signal:AbortSignal.timeout(12000)});
   const data=await response.json() as {id?:string};
   if(response.ok&&data.id){await finish('Accepted',null,data.id);continue}
   const transient=response.status===429||response.status>=500||response.status===409;
   const detail=response.status===429?'Email quota or rate limit reached.':response.status===403?'Resend rejected the sender or recipient. Verify the email configuration.':response.status===401?'The email credential needs attention.':'Email provider returned HTTP '+response.status+'.';
   await finish(transient&&attempts<6?'Queued':'Failed',detail,null,Date.now()+Math.min(3600000,60000*2**attempts));
  }catch{await finish(attempts<6?'Queued':'Failed','Email provider did not confirm the request. A safe retry uses the same message ID.',null,Date.now()+Math.min(3600000,60000*2**attempts))}
 }
}
