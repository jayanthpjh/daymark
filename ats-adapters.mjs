// Shared ATS registry covering all 28 Tsenta-supported ATS platforms.
// Employer rules are declarative overlays; applicant-specific values and private locators never enter adapter definitions.
const DEFAULT_GUEST_SELECTORS = {
  name: ['input[name="name"]', 'input[name*="full_name" i]', 'input[name*="fullName" i]', 'input[autocomplete="name"]'],
  email: ['input[type="email"]', 'input[name*="email" i]', 'input[autocomplete="email"]'],
  phone: ['input[type="tel"]', 'input[name*="phone" i]', 'input[autocomplete="tel"]'],
  linkedin: ['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'],
  resume: ['input[type="file"]'],
  coverLetter: ['textarea[name*="cover" i]'],
};

const DEFAULT_ACCOUNT_SELECTORS = {
  name: ['input[autocomplete="given-name"]', 'input[name*="firstName" i]'],
  email: ['input[type="email"]', 'input[name*="email" i]'],
  phone: ['input[type="tel"]', 'input[name*="phone" i]'],
  linkedin: ['input[name*="linkedin" i]'],
  resume: ['input[type="file"]'],
  coverLetter: ['textarea'],
};

const selectors = {
  greenhouse: { name: ['input[name="name"]'], email: ['input[type="email"]', 'input[name*="email" i]'], phone: ['input[type="tel"]', 'input[name*="phone" i]'], linkedin: ['input[name*="linkedin" i]'], resume: ['input[type="file"]'], coverLetter: ['textarea[name*="cover" i]'] },
  lever: { name: ['input[name="name"]'], email: ['input[name="email"]', 'input[type="email"]'], phone: ['input[name="phone"]', 'input[type="tel"]'], linkedin: ['input[name*="urls[LinkedIn]" i]', 'input[name*="linkedin" i]'], resume: ['input[type="file"]'], coverLetter: ['textarea[name="comments"]', 'textarea[name*="cover" i]'] },
  ashby: { name: ['input[name="_systemfield_name"]', 'input[name*="name" i]'], email: ['input[type="email"]', 'input[name="_systemfield_email"]'], phone: ['input[type="tel"]'], linkedin: ['input[name*="linkedin" i]'], resume: ['input[type="file"]'], coverLetter: ['textarea'] },
  workday: DEFAULT_ACCOUNT_SELECTORS,
  smartrecruiters: { name: ['input[name*="firstName" i]'], email: ['input[type="email"]'], phone: ['input[type="tel"]'], linkedin: ['input[name*="linkedin" i]'], resume: ['input[type="file"]'], coverLetter: ['textarea'] },
  workable: DEFAULT_GUEST_SELECTORS,
  recruitee: DEFAULT_GUEST_SELECTORS,
  rippling: DEFAULT_GUEST_SELECTORS,
  pinpoint: DEFAULT_GUEST_SELECTORS,
  bamboohr: DEFAULT_GUEST_SELECTORS,
  jobvite: DEFAULT_GUEST_SELECTORS,
  breezy: DEFAULT_GUEST_SELECTORS,
  gem: DEFAULT_GUEST_SELECTORS,
  dover: DEFAULT_GUEST_SELECTORS,
  teamtailor: DEFAULT_GUEST_SELECTORS,
  jazzhr: DEFAULT_GUEST_SELECTORS,
  personio: DEFAULT_GUEST_SELECTORS,
  comeet: DEFAULT_GUEST_SELECTORS,
  eightfold: DEFAULT_GUEST_SELECTORS,
  icims: DEFAULT_ACCOUNT_SELECTORS,
  avature: DEFAULT_ACCOUNT_SELECTORS,
  successfactors: DEFAULT_ACCOUNT_SELECTORS,
  ukg: DEFAULT_ACCOUNT_SELECTORS,
  adp: DEFAULT_ACCOUNT_SELECTORS,
  taleo: DEFAULT_ACCOUNT_SELECTORS,
  dayforce: DEFAULT_ACCOUNT_SELECTORS,
  paylocity: DEFAULT_ACCOUNT_SELECTORS,
  paycom: DEFAULT_ACCOUNT_SELECTORS,
};

const hosts = {
  greenhouse: /(^|\.)(greenhouse\.io|greenhouse\.com|job-boards\.greenhouse\.io)$/i,
  lever: /(^|\.)lever\.(co|com)$/i,
  ashby: /(^|\.)ashbyhq\.com$/i,
  workday: /(^|\.)myworkdayjobs\.com$/i,
  smartrecruiters: /(^|\.)smartrecruiters\.com$/i,
  workable: /(^|\.)workable\.com$/i,
  recruitee: /(^|\.)recruitee\.com$/i,
  rippling: /(^|\.)rippling\.com$/i,
  pinpoint: /(^|\.)pinpointhq\.com$/i,
  bamboohr: /(^|\.)bamboohr\.com$/i,
  jobvite: /(^|\.)jobvite\.com$/i,
  breezy: /(^|\.)breezy\.hr$/i,
  gem: /(^|\.)gem\.com$/i,
  dover: /(^|\.)dover\.com$/i,
  teamtailor: /(^|\.)teamtailor\.com$/i,
  jazzhr: /(^|\.)applytojob\.com$/i,
  personio: /(^|\.)personio\.(de|com)$/i,
  comeet: /(^|\.)comeet\.com$/i,
  eightfold: /(^|\.)eightfold\.ai$/i,
  icims: /(^|\.)icims\.com$/i,
  avature: /(^|\.)avature\.(net|com)$/i,
  successfactors: /(^|\.)(successfactors\.(com|eu|de|net)|jobs2web\.com)$/i,
  ukg: /(^|\.)ultipro\.com$/i,
  adp: /(^|\.)adp\.com$/i,
  taleo: /(^|\.)(taleo\.net|oraclecloud\.com)$/i,
  dayforce: /(^|\.)dayforcehcm\.com$/i,
  paylocity: /(^|\.)paylocity\.com$/i,
  paycom: /(^|\.)paycomonline\.net$/i,
};

// Guest ATSs accept an application with no applicant account; the others require sign-in or registration first.
const GUEST_ATS = new Set([
  'greenhouse', 'lever', 'ashby', 'smartrecruiters',
  'workable', 'recruitee', 'rippling', 'pinpoint', 'bamboohr', 'jobvite', 'breezy',
  'gem', 'dover', 'teamtailor', 'jazzhr', 'personio', 'comeet', 'eightfold',
]);
const ACCOUNT_FLOW = ['account_discovery', 'sign_in_or_register', 'verification', 'application_entry', 'read_form', 'fill', 'validate', 'upload', 'final_review'];
const GUEST_FLOW = ['application_entry', 'read_form', 'fill', 'validate', 'upload', 'final_review'];

export const ATS_ADAPTERS = Object.freeze(
  Object.fromEntries(
    Object.entries(hosts).map(([id, host]) => [
      id,
      Object.freeze({
        id,
        version: 1,
        host,
        selectors: selectors[id],
        authMode: GUEST_ATS.has(id) ? 'guest' : 'account_required',
        flow: [...(GUEST_ATS.has(id) ? GUEST_FLOW : ACCOUNT_FLOW)],
      }),
    ]),
  ),
);

export function detectATSAdapter(hostname) {
  const host = String(hostname || '').toLowerCase();
  const match = Object.values(ATS_ADAPTERS).find(adapter => adapter.host.test(host));
  return match ? { ...match } : null;
}

export function adapterSnapshot(adapter, employerHost = '') {
  if (!adapter?.id || !Number.isInteger(adapter.version)) throw new TypeError('A versioned ATS adapter is required.');
  return { id: adapter.id, version: adapter.version, employerHost: String(employerHost).toLowerCase().slice(0, 253), flow: [...adapter.flow] };
}

// Guest-capable adapters (including dynamic career sites) may fill without an applicant account; visible sign-in, verification and CAPTCHA screens still pause.
export const isGuestAdapter = adapter => adapter?.authMode === 'guest';
