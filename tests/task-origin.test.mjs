import test from 'node:test';
import assert from 'node:assert/strict';
import { taskOrigin, describeOrigin } from '../task-origin.mjs';

test('a background path names itself and carries no request', () => {
  const origin = taskOrigin({ createdBy: 'auto-apply' }, null);
  assert.deepEqual(origin, { createdBy: 'auto-apply', createdVia: null });
  assert.equal(taskOrigin({}, null).createdBy, 'background');
});
test('a request leaves its method, path, origin and agent, trimmed', () => {
  const origin = taskOrigin({}, { method: 'POST', path: '/api/tasks', origin: 'http://127.0.0.1:4173', agent: 'curl/8.7.1'.padEnd(200, 'x') });
  assert.equal(origin.createdBy, 'http');
  assert.equal(origin.createdVia.path, '/api/tasks');
  assert.equal(origin.createdVia.agent.length, 80);
  assert.match(describeOrigin(origin), /^http via POST \/api\/tasks$/);
});
test('a name that is not a plain label is ignored, so a request body cannot forge its origin', () => {
  assert.equal(taskOrigin({ createdBy: 'Robert; DROP' }, null).createdBy, 'background');
  assert.equal(taskOrigin({ createdBy: '../../x' }, { method: 'POST', path: '/p' }).createdBy, 'http');
  assert.equal(taskOrigin({ createdBy: 42 }, null).createdBy, 'background');
});
