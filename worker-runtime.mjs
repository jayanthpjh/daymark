export const DAYMARK_ROLES = Object.freeze(['combined', 'api', 'worker']);

export function daymarkRole(env = process.env) {
  const role = env.DAYMARK_ROLE || 'combined';
  if (!DAYMARK_ROLES.includes(role)) throw new Error(`DAYMARK_ROLE must be one of: ${DAYMARK_ROLES.join(', ')}.`);
  return role;
}

export function runtimeCapabilities(role) {
  if (!DAYMARK_ROLES.includes(role)) throw new Error('Invalid Daymark process role.');
  return Object.freeze({
    ownsApi: role !== 'worker',
    ownsTaskQueue: role !== 'api',
    ownsBrowserProfile: role !== 'api',
    ownsProtonKeychain: role !== 'worker',
    usesDockerWorker: role === 'api',
  });
}

export function listenHost(role, env = process.env) {
  if (!DAYMARK_ROLES.includes(role)) throw new Error('Invalid Daymark process role.');
  // Compose publishes the worker port only on the Mac's loopback interface;
  // inside the container the service must accept traffic on its container NIC.
  if (role === 'worker') return '0.0.0.0';
  // The OCI deployment binds the API to its Tailscale address (or 0.0.0.0 inside Docker) through DAYMARK_HOST.
  const host = String(env.DAYMARK_HOST || '').trim();
  if (host && !/^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)$/.test(host)) throw new Error('DAYMARK_HOST must be an IP address.');
  return host || '127.0.0.1';
}

export function workerHeartbeat({ online = true, browserProbePassed = false, activeTaskId = '', activeSince = 0, taskQueue = 'local-poller', now = Date.now() } = {}) {
  const browserReady = Boolean(online && browserProbePassed);
  return {
    at: browserReady ? now : 0,
    heartbeatAt: now,
    browserReady,
    taskQueue: ['redis-bullmq', 'redis-degraded', 'local-poller'].includes(taskQueue) ? taskQueue : 'local-poller',
    activeTaskId: typeof activeTaskId === 'string' ? activeTaskId.slice(0, 200) : '',
    activeSince: Number.isFinite(Number(activeSince)) ? Number(activeSince) : 0,
  };
}

export function publicWorkerStatus({ role, heartbeat, now = Date.now() }) {
  if (role === 'combined') return { mode: 'embedded', status: 'ready', viewerUrl: '' };
  if (role === 'worker') return { mode: 'container', status: 'ready', viewerUrl: '' };
  const at = Number(heartbeat?.at || 0);
  const online = Number.isFinite(at) && at > 0 && heartbeat?.browserReady === true && now - at < 12_000;
  return {
    mode: 'container',
    status: online ? 'ready' : 'offline',
    heartbeatAt: online ? new Date(at).toISOString() : '',
    viewerUrl: online ? 'http://127.0.0.1:6080/vnc.html?autoconnect=1' : '',
  };
}
