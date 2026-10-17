import test from 'node:test';
import assert from 'node:assert/strict';
import {ATS_ADAPTERS,detectATSAdapter,adapterSnapshot} from '../ats-adapters.mjs';

test('prioritized ATS hosts resolve to versioned flows with the right auth mode',()=>{
  for(const [host,id] of [['careers.avature.net','avature'],['jobs.successfactors.com','successfactors'],['job-boards.greenhouse.io','greenhouse'],['boards.greenhouse.io','greenhouse'],['acme.wd1.myworkdayjobs.com','workday'],['jobs.lever.co','lever'],['jobs.ashbyhq.com','ashby'],['jobs.smartrecruiters.com','smartrecruiters'],['careers.icims.com','icims']]){
    const adapter=detectATSAdapter(host);assert.equal(adapter?.id,id,host);assert.equal(adapter.version,1);const guest=['greenhouse','lever','ashby','smartrecruiters'].includes(id);assert.equal(adapter.authMode,guest?'guest':'account_required',id);assert.equal(adapter.flow.includes('sign_in_or_register'),!guest,id);
  }
  assert.equal(detectATSAdapter('greenhouse.io.attacker.test'),null);
});
test('snapshots keep only version and employer host, not applicant values',()=>{
  assert.deepEqual(adapterSnapshot(ATS_ADAPTERS.avature,'Jobs.Avature.net'),{id:'avature',version:1,employerHost:'jobs.avature.net',flow:ATS_ADAPTERS.avature.flow});
});
