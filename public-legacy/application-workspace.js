import { applicationRun, runActivity, displayTaskMessage } from './application-model.js';

export function workspaceModel(state, jobId) {
  const run = applicationRun(state.tasks || [], jobId);
  const fill = run.fill, task = run.current;
  const record = (state.applications || []).find(a => a.jobId === jobId || a.id === jobId);
  const job = (state.jobs || []).find(j => j.id === jobId) || record || task || {};
  const mailConfirmed=record?.status==='submitted'&&!record.manuallyUpdated&&record.statusHistory?.some(event=>event.after==='submitted'&&event.source==='mail');
  const confirmed = fill?.submissionOutcome === 'confirmed'||Boolean(mailConfirmed);
  const recorded = !confirmed && record?.status === 'submitted';
  const closed = confirmed || recorded || Boolean(record?.manuallyUpdated && !['in_progress', 'filled'].includes(record.status));
  const uncertain = !closed && (fill?.submissionOutcome === 'uncertain' || Boolean(fill?.submitAttemptedAt));
  const auth = fill?.authStatus === 'authenticated';
  const needsAccount = !closed && Boolean(fill && !auth && !uncertain);
  const reviewing = !closed && !uncertain && !needsAccount && fill?.finalReviewReady;
  const failed = !closed && task?.status === 'failed';
  const active = !closed && ['queued', 'running'].includes(task?.status);
  let title = confirmed ? 'Application submitted' : recorded ? 'Recorded as submitted' : closed ? (record?.status==='skipped'?'Application skipped':'Application closed')
    : uncertain ? 'Submission unconfirmed' : needsAccount ? 'Sign in to continue' : reviewing ? 'Review before submission'
      : failed ? 'Application needs attention' : task?.status === 'queued' ? 'Queued for processing'
        : task?.type === 'prepare' && !run.prepare?.hasArtifacts ? 'Preparing your resume'
          : task?.stage || 'Application ready to prepare';
  const phase = closed ? 4 : uncertain ? 3 : reviewing ? 3 : fill ? 2 : run.prepare?.hasArtifacts ? 2 : task?.status === 'queued' ? 0 : 1;
  const tone = confirmed ? 'success' : closed ? 'neutral' : uncertain || needsAccount || failed || task?.status === 'needs_you' ? 'warning' : active ? 'active' : 'neutral';
  const message = confirmed ? (mailConfirmed?'A matched employer email confirmed receipt. Your application is saved in the tracker.':'The employer confirmed receipt. Your application is saved in the tracker.')
    : recorded ? 'Recorded in your tracker after completing the employer form. The worker did not verify this receipt.'
      : closed ? 'Your recorded outcome is preserved. Automatic processing has stopped.'
        : uncertain ? 'A submit attempt has no verified receipt. Check the employer page or inbox before allowing another attempt.'
          : needsAccount ? 'Sign into this employer ATS in the saved worker session. Your visible browser has a separate session.'
            : reviewing ? 'Check the answers and resume. Nothing is sent until you explicitly approve submission.'
              : displayTaskMessage(task?.message || 'Choose a role to start. Daymark records each step here.');
  return { ...run, job, record, title, message, phase, tone, confirmed, recorded, closed, uncertain, active, needsAccount,
    account: closed ? 'Historical application' : auth ? 'Account verified' : 'Sign-in required',
    canSubmit: Boolean(!state.workspaceDraftDirty && !closed && !uncertain && auth && run.approved && fill?.finalReviewReady && fill.status === 'needs_you'),
    canRetry: Boolean(!closed && !uncertain && task && ['failed', 'paused', 'needs_you'].includes(task.status) && !fill?.finalReviewReady),
    events: runActivity(state.tasks || [], jobId).slice(0, 20),
  };
}

export function applicationBucket(state, job) {
  const m = workspaceModel(state, job.id);
  if (m.confirmed || m.record?.status === 'submitted') return 'submitted';
  if (m.record?.status === 'skipped') return 'skipped';
  if (m.current?.status === 'failed' || m.record?.status === 'failed') return 'failed';
  if (m.uncertain || ['needs_you', 'paused', 'ready_for_review'].includes(m.current?.status)) return 'needs_you';
  if (['queued', 'running'].includes(m.current?.status)) return 'in_flight';
  return m.record?.status || 'not_started';
}

export function workspaceStatus(m, { esc, svg, relativeDate }) {
  const labels = ['Queued', 'Prepare', 'Apply', 'Review & receipt'];
  const events = m.events.map(e => `<li><span class="ws-event-dot" aria-hidden="true"></span><div><p>${esc(displayTaskMessage(e.message || e.status))}</p><time>${esc(relativeDate(e.at))}</time></div></li>`).join('');
  return `<div class="ws-current ${m.tone}" role="status"><span class="ws-status-dot" aria-hidden="true"></span><span>${esc(m.title)}</span><details class="ws-activity"><summary>Activity log</summary><ol>${events || '<li>No activity recorded yet.</li>'}</ol></details></div><section class="ws-progress" aria-label="Application progress"><div><strong>${esc(m.title)}</strong><span>${m.phase} / 4</span></div><ol>${labels.map((label, i) => `<li class="${i < m.phase ? 'complete' : i === m.phase ? 'current' : ''}"><span></span><small>${label}</small></li>`).join('')}</ol></section><div class="ws-next ${m.tone}"><div><strong>${esc(m.title)}</strong><p>${esc(m.message)}</p></div><div class="ws-next-actions">${m.canSubmit ? `<button class="primary-button" data-submit-task="${esc(m.fill.id)}">Approve & submit ${svg('arrow')}</button>` : !m.closed && m.fill?.finalReviewReady && !m.uncertain ? '<button class="primary-button" data-workspace-pane="resume">Review resume</button>' : m.needsAccount ? '' : ''}${m.canRetry ? `<button class="secondary-button" data-task-action="resume" data-id="${esc(m.current.id)}">${m.current.status === 'failed' ? 'Retry this step' : 'Continue processing'}</button>` : ''}${!m.closed && m.fill ? `<button class="${m.canSubmit ? 'text-button' : 'secondary-button'}" data-handoff="open" data-task="${esc(m.fill.id)}">Open employer session ↗</button>` : ''}</div></div><div class="ws-policy"><span>${svg('user')} ${esc(m.account)}</span><span>${svg('check')} Your approval required</span><span>${svg('file')} Verified resume only</span></div>`;
}

export function workspaceReceipt(m, { esc, svg }) {
  const steps = m.fill?.filledSteps || [];
  const receipt = m.fill?.receipt;
  const sources = {profile:'Profile',you:'Confirmed by you',library:'Saved answer',ai:'AI draft · review required',autofill:'Employer autofill'};
  const rows = steps.length ? steps.map(step => `<section class="ws-form-section"><header><h3>${esc(step.step)}</h3><span>${step.answers.length} fields</span></header><dl>${step.answers.map(a => `<div><dt>${esc(a.label)}</dt><dd>${esc(a.value || 'Not answered')}<small>${esc(sources[a.source] || a.source || 'Recorded answer')}</small></dd></div>`).join('')}</dl></section>`).join('')
    : `<div class="ws-empty">${svg('file')}<h3>${m.closed ? 'No form receipt saved' : 'Your form answers will appear here'}</h3><p>${m.closed ? 'This historical application has no captured field-level answers.' : 'Daymark first verifies the ATS account, then records the fields it fills. Missing answers stay visible for your review.'}</p></div>`;
  return `<div class="ws-pane-heading"><div><h2>Application form</h2><p>${m.closed ? 'Saved answers for this application.' : 'Review what Daymark has entered, with the source of each answer.'}</p></div>${receipt ? `<span>${Number(receipt.filled) || 0} filled · ${receipt.skipped?.length || 0} skipped</span>` : ''}</div>${rows}`;
}
