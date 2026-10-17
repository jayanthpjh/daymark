// Pure helpers for the tailoring review: tags, struck-line application, and the final resume text.
export type Kind = 'source' | 'rewritten' | 'invented';
export interface Change { section: string; before: string; after: string; kind: Kind; basedOn?: string; reason?: string; novel?: string[] }
export interface Claim { id: string; section: string; claim: string; basedOn?: string; novel?: string[]; likelyQuestion?: string; talkingPoint?: string }
export interface KeywordScore { before: number; after: number; matched?: string[]; missing?: string[] }
export interface Version { mode: Mode; resume: string; coverLetter: string; changes: Change[]; claims: Claim[]; prep: Claim[]; keywordScore: KeywordScore | null; note?: string; fellBack?: boolean }
export type Mode = 'honest' | 'strong' | 'aggressive';

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'honest', label: 'Honest', blurb: 'Reorders your own bullets. Nothing is added or reworded.' },
  { id: 'strong', label: 'Strong', blurb: 'Rewrites from your own evidence. Anything it cannot trace to your resume is dropped.' },
  { id: 'aggressive', label: 'Aggressive', blurb: 'Also adds realistic skills and results to match the posting. Each one is tagged for your review.' },
];

export const kindLabel: Record<Kind, string> = { source: 'From your resume', rewritten: 'Rewritten', invented: 'Invented' };
export const kindTone = (kind: Kind) => (kind === 'invented' ? 'warning' : kind === 'rewritten' ? 'info' : 'neutral') as 'warning' | 'info' | 'neutral';

const BULLET = /^\s*[•*–-]\s+/;
const key = (line: string) => line.replace(BULLET, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Applies the struck changes: a struck rewrite goes back to its source wording, a struck invented line is removed.
export function applyStrikes(resume: string, changes: Change[], struck: Set<number>): string {
  const lines = resume.split('\n');
  changes.forEach((change, index) => {
    if (!struck.has(index)) return;
    const at = lines.findIndex(line => key(line) === key(change.after));
    if (at < 0) {
      // Added skills share one line; removing one takes just that item out of the list.
      const skillsAt = change.section === 'Skills' ? lines.findIndex(line => line.split(/\s*,\s*/).some(item => item.trim().toLowerCase() === change.after.trim().toLowerCase())) : -1;
      if (skillsAt >= 0) {
        const rest = lines[skillsAt].split(/\s*,\s*/).filter(item => item.trim().toLowerCase() !== change.after.trim().toLowerCase());
        if (rest.length) lines[skillsAt] = rest.join(', '); else lines.splice(skillsAt, 1);
      }
      return;
    }
    const revert = change.kind === 'rewritten' && change.before ? change.before.replace(BULLET, '').trim() : '';
    if (revert) lines[at] = `${BULLET.test(lines[at]) ? '- ' : ''}${revert}`;
    else lines.splice(at, 1);
  });
  return lines.join('\n');
}

export const inventedCount = (changes: Change[], struck: Set<number>) => changes.filter((c, i) => c.kind === 'invented' && !struck.has(i)).length;
