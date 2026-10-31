import {env} from 'cloudflare:workers';
import {getDb} from '../../../../db';
import {oauthStates,sessions} from '../../../../db/schema';
import {lt} from 'drizzle-orm';
import {authCookie,challenge,digest,randomToken,safeReturnTo} from '../../../../lib/auth-utils';
import {allowRequest} from '../../../../lib/limits';
export async function GET(req:Request){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return Response.json({error:'Google sign-in setup is not complete yet.'},{status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(req.url);if(url.origin!==env.APP_ORIGIN)return new Response('Invalid origin',{status:400});
 if(!await allowRequest('login:'+(req.headers.get('cf-connecting-ip')||'local'),20,600000))return new Response('Too many sign-in attempts. Please try again later.',{status:429,headers:{'Retry-After':'600'}});
 const state=randomToken(),verifier=randomToken(),nonce=randomToken();
 const db=getDb();await db.delete(oauthStates).where(lt(oauthStates.expiresAt,Date.now()));await db.delete(sessions).where(lt(sessions.expiresAt,Date.now()));
 await db.insert(oauthStates).values({id:await digest(state),verifier,nonce,returnTo:safeReturnTo(url.searchParams.get('return_to')),expiresAt:Date.now()+600000});
 const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.APP_ORIGIN+'/api/auth/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:await challenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
 return new Response(null,{status:302,headers:{Location:target.toString(),'Set-Cookie':authCookie(env.APP_ORIGIN,'state',state,600),'Cache-Control':'no-store'}});
}
