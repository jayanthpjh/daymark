import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { timingSafeEqual } from 'node:crypto';
import * as z from 'zod/v4';

export function zodSchema(schema) {
  const shape = {};
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    let value = rule.type === 'integer' ? z.number().int() : z.string();
    if (rule.minLength) value = value.min(rule.minLength);
    if (rule.maxLength) value = value.max(rule.maxLength);
    if (rule.pattern) value = value.regex(new RegExp(rule.pattern));
    if (rule.enum) value = value.pipe(z.enum(rule.enum));
    if (rule.minimum !== undefined) value = value.min(rule.minimum);
    if (rule.maximum !== undefined) value = value.max(rule.maximum);
    shape[key] = (schema.required || []).includes(key) ? value : value.optional();
  }
  return z.object(shape).strict();
}

function bearerMatches(header, token) {
  if (typeof token !== 'string' || token.length < 32 || typeof header !== 'string') return false;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header);
  if (!match) return false;
  const expected = Buffer.from(token);
  const supplied = Buffer.from(match[1]);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function createMcpHttpHandler({ tools, getToken, allowedHosts = [], allowedOrigins = [] } = {}) {
  if (!tools || typeof tools.call !== 'function' || !Array.isArray(tools.tools)) throw new Error('A Daymark MCP tool interface is required.');
  const hostSet = new Set(allowedHosts.map(value => String(value).toLowerCase()));
  const originSet = new Set(allowedOrigins.map(value => String(value).replace(/\/$/, '').toLowerCase()));
  const protocol = createMcpHandler(() => {
    const server = new McpServer({ name: 'daymark', version: '0.1.0' });
    for (const tool of tools.tools) server.registerTool(tool.name, { description: tool.description, inputSchema: zodSchema(tool.inputSchema) }, args => tools.call(tool.name, args));
    return server;
  });

  return {
    async fetch(request) {
      const host = (request.headers.get('host') || new URL(request.url).host).toLowerCase();
      const origin = request.headers.get('origin')?.replace(/\/$/, '').toLowerCase();
      if (!hostSet.has(host)) return new Response('Host not allowed.', { status: 421 });
      if (origin && (!originSet.has(origin) || new URL(origin).host.toLowerCase() !== host)) return new Response('Origin not allowed.', { status: 403 });
      if (!bearerMatches(request.headers.get('authorization'), await getToken?.())) return new Response('Unauthorized.', { status: 401, headers: { 'www-authenticate': 'Bearer' } });
      return protocol.fetch(request);
    },
  };
}

export async function handleNodeMcpRequest(req, res, handler, { maxBodyBytes = 1_000_000 } = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  let body;
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBodyBytes) { res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Request too large.'); return; }
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }
  const request = new Request(`http://${req.headers.host || '127.0.0.1'}${req.url || '/mcp'}`, { method: req.method, headers, ...(body ? { body, duplex: 'half' } : {}) });
  const response = await handler.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) { res.end(); return; }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once('drain', resolve));
    }
    res.end();
  } catch { res.destroy(); }
}
