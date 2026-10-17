// Company career sites often embed Greenhouse with ?gh_jid=<id>. The application form lives on
// job-boards.greenhouse.io/embed/job_app?for=<board>&token=<id>, so work out the board name safely.
const GENERIC = new Set(['www', 'careers', 'career', 'jobs', 'job', 'boards', 'apply', 'join', 'work', 'about', 'hire', 'hiring', 'talent', 'team', 'en', 'us', 'app']);
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

export function greenhouseBoardName(url) {
  const explicit = url.searchParams.get('for');
  if (explicit && /^[a-z0-9_-]{1,80}$/i.test(explicit)) return explicit.toLowerCase();
  const labels = url.hostname.toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return '';
  labels.pop();
  if (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1])) labels.pop();
  const meaningful = labels.filter(label => !GENERIC.has(label));
  const board = meaningful[meaningful.length - 1] || '';
  return /^[a-z0-9-]+$/.test(board) ? board : '';
}

export function greenhouseEmbedUrl(raw, isKnownAts = () => false) {
  try {
    const url = new URL(raw);
    const id = url.searchParams.get('gh_jid');
    if (!id || !/^\d+$/.test(id) || isKnownAts(url.hostname)) return '';
    const board = greenhouseBoardName(url);
    return board ? `https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${id}` : '';
  } catch { return ''; }
}
