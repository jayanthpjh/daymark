import test from 'node:test';import assert from 'node:assert/strict';
import {authenticationMailScope} from '../auth-mail-search.mjs';
test('security-code lookup includes archived/filtered mail but remains employer/time scoped',async()=>{
 const since='2026-10-16T22:45:00Z';
 for(const folder of [{path:'All Mail'},{path:'mail/all',specialUse:'\\All'}]){
 const result=await authenticationMailScope({list:async()=>[{path:'INBOX'},folder]},{company:'Quisitive',since});
 assert.equal(result.mailbox,folder.path);assert.equal(result.query.text,'Quisitive');assert.equal(result.query.since.toISOString(),since.replace('00Z','00.000Z'));
 }
 const fallback=await authenticationMailScope({list:async()=>[{path:'INBOX'}]},{company:'Quisitive',since});assert.equal(fallback.mailbox,'INBOX');
 await assert.rejects(authenticationMailScope({},{}));
});
