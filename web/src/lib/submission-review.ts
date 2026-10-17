const labelKey = (label: string) => String(label || '').replace(/\*/g, '').trim().toLowerCase();
export function reviewAnswers(fill: any) {
  const rows: any[] = [];
  for (const step of fill?.filledSteps || []) for (const answer of step.answers || []) {
    if (answer.label && !/password|security code|one.time code/i.test(answer.label)) rows.push({ ...answer, step: step.step, key: `${step.step}:${labelKey(answer.label)}` });
  }
  for (const question of fill?.checkpoint?.questions || []) {
    if (!question.label || /password|security code|one.time code/i.test(question.label)) continue;
    const existing = [...rows].reverse().find(row => labelKey(row.label) === labelKey(question.label));
    const value = { ...question, step: fill.checkpoint.step || 'Current step', key: question.id, editable: !question.manual && !['file','password'].includes(question.type) && question.id };
    if (existing) Object.assign(existing, value); else rows.push(value);
  }
  // Legacy records sometimes contain objects here; strings are field names, never answers.
  if (!rows.length) for (const field of fill?.fieldsFilled || []) if (typeof field === 'object' && field.label) rows.push({ ...field, key: field.label });
  return rows;
}
export async function reviewToken(fill: any, prepare: any) {
  const input = JSON.stringify([fill?.id, fill?.checkpoint, fill?.filledSteps, prepare?.id, prepare?.review?.resume, prepare?.review?.coverLetter, prepare?.review?.approvedAt, prepare?.review?.approvalStatus]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function recoveryAction(fill: any) {
  return fill?.submitAttemptedAt || fill?.submissionOutcome === 'uncertain'
    ? {label:'Check confirmation',section:'mail'}
    : {label:'Review next step',section:'form'};
}
