const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'daymark-api', 'daymark-worker']);

function hostAllowed(value, port) {
  if (typeof value !== 'string' || value.length > 255) return false;
  let url;
  try { url = new URL(`http://${value}`); } catch { return false; }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
  const hostname = url.hostname.toLowerCase();
  const local = LOCAL_HOSTS.has(hostname) || hostname === '::1';
  return local && (!url.port || Number(url.port) === Number(port));
}

export function requestSecurityError(req, port) {
  if (!hostAllowed(req.headers?.host, port)) return 'host';
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return '';
  const site = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (site && !['same-origin', 'none', 'same-site'].includes(site)) return 'origin';
  const origin = req.headers?.origin;
  if (origin) {
    let parsed;
    try { parsed = new URL(origin); } catch { return 'origin'; }
    if (!['http:', 'https:'].includes(parsed.protocol) || !hostAllowed(parsed.host, port) || parsed.host.toLowerCase() !== String(req.headers.host).toLowerCase()) return 'origin';
  } else if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''))) {
    return 'content-type';
  }
  return '';
}
