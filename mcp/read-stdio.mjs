// Local MCP stdio transport. Reads the same saved state as Daymark, with a
// read-only PostgreSQL connection when that store is configured.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createSharedJsonStore } from '../shared-state.mjs';
import { createAgentReadTools } from '../agent-read-tools.mjs';
import { createMcpReadInterface, MCP_READ_TOOLS } from './read-interface.mjs';
import { MCP_ACTION_TOOLS } from './action-interface.mjs';
import { createDaymarkMcpProxy } from './stdio-proxy.mjs';
import { zodSchema } from './http-handler.mjs';
import { parseRuntimeSettings, runtimeSettings } from '../runtime-settings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.DAYMARK_DATA_DIR || path.join(root, 'data');
const envFile = process.env.DAYMARK_ENV_PATH || path.join(root, '.env');
const envContents = await fs.readFile(envFile, 'utf8').catch(() => '');
const localSettings = parseRuntimeSettings(envContents);
const envValue = key => envContents.split(/\r?\n/).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2') || '';
const mcpToken = process.env.DAYMARK_MCP_TOKEN || envValue('DAYMARK_MCP_TOKEN');
const { databaseUrl } = runtimeSettings({ fileSettings: localSettings });
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true, application_name: 'daymark-mcp-readonly', options: '-c default_transaction_read_only=on' }) : null;
pool?.on('error', () => console.error(JSON.stringify({ event: 'mcp_database_connection_lost' })));
const jsonStore = createSharedJsonStore(path.join(dataDir, 'state.json'));

async function readState() {
  if (!pool) {
    try { return await jsonStore.read(); }
    catch (error) { if (error.code === 'ENOENT') return { jobs: [], tasks: [] }; throw error; }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query('SELECT state_json FROM daymark_state WHERE state_id = $1', ['daymark']);
    await client.query('COMMIT');
    return result.rows[0]?.state_json || { jobs: [], tasks: [] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

const readInterface = createMcpReadInterface(createAgentReadTools(readState));
const actionProxy = mcpToken ? createDaymarkMcpProxy({ url: process.env.DAYMARK_MCP_URL || `http://127.0.0.1:${process.env.PORT || 4173}/mcp`, token: mcpToken }) : null;
const toolCatalog = [...MCP_READ_TOOLS, ...MCP_ACTION_TOOLS];

function createServer() {
  const server = new McpServer({ name: 'daymark', version: '0.1.0' });
  for (const tool of toolCatalog) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: zodSchema(tool.inputSchema) }, args => MCP_READ_TOOLS.includes(tool) ? readInterface.call(tool.name, args) : actionProxy ? actionProxy.call(tool.name, args) : ({ content: [{ type: 'text', text: 'Daymark MCP writes are disabled. Configure DAYMARK_MCP_TOKEN and start Daymark.' }], isError: true }));
  }
  return server;
}

await serveStdio(createServer);
console.error('Daymark MCP read server ready on stdio.');
