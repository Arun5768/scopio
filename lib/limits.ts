import {getDb} from '../db';
import {rateLimits} from '../db/schema';
import {lt,sql} from 'drizzle-orm';
import {digest} from './auth-utils';
export async function allowRequest(key:string,limit:number,windowMs=60000){
 const db=getDb(),now=Date.now(),bucket=Math.floor(now/windowMs);
 const id=await digest(key+':'+bucket);
 await db.delete(rateLimits).where(lt(rateLimits.expiresAt,now));
 const rows=await db.insert(rateLimits).values({id,hits:1,expiresAt:(bucket+1)*windowMs}).onConflictDoUpdate({target:rateLimits.id,set:{hits:sql`${rateLimits.hits}+1`}}).returning({hits:rateLimits.hits});
 return rows[0].hits<=limit;
}
