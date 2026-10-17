import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssistantCommand} from '../public/assistant-model.js';

test('assistant maps navigation requests to existing workspace pages',()=>{
  assert.equal(resolveAssistantCommand('Show my application progress'),'applications');
  assert.equal(resolveAssistantCommand('Open my inbox'),'inbox');
  assert.equal(resolveAssistantCommand('Go to auto apply settings'),'auto-apply');
  assert.equal(resolveAssistantCommand('Review my resume'),'profile');
  assert.equal(resolveAssistantCommand('Browse fresh jobs'),'discover');
});

test('assistant recognizes collection as a separately confirmable action',()=>{
  assert.equal(resolveAssistantCommand('Collect fresh jobs'),'collect');
  assert.equal(resolveAssistantCommand('Find new job postings'),'collect');
});

test('assistant leaves unknown messages without an action',()=>{
  assert.equal(resolveAssistantCommand('How do I improve my interview?'),null);
  assert.equal(resolveAssistantCommand(''),null);
});
