import test from 'node:test';
import assert from 'node:assert/strict';
import { workerEnvFile } from '../worker-env.mjs';

test('worker env contains required runtime tokens and private service URLs without mailbox access', () => {
  const result = workerEnvFile({
    dataDir: '/Users/example/Daymark/data', uid: 501, gid: 20,
    sourceEnv: 'APIFY_API_TOKEN=apify_test\nNVIDIA_API_KEY=nvapi-test\nDAYMARK_POSTGRES_PASSWORD=localpass_123\nAPPLICATION_EMAIL=person@example.com\nPROTON_BRIDGE_USER=private-user\nPROTON_BRIDGE_PORT=1143\n',
  });
  assert.match(result, /APIFY_API_TOKEN=apify_test/);
  assert.match(result, /NVIDIA_API_KEY=nvapi-test/);
  assert.match(result, /DAYMARK_DATABASE_URL=postgresql:\/\/daymark:localpass_123@postgres:5432\/daymark/);
  assert.match(result, /DAYMARK_REDIS_URL=redis:\/\/redis:6379\/0/);
  assert.match(result, /DAYMARK_POSTGRES_PASSWORD=localpass_123/);
  assert.match(result, /DAYMARK_DATA_DIR="\/Users\/example\/Daymark\/data"/);
  assert.doesNotMatch(result, /APPLICATION_EMAIL|PROTON_BRIDGE|private-user|1143/);
});

test('requires an absolute data path and a non-root host identity', () => {
  assert.throws(() => workerEnvFile({ dataDir: 'relative/data', uid: 501, gid: 20 }), /absolute path/);
  assert.throws(() => workerEnvFile({ dataDir: '/data', uid: 0, gid: 20 }), /non-root/);
});

test('refuses API-key values that Compose would parse ambiguously', () => {
  assert.throws(() => workerEnvFile({ dataDir: '/data', uid: 501, gid: 20, sourceEnv: 'NVIDIA_API_KEY=one two' }), /manual Compose secret configuration/);
});
