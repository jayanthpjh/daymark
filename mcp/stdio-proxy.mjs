function payload(response) {
  return response.text().then(body => {
    if (!response.ok) throw new Error('Daymark MCP is unavailable or not authorized.');
    const data = body.split(/\r?\n/).find(line => line.startsWith('data: '));
    if (!data) throw new Error('Daymark MCP returned an invalid response.');
    const message = JSON.parse(data.slice(6));
    if (message.error) throw new Error('Daymark MCP could not complete this request.');
    return message.result;
  });
}

export function createDaymarkMcpProxy({ url, token, fetchImpl = fetch } = {}) {
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new Error('Configure a valid DAYMARK_MCP_URL to enable MCP write tools.'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  if (!['http:', 'https:'].includes(endpoint.protocol) || (endpoint.protocol === 'http:' && !loopback) || endpoint.username || endpoint.password || typeof token !== 'string' || token.length < 32) throw new Error('MCP write tools require a 32-character bearer token and a secure Daymark endpoint.');
  let protocolVersion = '2025-11-25';
  let requestId = 0;
  const send = async (method, params = {}, initialize = false) => {
    const id = ++requestId;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(initialize ? {} : { 'mcp-protocol-version': protocolVersion }) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    return payload(response);
  };
  return {
    async call(name, args) {
      try {
        if (!endpoint || !token) throw new Error('Unavailable.');
        if (protocolVersion === '2025-11-25') {
          const initialized = await send('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: 'daymark-stdio-proxy', version: '0.1.0' } }, true);
          protocolVersion = initialized.protocolVersion;
        }
        return await send('tools/call', { name, arguments: args });
      } catch {
        return { content: [{ type: 'text', text: 'Daymark MCP is unavailable. Start Daymark and configure DAYMARK_MCP_TOKEN to use MCP write tools.' }], isError: true };
      }
    },
  };
}
