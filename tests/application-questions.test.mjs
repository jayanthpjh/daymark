import test from 'node:test';
import assert from 'node:assert/strict';
import { questionPanel, resolutionPanel, isCaptchaCheckpoint } from '../public/application-questions.js';

globalThis.localStorage = { getItem: () => null };

test('keeps unresolved employer questions visible when the application browser is open for manual review', () => {
  const html = questionPanel({
    id: 'fill-1',
    status: 'needs_you',
    manualHandoff: true,
    checkpoint: {
      id: 'checkpoint-1',
      step: 'Application information',
      unresolvedIds: ['sponsorship'],
      questions: [{
        id: 'sponsorship',
        label: 'Will you need sponsorship?',
        required: true,
        type: 'radio',
        value: '',
        options: [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }],
      }],
    },
  });

  assert.match(html, /Answers needed/);
  assert.match(html, /<form novalidate/);
  assert.match(html, /Will you need sponsorship\?/);
  assert.match(html, /data-checkpoint="checkpoint-1"/);
});

test('verification checkpoints hide stale answers and provide a direct inbox action', () => {
  const task = {
    id: 'fill-verify', type: 'fill', status: 'needs_you', stage: 'Needs verification',
    checkpoint: { pauseReason: 'verification', questions: [{ id: 'privacy', label: 'Old question' }], unresolvedIds: ['privacy'] },
  };
  assert.equal(questionPanel(task), '');
  const html = resolutionPanel(task, 'https://jobs.example/apply', { mode: 'container', status: 'ready' });
  assert.match(html, /Verification needed/);
  assert.match(html, /data-page="inbox"/);
  assert.match(html, /Employer page/);
});

test('final review hides the previous application-information recovery checkpoint', () => {
  const task = {
    id: 'fill-review', type: 'fill', status: 'needs_you', finalReviewReady: true,
    checkpoint: { pauseReason: 'final_review', step: 'Application information', capturedAt: '2026-10-12T20:46:34Z' },
  };
  assert.equal(resolutionPanel(task, 'https://jobs.example/apply', { mode: 'container', status: 'ready' }), '');
});

test('offers the local Docker browser viewer only when the worker is ready', () => {
  const task = { id: 'fill-1', type: 'fill', status: 'needs_you', manualHandoff: true, stage: 'Needs verification' };
  const ready = resolutionPanel(task, 'https://jobs.example/apply', {
    mode: 'container', status: 'ready', viewerUrl: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
  });
  assert.match(ready, /Open employer session in a separate window/);
  assert.ok(ready.includes('https://jobs.example/apply'));

  const offline = resolutionPanel(task, '', { mode: 'container', status: 'offline', viewerUrl: '' });
  assert.doesNotMatch(offline, /worker browser viewer/);
});

test('keeps CAPTCHA review inside Daymark and opens the employer session separately', () => {
  const task = {
    id: 'fill-captcha', type: 'fill', status: 'paused', watchBrowser: true, browserSessionOpen: true,
    authStatus: 'captcha', stage: 'Needs verification',
    checkpoint: { id: 'captcha-1', step: 'ATS authentication', pauseReason: 'captcha' },
  };
  const html = resolutionPanel(task, 'https://jobs.example/apply', {
    mode: 'container', status: 'ready', viewerUrl: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
  });

  assert.match(html, /Daymark paused at a security check/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /Open employer session in a separate window/);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:6080\/vnc\.html\?autoconnect=1"/);
  assert.match(html, /data-handoff="resume"/);
  assert.match(html, /Continue after solving/);
});

test('does not embed a browser session for non-CAPTCHA checkpoints', () => {
  const task = {
    id: 'fill-answer', type: 'fill', status: 'needs_you', watchBrowser: true,
    checkpoint: { pauseReason: 'answers', step: 'Application questions' },
  };
  const html = resolutionPanel(task, '', {
    mode: 'container', status: 'ready', viewerUrl: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
  });
  assert.doesNotMatch(html, /<iframe/);
});

test('identifies CAPTCHA checkpoints so the review screen shows only its solve-and-continue action', () => {
  assert.equal(isCaptchaCheckpoint({ authStatus: 'captcha' }), true);
  assert.equal(isCaptchaCheckpoint({ checkpoint: { pauseReason: 'captcha' } }), true);
  assert.equal(isCaptchaCheckpoint({ checkpoint: { pauseReason: 'verification' } }), false);
});
