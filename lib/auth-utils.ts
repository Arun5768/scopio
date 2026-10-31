export function safeReturnTo(value:string|null):string {
 if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/workspace';
 try{const parsed=new URL(value,'https://scopio.local');if(parsed.origin!=='https://scopio.local'||parsed.pathname.startsWith('/api/auth'))return '/workspace';return parsed.pathname+parsed.search;}catch{return '/workspace'}
}
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(value:string){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('')}
export async function challenge(value:string){const data=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
export function cookieValue(header:string|null,name:string){return header?.split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1)||''}
export function authCookieName(origin:string,kind:'session'|'state'){return (origin.startsWith('https:')?'__Host-':'')+'scopio_'+kind}
export function authCookie(origin:string,kind:'session'|'state',value:string,maxAge:number){return `${authCookieName(origin,kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:')?'; Secure':''}`}
