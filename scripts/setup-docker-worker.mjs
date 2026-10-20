import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { workerEnvFile } from '../worker-env.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const envPath = path.join(root, '.env');
const workerEnvPath = path.join(root, '.env.worker');

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
    const index=line.indexOf('=');let value=line.slice(index+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    return [line.slice(0,index).trim(),value];
  }));
}

function setEnvValues(text, values) {
  const lines=text.split(/\r?\n/);const seen=new Set();
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);if(!match||!(match[1] in values))continue;
    lines[i]=`${match[1]}=${values[match[1]]}`;seen.add(match[1]);
  }
  for(const [key,value] of Object.entries(values))if(!seen.has(key))lines.push(`${key}=${value}`);
  return `${lines.filter((line,index)=>line||index<lines.length-1).join('\n').replace(/\n*$/,'')}\n`;
}

const originalEnv = await fs.readFile(envPath, 'utf8').catch(() => '');
const current = parseEnv(originalEnv);
const postgresPassword = current.DAYMARK_POSTGRES_PASSWORD || randomBytes(32).toString('base64url');
const sourceEnv = setEnvValues(originalEnv, {
  DAYMARK_POSTGRES_PASSWORD: postgresPassword,
  DAYMARK_DATABASE_URL: `"postgresql://daymark:${postgresPassword}@postgres:5432/daymark"`,
  DAYMARK_REDIS_URL: 'redis://redis:6379/0',
  DAYMARK_MCP_TOKEN: current.DAYMARK_MCP_TOKEN || randomBytes(32).toString('hex'),
});
const existingWorkerEnv = await fs.readFile(workerEnvPath, 'utf8').catch(() => '');
const content = workerEnvFile({ dataDir, uid: process.getuid?.(), gid: process.getgid?.(), sourceEnv, existingEnv: existingWorkerEnv });
const envTemporary=`${envPath}.${process.pid}.tmp`;
await fs.writeFile(envTemporary, sourceEnv, { mode: 0o600 });
await fs.rename(envTemporary, envPath);
await fs.chmod(envPath, 0o600);
await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
await fs.mkdir(path.join(dataDir, 'secrets'), { recursive: true, mode: 0o700 });
await fs.chmod(path.join(dataDir, 'secrets'), 0o700);
await fs.mkdir(path.join(dataDir, 'docker-browser-profile'), { recursive: true, mode: 0o700 });
const workerControlDir = path.join(dataDir, 'worker-control');
await fs.mkdir(workerControlDir, { recursive: true, mode: 0o700 });
const credentialsPath = path.join(dataDir, 'secrets', 'ats-credentials.json');
try { await fs.access(credentialsPath); }
catch { await fs.writeFile(credentialsPath, '{}\n', { mode: 0o600, flag: 'wx' }); }
const temporary = `${workerEnvPath}.${process.pid}.tmp`;
await fs.writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
await fs.rename(temporary, workerEnvPath);
await fs.chmod(workerEnvPath, 0o600);
console.log('Created private local Docker settings and an MCP token. Only the NVIDIA and Apify keys were copied to the worker; Proton Bridge and ATS credentials were excluded. Review .env.worker before starting Docker.');
