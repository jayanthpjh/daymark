// Company/board registry. No seed list: boards arrive from discovery (Common Crawl, SearXNG, link harvesting)
// and are verified once against their ATS API. Stores: in-memory, JSON file, or Postgres (same interface).
import fs from 'node:fs/promises';
import path from 'node:path';
import { boardKey, boardFromKey } from './schema.mjs';

export const HOUR = 3_600_000, DAY = 24 * HOUR;
export const TIERS = Object.freeze({ hot: 2 * HOUR, daily: DAY, weekly: 7 * DAY, parked: 30 * DAY });
export const PARK_AFTER_MS = 60 * DAY;

export function newRecord(board, via, now = Date.now()) {
  return {
    key: boardKey(board), ats: board.ats, token: String(board.token).toLowerCase(), host: board.host || null, company: board.company || null,
    status: 'new', tier: 'daily', discoveredVia: via, firstSeenAt: now, lastPolledAt: 0, nextPollAt: now, lastMatchAt: 0, lastOkAt: 0,
    jobCount: 0, matchCount: 0, failures: 0, lastError: '', verifiedAt: 0,
  };
}

/** Pure scheduling rule applied after each poll. `matchCount` = postings fitting the user's roles. */
export function afterPoll(record, { ok, jobCount = 0, matchCount = 0, error = '', status: httpStatus }, now = Date.now()) {
  const r = { ...record, lastPolledAt: now };
  if (!ok) {
    r.failures = (record.failures || 0) + 1;
    r.lastError = String(error).slice(0, 200);
    const gone = httpStatus === 404 || httpStatus === 410;
    if (gone && !record.verifiedAt) { r.status = 'dead'; r.tier = 'parked'; r.nextPollAt = now + 90 * DAY; return r; } // never worked: drop for good measure
    if (gone || r.failures >= 5) { r.status = 'dead'; r.tier = 'parked'; r.nextPollAt = now + 30 * DAY; return r; }
    r.nextPollAt = now + Math.min(DAY, HOUR * 2 ** r.failures); // backoff
    return r;
  }
  r.failures = 0; r.lastError = ''; r.lastOkAt = now; r.jobCount = jobCount; r.matchCount = matchCount;
  if (!record.verifiedAt) {
    r.verifiedAt = now;
    if (jobCount === 0) { r.status = 'dead'; r.tier = 'parked'; r.nextPollAt = now + 90 * DAY; return r; } // empty board: dropped
  }
  r.status = 'active';
  if (matchCount > 0) { r.lastMatchAt = now; r.tier = 'hot'; }
  else {
    const since = now - (r.lastMatchAt || r.firstSeenAt);
    r.tier = since >= PARK_AFTER_MS ? 'parked' : r.lastMatchAt && since < 7 * DAY ? 'hot' : since >= 7 * DAY ? 'weekly' : 'daily';
    if (r.tier === 'parked') r.status = 'parked';
  }
  r.nextPollAt = now + TIERS[r.tier];
  return r;
}

export class Registry {
  constructor(store, { now = Date.now } = {}) { this.store = store; this.now = now; }
  async init() { await this.store.init?.(); return this; }
  get(key) { return this.store.get(key); }
  async all() { return (await this.store.all()).filter(r => !r.key.startsWith('meta:')); }
  async meta(name) { return (await this.store.get(`meta:${name}`)) ?? {}; }
  async setMeta(name, value) { await this.store.put({ key: `meta:${name}`, ats: 'meta', tier: 'parked', status: 'meta', nextPollAt: Number.MAX_SAFE_INTEGER, ...value }); await this.store.flush?.(); }
  /** Add boards not yet known. Returns the records that were new. */
  async add(boards, via) {
    const fresh = [], now = this.now();
    for (const board of boards) {
      const key = boardKey(board);
      const existing = await this.store.get(key);
      if (existing) { if (!existing.company && board.company) await this.store.put({ ...existing, company: board.company }); continue; }
      const record = newRecord(board, via, now);
      await this.store.put(record);
      fresh.push(record);
    }
    await this.store.flush?.();
    return fresh;
  }
  async due({ limit = 500 } = {}) {
    const now = this.now();
    const rows = (await this.all()).filter(r => r.nextPollAt <= now);
    const rank = { new: 0, hot: 1, daily: 2, weekly: 3, parked: 4 };
    rows.sort((a, b) => (a.status === 'new' ? 0 : rank[a.tier]) - (b.status === 'new' ? 0 : rank[b.tier]) || a.nextPollAt - b.nextPollAt);
    // Take boards in turns across ATS types, so a cap never fills up with whichever ATS was discovered first.
    const byAts = new Map();
    for (const row of rows) { const list = byAts.get(row.ats) || byAts.set(row.ats, []).get(row.ats); list.push(row); }
    const lanes = [...byAts.values()], picked = [];
    for (let i = 0; picked.length < limit && lanes.some(lane => i < lane.length); i++) for (const lane of lanes) if (i < lane.length && picked.length < limit) picked.push(lane[i]);
    return picked;
  }
  async recordPoll(record, result) { const next = afterPoll(record, result, this.now()); await this.store.put(next); return next; }
  async stats() {
    const out = { total: 0, byTier: {}, byStatus: {}, byAts: {} };
    for (const r of await this.all()) { out.total++; out.byTier[r.tier] = (out.byTier[r.tier] || 0) + 1; out.byStatus[r.status] = (out.byStatus[r.status] || 0) + 1; out.byAts[r.ats] = (out.byAts[r.ats] || 0) + 1; }
    return out;
  }
  async flush() { await this.store.flush?.(); }
}

export class MemoryStore {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key) ?? null; }
  async put(record) { this.map.set(record.key, record); }
  async all() { return [...this.map.values()]; }
}

/** Atomic JSON file store; writes are batched until flush(). Plenty for tens of thousands of boards. */
export class JsonFileStore extends MemoryStore {
  constructor(file) { super(); this.file = file; this.dirty = false; }
  async init() {
    try { for (const r of JSON.parse(await fs.readFile(this.file, 'utf8')).boards ?? []) this.map.set(r.key, r); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`Job board registry at ${this.file} is unreadable; it was left untouched.`, { cause: error }); }
  }
  async put(record) { await super.put(record); this.dirty = true; }
  async flush() {
    if (!this.dirty) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ version: 1, boards: [...this.map.values()] }), { mode: 0o600 });
    await fs.rename(tmp, this.file);
    this.dirty = false;
  }
}

/** Postgres store: one row per board, the full record in jsonb. `pool` is a pg Pool (or compatible). */
export class PostgresStore {
  constructor(pool, table = 'daymark_job_boards') { this.pool = pool; this.table = /^[a-z_][a-z0-9_]*$/.test(table) ? table : 'daymark_job_boards'; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (board_key text PRIMARY KEY, ats text NOT NULL, tier text NOT NULL, status text NOT NULL, next_poll_at timestamptz NOT NULL, record jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.table}_due ON ${this.table} (next_poll_at)`);
  }
  async get(key) { const { rows } = await this.pool.query(`SELECT record FROM ${this.table} WHERE board_key = $1`, [key]); return rows[0]?.record ?? null; }
  async put(r) {
    await this.pool.query(
      `INSERT INTO ${this.table} (board_key, ats, tier, status, next_poll_at, record, updated_at) VALUES ($1,$2,$3,$4,to_timestamp($5/1000.0),$6::jsonb,now())
       ON CONFLICT (board_key) DO UPDATE SET tier=EXCLUDED.tier, status=EXCLUDED.status, next_poll_at=EXCLUDED.next_poll_at, record=EXCLUDED.record, updated_at=now()`,
      [r.key, r.ats, r.tier, r.status, r.nextPollAt, JSON.stringify(r)]);
  }
  async all() { const { rows } = await this.pool.query(`SELECT record FROM ${this.table}`); return rows.map(x => x.record); }
}

export { boardFromKey };
