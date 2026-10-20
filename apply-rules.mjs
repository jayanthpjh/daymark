// Find stage: decide which collected roles the agent applies to on its own, and which it skips and why.
import { compensationForJob } from './public/workflow.js';

export const defaultAutoApply = { enabled: true, minMatch: 70, dailyCap: 10, maxAgeDays: 7 };
// Collection cadence in minutes (0 = off, otherwise 15 to 1440) and the oldest posting kept, by its posted date (0 = no limit).
export const defaultJobPulling = { scheduleMinutes: 60, maxAgeDays: 60 };
export const defaultSkipRules = { clearance: true, minSalary: 0, excludedCompanies: [], excludedTitles: [], remoteOnly: false };

const CLEARANCE = /(?:security|secret|top secret|ts\/sci|public trust)[^.\n]{0,40}clearance|clearance[^.\n]{0,40}(?:required|active|must|obtain|eligib|ts\/sci|top secret|secret)|\bts\/sci\b|active (?:secret|top secret|ts) /i;
const list = value => (Array.isArray(value) ? value : String(value || '').split(/[,\n]/)).map(item => String(item).trim()).filter(Boolean);

export function normalizePreferences(prefs = {}) {
  const auto = { ...defaultAutoApply, ...(prefs.autoApply || {}) };
  const rules = { ...defaultSkipRules, ...(prefs.skipRules || {}) };
  const pulling = { ...defaultJobPulling, ...(prefs.jobPulling || {}) };
  const minutes = Math.round(Number(pulling.scheduleMinutes));
  const age = Math.round(Number(pulling.maxAgeDays));
  return {
    jobPulling: { scheduleMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(1440, Math.max(15, minutes)) : 0, maxAgeDays: Number.isFinite(age) && age > 0 ? Math.min(365, age) : 0 },
    autoApply: { enabled: auto.enabled !== false, minMatch: Math.min(100, Math.max(0, Number(auto.minMatch) || 0)), dailyCap: Math.min(50, Math.max(0, Math.round(Number(auto.dailyCap) || 0))), maxAgeDays: Math.min(60, Math.max(1, Number(auto.maxAgeDays) || 7)) },
    skipRules: { clearance: rules.clearance !== false, minSalary: Math.max(0, Number(rules.minSalary) || 0), excludedCompanies: list(rules.excludedCompanies).slice(0, 50), excludedTitles: list(rules.excludedTitles).slice(0, 50), remoteOnly: rules.remoteOnly === true },
    defaults: { resumeMode: prefs.defaults?.resumeMode === 'default' ? 'default' : 'tailored', coverLetter: prefs.defaults?.coverLetter === 'off' ? 'off' : 'on', tailoringMode: ['strong', 'aggressive'].includes(prefs.defaults?.tailoringMode) ? prefs.defaults.tailoringMode : 'honest' },
  };
}

// Highest annual number in a pay string, or null when the posting gives none.
export function salaryCeiling(job) {
  const pay = compensationForJob(job);
  if (pay.source !== 'Company published base pay') return null;
  const numbers = [...String(pay.answer).matchAll(/\$?\s*(\d{1,3}(?:,\d{3})+|\d{4,7}|\d{2,3}(?=\s*k\b))(?:\.\d+)?\s*(k\b)?/gi)].map(m => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)).filter(n => n >= 10000);
  return numbers.length ? Math.max(...numbers) : null;
}

export function skipReason(job, rules) {
  const text = `${job.role || ''}\n${job.description || ''}`;
  if (rules.clearance && CLEARANCE.test(text)) return { rule: 'exclude clearance-required', reason: 'Role requires a security clearance' };
  const company = String(job.company || '').toLowerCase();
  const blockedCompany = rules.excludedCompanies.find(name => company.includes(name.toLowerCase()));
  if (blockedCompany) return { rule: 'excluded company', reason: `Company excluded (${blockedCompany})` };
  const role = String(job.role || '').toLowerCase();
  const blockedTitle = rules.excludedTitles.find(word => role.includes(word.toLowerCase()));
  if (blockedTitle) return { rule: 'excluded title', reason: `Title contains “${blockedTitle}”` };
  if (rules.minSalary > 0) { const top = salaryCeiling(job); if (top !== null && top < rules.minSalary) return { rule: 'minimum salary', reason: `Published pay tops out at $${top.toLocaleString('en-US')}` }; }
  if (rules.remoteOnly && !/remote/i.test(`${job.location || ''} ${job.description || ''}`)) return { rule: 'remote only', reason: 'Not a remote role' };
  return null;
}

const firstSeen = job => Date.parse(job.first_seen_at || job.posted || '') || 0;

// Picks roles to auto-apply (best matches first, within today's remaining cap) and roles to record as skipped.
export function planAutoApply(jobs, { prefs, tasks = [], applications = [], usedToday = 0, now = Date.now(), match = job => Number(job.match) || 0, canFill = () => true }) {
  const { autoApply, skipRules } = normalizePreferences(prefs);
  const handled = new Set([...tasks.filter(t => t.type !== 'collect').map(t => t.jobId), ...applications.map(a => a.jobId)]);
  const skip = [], candidates = [];
  if (!autoApply.enabled) return { apply: [], skip, remaining: 0 };
  for (const job of jobs) {
    if (job?.closedAt) continue; // the employer has taken it down
    if (!job?.id || handled.has(job.id) || job.historical) continue;
    if (now - firstSeen(job) > autoApply.maxAgeDays * 86400000) continue;
    const score = match(job);
    if (score < autoApply.minMatch) continue;
    const reason = skipReason(job, skipRules);
    if (reason) { skip.push({ job, ...reason }); continue; }
    if (!canFill(job)) continue;
    candidates.push({ job, score });
  }
  const remaining = Math.max(0, autoApply.dailyCap - usedToday);
  const apply = candidates.sort((a, b) => b.score - a.score || firstSeen(b.job) - firstSeen(a.job)).slice(0, remaining).map(item => item.job);
  return { apply, skip, remaining: remaining - apply.length };
}
