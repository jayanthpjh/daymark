import { Pool } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const tables = { conversations: 'daymark_assistant_conversations', messages: 'daymark_mail_messages', drafts: 'daymark_mail_drafts', attempts: 'daymark_mail_send_attempts', sync: 'daymark_mail_sync', attachments: 'daymark_mail_attachments', events: 'daymark_calendar_events', approvals: 'daymark_agent_approvals' };
const table = kind => { if (!tables[kind]) throw new Error('Invalid mailbox collection.'); return tables[kind]; };
export async function createMailboxStore({ connectionString, pool: suppliedPool, demoFile } = {}) {
  // File storage is explicitly limited to synthetic demo/testing. Production uses dedicated PostgreSQL tables.
  if (demoFile) {
    let tail = Promise.resolve();
    const read = async () => { try { return JSON.parse(await fs.readFile(demoFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } };
    return { backend: 'synthetic-demo', async transaction(fn) {
      const work = tail.then(async () => {
        const state = await read();
        const result = await fn({
          get: async (k, id) => { table(k); return structuredClone(state[k]?.[id] || null); },
          put: async (k, v) => { table(k); (state[k] ||= {})[v.id] = structuredClone(v); },
          remove: async (k, id) => { table(k); delete (state[k] ||= {})[id]; },
          list: async (k, opts = {}) => { table(k); return select(Object.values(state[k] || {}), opts); },
        });
        await fs.mkdir(path.dirname(demoFile), { recursive: true, mode: 0o700 });
        const tmp = `${demoFile}.${randomUUID()}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(state), { mode: 0o600 }); await fs.rename(tmp, demoFile);
        return result;
      });
      tail = work.catch(() => {}); return work;
    }, async close() {} };
  }
  if (!connectionString && !suppliedPool) return null;
  const pool = suppliedPool || new Pool({ connectionString, max: 3, application_name: 'daymark-mailbox', connectionTimeoutMillis: 3000, query_timeout: 5000 });
  // pg removes disconnected idle clients; observe the error so it cannot terminate Node.
  pool.on?.('error', () => console.error(JSON.stringify({event:'database_connection_lost',store:'mailbox',at:new Date().toISOString()})));
  for (const name of Object.values(tables)) await pool.query(`CREATE TABLE IF NOT EXISTS ${name} (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS daymark_mail_thread_idx ON daymark_mail_messages ((data->>'threadId')); CREATE INDEX IF NOT EXISTS daymark_mail_date_idx ON daymark_mail_messages ((data->>'date') DESC)`);
  return { backend: 'postgresql', async transaction(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // One applicant, one mailbox writer. Lock is cross-process and released on rollback/crash.
      await c.query("SELECT pg_advisory_xact_lock(hashtext('daymark-mailbox'))");
      const result = await fn({
        get: async (k, id) => (await c.query(`SELECT data FROM ${table(k)} WHERE id=$1`, [id])).rows[0]?.data || null,
        put: async (k, v) => { await c.query(`INSERT INTO ${table(k)} (id,data) VALUES ($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`, [v.id, JSON.stringify(v)]); },
        remove: async (k, id) => { await c.query(`DELETE FROM ${table(k)} WHERE id=$1`, [id]); },
        list: async (k, o = {}) => {
          const args = []; const where = [];
          const arg = v => { args.push(v); return `$${args.length}`; };
          if (k === 'messages' && !o.threadId && !['All','Verification'].includes(o.folder)) where.push("NOT (coalesce(data->'categories','[]'::jsonb) ? 'Verification')");
          if (o.folder === 'Verification') where.push("coalesce(data->'categories','[]'::jsonb) ? 'Verification'");
          if (o.jobId) where.push(`data->>'jobId'=${arg(o.jobId)}`);
          if (o.folder === 'Needs reply') where.push("data->>'needsReply'='true'");
          if (o.threadId) where.push(`data->>'threadId'=${arg(o.threadId)}`);
          if (o.query) where.push(`lower(concat_ws(' ',data->>'subject',data->>'from',data->>'text')) LIKE ${arg('%'+o.query.toLowerCase().replace(/[\\%_]/g, '\\$&')+'%')} ESCAPE '\\'`);
          if (o.folder === 'Inbox') where.push("data->>'direction'='incoming'");
          if (o.folder === 'Archive') where.push("data->>'archived'='true'");
          else if (o.folder === 'Sent') where.push("data->>'direction'='outgoing'");
          else if (o.folder === 'Starred') where.push("data->>'starred'='true'");
          else if (o.folder === 'Unread') where.push("data->>'unread'='true'");
          else if (o.folder && o.folder !== 'All') {
            where.push("coalesce(data->>'archived','false')!='true'");
            const cats = { 'Needs reply': ['Screening','Interview','Assessment','Offer'], Interviews: ['Interview','Screening'], Assessments: ['Assessment'], Updates: ['Application confirmation','Application update','Offer','Rejection'] }[o.folder];
            if (cats) where.push(`(data->'categories') ?| ${arg(cats)}::text[]`);
          }
          const limit = Math.min(200, Math.max(1, Number(o.limit) || 50)); const offset = Math.max(0, Number(o.offset) || 0);
          const source = o.distinctThread ? `(SELECT DISTINCT ON (data->>'threadId') data,id FROM ${table(k)} ${where.length ? 'WHERE '+where.join(' AND ') : ''} ORDER BY data->>'threadId',data->>'date' DESC,id) AS threads` : `${table(k)} ${where.length ? 'WHERE '+where.join(' AND ') : ''}`;
          const projection=k==='conversations' && o.metadata ? "(data - 'turns') AS data" : k==='drafts' && o.metadata ? `jsonb_set(data,'{attachments}',coalesce((SELECT jsonb_agg(item - 'base64') FROM jsonb_array_elements(data->'attachments') item),'[]'::jsonb)) AS data` : 'data';
          const q = `SELECT ${projection} FROM ${source} ORDER BY coalesce(data->>'date',data->>'updatedAt','') DESC,id LIMIT ${arg(limit)} OFFSET ${arg(offset)}`;
          return (await c.query(q, args)).rows.map(r => r.data);
        },
      });
      await c.query('COMMIT'); return result;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }, async close() { if (!suppliedPool) await pool.end(); } };
}
function select(rows, o) {
  const cats = { 'Needs reply': ['Screening','Interview','Assessment','Offer'], Interviews: ['Interview','Screening'], Assessments: ['Assessment'], Updates: ['Application confirmation','Application update','Offer','Rejection'] }[o.folder];
  let filtered = rows.filter(m => (o.threadId || (o.folder === 'Verification' ? m.categories?.includes('Verification') : o.folder === 'All' || !m.categories?.includes('Verification'))) && (!o.threadId || m.threadId === o.threadId) && (!o.jobId || m.jobId === o.jobId) && (o.folder !== 'Needs reply' || m.needsReply) && (o.folder !== 'Inbox' || m.direction === 'incoming') && (!o.query || `${m.subject} ${m.from} ${m.text}`.toLowerCase().includes(o.query.toLowerCase())) && (!o.folder || o.folder === 'All' || (o.folder === 'Archive' ? m.archived : o.folder === 'Sent' ? m.direction === 'outgoing' : o.folder === 'Starred' ? m.starred : o.folder === 'Unread' ? m.unread : !m.archived && (!cats || m.categories?.some(c => cats.includes(c)))))).sort((a,b) => String(b.date || b.updatedAt || '').localeCompare(String(a.date || a.updatedAt || '')) || a.id.localeCompare(b.id));
  if (o.distinctThread) { const seen = new Set(); filtered = filtered.filter(m => {if(seen.has(m.threadId))return false;seen.add(m.threadId);return true;}); }
  return structuredClone(filtered.slice(o.offset || 0, (o.offset || 0) + Math.min(200,o.limit || 50)));
}
