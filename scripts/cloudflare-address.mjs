// Read-only: resolve the existing account's workers.dev suffix via Wrangler auth.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const credentials=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}}));
if(!['oauth','api_token'].includes(credentials.type))throw Error('Expected an authenticated Wrangler token');
const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+config.account_id+'/workers/subdomain',{headers:{Authorization:'Bearer '+credentials.token},signal:AbortSignal.timeout(20000)});
const data=await response.json();
if(!response.ok||!data.success)throw Error('Unable to read the account subdomain (HTTP '+response.status+')');
if(!/^[a-z0-9-]+$/.test(data.result.subdomain))throw Error('No valid workers.dev subdomain configured');
console.log('https://'+config.name+'.'+data.result.subdomain+'.workers.dev');
