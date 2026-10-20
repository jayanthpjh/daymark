import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaymarkMcpProxy } from './stdio-proxy.mjs';

function sse(result) { return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } }); }

test('stdio write proxy uses authenticated local Streamable HTTP without exposing the token', async () => {
  const seen = [];
  const token = 'secret-token-0123456789abcdef0123456789';
  const proxy = createDaymarkMcpProxy({ url: 'http://127.0.0.1:4173/mcp', token, fetchImpl: async (_url, options) => {
    seen.push({ headers: options.headers, body: JSON.parse(options.body) });
    return sse(seen.length === 1 ? { protocolVersion: '2025-11-25' } : { content: [{ type: 'text', text: 'queued' }], structuredContent: { status: 'queued', taskId: 'task-1' } });
  } });
  const result = await proxy.call('daymark_prepare_application', { jobId: 'job-1', idempotencyKey: 'request_0123456789' });
  assert.equal(result.structuredContent.taskId, 'task-1');
  assert.deepEqual(seen.map(item => item.body.method), ['initialize', 'tools/call']);
  assert.ok(seen.every(item => item.headers.authorization === `Bearer ${token}`));
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('stdio write proxy blocks insecure remote URLs and redacts endpoint failures', async () => {
  const token = 'secret-token-0123456789abcdef0123456789';
  assert.throws(() => createDaymarkMcpProxy({ url: 'http://example.com/mcp', token }), /secure Daymark endpoint/);
  const proxy = createDaymarkMcpProxy({ url: 'http://localhost:4173/mcp', token, fetchImpl: async () => new Response('database password leaked', { status: 401 }) });
  const result = await proxy.call('daymark_prepare_application', {});
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Daymark MCP is unavailable. Start Daymark and configure DAYMARK_MCP_TOKEN to use MCP write tools.');
  assert.equal(JSON.stringify(result).includes('password'), false);
});
