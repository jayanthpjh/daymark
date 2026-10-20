import { Pool } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const tables = { conversations: 'daymark_assistant_conversations', messages: 'daymark_mail_messages', drafts: 'daymark_mail_drafts', attempts: 'daymark_mail_send_attempts', sync: 'daymark_mail_sync', attachments: 'daymark_mail_attachments', events: 'daymark_calendar_events', approvals: 'daymark_agent_approvals', mcp_requests: 'daymark_mcp_requests' };
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
          unreadCount: async () => Object.values(state.messages || {}).filter(m => m.unread && m.direction === 'incoming' && !m.archived && !m.spam && !m.trashed && !(m.snoozedUntil && Date.parse(m.snoozedUntil) > Date.now())).length,
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
  await pool.query(`CREATE INDEX IF NOT EXISTS daymark_mail_thread_idx ON daymark_mail_messages ((data->>'threadId')); CREATE INDEX IF NOT EXISTS daymark_mail_date_idx ON daymark_mail_messages ((data->>'date') DESC); CREATE INDEX IF NOT EXISTS daymark_mail_provider_key_idx ON daymark_mail_messages ((data->>'providerMessageKey'))`);
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
          if (o.providerMessageKey) where.push(`data->>'providerMessageKey'=${arg(o.providerMessageKey)}`);
          if (o.query) where.push(`lower(concat_ws(' ',data->>'subject',data->>'from',data->>'text')) LIKE ${arg('%'+o.query.toLowerCase().replace(/[\\%_]/g, '\\$&')+'%')} ESCAPE '\\'`);
          if (o.from) where.push(`lower(concat_ws(' ',data->>'from',data->>'senderAddress')) LIKE ${arg('%'+o.from.toLowerCase().replace(/[\\%_]/g, '\\$&')+'%')} ESCAPE '\\'`);
          if (o.subject) where.push(`lower(data->>'subject') LIKE ${arg('%'+o.subject.toLowerCase().replace(/[\\%_]/g, '\\$&')+'%')} ESCAPE '\\'`);
          if (o.unread) where.push("data->>'unread'='true'");
          if (o.starred) where.push("data->>'starred'='true'");
          if (o.important) where.push("data->>'important'='true'");
          if (o.hasAttachment) where.push("jsonb_array_length(CASE WHEN jsonb_typeof(data->'attachments')='array' THEN data->'attachments' ELSE '[]'::jsonb END)>0");
          if (o.label) where.push(`coalesce(data->'labels','[]'::jsonb) ? ${arg(o.label)}`);
          if (o.after) where.push(`(data->>'date')::timestamptz >= ${arg(o.after)}::timestamptz`);
          if (o.before) where.push(`(data->>'date')::timestamptz < ${arg(o.before)}::timestamptz`);
          if (o.folder === 'Inbox') where.push("data->>'direction'='incoming'");
          if (o.folder === 'Archive') where.push("data->>'archived'='true'");
          else if (o.folder === 'Spam') where.push("data->>'spam'='true'");
          else if (o.folder === 'Trash') where.push("data->>'trashed'='true'");
          else if (o.folder === 'Sent') where.push("data->>'direction'='outgoing'");
          else if (o.folder === 'Starred') where.push("data->>'starred'='true'");
          else if (o.folder === 'Unread') where.push("data->>'unread'='true'");
          else if (o.folder && o.folder !== 'All') {
            where.push("coalesce(data->>'archived','false')!='true'");
            where.push("coalesce(data->>'spam','false')!='true'");
            where.push("coalesce(data->>'trashed','false')!='true'");
            const cats = { 'Needs reply': ['Screening','Interview','Assessment','Offer'], Interviews: ['Interview','Screening'], Assessments: ['Assessment'], Updates: ['Application confirmation','Application update','Offer','Rejection'] }[o.folder];
            if (cats) where.push(`(data->'categories') ?| ${arg(cats)}::text[]`);
          }
          if (o.folder === 'Inbox') {
            where.push("coalesce(data->>'archived','false')!='true'");
            where.push("coalesce(data->>'spam','false')!='true'");
            where.push("coalesce(data->>'trashed','false')!='true'");
            where.push("((data->>'snoozedUntil') IS NULL OR (data->>'snoozedUntil')::timestamptz <= now())");
          }
          if (o.folder === 'Snoozed') where.push("(data->>'snoozedUntil')::timestamptz > now()");
          if (o.folder === 'All') {
            where.push("coalesce(data->>'spam','false')!='true'");
            where.push("coalesce(data->>'trashed','false')!='true'");
          }
          const limit = Math.min(200, Math.max(1, Number(o.limit) || 50)); const offset = Math.max(0, Number(o.offset) || 0);
          const source = o.distinctThread ? `(SELECT DISTINCT ON (data->>'threadId') data,id FROM ${table(k)} ${where.length ? 'WHERE '+where.join(' AND ') : ''} ORDER BY data->>'threadId',data->>'date' DESC,id) AS threads` : `${table(k)} ${where.length ? 'WHERE '+where.join(' AND ') : ''}`;
          const projection=k==='conversations' && o.metadata ? "(data - 'turns') AS data" : k==='drafts' && o.metadata ? `jsonb_set(data,'{attachments}',coalesce((SELECT jsonb_agg(item - 'base64') FROM jsonb_array_elements(data->'attachments') item),'[]'::jsonb)) AS data` : 'data';
          const q = `SELECT ${projection} FROM ${source} ORDER BY coalesce(data->>'date',data->>'updatedAt','') DESC,id LIMIT ${arg(limit)} OFFSET ${arg(offset)}`;
          return (await c.query(q, args)).rows.map(r => r.data);
        },
        unreadCount: async () => Number((await c.query("SELECT count(*)::int AS count FROM daymark_mail_messages WHERE data->>'unread'='true' AND data->>'direction'='incoming' AND coalesce(data->>'archived','false')!='true' AND coalesce(data->>'spam','false')!='true' AND coalesce(data->>'trashed','false')!='true' AND ((data->>'snoozedUntil') IS NULL OR (data->>'snoozedUntil')::timestamptz <= now())")).rows[0].count),
      });
      await c.query('COMMIT'); return result;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }, async close() { if (!suppliedPool) await pool.end(); } };
}
function select(rows, o) {
  const cats = { 'Needs reply': ['Screening','Interview','Assessment','Offer'], Interviews: ['Interview','Screening'], Assessments: ['Assessment'], Updates: ['Application confirmation','Application update','Offer','Rejection'] }[o.folder];
  const snoozed = m => m.snoozedUntil && Date.parse(m.snoozedUntil) > Date.now();
  let filtered = rows.filter(m => (o.threadId || (o.folder === 'Verification' ? m.categories?.includes('Verification') : o.folder === 'All' || !m.categories?.includes('Verification'))) && (!o.threadId || m.threadId === o.threadId) && (!o.providerMessageKey || m.providerMessageKey === o.providerMessageKey) && (!o.jobId || m.jobId === o.jobId) && (o.folder !== 'Needs reply' || m.needsReply) && (!o.query || `${m.subject} ${m.from} ${m.text}`.toLowerCase().includes(o.query.toLowerCase())) && (!o.from || `${m.from} ${m.senderAddress}`.toLowerCase().includes(o.from.toLowerCase())) && (!o.subject || String(m.subject || '').toLowerCase().includes(o.subject.toLowerCase())) && (!o.unread || m.unread) && (!o.starred || m.starred) && (!o.important || m.important) && (!o.hasAttachment || (m.attachments || []).length > 0) && (!o.label || (m.labels || []).includes(o.label)) && (!o.after || Date.parse(m.date || '') >= Date.parse(o.after)) && (!o.before || Date.parse(m.date || '') < Date.parse(o.before)) && (!o.folder || o.folder === 'All' || (o.folder === 'Archive' ? m.archived : o.folder === 'Spam' ? m.spam : o.folder === 'Trash' ? m.trashed : o.folder === 'Snoozed' ? snoozed(m) : o.folder === 'Sent' ? m.direction === 'outgoing' : o.folder === 'Starred' ? m.starred : o.folder === 'Unread' ? m.unread : !m.archived && !m.spam && !m.trashed && (o.folder !== 'Inbox' || (m.direction === 'incoming' && !snoozed(m))) && (!cats || m.categories?.some(c => cats.includes(c)))))).sort((a,b) => String(b.date || b.updatedAt || '').localeCompare(String(a.date || a.updatedAt || '')) || a.id.localeCompare(b.id));
  if (o.distinctThread) { const seen = new Set(); filtered = filtered.filter(m => {if(seen.has(m.threadId))return false;seen.add(m.threadId);return true;}); }
  return structuredClone(filtered.slice(o.offset || 0, (o.offset || 0) + Math.min(200,o.limit || 50)));
}
