import test from 'node:test';import assert from 'node:assert/strict';
import {scheduledCollectionDue,collectionIntervalMinutes} from '../collection-schedule.mjs';
import {normalizePreferences,defaultJobPulling} from '../apply-rules.mjs';

const MIN=60_000,NOW=Date.parse('2026-10-20T12:00:00Z');
const state=(extra={})=>({profile:{roleSearch:'data engineer'},tasks:[],preferences:{},...extra});
const iso=minAgo=>new Date(NOW-minAgo*MIN).toISOString();

test('job pulling preferences default to hourly and 7 days, and are clamped',()=>{
  assert.deepEqual(defaultJobPulling,{scheduleMinutes:60,maxAgeDays:7});
  assert.deepEqual(normalizePreferences({}).jobPulling,{scheduleMinutes:60,maxAgeDays:7});
  assert.equal(normalizePreferences({jobPulling:{scheduleMinutes:0}}).jobPulling.scheduleMinutes,0,'0 turns it off');
  assert.equal(normalizePreferences({jobPulling:{scheduleMinutes:3}}).jobPulling.scheduleMinutes,15,'never faster than every 15 minutes');
  assert.equal(normalizePreferences({jobPulling:{scheduleMinutes:99999}}).jobPulling.scheduleMinutes,1440);
  assert.equal(normalizePreferences({jobPulling:{maxAgeDays:0}}).jobPulling.maxAgeDays,0,'0 means no age limit');
  assert.equal(normalizePreferences({jobPulling:{maxAgeDays:9999}}).jobPulling.maxAgeDays,365);
  assert.equal(normalizePreferences({jobPulling:{scheduleMinutes:'soon',maxAgeDays:'old'}}).jobPulling.scheduleMinutes,0);
  assert.equal(normalizePreferences({jobPulling:{maxAgeDays:14}}).jobPulling.scheduleMinutes,60,'an untouched field keeps its default');
});
test('a collection is due once the interval has passed since the last one',()=>{
  assert.equal(scheduledCollectionDue(state({lastAtsCollection:iso(30)}),{now:NOW,env:{}}),false);
  assert.equal(scheduledCollectionDue(state({lastAtsCollection:iso(61)}),{now:NOW,env:{}}),true);
  assert.equal(scheduledCollectionDue(state(),{now:NOW,env:{}}),true,'never collected: due now');
});
test('it waits for saved roles, an idle queue, and the setting being on',()=>{
  assert.equal(scheduledCollectionDue(state({profile:{roleSearch:'  '}}),{now:NOW,env:{}}),false);
  assert.equal(scheduledCollectionDue(state({tasks:[{type:'collect',status:'running',createdAt:iso(500)}]}),{now:NOW,env:{}}),false);
  assert.equal(scheduledCollectionDue(state({tasks:[{type:'collect',status:'queued',createdAt:iso(500)}]}),{now:NOW,env:{}}),false);
  assert.equal(scheduledCollectionDue(state({preferences:{jobPulling:{scheduleMinutes:0}}}),{now:NOW,env:{}}),false);
});
test('a failed collection is retried at the normal pace, not every minute',()=>{
  const failed=state({tasks:[{type:'collect',status:'failed',createdAt:iso(10)}]});
  assert.equal(scheduledCollectionDue(failed,{now:NOW,env:{}}),false);
  assert.equal(scheduledCollectionDue(state({tasks:[{type:'collect',status:'failed',createdAt:iso(70)}]}),{now:NOW,env:{}}),true);
});
test('a saved interval and the environment override both apply',()=>{
  assert.equal(collectionIntervalMinutes(state({preferences:{jobPulling:{scheduleMinutes:120}}}),{}),120);
  assert.equal(collectionIntervalMinutes(state({preferences:{jobPulling:{scheduleMinutes:120}}}),{DAYMARK_ATS_POLL_MINUTES:'30'}),30);
  assert.equal(collectionIntervalMinutes(state(),{DAYMARK_ATS_POLL_MINUTES:'5'}),15,'the override is also kept at 15 minutes or more');
  assert.equal(scheduledCollectionDue(state({lastAtsCollection:iso(20),preferences:{jobPulling:{scheduleMinutes:0}}}),{now:NOW,env:{DAYMARK_ATS_POLL_MINUTES:'15'}}),true,'the override can turn it on');
});
