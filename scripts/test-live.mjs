import assert from 'node:assert/strict';
const origin='https://scopio.arunchandel1780.workers.dev';
const request=(path,options={})=>fetch(origin+path,{...options,signal:AbortSignal.timeout(20000)});
for(const path of ['/','/privacy','/workspace']){const r=await request(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'same-origin');assert.ok((await r.text()).includes('Scopio')||(path==='/'));console.log('PASS live '+path)}
assert.equal((await request('/api/projects')).status,401);console.log('PASS anonymous project protection');
assert.equal((await request('/api/auth/callback?state=invalid&code=invalid')).status,400);console.log('PASS invalid callback rejected');
const login=await request('/api/auth/google?return_to=//evil.example',{redirect:'manual'});assert.equal(login.status,302);
const google=new URL(login.headers.get('location'));assert.equal(google.origin,'https://accounts.google.com');assert.equal(google.searchParams.get('redirect_uri'),origin+'/api/auth/callback');assert.equal(google.searchParams.get('scope'),'openid email profile');assert.equal(google.searchParams.get('code_challenge_method'),'S256');
const stateCookie=login.headers.get('set-cookie');assert.match(stateCookie,/__Host-scopio_state=/);assert.match(stateCookie,/HttpOnly/);assert.match(stateCookie,/Secure/);
console.log('PASS Google redirect, exact callback, minimal scopes, PKCE, and secure state cookie');
const denied=await request('/api/projects',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);console.log('PASS live cross-origin writes rejected');
console.log('Live smoke checks passed; interactive Google login is verified separately in the browser.');
