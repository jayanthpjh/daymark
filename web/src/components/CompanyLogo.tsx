import { useState } from 'react';
const local: Record<string, string> = { airbnb: 'airbnb', figma: 'figma', robinhood: 'robinhood', quisitive: 'quisitive.png', newsela: 'newsela.png' };
/**
 * Shows a company's logo. The server finds it on the company's own website the first time and remembers it, so there is no
 * list to maintain; until it arrives, or if none is found, the company's initials show. Nothing is sent to a logo service.
 */
export function CompanyLogo({ company, logoUrl, jobId }: { company: string; logoUrl?: string; jobId?: string }) {
  const [failed, setFailed] = useState('');
  const name = local[company.trim().toLowerCase()];
  const source = name ? `/logos/${name.includes('.') ? name : name + '.svg'}`
    : logoUrl?.startsWith('https://') ? logoUrl
    : company.trim() ? `/api/logo?company=${encodeURIComponent(company.trim())}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}` : '';
  return <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface text-lg font-semibold text-brand" aria-hidden="true">
    {source && failed !== source ? <img src={source} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-8 w-8 object-contain" onError={() => setFailed(source)} /> : company.trim().slice(0, 2).toUpperCase() || '?'}
  </span>;
}
