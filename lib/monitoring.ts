import {processEmails,type EmailConfig} from './email';
export async function health(db:D1Database,now=Date.now()){
 try{
  const scheduler=await db.prepare("SELECT * FROM service_state WHERE id='mail-cron'").first<{last_success:number|null;last_failure:number|null;running_since:number|null}>();
  const queue=await db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE (status='Queued' AND next_attempt<?) OR (status='Sending' AND lease_until<?)").bind(now-900000,now-900000).first<{count:number}>();
  const schedulerOk=!!scheduler?.last_success&&now-scheduler.last_success<1200000&&(!scheduler.last_failure||scheduler.last_success>=scheduler.last_failure);
  const queueOk=(queue?.count||0)===0;
  return {status:schedulerOk&&queueOk?'ok':'degraded',checks:{database:'ok',scheduler:schedulerOk?'ok':'stale',emailQueue:queueOk?'ok':'delayed'},checkedAt:new Date(now).toISOString()};
 }catch{return {status:'unavailable',checks:{database:'unavailable',scheduler:'unknown',emailQueue:'unknown'},checkedAt:new Date(now).toISOString()}}
}
export function safeRoute(path:string){return ['/api/projects','/api/review','/api/emails','/api/gmail/connect','/api/auth/callback','/api/hooks/resend','/api/operations','/api/health'].includes(path)?path:'other'}
export async function recordFailure(db:D1Database,path:string,status:number,now=Date.now()){
 const route=safeRoute(path);await db.prepare('INSERT OR IGNORE INTO service_events (id,route,status,created_at) VALUES (?,?,?,?)').bind(route+':'+status+':'+Math.floor(now/300000),route,status,now).run();
}
export async function runScheduled(db:D1Database,env:EmailConfig){
 const start=Date.now();
 try{
  await db.prepare("INSERT INTO service_state (id,running_since) VALUES ('mail-cron',?) ON CONFLICT(id) DO UPDATE SET running_since=excluded.running_since").bind(start).run();
  await processEmails(db,env);
  await db.batch([
   db.prepare("UPDATE service_state SET last_success=?,running_since=NULL WHERE id='mail-cron'").bind(Date.now()),
   db.prepare('DELETE FROM service_events WHERE created_at<?').bind(start-7*86400000),
   db.prepare('DELETE FROM email_webhook_events WHERE received_at<?').bind(start-30*86400000),
   db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(start),
   db.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(start),
   db.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(start),
   db.prepare('DELETE FROM email_daily_usage WHERE substr(id,-10)<?').bind(new Date(start-30*86400000).toISOString().slice(0,10))
  ]);
 }catch{
  console.error('Scheduled email processing failed. See Operations.');
  await db.prepare("INSERT INTO service_state (id,last_failure) VALUES ('mail-cron',?) ON CONFLICT(id) DO UPDATE SET last_failure=excluded.last_failure,running_since=NULL").bind(Date.now()).run();
 }
}
