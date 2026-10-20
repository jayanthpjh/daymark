export const LOCAL_SETTING_KEYS = Object.freeze([
  'NVIDIA_MODEL', 'NVIDIA_RPM', 'LLM_HOSTED_ENABLED', 'LLM_BASE_URL', 'LLM_MODEL', 'APIFY_API_TOKEN', 'NVIDIA_API_KEY', 'APPLICATION_EMAIL', 'PROTON_BRIDGE_USER',
  'PROTON_BRIDGE_HOST', 'PROTON_BRIDGE_PORT', 'PROTON_BRIDGE_SMTP_PORT', 'PROTON_BRIDGE_MODE',
  'APPLICATION_FORWARD_TO', 'APPLICATION_FORWARD_ENABLED',
]);

const privateRuntimeKeys = Object.freeze(['DAYMARK_POSTGRES_PASSWORD', 'DAYMARK_DATABASE_URL', 'DAYMARK_REDIS_URL', 'DAYMARK_MCP_TOKEN']);

export function localSettingsContents(settings = {}, mutableKeys = LOCAL_SETTING_KEYS) {
  const keys = [...new Set([...mutableKeys, ...privateRuntimeKeys])];
  return `# Private local Daymark settings.\n${keys.map(key => `${key}=${String(settings[key] || '').split(/[\r\n]/, 1)[0]}`).join('\n')}\n`;
}
