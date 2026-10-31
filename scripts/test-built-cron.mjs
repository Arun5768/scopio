import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {resolve} from 'node:path';
const mf=new Miniflare({modulesRoot:resolve('dist/server'),modules:['index.js',...readdirSync('dist/server',{recursive:true}).filter(f=>f.endsWith('.js')&&f!=='index.js')].map(path=>({type:'ESModule',path:resolve('dist/server',path)})),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APP_ORIGIN:'http://localhost'}});
try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>/^000\d.*\.sql$/.test(f)).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(x=>x.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean))await db.prepare(sql).run();
 const worker=await mf.getWorker();const result=await worker.scheduled({cron:'1-59/5 * * * *'});assert.equal(result.outcome,'ok');
 const row=await db.prepare("SELECT last_success FROM service_state WHERE id='mail-cron'").first();
 assert.ok(row?.last_success>Date.now()-60000,'built Worker must persist a successful scheduled heartbeat');
 const health=await mf.dispatchFetch('http://localhost/api/health');const body=await health.text();assert.equal(health.status,200,body);assert.equal(JSON.parse(body).status,'ok');
 console.log('PASS compiled production Worker handles scheduled events and exposes a healthy heartbeat. No provider credentials or emails used.');
}finally{await mf.dispose()}
