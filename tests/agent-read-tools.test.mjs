import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentReadTools } from '../agent-read-tools.mjs';
const state = { jobs: [{ id:'a',company:'Northwind',role:'Engineer',secret:'hidden' }], tasks: [{id:'t',jobId:'a',status:'needs_you',reviewState:{kind:'authentication_required'},password:'hidden'}] };
const tools = createAgentReadTools(async()=>state);
test('job reads search real persisted jobs without private fields',async()=>{assert.deepEqual(await tools.find_jobs({query:'NORTH'}),{jobs:[{id:'a',company:'Northwind',role:'Engineer'}]});assert.deepEqual(await tools.find_jobs({query:'missing'}),{jobs:[]});});
test('application reads distinguish missing targets and preserve blocker kind',async()=>{assert.deepEqual(await tools.application_status({jobId:'missing'}),{status:'not_found'});const result=await tools.application_status({jobId:'a'});assert.equal(result.tasks[0].reviewKind,'authentication_required');assert.equal(JSON.stringify(result).includes('hidden'),false);});
test('read failures propagate rather than becoming fabricated empty results',async()=>{await assert.rejects(createAgentReadTools(async()=>{throw Error('offline');}).find_jobs({}),/offline/);});

test('navigation resolves existing applications and only allowlisted sections', async () => {
  assert.deepEqual((await tools.open_application({jobId:'a',section:'resume'})).navigation, {jobId:'a',section:'resume'});
  assert.deepEqual(await tools.open_application({jobId:'unknown'}), {status:'not_found'});
  await assert.rejects(tools.open_application({jobId:'a',section:'https://external.test'}), /supported/);
});
