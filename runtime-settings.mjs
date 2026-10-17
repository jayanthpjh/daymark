const ALLOWED = new Set(['DAYMARK_DATABASE_URL', 'DAYMARK_REDIS_URL']);

export function parseRuntimeSettings(text = '') {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    if (!ALLOWED.has(key)) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) values[key] = value;
  }
  return values;
}

export function runtimeSettings({ fileSettings = {}, environment = process.env } = {}) {
  return {
    databaseUrl: environment.DAYMARK_DATABASE_URL || fileSettings.DAYMARK_DATABASE_URL || '',
    redisUrl: environment.DAYMARK_REDIS_URL || fileSettings.DAYMARK_REDIS_URL || '',
  };
}
