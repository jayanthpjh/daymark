export function protonBridgeHost(requestedHost, { defaultHost = '127.0.0.1', allowedHosts = [] } = {}) {
  const requested = String(requestedHost || '').trim();
  const fallback = String(defaultHost || '127.0.0.1').trim();
  // The legacy settings form submits loopback by default. In Docker, translate
  // only that default to the explicitly allowlisted Mac gateway hostname.
  if (requested === '127.0.0.1' && fallback !== '127.0.0.1' && allowedHosts.includes(fallback)) return fallback;
  return requested || fallback;
}
