import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

const SOURCE_LABELS: Record<string, string> = {
  adzuna: 'Adzuna', arbeitnow: 'Arbeitnow', ashby: 'Ashby', bamboohr: 'BambooHR', breezy: 'Breezy HR',
  greenhouse: 'Greenhouse', himalayas: 'Himalayas', hn: 'Hacker News', jobicy: 'Jobicy', jobvite: 'Jobvite',
  lever: 'Lever', remoteok: 'Remote OK', remotive: 'Remotive', recruitee: 'Recruitee', rippling: 'Rippling',
  smartrecruiters: 'SmartRecruiters', themuse: 'The Muse', usajobs: 'USAJobs', workable: 'Workable', workday: 'Workday',
};

function sourceName(rawValue: unknown) {
  const raw = String(rawValue || '').replace(/\s+board$/i, '').trim();
  if (!raw) return '';
  return SOURCE_LABELS[raw.toLowerCase()] || raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function JobSourceLink({ job, className }: { job: { url?: string; ats?: string; source?: string; discoverySource?: string; sourceUrl?: string }; className?: string }) {
  let href = '';
  try {
    const parsed = new URL(String(job.url || ''));
    if (parsed.protocol === 'https:') href = parsed.href;
  } catch { /* no usable original posting URL */ }
  if (!href) return null;
  const ats = sourceName(job.ats || job.source);
  const publisher = sourceName(job.discoverySource);
  let sourceHref = '';
  try {
    const parsed = new URL(String(job.sourceUrl || ''));
    if (parsed.protocol === 'https:' && parsed.href !== href) sourceHref = parsed.href;
  } catch { /* no separate publisher link */ }
  const primaryLabel = !job.ats && publisher ? `View on ${publisher}` : `Original posting${ats ? ` · ${ats}` : ''}`;
  return <span className={cn('relative z-10 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${primaryLabel}`} className="inline-flex items-center gap-1 text-brand hover:underline">
      {primaryLabel}<ExternalLink size={12} aria-hidden />
    </a>
    {publisher && sourceHref && <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline" aria-label={`View original source on ${publisher}`}>
      via {publisher}<ExternalLink size={12} aria-hidden />
    </a>}
  </span>;
}
