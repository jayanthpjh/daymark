const PARKABLE_STATUSES = new Set(['needs_you', 'failed', 'paused']);

export function parkManualHandoff(task, { now = new Date().toISOString() } = {}) {
  if (task?.type !== 'fill' || !PARKABLE_STATUSES.has(task.status)) return null;
  if (!task.checkpoint && !task.manualHandoff && !task.watchBrowser) return null;

  const message = 'Application put aside. Its checkpoint is saved; unsaved employer fields may need to be entered again when resumed.';
  return {
    ...task,
    manualHandoff: false,
    watchBrowser: false,
    message,
    updatedAt: now,
    activity: [...(task.activity || []), { status: task.status, message, progress: task.progress || 0, at: now }],
  };
}
