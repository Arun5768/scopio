import {env} from 'cloudflare:workers';
import {health} from '../../../lib/monitoring';
export async function GET(){const result=await health(env.DB);return Response.json(result,{status:result.status==='ok'?200:503,headers:{'Cache-Control':'no-store'}})}
