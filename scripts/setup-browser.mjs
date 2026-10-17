import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.DAYMARK_DATA_DIR || path.join(root, 'data');
const browserPath = path.join(dataDir, 'browser-runtime');
const cli = path.join(root, 'node_modules', 'playwright', 'cli.js');

if (!fs.existsSync(cli)) {
  console.error('Install Daymark dependencies before setting up its browser.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserPath },
});

if (result.error) {
  console.error(`Could not install Daymark’s browser: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
