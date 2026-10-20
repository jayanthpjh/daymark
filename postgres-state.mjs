import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { mergeStateSnapshots } from './shared-state.mjs';

const singleton = 'daymark';
const clone = value => structuredClone(value);

function assertState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.jobs) || !Array.isArray(value.tasks) || !Array.isArray(value.applications) || !value.profile || typeof value.profile !== 'object') {
    throw new Error('Daymark saved state has an invalid structure. The database record was left untouched.');
  }
  return value;
}

async function importLegacyState(pool, legacyFile) {
  if (!legacyFile) return null;
  const present = await pool.query('SELECT 1 FROM daymark_state WHERE state_id = $1', [singleton]);
  if (present.rowCount) return null;
  let state;
  try { state = assertState(JSON.parse(await fs.readFile(legacyFile, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Daymark could not safely import its existing local state into PostgreSQL.', { cause: error });
  }
  const revision = Number.isSafeInteger(state._stateRevision) && state._stateRevision >= 0 ? state._stateRevision : 0;
  await pool.query(
    'INSERT INTO daymark_state (state_id, revision, state_json, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (state_id) DO NOTHING',
    [singleton, revision, JSON.stringify(state)],
  );
  return { state, revision };
}

async function saveCheckpointSnapshots(client, state, revision) {
  const records = state.tasks.flatMap(task => {
    const checkpoint = task?.type === 'fill' ? task.checkpoint : null;
    if (!checkpoint || typeof checkpoint !== 'object' || !checkpoint.id) return [];
    const eventId = createHash('sha256').update(`${task.id}\0${checkpoint.id}\0${JSON.stringify(checkpoint)}`).digest('hex');
    return [{ task_id: task.id, checkpoint_id: checkpoint.id, task_status: task.status || '', stage: task.stage || '', checkpoint_json: checkpoint, state_revision: revision, event_id: eventId }];
  });
  if (!records.length) return;
  const encoded = JSON.stringify(records);
  await client.query(
    `INSERT INTO daymark_application_checkpoints (task_id, checkpoint_id, task_status, stage, checkpoint_json, state_revision, updated_at)
     SELECT task_id, checkpoint_id, task_status, stage, checkpoint_json, state_revision, now()
     FROM jsonb_to_recordset($1::jsonb) AS rows(task_id text, checkpoint_id text, task_status text, stage text, checkpoint_json jsonb, state_revision bigint)
     ON CONFLICT (task_id) DO UPDATE SET checkpoint_id = EXCLUDED.checkpoint_id,
       task_status = EXCLUDED.task_status, stage = EXCLUDED.stage,
       checkpoint_json = EXCLUDED.checkpoint_json, state_revision = EXCLUDED.state_revision,
       updated_at = now()
     WHERE daymark_application_checkpoints.checkpoint_id IS DISTINCT FROM EXCLUDED.checkpoint_id
       OR daymark_application_checkpoints.task_status IS DISTINCT FROM EXCLUDED.task_status
       OR daymark_application_checkpoints.stage IS DISTINCT FROM EXCLUDED.stage
       OR daymark_application_checkpoints.checkpoint_json IS DISTINCT FROM EXCLUDED.checkpoint_json`,
    [encoded],
  );
  await client.query(
    `INSERT INTO daymark_checkpoint_history (event_id, task_id, checkpoint_id, state_revision, checkpoint_json)
     SELECT event_id, task_id, checkpoint_id, state_revision, checkpoint_json
     FROM jsonb_to_recordset($1::jsonb) AS rows(event_id text, task_id text, checkpoint_id text, state_revision bigint, checkpoint_json jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [encoded],
  );
}

export async function createPostgresStateStore({ connectionString, legacyFile = '', pool: suppliedPool, PoolClass = Pool } = {}) {
  if (!suppliedPool && (typeof connectionString !== 'string' || !connectionString.trim())) throw new Error('DAYMARK_DATABASE_URL is required for PostgreSQL state.');
  const pool = suppliedPool || new PoolClass({ connectionString, max: 6, application_name: 'daymark-local', connectionTimeoutMillis: 3000, query_timeout: 5000 });
  // pg removes disconnected idle clients; observe the error so it cannot terminate Node.
  pool.on?.('error', () => console.error(JSON.stringify({event:'database_connection_lost',store:'state',at:new Date().toISOString()})));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daymark_state (
      state_id text PRIMARY KEY,
      revision bigint NOT NULL CHECK (revision >= 0),
      state_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS daymark_application_checkpoints (
      task_id text PRIMARY KEY,
      checkpoint_id text NOT NULL,
      task_status text NOT NULL DEFAULT '',
      stage text NOT NULL DEFAULT '',
      checkpoint_json jsonb NOT NULL,
      state_revision bigint NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS daymark_checkpoint_history (
      event_id text PRIMARY KEY,
      task_id text NOT NULL,
      checkpoint_id text NOT NULL,
      state_revision bigint NOT NULL,
      checkpoint_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS daymark_checkpoint_history_task_created_idx
      ON daymark_checkpoint_history (task_id, created_at DESC);
  `);
  const imported = await importLegacyState(pool, legacyFile);
  if (imported) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveCheckpointSnapshots(client, imported.state, imported.revision);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error('Daymark could not safely migrate existing application checkpoints.', { cause: error });
    } finally { client.release(); }
  }

  const snapshots = new WeakMap();
  const snapshotRevisions = new WeakMap();
  let lastKnownRevision = 0;
  let localWrites = Promise.resolve();

  async function read() {
    // A SELECT can start before a local write commits and return afterward. If
    // that write advanced lastKnownRevision, retry the older MVCC snapshot
    // before treating it as an actual database rollback.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await pool.query('SELECT state_json, revision FROM daymark_state WHERE state_id = $1', [singleton]);
      if (!result.rowCount) throw Object.assign(new Error('Daymark PostgreSQL state has not been initialized.'), { code: 'ENOENT' });
      const value = assertState(result.rows[0].state_json);
      const revision = Number(result.rows[0].revision);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Daymark PostgreSQL state revision moved backwards. The saved record was left untouched.');
      if (lastKnownRevision > 0 && revision < lastKnownRevision) {
        if (attempt < 2) continue;
        throw new Error('Daymark PostgreSQL state revision moved backwards. The saved record was left untouched.');
      }
      value._stateRevision = revision;
      lastKnownRevision = Math.max(lastKnownRevision, revision);
      snapshots.set(value, clone(value));
      snapshotRevisions.set(value, revision);
      return value;
    }
    throw new Error('Daymark could not read a consistent PostgreSQL state snapshot. The saved record was left untouched.');
  }

  function write(value) {
    const operation = localWrites.catch(() => {}).then(async () => {
      assertState(value);
      const base = snapshots.get(value);
      const baseRevision = snapshotRevisions.get(value) ?? base?._stateRevision ?? 0;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT state_json, revision FROM daymark_state WHERE state_id = $1 FOR UPDATE', [singleton]);
        const latestRow = result.rows[0];
        if (!latestRow && base) throw new Error('Daymark cannot safely update missing PostgreSQL state; reload state before retrying.');
        if (latestRow && !base) throw new Error('Daymark state changed during initialization; reload state before retrying.');
        const latest = latestRow ? assertState(latestRow.state_json) : null;
        const latestRevision = Number(latestRow?.revision || 0);
        if (!Number.isSafeInteger(latestRevision) || latestRevision < Math.max(baseRevision, lastKnownRevision)) throw new Error('Daymark PostgreSQL state revision moved backwards.');
        const merged = assertState(base && latest ? mergeStateSnapshots(base, value, latest) : clone(value));
        const revision = Math.max(baseRevision, latestRevision, lastKnownRevision) + 1;
        merged._stateRevision = revision;
        await client.query(
          `INSERT INTO daymark_state (state_id, revision, state_json, updated_at) VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (state_id) DO UPDATE SET revision = EXCLUDED.revision, state_json = EXCLUDED.state_json, updated_at = now()`,
          [singleton, revision, JSON.stringify(merged)],
        );
        await saveCheckpointSnapshots(client, merged, revision);
        await client.query('COMMIT');
        for (const key of Object.keys(value)) delete value[key];
        Object.assign(value, merged);
        snapshots.set(value, clone(merged));
        snapshotRevisions.set(value, revision);
        lastKnownRevision = revision;
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });
    localWrites = operation;
    return operation;
  }

  async function checkpointHistory(taskId, limit = 30) {
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const result = await pool.query(
      'SELECT checkpoint_id, state_revision, checkpoint_json, created_at FROM daymark_checkpoint_history WHERE task_id = $1 ORDER BY created_at DESC LIMIT $2',
      [String(taskId), boundedLimit],
    );
    return result.rows;
  }

  return { read, write, checkpointHistory, close: () => pool.end() };
}
