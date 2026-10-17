// Shared ATS registry. Employer rules are declarative overlays; applicant-specific
// values and private locators never enter adapter definitions.
const selectors = {
  greenhouse: { name:['input[name="name"]'], email:['input[type="email"]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea[name*="cover" i]'] },
  lever: { name:['input[name="name"]'], email:['input[name="email"]'], phone:['input[name="phone"]'], linkedin:['input[name*="urls[LinkedIn]" i]'], resume:['input[type="file"]'], coverLetter:['textarea[name="comments"]'] },
  ashby: { name:['input[name*="name" i]'], email:['input[type="email"]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
  workday: { name:['input[autocomplete="given-name"]','input[name*="firstName" i]'], email:['input[type="email"]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
  smartrecruiters: { name:['input[name*="firstName" i]'], email:['input[type="email"]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
  icims: { name:['input[name*="firstName" i]'], email:['input[type="email"]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
  avature: { name:['input[name*="firstName" i]','input[autocomplete="given-name"]'], email:['input[type="email"]','input[name*="email" i]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
  successfactors: { name:['input[name*="firstName" i]','input[autocomplete="given-name"]'], email:['input[type="email"]','input[name*="email" i]'], phone:['input[type="tel"]'], linkedin:['input[name*="linkedin" i]'], resume:['input[type="file"]'], coverLetter:['textarea'] },
};
const hosts = {
  greenhouse: /(^|\.)(greenhouse\.io|greenhouse\.com|job-boards\.greenhouse\.io)$/i,
  lever: /(^|\.)lever\.(co|com)$/i,
  ashby: /(^|\.)ashbyhq\.com$/i,
  workday: /(^|\.)myworkdayjobs\.com$/i,
  smartrecruiters: /(^|\.)smartrecruiters\.com$/i,
  icims: /(^|\.)icims\.com$/i,
  avature: /(^|\.)avature\.(net|com)$/i,
  successfactors: /(^|\.)(successfactors\.(com|eu|de|net)|jobs2web\.com)$/i,
};
// Guest ATSs accept an application with no applicant account; the others require sign-in or registration first.
const GUEST_ATS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
const ACCOUNT_FLOW = ['account_discovery','sign_in_or_register','verification','application_entry','read_form','fill','validate','upload','final_review'];
const GUEST_FLOW = ['application_entry','read_form','fill','validate','upload','final_review'];
export const ATS_ADAPTERS = Object.freeze(Object.fromEntries(Object.entries(hosts).map(([id, host]) => [id, Object.freeze({ id, version:1, host, selectors:selectors[id], authMode:GUEST_ATS.has(id)?'guest':'account_required', flow:[...(GUEST_ATS.has(id)?GUEST_FLOW:ACCOUNT_FLOW)] })])));
export function detectATSAdapter(hostname) {
  const host=String(hostname||'').toLowerCase();
  const match=Object.values(ATS_ADAPTERS).find(adapter=>adapter.host.test(host));
  return match ? { ...match } : null;
}
export function adapterSnapshot(adapter, employerHost='') {
  if(!adapter?.id||!Number.isInteger(adapter.version))throw new TypeError('A versioned ATS adapter is required.');
  return { id:adapter.id, version:adapter.version, employerHost:String(employerHost).toLowerCase().slice(0,253), flow:[...adapter.flow] };
}

// Guest-capable adapters (including dynamic career sites) may fill without an applicant account; visible sign-in, verification and CAPTCHA screens still pause.
export const isGuestAdapter = adapter => adapter?.authMode === 'guest';
