import {env} from 'cloudflare:workers';
import {getDb} from '../../../../db';
import {sessions} from '../../../../db/schema';
import {eq} from 'drizzle-orm';
import {authCookie,authCookieName,cookieValue,digest} from '../../../../lib/auth-utils';
export async function POST(req:Request){if(req.headers.get('origin')!==env.APP_ORIGIN)return new Response('Invalid origin',{status:403});const token=cookieValue(req.headers.get('cookie'),authCookieName(env.APP_ORIGIN,'session'));if(token)await getDb().delete(sessions).where(eq(sessions.id,await digest(token)));return new Response(null,{status:303,headers:{Location:env.APP_ORIGIN,'Set-Cookie':authCookie(env.APP_ORIGIN,'session','',0),'Cache-Control':'no-store'}})}
