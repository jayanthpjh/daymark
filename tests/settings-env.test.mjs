import test from 'node:test';
import assert from 'node:assert/strict';
import { localSettingsContents } from '../settings-env.mjs';

test('settings updates preserve private PostgreSQL and Redis runtime configuration', () => {
  const contents = localSettingsContents({
    NVIDIA_API_KEY: 'updated-key',
    DAYMARK_POSTGRES_PASSWORD: 'keep-this-private',
    DAYMARK_DATABASE_URL: 'postgresql://daymark:keep-this-private@127.0.0.1:55432/daymark',
    DAYMARK_REDIS_URL: 'redis://127.0.0.1:56379/0',
  });
  assert.match(contents, /NVIDIA_API_KEY=updated-key/);
  assert.match(contents, /DAYMARK_POSTGRES_PASSWORD=keep-this-private/);
  assert.match(contents, /DAYMARK_DATABASE_URL=postgresql:\/\/daymark:keep-this-private@127\.0\.0\.1:55432\/daymark/);
  assert.match(contents, /DAYMARK_REDIS_URL=redis:\/\/127\.0\.0\.1:56379\/0/);
  assert.doesNotMatch(localSettingsContents({ NVIDIA_API_KEY: 'x', DAYMARK_DATABASE_URL: 'x\nOTHER=value' }), /OTHER=value/);
});
