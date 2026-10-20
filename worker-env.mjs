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
  const nvidiaKey = safeSecret(source.NVIDIA_API_KEY || existing.NVIDIA_API_KEY);
  const hostedExplicit = source.LLM_HOSTED_ENABLED || existing.LLM_HOSTED_ENABLED;
  const hostedEnabled = hostedExplicit === 'false' ? 'false' : (hostedExplicit === 'true' || Boolean(nvidiaKey) ? 'true' : 'false');
  const liveApproved = source.DAYMARK_NVIDIA_LIVE_APPROVED === 'true' || existing.DAYMARK_NVIDIA_LIVE_APPROVED === 'true' ? 'true' : 'false';
  const htmlCrawlHosts = safeHostList(source.DAYMARK_HTML_CRAWL_TERMS_APPROVED_HOSTS || existing.DAYMARK_HTML_CRAWL_TERMS_APPROVED_HOSTS || '');
  const lines = [
    '# Local-only Docker worker environment. Do not commit this file.',
    `DAYMARK_UID=${uid}`,
    `DAYMARK_GID=${gid}`,
    `DAYMARK_DATA_DIR=${quotePath(dataDir)}`,
    `APIFY_API_TOKEN=${safeSecret(source.APIFY_API_TOKEN || existing.APIFY_API_TOKEN)}`,
    `NVIDIA_API_KEY=${nvidiaKey}`,
    `NVIDIA_MODEL=${safeSecret(source.NVIDIA_MODEL || existing.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b')}`,
    `NVIDIA_RPM=${safeSecret(source.NVIDIA_RPM || existing.NVIDIA_RPM || '10')}`,
    `LLM_HOSTED_ENABLED=${hostedEnabled}`,
    `DAYMARK_NVIDIA_LIVE_APPROVED=${liveApproved}`,
    `DAYMARK_HTML_CRAWL_TERMS_APPROVED_HOSTS=${htmlCrawlHosts}`,
    'DAYMARK_LOCAL_LLM_DISABLED=true',
    `SEARXNG_URL=${safeSecret(source.SEARXNG_URL || existing.SEARXNG_URL || 'http://searxng:8080')}`,
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

function safeHostList(value = '') {
  const hosts = String(value).split(',').map(host => host.trim()).filter(Boolean);
  if (hosts.some(host => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(host))) {
    throw new Error('HTML crawl approval must contain comma-separated hostnames only.');
  }
  return hosts.join(',');
}

function pathIsAbsolute(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.includes('\0');
}
