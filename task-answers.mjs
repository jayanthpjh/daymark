export function canApplyCheckpointAnswers(task, handoffTaskId) {
  if (task?.status !== 'needs_you') return false;
  if (!handoffTaskId) return true;
  return handoffTaskId === task.id && Boolean(task.manualHandoff || task.watchBrowser);
}
