import { classifyQuestion } from './public/questions-model.js';

const fields = [
  ['firstName', /^(what is )?(your )?(legal )?first name\b|^given name\b/i],
  ['lastName', /^(what is )?(your )?(legal )?last name\b|^surname\b|^family name\b/i],
  ['preferredName', /^preferred (first )?name\b|^nickname\b/i],
  ['name', /full\s*name|your\s*name|^legal\s*name$|^name\s*\*?$/i],
  ['email', /e-?mail/i],
  ['phone', /phone|mobile|telephone|cell/i],
  ['linkedin', /linkedin/i],
  ['github', /github/i],
  ['website', /portfolio|personal\s*(web)?site|website|\bblog\b/i],
  ['city', /^city\b|current\s*city|location\s*\(city\)/i],
  ['state', /^state\b|province|region/i],
  ['postalCode', /postal|zip\s*code|\bzip\b/i],
  ['country', /^country\b|country\s*of\s*residence/i],
  ['addressLine1', /street\s*address|address\s*line\s*1|^address$/i],
  ['currentCompany', /current\s*(or\s*most\s*recent\s*)?(company|employer)/i],
  ['currentTitle', /current\s*(or\s*most\s*recent\s*)?(job\s*)?title/i],
  ['yearsExperience', /years\s*of\s*(relevant\s*|professional\s*|total\s*)?experience/i],
  ['desiredSalary', /desired\s*(base\s*)?(salary|compensation|pay)|salary\s*expectation|expected\s*(annual\s*)?(salary|compensation)/i],
  ['noticePeriod', /notice\s*period|how\s*soon\s*can\s*you\s*start/i],
];

const ALLOWED_KEYS = new Set(fields.map(([key]) => key));

// Maps obvious profile fields deterministically and optionally uses NVIDIA (`llm`) to map unconventional
// non-sensitive field labels to canonical profile keys. Decision, EEO, authorization, and open-ended fields stay untouched.
export async function understandForm(questions, { llm = null } = {}) {
  const mapping = {};
  const unresolved = [];
  for (const q of questions) {
    if (q.manual || !['text', 'email', 'tel', 'url', 'number'].includes(q.type)) continue;
    const meta = classifyQuestion(q);
    if (meta.lane === 'decision' || ['eeo', 'authorization', 'open'].includes(meta.kind)) continue;
    const match = fields.find(([, pattern]) => pattern.test(q.label || ''));
    if (match) mapping[q.id] = match[0];
    else if (q.label) unresolved.push(q);
  }
  if (typeof llm === 'function' && unresolved.length) {
    try {
      const response = await llm([
        {
          role: 'system',
          content: `Map job-application form fields to canonical candidate profile keys. Allowed keys: ${[...ALLOWED_KEYS].join(', ')}. Never map legal, consent, EEO, demographic, or open-ended essay questions. Return JSON {"mapping":{"<questionId>":"<allowedKey>"}} containing only high-confidence matches.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ fields: unresolved.map(q => ({ id: q.id, label: q.label, type: q.type, placeholder: q.placeholder || '' })) }),
        },
      ]);
      const aiMap = response?.mapping && typeof response.mapping === 'object' ? response.mapping : {};
      for (const q of unresolved) {
        const key = aiMap[q.id];
        if (typeof key === 'string' && ALLOWED_KEYS.has(key)) mapping[q.id] = key;
      }
    } catch { /* fallback to deterministic mapping */ }
  }
  return mapping;
}
