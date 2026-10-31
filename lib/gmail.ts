export type GmailEnv={APP_ORIGIN:string;GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;GMAIL_TOKEN_KEY?:string;GMAIL_OWNER_EMAIL?:string;GMAIL_ACCESS_MODE?:string};
export type GmailConnection={owner:string;email:string;token:string;status:string;connected_at:string};
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send';
export const pilotEmail=(e:GmailEnv,email:string)=>!!e.GMAIL_OWNER_EMAIL&&email.toLowerCase()===e.GMAIL_OWNER_EMAIL.toLowerCase();
export const gmailReady=(e:GmailEnv)=>!!(e.GOOGLE_CLIENT_ID&&e.GOOGLE_CLIENT_SECRET&&e.GMAIL_TOKEN_KEY&&e.GMAIL_OWNER_EMAIL);
export async function gmailAllowed(db:D1Database,e:GmailEnv,email:string){
 if(pilotEmail(e,email))return true;
 // Set verified only after Google's sensitive-scope verification is complete.
 if(e.GMAIL_ACCESS_MODE==='verified')return true;
 if(e.GMAIL_ACCESS_MODE!=='invited')return false;
 return !!await db.prepare('SELECT email FROM gmail_invites WHERE email=? AND active=1').bind(email.toLowerCase()).first();
}
export async function inviteGmail(db:D1Database,email:string){
 const result=await db.prepare('INSERT INTO gmail_invites (email,active,created_at) SELECT ?,1,? WHERE (SELECT COUNT(*) FROM gmail_invites)<20 OR EXISTS (SELECT 1 FROM gmail_invites WHERE email=?) ON CONFLICT(email) DO UPDATE SET active=1 RETURNING email').bind(email.toLowerCase(),new Date().toISOString(),email.toLowerCase()).all();
 return result.results.length>0;
}
export async function revokeInvite(db:D1Database,email:string){
 await db.batch([
  db.prepare('UPDATE gmail_invites SET active=0 WHERE email=?').bind(email.toLowerCase()),
  db.prepare("UPDATE email_outbox SET status='Cancelled',error='Gmail early access was revoked.' WHERE provider='gmail' AND status IN ('Queued','Paused','Failed') AND owner IN (SELECT owner FROM gmail_connections WHERE email=?)").bind(email.toLowerCase()),
  db.prepare("UPDATE gmail_connections SET token='',status='Disconnected' WHERE email=?").bind(email.toLowerCase())
 ]);
}
const b64=(v:Uint8Array)=>btoa(Array.from(v,b=>String.fromCharCode(b)).join(''));
const un64=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
export async function sealToken(value:string,owner:string,keyHex:string){
 if(!/^[a-f0-9]{64}$/.test(keyHex))throw Error('Invalid encryption configuration');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyHex.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},key,new TextEncoder().encode(value));
 return b64(iv)+'.'+b64(new Uint8Array(encrypted));
}
export async function openToken(value:string,owner:string,keyHex:string){
 if(!/^[a-f0-9]{64}$/.test(keyHex))throw Error('Invalid encryption configuration');
 const [iv,body]=value.split('.');const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyHex.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv),additionalData:new TextEncoder().encode(owner)},key,un64(body)));
}
export async function gmailConnection(db:D1Database,owner:string){return db.prepare('SELECT * FROM gmail_connections WHERE owner=?').bind(owner).first<GmailConnection>()}
export async function disconnectGmail(db:D1Database,owner:string){
 await db.batch([
 db.prepare("UPDATE gmail_connections SET token='',status='Disconnected' WHERE owner=?").bind(owner),
 db.prepare("UPDATE email_outbox SET status='Cancelled',error='Gmail was disconnected.' WHERE owner=? AND provider='gmail' AND status IN ('Queued','Paused','Failed')").bind(owner)
 ]);
}
function headerSubject(value:string){
 const words:string[]=[];let part='';
 for(const ch of value.replace(/[\r\n]/g,' ')){if(new TextEncoder().encode(part+ch).length>42){words.push('=?UTF-8?B?'+b64(new TextEncoder().encode(part))+'?=');part=''}part+=ch}
 if(part)words.push('=?UTF-8?B?'+b64(new TextEncoder().encode(part))+'?=');return words.join('\r\n ');
}
export async function gmailMime(payload:{from:string;to:string[];subject:string;text:string;html:string},id:string,sender:string){
 const address=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
 if(!address.test(sender)||payload.to.length!==1||!address.test(payload.to[0]))throw Error('Invalid mail address');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))),b=>b.toString(16).padStart(2,'0')).join('');
 const boundary='scopio_'+hash;const encode=(s:string)=>b64(new TextEncoder().encode(s)).match(/.{1,76}/g)?.join('\r\n')||'';
 const raw=[`From: Scopio <${sender}>`,`To: <${payload.to[0]}>`,`Subject: ${headerSubject(payload.subject)}`,`Message-ID: <${hash}@scopio.arunchandel1780.workers.dev>`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(payload.text),`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(payload.html),`--${boundary}--`,''].join('\r\n');
 return b64(new TextEncoder().encode(raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export type GmailResult={status:'Accepted'|'Queued'|'Failed'|'Paused'|'Unknown';error:string|null;id?:string;next?:number};
export async function sendGmail(db:D1Database,e:GmailEnv,row:{id:string;owner:string;payload:string;attempts:number},transport:typeof fetch):Promise<GmailResult>{
 const paused=(error:string):GmailResult=>({status:'Paused',error});const unknown=():GmailResult=>({status:'Unknown',error:'Gmail did not confirm sending. Check Gmail Sent before attempting another send; automatic retry is paused to avoid duplicates.'});
 const connection=await gmailConnection(db,row.owner);
 if(!gmailReady(e)||!connection||connection.status!=='Connected'||!await gmailAllowed(db,e,connection.email))return paused('Gmail access is unavailable. Check Email settings before retrying.');
 let access:string;
 try{
  const refresh=await openToken(connection.token,row.owner,e.GMAIL_TOKEN_KEY!);
  const response=await transport('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID!,client_secret:e.GOOGLE_CLIENT_SECRET!,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000)});
  if(response.status===400||response.status===401){await db.prepare("UPDATE gmail_connections SET status='Reconnect required' WHERE owner=? AND token=?").bind(row.owner,connection.token).run();return paused('Google authorization expired or was revoked. Reconnect Gmail, then retry this email.');}
  if(!response.ok)return {status:row.attempts<6?'Queued':'Failed',error:'Gmail authorization is temporarily unavailable.',next:Date.now()+300000};
  const tokens=await response.json() as {access_token?:string;scope?:string};if(!tokens.access_token)return paused('Google did not return a sending credential. Reconnect Gmail.');access=tokens.access_token;
 }catch{return {status:row.attempts<6?'Queued':'Failed',error:'Could not refresh Gmail authorization. No message was submitted.',next:Date.now()+300000}}
 let raw:string;try{raw=await gmailMime(JSON.parse(row.payload),row.id,connection.email)}catch{return {status:'Failed',error:'The sender or recipient address is invalid.'}}
 const live=await gmailConnection(db,row.owner);if(!live||live.status!=='Connected'||live.token!==connection.token||!await gmailAllowed(db,e,live.email))return paused('The Gmail connection changed. Reconnect and retry.');
 const bucket=row.owner+':'+new Date().toISOString().slice(0,10);
 const quota=await db.prepare('INSERT INTO email_daily_usage (id,hits) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET hits=hits+1 WHERE hits<100 RETURNING hits').bind(bucket).all();
 if(!quota.results.length){const reset=new Date();reset.setUTCHours(24,0,0,0);return {status:'Queued',error:'Scopio’s pilot limit of 100 send attempts today has been reached. Waiting for the daily reset.',next:reset.getTime()}}
 try{
  const response=await transport('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(12000)});
  if(response.status===401){await db.prepare("UPDATE gmail_connections SET status='Reconnect required' WHERE owner=? AND token=?").bind(row.owner,connection.token).run();return paused('Gmail rejected the sending credential. Reconnect and retry.');}
  if(response.status===429)return {status:row.attempts<6?'Queued':'Failed',error:'Gmail’s sending limit was reached. Waiting before another attempt.',next:Date.now()+3600000};
  if(response.status===403){const d=await response.json() as {error?:{errors?:{reason?:string}[]}};const rate=d.error?.errors?.some(x=>['rateLimitExceeded','userRateLimitExceeded'].includes(x.reason||''));if(rate)return {status:row.attempts<6?'Queued':'Failed',error:'Gmail is limiting sends. Waiting before another attempt.',next:Date.now()+3600000};await db.prepare("UPDATE gmail_connections SET status='Reconnect required' WHERE owner=? AND token=?").bind(row.owner,connection.token).run();return paused('Gmail sending is not authorized. Check the API setup and reconnect Gmail.');}
  if(response.status>=500)return unknown();
  if(!response.ok)return {status:'Failed',error:'Gmail rejected this message (HTTP '+response.status+').'};
  const sent=await response.json() as {id?:string};return sent.id?{status:'Accepted',error:null,id:sent.id}:unknown();
 }catch{return unknown()}
}
