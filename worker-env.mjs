function parseSimpleEnv(text = '') {
  const output = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[key] = value;
  }
  return output;
}

function quotePath(value) {
  if (/[\r\n]/.test(value)) throw new Error('The Daymark data path contains an unsupported line break.');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function workerEnvFile({ dataDir, uid, gid, sourceEnv = '', existingEnv = '' }) {
  if (!pathIsAbsolute(dataDir)) throw new Error('DAYMARK_DATA_DIR must be an absolute path.');
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(gid) || gid < 1) throw new Error('A non-root host user and group are required for the worker.');
  const source = parseSimpleEnv(sourceEnv);
  const existing = parseSimpleEnv(existingEnv);
  const postgresPassword = safeSecret(source.DAYMARK_POSTGRES_PASSWORD || existing.DAYMARK_POSTGRES_PASSWORD || '');
  const lines = [
    '# Local-only Docker worker environment. Do not commit this file.',
    `DAYMARK_UID=${uid}`,
    `DAYMARK_GID=${gid}`,
    `DAYMARK_DATA_DIR=${quotePath(dataDir)}`,
    `APIFY_API_TOKEN=${safeSecret(source.APIFY_API_TOKEN || existing.APIFY_API_TOKEN)}`,
    `NVIDIA_API_KEY=${safeSecret(source.NVIDIA_API_KEY || existing.NVIDIA_API_KEY)}`,
    `DAYMARK_POSTGRES_PASSWORD=${postgresPassword}`,
    `DAYMARK_DATABASE_URL=${postgresPassword ? `postgresql://daymark:${postgresPassword}@postgres:5432/daymark` : ''}`,
    `DAYMARK_REDIS_URL=${postgresPassword ? 'redis://redis:6379/0' : ''}`,
  ];
  return `${lines.join('\n')}\n`;
}

function safeSecret(value = '') {
  if (!value) return '';
  if (!/^[A-Za-z0-9._/:+=-]+$/.test(value)) throw new Error('An API key contains characters that need manual Compose secret configuration.');
  return value;
}

function pathIsAbsolute(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.includes('\0');
}
