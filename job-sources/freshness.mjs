// Keeps the job feed honest between collections. Each poll of an employer board that completed and listed everything gives a
// snapshot of its open postings. A job missing from two snapshots in a row is marked closed (hidden, never deleted); a job that
// reappears is reopened. A failed, partial or truncated poll gives no snapshot, so it can never close anything.
import { parseBoardUrl, boardKey } from './schema.mjs';

export const MISSES_TO_CLOSE = 2;
export const CLOSED_REASON = 'No longer listed by the employer';

export function jobBoardKey(job) {
  if (job.ats && job.board) return `${job.ats}:${String(job.board).toLowerCase()}`;
  const board = parseBoardUrl(job.url);
  return board ? boardKey(board) : '';
}

/** Updates jobs in place. Returns what changed so the caller can report it. */
export function reconcileJobs(jobs, snapshots, now = new Date().toISOString()) {
  const result = { seen: 0, missed: 0, closed: [], reopened: [] };
  const sets = new Map(Object.entries(snapshots || {}).map(([key, snap]) => [key, new Set(snap?.ids || [])]));
  if (!sets.size) return result;
  for (const job of jobs) {
    // Only jobs this pipeline created from a board listing (ids made from the apply URL) can be judged by a listing.
    if (!String(job.id).startsWith('ats-')) continue;
    const snap = sets.get(jobBoardKey(job));
    if (!snap) continue;
    if (snap.has(job.id)) {
      job.last_seen_at = now; result.seen++;
      if (job.closedAt) result.reopened.push(job.id);
      delete job.closedAt; delete job.closedReason; job.missedPolls = 0;
      continue;
    }
    if (snap.size === 0) continue; // an empty list after a non-empty one is more likely an outage than 50 closures
    job.missedPolls = (job.missedPolls || 0) + 1; result.missed++;
    if (job.missedPolls >= MISSES_TO_CLOSE && !job.closedAt) { job.closedAt = now; job.closedReason = CLOSED_REASON; result.closed.push(job.id); }
  }
  return result;
}

export const isClosed = job => Boolean(job?.closedAt);
export const withinAge = (postedAt, maxAgeDays, now = Date.now()) => {
  if (!maxAgeDays) return true;
  const t = Date.parse(postedAt || '');
  return !Number.isFinite(t) || t >= now - maxAgeDays * 86_400_000; // an undated posting is kept and shown as undated
};
