import test from 'node:test';
import assert from 'node:assert/strict';
import { daymarkRole, publicWorkerStatus, runtimeCapabilities, workerHeartbeat, listenHost } from '../worker-runtime.mjs';

test('keeps the existing single-process mode as the default', () => {
  assert.equal(daymarkRole({}), 'combined');
  assert.deepEqual(runtimeCapabilities('combined'), {
    ownsApi: true, ownsTaskQueue: true, ownsBrowserProfile: true, ownsProtonKeychain: true, usesDockerWorker: false,
  });
});

test('assigns the queue and browser profile to the worker while Proton Keychain stays on the Mac API', () => {
  assert.equal(daymarkRole({ DAYMARK_ROLE: 'worker' }), 'worker');
  assert.deepEqual(runtimeCapabilities('worker'), {
    ownsApi: false, ownsTaskQueue: true, ownsBrowserProfile: true, ownsProtonKeychain: false, usesDockerWorker: false,
  });
  assert.deepEqual(runtimeCapabilities('api'), {
    ownsApi: true, ownsTaskQueue: false, ownsBrowserProfile: false, ownsProtonKeychain: true, usesDockerWorker: true,
  });
});

test('rejects unknown process roles instead of silently starting another queue owner', () => {
  assert.throws(() => daymarkRole({ DAYMARK_ROLE: 'browser-only' }), /DAYMARK_ROLE must be one of/);
  assert.throws(() => runtimeCapabilities('browser-only'), /Invalid Daymark process role/);
});

test('keeps the API loopback-only while allowing the container worker through its localhost-published port', () => {
  assert.equal(listenHost('api'), '127.0.0.1');
  assert.equal(listenHost('combined'), '127.0.0.1');
  assert.equal(listenHost('worker'), '0.0.0.0');
});

test('reports only worker readiness and a safe timestamp', () => {
  assert.deepEqual(publicWorkerStatus({ role: 'api', heartbeat: { at: 1_000, browserReady: true }, now: 2_000 }), {
    mode: 'container', status: 'ready', heartbeatAt: new Date(1_000).toISOString(), viewerUrl: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
  });
  assert.deepEqual(publicWorkerStatus({ role: 'api', heartbeat: { at: 1_000, browserReady: true }, now: 20_000 }), {
    mode: 'container', status: 'offline', heartbeatAt: '', viewerUrl: '',
  });
  assert.deepEqual(publicWorkerStatus({ role: 'api', heartbeat: { at: 1_000, browserReady: false }, now: 2_000 }), { mode: 'container', status: 'offline', heartbeatAt: '', viewerUrl: '' });
  assert.deepEqual(publicWorkerStatus({ role: 'worker' }), { mode: 'container', status: 'ready', viewerUrl: '' });
});

test('an idle worker is ready after its browser probe without opening an application session', () => {
  assert.deepEqual(workerHeartbeat({ online: false, browserProbePassed: true, now: 5_000 }), { at: 0, heartbeatAt: 5_000, browserReady: false, taskQueue: 'local-poller', activeTaskId: '', activeSince: 0 });
  assert.deepEqual(workerHeartbeat({ online: true, browserProbePassed: false, now: 5_000 }), { at: 0, heartbeatAt: 5_000, browserReady: false, taskQueue: 'local-poller', activeTaskId: '', activeSince: 0 });
  const heartbeat = workerHeartbeat({ online: true, browserProbePassed: true, now: 5_000 });
  assert.deepEqual(heartbeat, { at: 5_000, heartbeatAt: 5_000, browserReady: true, taskQueue: 'local-poller', activeTaskId: '', activeSince: 0 });
  assert.equal(publicWorkerStatus({ role: 'api', heartbeat, now: 5_001 }).status, 'ready');
});

test('heartbeat records active work internally while public status remains identifier-free', () => {
  const heartbeat = workerHeartbeat({ online: true, browserProbePassed: true, activeTaskId: 'task-secret', activeSince: 4_000, taskQueue: 'redis-bullmq', now: 5_000 });
  assert.equal(heartbeat.activeTaskId, 'task-secret');
  assert.equal(heartbeat.taskQueue, 'redis-bullmq');
  assert.deepEqual(publicWorkerStatus({ role: 'api', heartbeat, now: 5_001 }), {
    mode: 'container', status: 'ready', heartbeatAt: new Date(5_000).toISOString(), viewerUrl: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
  });
});

test('DAYMARK_HOST sets the API bind address and must be an IP; the worker binding is unchanged', async () => {
  const { listenHost } = await import('../worker-runtime.mjs');
  assert.equal(listenHost('api', {}), '127.0.0.1');
  assert.equal(listenHost('api', { DAYMARK_HOST: '100.64.1.2' }), '100.64.1.2');
  assert.equal(listenHost('combined', { DAYMARK_HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(listenHost('worker', { DAYMARK_HOST: '100.64.1.2' }), '0.0.0.0');
  assert.throws(() => listenHost('api', { DAYMARK_HOST: 'evil.example.com' }), /IP address/);
});
