// Local-only browser QA fixture. Never imported by the app or included in deploys.
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {createServer} from 'node:http';
const token=randomBytes(32).toString('hex'),nonce=randomBytes(16).toString('hex');
const dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const files=readdirSync(dir).filter(x=>x.endsWith('.sqlite')&&x!=='metadata.sqlite');
if(files.length!==1)throw Error('Expected exactly one local D1 database for browser QA.');
const db=new DatabaseSync(dir+'/'+files[0]);
db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'preview-'+nonce,'preview@scopio.test','Alex Studio',Date.now()+5400000);
db.close();
const server=createServer((req,res)=>{if(req.url!==`/session/${nonce}`){res.writeHead(404);res.end();return}res.writeHead(302,{'Set-Cookie':`scopio_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=5400`,Location:'http://127.0.0.1:5175/workspace','Cache-Control':'no-store'});res.end();server.close();});
server.listen(5180,'127.0.0.1',()=>console.log(`Local synthetic QA session: http://127.0.0.1:5180/session/${nonce}`));
setTimeout(()=>server.close(),600000).unref();
