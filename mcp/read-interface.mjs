// Read-only MCP tool catalogue. Implemented separately from the transport so stdio
// and Streamable HTTP expose exactly the same schemas and bounded data.
const text = value => ({ type: 'text', text: String(value) });

export const MCP_READ_TOOLS = Object.freeze([
  { name: 'daymark_find_jobs', description: 'Find saved jobs by employer or role.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 200 } }, additionalProperties: false } },
  { name: 'daymark_application_status', description: 'Read an application status and its task states.', inputSchema: { type: 'object', properties: { jobId: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['jobId'], additionalProperties: false } },
  { name: 'daymark_pending_questions', description: 'List application tasks waiting for applicant review.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'daymark_tracker_page', description: 'Read a bounded page of application tracker metadata.', inputSchema: { type: 'object', properties: { cursor: { type: 'string', pattern: '^(0|[1-9][0-9]{0,4})$' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false } },
]);

export function createMcpReadInterface(readTools) {
  if (!readTools || ['find_jobs', 'application_status', 'list_questions', 'tracker_page'].some(key => typeof readTools[key] !== 'function')) throw new Error('Daymark read tools are required.');
  const handlers = {
    daymark_find_jobs: args => readTools.find_jobs({ query: args.query || '' }),
    daymark_application_status: args => readTools.application_status({ jobId: args.jobId }),
    daymark_pending_questions: () => readTools.list_questions(),
    daymark_tracker_page: args => readTools.tracker_page({ cursor: args.cursor === undefined ? 0 : Number(args.cursor), limit: args.limit ?? 20 }),
  };
  return {
    tools: MCP_READ_TOOLS,
    async call(name, args = {}) {
      const schema = MCP_READ_TOOLS.find(tool => tool.name === name);
      if (!schema) throw new Error('Unknown Daymark MCP tool.');
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(schema.inputSchema.properties, key))) throw new Error('Unexpected or invalid tool arguments.');
      const allowed = schema.inputSchema.properties;
      for (const [key, value] of Object.entries(args)) {
        const rule = allowed[key];
        if (rule.type === 'string' && (typeof value !== 'string' || value.length > (rule.maxLength || 1000) || (rule.minLength && value.length < rule.minLength) || (rule.pattern && !new RegExp(rule.pattern).test(value)))) throw new Error(`Invalid ${key}.`);
        if (rule.type === 'integer' && (!Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum)) throw new Error(`Invalid ${key}.`);
      }
      for (const key of schema.inputSchema.required || []) if (!(key in args)) throw new Error(`Missing ${key}.`);
      try {
        const result = await handlers[name](args);
        return { content: [text(JSON.stringify(result))], structuredContent: result, isError: false };
      } catch {
        // Filesystem and database messages can contain local paths or connection details.
        return { content: [text('Daymark could not read this right now.')], isError: true };
      }
    },
  };
}
