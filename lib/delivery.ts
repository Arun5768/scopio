// Resend/Svix signs the unmodified request body. Never persist the webhook payload.
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const states:Record<string,{state:string;priority:number}>={
 'email.sent':{state:'Sent',priority:0},'email.delivery_delayed':{state:'Delayed',priority:10},
 'email.delivered':{state:'Delivered',priority:20},'email.failed':{state:'Failed',priority:30},
 'email.bounced':{state:'Bounced',priority:40},'email.complained':{state:'Complaint',priority:50}
};
export async function receiveDelivery(req:Request,db:D1Database,secret?:string,now=Date.now()){
 if(!secret)return new Response('Webhook not configured',{status:503});
 if(Number(req.headers.get('content-length')||0)>65536)return new Response('Too large',{status:413});
 const reader=req.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
 if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();return new Response('Too large',{status:413})}chunks.push(part.value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const raw=new TextDecoder().decode(bytes);
 const id=req.headers.get('svix-id')||'',stamp=req.headers.get('svix-timestamp')||'',signatures=req.headers.get('svix-signature')||'';
 let valid=false;
 try{
  if(!/^[\w-]{1,200}$/.test(id)||!/^\d{10,12}$/.test(stamp)||Math.abs(now-Number(stamp)*1000)>300000||signatures.length>4096)throw Error();
  const key=await crypto.subtle.importKey('raw',decode(secret.replace(/^whsec_/,'')),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const content=new TextEncoder().encode(id+'.'+stamp+'.'+raw);
  for(const s of signatures.split(' ')){const [version,value]=s.split(',');if(version==='v1'&&value&&await crypto.subtle.verify('HMAC',key,decode(value),content)){valid=true;break}}
 }catch{valid=false}
 if(!valid)return new Response('Invalid signature',{status:401});
 let event:{type?:string;created_at?:string;data?:{email_id?:string}};
 try{event=JSON.parse(raw)}catch{return new Response('Invalid event',{status:400})}
 const state=states[event.type||''];if(!state)return new Response(null,{status:204});
 const provider=event.data?.email_id,eventAt=Date.parse(event.created_at||'');
 if(typeof provider!=='string'||!/^[\w-]{1,200}$/.test(provider)||!Number.isFinite(eventAt)||eventAt>now+300000)return new Response('Invalid event',{status:400});
 // Idempotent, monotonic updates also handle events arriving before the send response.
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO email_webhook_events (id,provider_id,type,received_at) VALUES (?,?,?,?)').bind(id,provider,event.type,now),
  db.prepare('INSERT INTO email_delivery (provider_id,state,priority,event_at) VALUES (?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET state=excluded.state,priority=excluded.priority,event_at=excluded.event_at WHERE excluded.priority>email_delivery.priority OR (excluded.priority=email_delivery.priority AND excluded.event_at>email_delivery.event_at)').bind(provider,state.state,state.priority,eventAt)
 ]);
 return new Response(null,{status:204});
}
export async function recordReview(db:D1Database,owner:string,project:string,token:string,decision?:'Approved'|'Declined'){
 const at=new Date().toISOString();
 await db.prepare('UPDATE email_outbox SET reviewed_at=COALESCE(reviewed_at,?),client_decision=COALESCE(?,client_decision),decided_at=CASE WHEN ? IS NOT NULL THEN ? ELSE decided_at END WHERE owner=? AND project_id=? AND review_token=? AND kind=\'approval\'').bind(at,decision||null,decision||null,at,owner,project,token).run();
}
