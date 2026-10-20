import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const backupRoot = path.join(dataDir, 'backups');
const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
const backupDir = path.join(backupRoot, `pre-docker-${stamp}`);

await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
await fs.chmod(backupRoot, 0o700);
await fs.mkdir(backupDir, { mode: 0o700 });

async function streamCommand(command, args, destination) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  const closed = once(child, 'close');
  try {
    await pipeline(child.stdout, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    const [code] = await closed;
    if (code !== 0) throw new Error(`${command} exited with status ${code}.`);
  } catch (error) {
    child.kill();
    await fs.rm(destination, { force: true });
    throw error;
  }
}

async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${command} exited with status ${code}.`);
}

try {
  await fs.copyFile(path.join(root, '.env'), path.join(backupDir, '.env'), constants.COPYFILE_EXCL);
  await fs.chmod(path.join(backupDir, '.env'), 0o600);
  await run('tar', ['-czf', path.join(backupDir, 'data.tar.gz'), '--exclude=./backups', '--exclude=./worker-control/a.sock', '-C', dataDir, '.']);
  await fs.chmod(path.join(backupDir, 'data.tar.gz'), 0o600);
  await streamCommand('docker', ['exec', 'daymark-postgres', 'pg_dump', '-U', 'daymark', '-d', 'daymark', '-Fc'], path.join(backupDir, 'postgres.dump'));
  await fs.chmod(path.join(backupDir, 'postgres.dump'), 0o600);
  console.log(`Private Daymark backup created under data/backups/${path.basename(backupDir)}.`);
} catch (error) {
  await fs.rm(backupDir, { recursive: true, force: true });
  console.error(`Daymark backup failed: ${error.message}`);
  process.exitCode = 1;
}
