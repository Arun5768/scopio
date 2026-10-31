import {env} from 'cloudflare:workers';
import {getUser} from '../../../../lib/auth';
import {getDb} from '../../../../db';
import {oauthStates} from '../../../../db/schema';
import {authCookie,challenge,digest,randomToken,cookieValue,authCookieName} from '../../../../lib/auth-utils';
import {gmailReady,gmailAllowed,GMAIL_SCOPE} from '../../../../lib/gmail';
import {allowRequest} from '../../../../lib/limits';
export async function POST(req:Request){
 if(req.headers.get('origin')!==env.APP_ORIGIN)return new Response('Invalid origin',{status:403});
 const u=await getUser();if(!u||!await gmailAllowed(env.DB,env,u.email))return new Response('Gmail early access requires an invitation. You can share review links meanwhile.',{status:403});
 if(!gmailReady(env))return new Response('Gmail setup is not ready.',{status:503});
 if(!await allowRequest('gmail-connect:'+u.userId,5,600000))return new Response('Please wait before reconnecting.',{status:429});
 const state=randomToken(),verifier=randomToken(),nonce=randomToken();
 const session=await digest(cookieValue(req.headers.get('cookie'),authCookieName(env.APP_ORIGIN,'session')));
 await getDb().insert(oauthStates).values({id:await digest(state),verifier,nonce,returnTo:'gmail:'+JSON.stringify({owner:u.userId,session}),expiresAt:Date.now()+600000});
 const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,redirect_uri:env.APP_ORIGIN+'/api/auth/callback',response_type:'code',scope:'openid email '+GMAIL_SCOPE,state,nonce,code_challenge:await challenge(verifier),code_challenge_method:'S256',access_type:'offline',prompt:'consent',login_hint:u.email,include_granted_scopes:'false'}).toString();
 return new Response(null,{status:303,headers:{Location:target.toString(),'Set-Cookie':authCookie(env.APP_ORIGIN,'state',state,600),'Cache-Control':'no-store'}});
}
