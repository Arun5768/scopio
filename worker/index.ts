import {runScheduled,recordFailure} from '../lib/monitoring';
import handler from 'vinext/server/fetch-handler';
export default {async scheduled(_controller:ScheduledController,env:Cloudflare.Env){await runScheduled(env.DB,env);},async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
  let response:Response;
  try{response=await handler.fetch(request,env,ctx)}catch{response=Response.json({error:'Scopio is temporarily unavailable. Please try again.'},{status:503})}
  const path=new URL(request.url).pathname;
  if(response.status>=500&&path!=='/api/health')ctx.waitUntil(recordFailure(env.DB,path,response.status).catch(()=>{console.error('Service event could not be recorded.')}));
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  // Same-origin forms need their Origin header; external links still receive no referrer.
  headers.set('Referrer-Policy','same-origin');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(new URL(request.url).protocol==='https:') headers.set('Strict-Transport-Security','max-age=31536000');
  if(new URL(request.url).pathname.startsWith('/api/')) headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
