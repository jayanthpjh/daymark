import { describe, expect, it } from 'vitest';
import { applicationRows, needsYou } from '../derive';
import { applicationPresentationModel } from '../application-model';

const job = { id: 'capital-one', company: 'Capital One', role: 'Data Engineer 4', tags: [], location: 'Plano, TX', match: 64 };
const loginTask = {
  id: 'capital-one-fill', type: 'fill', jobId: job.id, status: 'needs_you', stage: 'Sign in to continue',
  message: 'The saved password was not accepted. Complete password recovery in Chrome, then continue.',
  updatedAt: '2026-10-19T10:00:00Z', checkpoint: { id: 'capital-one-login', pauseReason: 'entry' },
  reviewState: { kind: 'authentication_required' },
};

describe('application pipeline', () => {
  it('routes sign-in and recovery checkpoints to the application workspace with their actual next step', () => {
    const item = needsYou({ jobs: [job], tasks: [loginTask], applications: [] })[0];
    expect(item.href).toBe(`/applications/${job.id}`);
    expect(item.detail).toMatch(/password recovery/i);
  });

  it('keeps answer checkpoints in the question inbox', () => {
    const task = { ...loginTask, message: 'Work authorization needs your answer.', checkpoint: { id: 'capital-one-answers', pauseReason: 'answers', unresolvedIds: ['work-authorization'] }, reviewState: { kind: 'answers_needed' } };
    const item = needsYou({ jobs: [job], tasks: [task], applications: [] })[0];
    expect(item.href).toBe('/questions');
    expect(item.detail).toMatch(/answer/i);
  });

  it('labels the application next action as sign-in recovery rather than answer questions', () => {
    const state = {
      jobs: [job], applications: [{ id: 'capital-one-app', jobId: job.id, status: 'in_progress', updatedAt: '2026-10-18T10:00:00Z' }],
      tasks: [
        { ...loginTask, type: 'prepare', status: 'completed', hasArtifacts: true, reviewPolicy: 'final', review: { approvalStatus: 'needs_review' }, id: 'capital-one-prepare' },
        { ...loginTask, parentTaskId: 'capital-one-prepare' },
      ],
    };
    expect(applicationRows(state)[0].next).toMatch(/sign in/i);
  });

  it('does not surface a resume review action after the user marks the application not applied', () => {
    const state = {
      jobs: [job], applications: [{ id: 'capital-one-app', jobId: job.id, status: 'not_started' }],
      tasks: [{ ...loginTask, status: 'paused' }, { ...loginTask, type: 'prepare', status: 'completed', hasArtifacts: true, id: 'capital-one-prepare' }],
    };
    expect(applicationRows(state)[0].next).toBe('—');
    const presentation = applicationPresentationModel(state.tasks, job.id, 'not_started');
    expect(presentation.current.title).toBe('Not applied');
    expect(presentation.current.message).toMatch(/processing stopped/i);
  });

  it('does not show queued orchestration details or stale review actions for cancelled work', () => {
    const state = {
      jobs: [job], applications: [],
      tasks: [{ ...loginTask, status: 'cancelled', orchestration: { state: 'queued' } }],
    };
    expect(applicationRows(state)[0].next).toBe('—');
    const presentation = applicationPresentationModel(state.tasks, job.id, 'cancelled');
    expect(presentation.current.title).toBe('Cancelled');
    expect(presentation.current.message).toMatch(/stay stopped/i);
  });

  it('keeps a submitted disposition from inheriting an old cancelled-task message', () => {
    const presentation = applicationPresentationModel([{ ...loginTask, status: 'cancelled', message: 'Cancelled by you.' }], job.id, 'submitted');
    expect(presentation.current.title).toBe('Application submitted');
    expect(presentation.current.message).toMatch(/marked as applied \/ submitted by you/i);
  });
});
