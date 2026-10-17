import test from 'node:test';import assert from 'node:assert/strict';
import {greenhouseEmbedUrl,greenhouseBoardName} from '../greenhouse-embed.mjs';
const ats=host=>/greenhouse\.io$/.test(host);
const embed=(board,id)=>`https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${id}`;
test('the board name comes from an explicit for= parameter, then from the meaningful hostname label',()=>{
  assert.equal(greenhouseEmbedUrl('https://careers.roblox.com/jobs/123?gh_jid=555',ats),embed('roblox','555'));
  assert.equal(greenhouseEmbedUrl('https://www.acme.com/careers?gh_jid=9&for=acmerobotics',ats),embed('acmerobotics','9'));
  assert.equal(greenhouseEmbedUrl('https://jobs.example.co.uk/role?gh_jid=77',ats),embed('example','77'));
  assert.equal(greenhouseBoardName(new URL('https://careers.jobs.stripe.com/x')),'stripe');
});
test('known ATS hosts, missing or non-numeric job ids and bad boards are not rewritten',()=>{
  assert.equal(greenhouseEmbedUrl('https://job-boards.greenhouse.io/acme/jobs/1?gh_jid=1',ats),'');
  assert.equal(greenhouseEmbedUrl('https://careers.roblox.com/jobs/123',ats),'');
  assert.equal(greenhouseEmbedUrl('https://careers.roblox.com/jobs/123?gh_jid=abc',ats),'');
  assert.equal(greenhouseEmbedUrl('https://careers.roblox.com/x?gh_jid=5&for=bad%20slug',ats),embed('roblox','5'));
  assert.equal(greenhouseEmbedUrl('not a url',ats),'');
});
