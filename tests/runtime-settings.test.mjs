import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeSettings, runtimeSettings } from '../runtime-settings.mjs';

test('loads only explicit local database and queue settings', () => {
  assert.deepEqual(parseRuntimeSettings(`APIFY_API_TOKEN=do-not-read\nDAYMARK_DATABASE_URL="postgres://local/db"\nDAYMARK_REDIS_URL=redis://127.0.0.1:56379/0`), {
    DAYMARK_DATABASE_URL: 'postgres://local/db',
    DAYMARK_REDIS_URL: 'redis://127.0.0.1:56379/0',
  });
});

test('process environment settings take precedence over the private local file', () => {
  assert.deepEqual(runtimeSettings({ fileSettings: { DAYMARK_DATABASE_URL: 'old-db' }, environment: { DAYMARK_DATABASE_URL: 'new-db' } }), {
    databaseUrl: 'new-db', redisUrl: '',
  });
});
