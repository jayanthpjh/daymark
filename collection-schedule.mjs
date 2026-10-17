// When should the next automatic job collection start? Pure, so it can be tested without a clock or a server.
import { normalizePreferences } from './apply-rules.mjs';

export function collectionIntervalMinutes(state, env = process.env) {
  const override = Number(env.DAYMARK_ATS_POLL_MINUTES);
  return override > 0 ? Math.max(15, override) : normalizePreferences(state?.preferences).jobPulling.scheduleMinutes;
}

export function scheduledCollectionDue(state, { now = Date.now(), env = process.env } = {}) {
  const minutes = collectionIntervalMinutes(state, env);
  if (!minutes || !String(state?.profile?.roleSearch || '').trim()) return false;
  const tasks = state?.tasks || [];
  if (tasks.some(task => task.type === 'collect' && ['queued', 'running'].includes(task.status))) return false;
  // A failed collection never sets lastAtsCollection, so its start time also counts: a broken source is retried at the normal pace.
  const lastTask = tasks.filter(task => task.type === 'collect').reduce((max, task) => Math.max(max, Date.parse(task.createdAt) || 0), 0);
  const last = Math.max(Date.parse(state?.lastAtsCollection) || 0, lastTask);
  return now - last >= minutes * 60_000;
}
