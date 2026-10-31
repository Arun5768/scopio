import {env} from 'cloudflare:workers';
import {receiveDelivery} from '../../../../lib/delivery';
export async function POST(req:Request){return receiveDelivery(req,env.DB,env.RESEND_WEBHOOK_SECRET)}
