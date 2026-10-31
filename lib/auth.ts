import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {getDb} from '../db';
import {sessions} from '../db/schema';
import {and,eq,gt} from 'drizzle-orm';
import {authCookieName,cookieValue,digest} from './auth-utils';
export async function getUser(){
 const requestHeaders=await headers();
 const token=cookieValue(requestHeaders.get('cookie'),authCookieName(env.APP_ORIGIN,'session'));
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const row=(await getDb().select().from(sessions).where(and(eq(sessions.id,await digest(token)),gt(sessions.expiresAt,Date.now()))))[0];
 return row?{userId:row.userId,email:row.email,displayName:row.name}:null;
}
