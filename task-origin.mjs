// Who asked for a task. An HTTP request leaves a context behind; a background path names itself with `createdBy`.
// Stored on the task and logged, so a task that appears on its own can be traced.
export function taskOrigin(values = {}, ctx = null) {
  const named = typeof values.createdBy === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(values.createdBy) ? values.createdBy : '';
  const createdBy = named || (ctx ? 'http' : 'background');
  const createdVia = ctx ? { method: String(ctx.method || '').slice(0, 8), path: String(ctx.path || '').slice(0, 120), origin: String(ctx.origin || '').slice(0, 80), agent: String(ctx.agent || '').slice(0, 80) } : null;
  return { createdBy, createdVia };
}

export const describeOrigin = ({ createdBy, createdVia }) => `${createdBy}${createdVia ? ` via ${createdVia.method} ${createdVia.path}` : ''}`;
