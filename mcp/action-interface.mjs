import { createMcpIdempotency, McpIdempotencyError } from './idempotency.mjs';

const text = value => ({ type: 'text', text: String(value) });
const keySchema = { type: 'string', minLength: 16, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' };

export const MCP_ACTION_TOOLS = Object.freeze([
  { name: 'daymark_add_job_link', description: 'Save a public job posting in Daymark. The URL is fetched using Daymark’s existing safe import checks.', inputSchema: { type: 'object', properties: { url: { type: 'string', minLength: 8, maxLength: 2000 }, idempotencyKey: keySchema }, required: ['url', 'idempotencyKey'], additionalProperties: false } },
  { name: 'daymark_prepare_application', description: 'Queue source-backed resume and cover-letter preparation. Daymark applies its factual review gates; this does not fill or submit an employer form.', inputSchema: { type: 'object', properties: { jobId: { type: 'string', minLength: 1, maxLength: 120 }, tailoringMode: { type: 'string', enum: ['honest', 'strong'] }, idempotencyKey: keySchema }, required: ['jobId', 'idempotencyKey'], additionalProperties: false } },
  { name: 'daymark_request_application_fill', description: 'Ask Daymark to create an applicant approval card to fill a prepared employer form. The applicant must approve it in Daymark. This tool cannot fill or submit directly.', inputSchema: { type: 'object', properties: { jobId: { type: 'string', minLength: 1, maxLength: 120 }, idempotencyKey: keySchema }, required: ['jobId', 'idempotencyKey'], additionalProperties: false } },
  { name: 'daymark_draft_question_answer', description: 'Save a proposed answer for an open employer question as an applicant approval card. Daymark rejects consent, agreement, credential and verification questions; the answer is not sent until you approve it in Daymark.', inputSchema: { type: 'object', properties: { questionId: { type: 'string', minLength: 1, maxLength: 120 }, answer: { type: 'string', minLength: 1, maxLength: 4000 }, idempotencyKey: keySchema }, required: ['questionId', 'answer', 'idempotencyKey'], additionalProperties: false } },
]);

function validate(tool, args) {
  const schema = tool.inputSchema;
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(schema.properties, key))) throw new Error('Unexpected or invalid tool arguments.');
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key];
    if (rule.type === 'string' && (typeof value !== 'string' || value.length > (rule.maxLength || 1000) || (rule.minLength && value.length < rule.minLength) || (rule.pattern && !new RegExp(rule.pattern).test(value)) || (rule.enum && !rule.enum.includes(value)))) throw new Error(`Invalid ${key}.`);
  }
  for (const key of schema.required) if (!(key in args)) throw new Error(`Missing ${key}.`);
}

export function createMcpActionInterface({ readInterface, store, actions, approvalLedger } = {}) {
  const idempotency = store ? createMcpIdempotency({ store }) : null;
  const allTools = Object.freeze([...(readInterface?.tools || []), ...MCP_ACTION_TOOLS]);
  return {
    tools: allTools,
    async call(name, args = {}) {
      const tool = allTools.find(item => item.name === name);
      if (!tool) throw new Error('Unknown Daymark MCP tool.');
      try { validate(tool, args); }
      catch (error) { throw error; }
      if (!MCP_ACTION_TOOLS.some(item => item.name === name)) return readInterface.call(name, args);
      if (!idempotency) return { content: [text('Daymark could not queue this request.')], isError: true };
      try {
        const input = { ...args };
        delete input.idempotencyKey;
        const result = await idempotency.run({ key: args.idempotencyKey, operation: name, input, execute: async () => {
          if (name === 'daymark_add_job_link') {
            const saved = await actions.change.add_job_link({ url: args.url });
            return { jobId: saved.job.id, company: saved.job.company, role: saved.job.role, status: 'saved' };
          }
          if (name === 'daymark_prepare_application') {
            const queued = await actions.change.prepare_application({ jobId: args.jobId, ...(args.tailoringMode ? { tailoringMode: args.tailoringMode } : {}) });
            return { status: queued.status, taskId: queued.taskId, company: queued.company, role: queued.role };
          }
          if (name === 'daymark_draft_question_answer') {
            const card = await actions.approve.answer_question.check({ questionId: args.questionId, value: args.answer });
            if (card.error) throw new Error(card.error);
            const approval = await approvalLedger.propose({ name: 'answer_question', args: { questionId: args.questionId, value: args.answer }, summary: card.summary, binding: card.binding });
            return { approvalId: approval.id, status: approval.status, nextStep: 'Review and approve this answer in Daymark.' };
          }
          const card = await actions.approve.fill_application.check({ jobId: args.jobId });
          if (card.error) throw new Error(card.error);
          const approval = await approvalLedger.propose({ name: 'fill_application', args: { jobId: args.jobId }, summary: card.summary, binding: card.binding });
          return { approvalId: approval.id, status: approval.status, summary: approval.summary, nextStep: 'Review and approve this request in Daymark.' };
        } });
        const failed = result?.status === 'failed';
        return { content: [text(JSON.stringify(result))], structuredContent: result, isError: failed };
      } catch (error) {
        if (error instanceof McpIdempotencyError) return { content: [text(error.message)], isError: true };
        return { content: [text('Daymark could not queue this request.')], isError: true };
      }
    },
  };
}
