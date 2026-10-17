const commands = [
  { id: 'import-job', patterns: [/\b(add|paste|import)\b.*\b(link|url|posting|job)\b/, /\bjob\s+link\b/] },
  { id: 'collect', patterns: [/\b(collect|refresh|find|pull)\b.*\b(jobs?|roles?|postings?)\b/, /\b(jobs?|roles?)\b.*\b(collect|refresh|find|pull)\b/] },
  { id: 'discover', patterns: [/\b(browse|discover|show|search)\b.*\b(jobs?|roles?|postings?)\b/, /^\s*(jobs?|roles?)\s*$/] },
  { id: 'applications', patterns: [/\b(applications?|queue|progress|processing)\b/] },
  { id: 'inbox', patterns: [/\b(inbox|email|mail|verification code)\b/] },
  { id: 'auto-apply', patterns: [/\b(auto.?apply|automation|daily cap|skip rules)\b/] },
  { id: 'profile', patterns: [/\b(profile|resume|answer pack|answers)\b/] },
  { id: 'resume-task', patterns: [/\b(resume|continue|retry)\b.*\b(application|task|checkpoint|fill|processing)\b/, /\bcontinue\b.*\b(workday|greenhouse|ashby|lever)\b/] },
];

export function resolveAssistantCommand(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  return commands.find(command => command.patterns.some(pattern => pattern.test(text)))?.id || null;
}
