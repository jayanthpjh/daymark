import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRuntimeSettings } from '../runtime-settings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = parseRuntimeSettings(await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => ''));
if (!settings.DAYMARK_DATABASE_URL || !settings.DAYMARK_REDIS_URL) {
  console.error('Set up local PostgreSQL and Redis with npm run worker:setup, then start them with npm run infra:up.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', path.join(root, 'tests/infrastructure-integration.test.mjs')], {
  cwd: root,
  env: { ...process.env, DAYMARK_TEST_DATABASE_URL: settings.DAYMARK_DATABASE_URL, DAYMARK_TEST_REDIS_URL: settings.DAYMARK_REDIS_URL },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
