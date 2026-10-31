import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getUser} from '../../../lib/auth';
import {pilotEmail,inviteGmail,revokeInvite} from '../../../lib/gmail';
import {health} from '../../../lib/monitoring';
import {allowRequest} from '../../../lib/limits';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const user=await getUser();if(!user||!pilotEmail(env,user.email))return json({error:'Operator access required.'},403);
 const [service,cron,counts,events,invites,webhooks]=await Promise.all([
  health(env.DB),env.DB.prepare("SELECT last_success,last_failure,running_since FROM service_state WHERE id='mail-cron'").first(),
  env.DB.prepare("SELECT provider,status,COUNT(*) AS count FROM email_outbox GROUP BY provider,status").all(),
  env.DB.prepare('SELECT route,status,created_at FROM service_events ORDER BY created_at DESC LIMIT 30').all(),
  env.DB.prepare('SELECT email,active,created_at FROM gmail_invites ORDER BY created_at DESC').all(),
  env.DB.prepare('SELECT MAX(received_at) AS last_received FROM email_webhook_events').first()
 ]);
 return json({service,cron,counts:counts.results,events:events.results,invites:invites.results,webhook:{configured:!!env.RESEND_WEBHOOK_SECRET,...webhooks},gmailAccess:env.GMAIL_ACCESS_MODE||'owner'});
}
export async function POST(req:Request){
 if(req.headers.get('origin')!==env.APP_ORIGIN)return json({error:'Invalid origin.'},403);
 const user=await getUser();if(!user||!pilotEmail(env,user.email))return json({error:'Operator access required.'},403);
 if(!await allowRequest('operations:'+user.userId,10))return json({error:'Please wait before making more changes.'},429);
 const raw=await req.text();if(raw.length>2048)return json({error:'Request too large.'},413);
 const parsed=z.object({action:z.enum(['invite','revoke']),email:z.string().email().max(254),confirmed:z.literal(true)}).safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})());
 if(!parsed.success)return json({error:'Enter a valid email address and confirm the change.'},400);
 const {action,email}=parsed.data;
 if(pilotEmail(env,email))return json({error:'The operator already has Gmail access.'},400);
 if(action==='invite'&&!await inviteGmail(env.DB,email))return json({error:'The early-access limit is 20 invited accounts. Public access awaits Google verification.'},409);
 if(action==='revoke')await revokeInvite(env.DB,email);
 return json({ok:true});
}
