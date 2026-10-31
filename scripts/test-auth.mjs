import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnTo,randomToken,digest,challenge,authCookie,cookieValue} from '../lib/auth-utils.ts';
test('return targets cannot escape the app',()=>{for(const bad of ['https://evil.example','//evil.example','/\\evil.example','/api/auth/google',null])assert.equal(safeReturnTo(bad),'/workspace');assert.equal(safeReturnTo('/review?project=abc&token=def'),'/review?project=abc&token=def')});
test('session tokens are strong and hashed before storage',async()=>{const token=randomToken();assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,randomToken());assert.equal((await digest(token)).length,64);assert.notEqual(await digest(token),token)});
test('PKCE challenge uses the RFC7636 test vector',async()=>{assert.equal(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')});
test('production cookies use secure host-only constraints',()=>{const cookie=authCookie('https://scopio.example','session','test',100);assert.match(cookie,/^__Host-scopio_session=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/; Secure/);assert.doesNotMatch(cookie,/Domain=/);assert.equal(cookieValue('unrelated=a; __Host-scopio_session=abc','__Host-scopio_session'),'abc')});
