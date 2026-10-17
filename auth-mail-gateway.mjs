import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';

const codePattern = purpose => purpose === 'security' ? /^[A-Za-z0-9]{4,10}$/ : /^\d{4,8}$/;
const safeRequest = value => value && typeof value === 'object'
  && /^[a-zA-Z0-9_-]{1,120}$/.test(value.taskId || '')
  && (value.purpose === 'verify' || value.purpose === 'security')
  && Number.isFinite(value.since) && value.since > Date.now() - 86_400_000 && value.since < Date.now() + 60_000
  && Array.isArray(value.usedIds) && value.usedIds.length <= 30
  && value.usedIds.every(id => typeof id === 'string' && id.length <= 120);

export async function createAuthMailGateway({ socketPath, findMail }) {
  if (typeof socketPath !== 'string' || !path.isAbsolute(socketPath) || typeof findMail !== 'function') throw new Error('A local auth-mail socket and matcher are required.');
  await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  try {
    const existing = await fs.lstat(socketPath);
    if (!existing.isSocket()) throw new Error('The auth-mail gateway path is occupied by a non-socket file.');
    await fs.unlink(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const server = net.createServer(socket => {
    socket.setTimeout(3000, () => socket.destroy());
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 4096) { socket.destroy(); return; }
      if (!data.includes('\n')) return;
      socket.removeAllListeners('data');
      let request;
      try { request = JSON.parse(data.slice(0, data.indexOf('\n'))); } catch { socket.end('null\n'); return; }
      if (!safeRequest(request)) { socket.end('null\n'); return; }
      Promise.resolve(findMail(request)).then(result => {
        const code = typeof result?.code === 'string' && codePattern(request.purpose).test(result.code) ? result.code : '';
        const id = typeof result?.id === 'string' && result.id.length <= 120 ? result.id : '';
        socket.end(code && id ? `${JSON.stringify({ id, code })}\n` : 'null\n');
      }, () => socket.end('null\n'));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { server.removeListener('error', reject); resolve(); });
  });
  await fs.chmod(socketPath, 0o600);
  return { close: async () => { await new Promise(resolve => server.close(resolve)); await fs.unlink(socketPath).catch(() => {}); } };
}

export function requestAuthMail({ socketPath, taskId, purpose = 'verify', since, usedIds = [] } = {}) {
  const request = { taskId, purpose, since, usedIds };
  if (!safeRequest(request)) return Promise.resolve(null);
  return new Promise(resolve => {
    const socket = net.createConnection(socketPath);
    let data = '', settled = false;
    const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
    socket.setTimeout(3000, () => finish(null));
    socket.setEncoding('utf8');
    socket.once('error', () => finish(null));
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 512) { finish(null); return; }
      if (!data.includes('\n')) return;
      try {
        const value = JSON.parse(data.slice(0, data.indexOf('\n')));
        finish(value && typeof value.id === 'string' && codePattern(purpose).test(value.code) ? value : null);
      } catch { finish(null); }
    });
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
  });
}
