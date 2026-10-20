import { useState } from 'react';
const local: Record<string, string> = { airbnb: 'airbnb', figma: 'figma', robinhood: 'robinhood', quisitive: 'quisitive.png', newsela: 'newsela.png' };
/**
 * Shows a company's logo. The server finds it on the company's own website the first time and remembers it, so there is no
 * list to maintain; until it arrives, or if none is found, the company's initials show. Nothing is sent to a logo service.
 */
export function CompanyLogo({ company, logoUrl, jobId }: { company: string; logoUrl?: string; jobId?: string }) {
  const [failed, setFailed] = useState('');
  const [loaded, setLoaded] = useState('');
  const name = local[company.trim().toLowerCase()];
  const source = name ? `/logos/${name.includes('.') ? name : name + '.svg'}`
    : logoUrl?.startsWith('https://') ? logoUrl
    : company.trim() ? `/api/logo?company=${encodeURIComponent(company.trim())}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}` : '';
  return <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface text-lg font-semibold text-brand" aria-hidden="true">
    {showsCompanyInitials(source, loaded) && <span>{company.trim().slice(0, 2).toUpperCase() || '?'}</span>}
    {source && failed !== source && <img src={source} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`absolute inset-0 m-auto h-8 w-8 object-contain transition-opacity duration-150 ${loaded === source ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setLoaded(source)} onError={() => setFailed(source)} />}
  </span>;
}

export function showsCompanyInitials(source: string, loaded: string) {
  return !source || source !== loaded;
}
