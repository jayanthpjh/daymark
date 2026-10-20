/** Serializes collection task creation so HTTP, assistant, and scheduled starts cannot race. */
export function createCollectionTaskGate({ readState, createTask }) {
  let pending = Promise.resolve();

  return function startCollection(values, shouldCreate = async () => true) {
    const result = pending.then(async () => {
      const state = await readState();
      const active = (state.tasks || []).find(task =>
        task.type === 'collect' && ['queued', 'running'].includes(task.status),
      );
      if (active) return { task: active, created: false, alreadyRunning: true };
      if (!(await shouldCreate(state))) return { task: null, created: false, alreadyRunning: false };
      return { task: await createTask('collect', values), created: true, alreadyRunning: false };
    });

    pending = result.then(() => undefined, () => undefined);
    return result;
  };
}
