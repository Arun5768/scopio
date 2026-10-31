import {getUser} from '../../../../lib/auth';
import {sealToken,gmailAllowed,GMAIL_SCOPE} from '../../../../lib/gmail';
import {env} from 'cloudflare:workers';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {getDb} from '../../../../db';
import {oauthStates,sessions} from '../../../../db/schema';
import {and,eq,gt} from 'drizzle-orm';
import {authCookie,authCookieName,cookieValue,digest,randomToken} from '../../../../lib/auth-utils';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function GET(req:Request){
 let gmailFlow=false;
 const fail=()=>gmailFlow?new Response(null,{status:303,headers:{Location:env.APP_ORIGIN+'/workspace?tab=email&gmail=failed','Cache-Control':'no-store','Set-Cookie':authCookie(env.APP_ORIGIN,'state','',0)}}):new Response('Sign-in could not be completed. Return to Scopio and try again.',{status:400,headers:{'Cache-Control':'no-store','Set-Cookie':authCookie(env.APP_ORIGIN,'state','',0)}});
 try{
 const url=new URL(req.url);if(url.origin!==env.APP_ORIGIN||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return fail();
 const state=url.searchParams.get('state');const code=url.searchParams.get('code');
 if(!state||!/^[a-f0-9]{64}$/.test(state)||state!==cookieValue(req.headers.get('cookie'),authCookieName(env.APP_ORIGIN,'state')))return fail();
 const db=getDb();const flow=(await db.delete(oauthStates).where(and(eq(oauthStates.id,await digest(state)),gt(oauthStates.expiresAt,Date.now()))).returning())[0];if(!flow)return fail();
 gmailFlow=flow.returnTo.startsWith('gmail:');if(!code||code.length>2048)return fail();
 const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.APP_ORIGIN+'/api/auth/callback',grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)});
 if(!tokenResponse.ok)return fail();const tokens=await tokenResponse.json() as {id_token?:string;refresh_token?:string;scope?:string};if(!tokens.id_token)return fail();
 const {payload}=await jwtVerify(tokens.id_token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,algorithms:['RS256'],maxTokenAge:'10m'});
 if(payload.nonce!==flow.nonce||!payload.sub||payload.email_verified!==true||typeof payload.email!=='string')return fail();
 if(flow.returnTo.startsWith('gmail:')){
  const intent=JSON.parse(flow.returnTo.slice(6)) as {owner:string;session:string};const u=await getUser();
  const sessionHash=await digest(cookieValue(req.headers.get('cookie'),authCookieName(env.APP_ORIGIN,'session')));
  if(!u||u.userId!==intent.owner||u.userId!=='google:'+payload.sub||intent.session!==sessionHash||!await gmailAllowed(env.DB,env,payload.email)||!tokens.scope?.split(' ').includes(GMAIL_SCOPE)||!tokens.refresh_token||!env.GMAIL_TOKEN_KEY)return fail();
  const encrypted=await sealToken(tokens.refresh_token,u.userId,env.GMAIL_TOKEN_KEY);
  await env.DB.prepare("INSERT INTO gmail_connections (owner,email,token,status,connected_at) VALUES (?,?,?,'Connected',?) ON CONFLICT(owner) DO UPDATE SET email=excluded.email,token=excluded.token,status='Connected',connected_at=excluded.connected_at").bind(u.userId,payload.email.toLowerCase(),encrypted,new Date().toISOString()).run();
  return new Response(null,{status:303,headers:{Location:env.APP_ORIGIN+'/workspace?tab=email&gmail=connected','Cache-Control':'no-store','Set-Cookie':authCookie(env.APP_ORIGIN,'state','',0)}});
 }
 const session=randomToken();await db.insert(sessions).values({id:await digest(session),userId:'google:'+payload.sub,email:payload.email.toLowerCase(),name:typeof payload.name==='string'?payload.name.slice(0,200):payload.email,expiresAt:Date.now()+7*86400000});
 const headers=new Headers({'Location':env.APP_ORIGIN+flow.returnTo,'Cache-Control':'no-store'});headers.append('Set-Cookie',authCookie(env.APP_ORIGIN,'state','',0));headers.append('Set-Cookie',authCookie(env.APP_ORIGIN,'session',session,7*86400));return new Response(null,{status:303,headers});
 }catch{return fail()}
}
