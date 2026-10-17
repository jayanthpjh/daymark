// Track stage: attach recruiter mail to the right application and move its status forward, never backward.

const SUFFIX = /\b(?:company|co|corporation|corp|incorporated|inc|llc|l\.l\.c|lp|llp|ltd|limited|plc|holdings|the)\b\.?/gi;
export function companyPhrases(company = '') {
  const words = String(company).toLowerCase().replace(/^\d+\s+/, '').replace(SUFFIX, ' ').replace(/[^a-z0-9& ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const phrases = new Set([words.join(' ')]);
  if (words.length >= 2) phrases.add(words.slice(0, 2).join(' '));
  if (words.length === 1 || words[0].length >= 7) phrases.add(words[0]);
  return [...phrases].filter(p => p.length >= 4);
}
const domainOf = address => String(address || '').toLowerCase().split('@')[1] || '';
const hostOf = url => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
const workdayTenant = host => host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/)?.[1] || '';

export function scoreMessage(mail, app, job = {}) {
  const sender = domainOf(mail.senderAddress || mail.from?.match(/<([^>]+)>/)?.[1] || mail.from);
  const subject = String(mail.subject || '').toLowerCase();
  const body = String(mail.text || '').slice(0, 20000).toLowerCase();
  const phrases = companyPhrases(app.company || job.company);
  let score = 0; const why = [];
  const compactSender = sender.replace(/[^a-z0-9]/g, '');
  if (phrases.some(p => compactSender.includes(p.replace(/[^a-z0-9]/g, '')))) { score += 0.6; why.push('sender domain'); }
  const host = hostOf(job.url || app.url);
  const tenant = workdayTenant(host);
  if (host && sender && (host === sender || host.endsWith('.' + sender) || sender.endsWith('.' + host))) { score += 0.5; why.push('career site domain'); }
  if (mail.categories?.includes('Verification') && /(^|\.)greenhouse-mail\.io$/i.test(sender) && (/greenhouse\.io$/i.test(host) || /greenhouse/i.test(app.source || job.source || '')) && phrases.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(subject))) { score += 0.25; why.push('Greenhouse verification naming employer'); }
  if (tenant && /workday/.test(sender) && (subject + body).includes(tenant)) { score += 0.3; why.push('workday tenant'); }
  if (phrases.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(subject))) { score += 0.4; why.push('company in subject'); }
  else if (phrases.some(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body))) { score += 0.25; why.push('company in body'); }
  const role = String(app.role || job.role || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
  if (role.length >= 6 && (subject.includes(role) || body.includes(role))) { score += 0.3; why.push('role title'); }
  return { score: Math.min(1, score), why };
}

// Returns the single confident match, or null when no application or more than one fits.
export function routeMessage(mail, applications = [], jobs = [], { expectedRecipient = '', addressDomain = '' } = {}) {
  const recipients = Array.isArray(mail.recipients) ? mail.recipients.map(value => String(value).toLowerCase()) : [];
  // A message sent to an application's own address belongs to that application, whatever its text says.
  const direct = applications.find(app => app.mailAddress && recipients.includes(String(app.mailAddress).toLowerCase()));
  if (direct) return { applicationId: direct.id, jobId: direct.jobId, confidence: 1, why: ['application address'] };
  const ownDomain = addressDomain && recipients.some(item => item.endsWith('@' + String(addressDomain).toLowerCase()));
  if (!ownDomain && expectedRecipient && recipients.length && !recipients.includes(String(expectedRecipient).toLowerCase())) return null;
  const ranked = applications.filter(app => app.status !== 'skipped').map(app => ({ app, ...scoreMessage(mail, app, jobs.find(job => job.id === app.jobId)) })).sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score < 0.6) return null;
  if (second && best.score - second.score < 0.2) return null;
  return { applicationId: best.app.id, jobId: best.app.jobId, confidence: Number(best.score.toFixed(2)), why: best.why };
}

const RANK = { skipped: 0, not_started: 0, in_progress: 1, filled: 1, failed: 1, unconfirmed: 2, submitted: 3, screening: 4, interview: 5, offer: 6, rejected: 7, withdrawn: 7 };
const FROM_CATEGORY = { 'Application confirmation': 'submitted', Screening: 'screening', Interview: 'interview', Offer: 'offer', Rejection: 'rejected', Assessment: 'screening' };

// Status a routed message implies, or null when it should not change anything.
export function statusFromMail(categories = [], current = 'not_started') {
  const wanted = ['Offer', 'Interview', 'Screening', 'Assessment', 'Rejection', 'Application confirmation'].map(c => categories.includes(c) ? FROM_CATEGORY[c] : null).find(Boolean);
  if (!wanted || wanted === current) return null;
  if ((RANK[current] ?? 0) >= 7) return null;
  if (wanted === 'rejected') return wanted;
  return (RANK[wanted] ?? 0) > (RANK[current] ?? 0) ? wanted : null;
}
export const needsYouCategories = ['Screening', 'Interview', 'Assessment', 'Offer'];

export function markVerificationCheckpoint(state, mail, applicationId) {
  const text = String(mail?.text || '');
  if (!mail?.verificationCode || !mail.categories?.includes('Verification') || !/resubmit your application|enter (?:the )?(?:security )?code/i.test(text)) return false;
  const expectedRecipient = String(state.profile?.email || '').toLowerCase();
  const recipients = Array.isArray(mail.recipients) ? mail.recipients.map(value => String(value).toLowerCase()) : [];
  const receivedAt = Date.parse(mail.receivedAt || '');
  if (!expectedRecipient || !recipients.includes(expectedRecipient) || !Number.isFinite(receivedAt)) return false;
  const application = state.applications?.find(item => item.id === applicationId);
  if (!application || application.status !== 'unconfirmed' || application.manuallyUpdated) return false;
  const task = (state.tasks || [])
    .filter(item => {
      if (item.type !== 'fill' || item.jobId !== application.jobId || !item.submitAttemptedAt || item.submittedAt) return false;
      const attemptedAt = Date.parse(item.submitAttemptedAt);
      return Number.isFinite(attemptedAt) && receivedAt >= attemptedAt - 30_000;
    })
    .sort((left, right) => String(right.submitAttemptedAt).localeCompare(String(left.submitAttemptedAt)))[0];
  if (!task) return false;
  if (task.stage === 'Needs verification' && task.verificationMessageId === mail.id) return false;

  const at = mail.date || new Date().toISOString();
  task.status = 'needs_you';
  task.stage = 'Needs verification';
  task.submissionOutcome = 'verification_required';
  task.verificationMessageId = mail.id;
  task.checkpoint ||= {};
  task.checkpoint.pauseReason = 'verification';
  task.message = 'The employer sent a security code and requires verification before the application can be submitted. Open Inbox, then resolve this step in the saved application session.';
  task.activity ||= [];
  task.activity.unshift({ at, status: 'needs_you', message: task.message });
  task.activity = task.activity.slice(0, 80);
  return true;
}
