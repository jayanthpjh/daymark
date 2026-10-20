import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHttpHandler } from './http-handler.mjs';

const tools = { tools: [{ name: 'daymark_echo', description: 'Return a fixed safe result.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 20 } }, required: ['query'], additionalProperties: false } }], call: async (_name, args) => ({ content: [{ type: 'text', text: args.query }] }) };
const make = () => createMcpHttpHandler({ tools, getToken: () => '0123456789abcdef0123456789abcdef', allowedHosts: ['daymark.local:4321'], allowedOrigins: ['http://daymark.local:4321'] });
const request = (handler, body, headers = {}) => handler.fetch(new Request('http://daymark.local:4321/mcp', { method: 'POST', headers: { host: 'daymark.local:4321', 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) }));

test('Streamable HTTP rejects missing credentials and untrusted Host or Origin', async () => {
  const handler = make();
  const rpc = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };
  assert.equal((await request(handler, rpc)).status, 401);
  assert.equal((await request(handler, rpc, { authorization: 'Bearer 0123456789abcdef0123456789abcdef', host: 'evil.example' })).status, 421);
  assert.equal((await request(handler, rpc, { authorization: 'Bearer 0123456789abcdef0123456789abcdef', origin: 'https://evil.example' })).status, 403);
});

test('authenticated Streamable HTTP negotiates MCP and validates tool schemas', async () => {
  const handler = make();
  const headers = { authorization: 'Bearer 0123456789abcdef0123456789abcdef' };
  const initialized = await request(handler, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }, headers);
  assert.equal(initialized.status, 200);
  const body = JSON.parse((await initialized.text()).split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.ok(body.result?.protocolVersion);
  const called = await request(handler, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'daymark_echo', arguments: { query: 'hello' } } }, { ...headers, 'mcp-protocol-version': body.result.protocolVersion });
  assert.equal(called.status, 200);
  assert.match(await called.text(), /hello/);
});
