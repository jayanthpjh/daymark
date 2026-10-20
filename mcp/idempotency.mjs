import { createHash } from 'node:crypto';

const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const fingerprint = value => createHash('sha256').update(stable(value)).digest('hex');
const validKey = value => typeof value === 'string' && value.length >= 16 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);

export class McpIdempotencyError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function createMcpIdempotency({ store, now = () => Date.now() } = {}) {
  if (!store || typeof store.transaction !== 'function') throw new Error('A durable Daymark request store is required.');

  return {
    async run({ key, operation, input, execute }) {
      if (!validKey(key)) throw new McpIdempotencyError('invalid_key', 'Provide an idempotency key with 16 to 128 safe characters.');
      const argsHash = fingerprint({ operation, input });
      const claim = await store.transaction(async tx => {
        const existing = await tx.get('mcp_requests', key);
        if (existing) {
          if (existing.argsHash !== argsHash) return { status: 'conflict' };
          if (existing.status === 'completed') return { status: 'cached', result: existing.result };
          if (existing.status === 'failed') return { status: 'failed', result: existing.result };
          return { status: 'in_progress' };
        }
        await tx.put('mcp_requests', { id: key, operation, argsHash, status: 'running', createdAt: now(), updatedAt: now() });
        return { status: 'claimed' };
      });
      if (claim.status !== 'claimed') {
        if (claim.status === 'conflict') throw new McpIdempotencyError('key_reused', 'This idempotency key was already used for different input.');
        return claim.status === 'cached' || claim.status === 'failed' ? claim.result : { status: claim.status };
      }
      try {
        const result = await execute();
        await store.transaction(async tx => {
          const record = await tx.get('mcp_requests', key);
          if (record?.status === 'running' && record.argsHash === argsHash) await tx.put('mcp_requests', { ...record, status: 'completed', result, updatedAt: now() });
        });
        return result;
      } catch {
        await store.transaction(async tx => {
          const record = await tx.get('mcp_requests', key);
          if (record?.status === 'running' && record.argsHash === argsHash) await tx.put('mcp_requests', { ...record, status: 'failed', result: { status: 'failed', message: 'Daymark could not queue this request.' }, updatedAt: now() });
        }).catch(() => {});
        return { status: 'failed', message: 'Daymark could not queue this request.' };
      }
    },
  };
}
