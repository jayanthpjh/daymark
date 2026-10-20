export function nextRunnableTask(tasks, { activeTasks = 0, applicationActive = false, collectionActive = false, maxActive = 2 } = {}) {
  if (activeTasks >= maxActive) return null;
  const queued = (Array.isArray(tasks) ? tasks : []).filter(task => task?.status === 'queued');
  return queued.find(task => task.type !== 'collect' && !applicationActive)
    || queued.find(task => task.type === 'collect' && !collectionActive)
    || null;
}
