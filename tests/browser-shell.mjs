import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const jobs = Array.from({ length: 30 }, (_, i) => ({
  id: `layout-job-${i}`, company: `Example Company ${i}`, role: `Data Engineer ${i}`, location: i % 2 ? 'Remote' : 'New York, NY', salary: '$100,000–$140,000', posted: new Date(Date.now() - i * 30 * 60_000).toISOString(), description: 'Build data systems with Python, SQL, and Snowflake.', tags: ['Python', 'SQL', 'Snowflake'], match: 85 - i, source: 'Greenhouse', url: `https://boards.greenhouse.io/example/jobs/${i}`,
}));
const data = { jobs, jobDispositions: {}, tasks: [], applications: [], profile: { roleSearch: 'Data Engineer' }, onboarding: { profileConfirmed: true, completed: true }, worker: { status: 'ready' } };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/state') return res.end(JSON.stringify(structuredClone(data)));
    if (url.pathname === '/api/mailbox') return res.end(JSON.stringify({ threads: [], hasMore: false, nextOffset: 0, unreadCount: 0, drafts: [], labels: [], filters: [], connection: { connected: false, lastSync: null, error: null }, demo: true }));
    if (url.pathname === '/api/calendar') return res.end(JSON.stringify({ events: [], conflicts: [] }));
    if (url.pathname === '/api/calendar/upcoming') return res.end(JSON.stringify({ events: [] }));
    if (url.pathname === '/api/events') { res.setHeader('content-type', 'text/event-stream'); return res.end(':ready\n\n'); }
    if (url.pathname === '/api/agent/approvals') return res.end(JSON.stringify({ pending: [], recent: [] }));
    if (url.pathname === '/api/agent/conversations' && req.method === 'GET') return res.end(JSON.stringify({ conversations: [] }));
    if (url.pathname === '/api/agent/conversations' && req.method === 'POST') return res.end(JSON.stringify({ conversation: { id: 'chat-layout-test', title: 'New chat', turns: [] } }));
    const disposition = url.pathname.match(/^\/api\/jobs\/([^/]+)\/disposition$/);
    if (disposition && req.method === 'PUT') {
      let body = ''; for await (const chunk of req) body += chunk;
      const { status } = JSON.parse(body);const id = decodeURIComponent(disposition[1]);
      if (status === 'active') delete data.jobDispositions[id]; else data.jobDispositions[id] = status;
      return res.end(JSON.stringify({ jobId: id, status }));
    }
    if (url.pathname === '/api/collect') return res.end(JSON.stringify({ queued: true }));
    if (url.pathname === '/api/profile/role-targets' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; const targets = JSON.parse(body); data.profile.roleSearch = targets.roleSearch; data.profile.roleFamilies = targets.roleFamilies; return res.end(JSON.stringify({ saved: true, profile: data.profile })); }
    if (url.pathname === '/api/jobs/import' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; const { url: jobUrl } = JSON.parse(body); const job = { id: 'imported-job', company: 'Imported Example', role: 'Imported Analyst', location: 'Remote', url: jobUrl, match: 70, first_seen_at: new Date().toISOString() }; data.jobs.unshift(job); return res.end(JSON.stringify({ job })); }
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const { jobId } = JSON.parse(body);const task = { id: `prepare-${jobId}`, jobId, type: 'prepare', status: 'queued', stopAtFinalReview: true };
      data.tasks = [task, ...data.tasks.filter(t => t.jobId !== jobId)];return res.end(JSON.stringify({ task }));
    }
    if (url.pathname === '/api/logo') return res.end(JSON.stringify({ logoUrl: '' }));
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'Not found' }));
  }
  try {
    const file = path.join(process.cwd(), 'public', url.pathname === '/' || !path.extname(url.pathname) ? 'index.html' : url.pathname.slice(1));
    const bytes = await fs.readFile(file);
    res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.ttf': 'font/ttf', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(5000);
  const errors = [];page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/discover`);
  await page.getByRole('heading', { name: 'Browse jobs' }).waitFor();
  await page.locator('aside #assistant-title').waitFor();
  const cards = page.locator('li[data-job-card]');
  await assert.equal(await cards.count(), 24);
  await page.getByRole('heading', { name: 'Add a job link' }).waitFor();
  await page.getByText('30 jobs').waitFor();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByText('Role', { exact: true }).click();
  await page.getByLabel('Data Science & ML').check();
  await page.getByLabel('Close role family filters').click();
  await page.getByRole('button', { name: /Data Science & ML/ }).waitFor();
  await page.getByRole('button', { name: 'Clear all' }).click();
  const wideColumns = await page.locator('.job-card-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(wideColumns, 4, 'wide workspace should show four job columns');
  await page.screenshot({ path: '/private/tmp/daymark-reference-layout.png' });

  await cards.first().getByRole('button', { name: 'Save' }).click();
  await page.locator('[role="tab"]').filter({ hasText: 'Saved' }).click();
  assert.equal(await cards.count(), 1, 'saved view should filter to the saved role');
  await page.getByRole('tab', { name: 'All jobs' }).click();
  await cards.first().getByRole('button', { name: 'Pass' }).click();
  await page.locator('[role="tab"]').filter({ hasText: 'Passed' }).click();
  assert.equal(await cards.count(), 1, 'passed view should contain the dismissed role');
  await cards.first().getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('tab', { name: 'All jobs' }).click();
  assert.equal(await cards.count(), 24, 'restored role returns to the main feed');

  await cards.first().getByRole('button', { name: 'Apply' }).click();
  await page.waitForURL(/\/applications\/layout-job-0$/);
  assert.equal(data.tasks[0].stopAtFinalReview, true, 'Apply enters preparation with final review required');
  await page.getByRole('link', { name: 'Browse jobs' }).click();
  await page.getByRole('heading', { name: 'Browse jobs' }).waitFor();

  for (const [width, columns] of [[1024, 3], [768, 2], [390, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(40);
    const measured = await page.locator('.job-card-grid').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, page: document.documentElement.scrollWidth }));
    assert.equal(measured.columns, columns, `${width}px should show ${columns} columns`);
    assert.ok(measured.page <= width + 1, `${width}px layout should not overflow horizontally`);
    if (width === 390) {
      await page.getByText('Role', { exact: true }).click();
      await page.getByLabel('Data Science & ML').check();
      await page.screenshot({ path: '/private/tmp/daymark-role-filter-mobile.png' });
      await page.keyboard.press('Escape');
    }
  }
  await page.locator('button[aria-label="Open navigation"]').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Settings' }).waitFor();

  const routes = [
    ['/', /Your next opportunity starts here/],
    ['/applications', 'Applications'],
    ['/applications/layout-job-0', 'Example Company 0'],
    ['/questions', 'Questions'],
    ['/discover', 'Browse jobs'],
    ['/discover/layout-job-0', /Data Engineer 0 at Example Company 0/],
    ['/mail', 'Your conversations'],
    ['/calendar', 'Calendar'],
    ['/tracker', 'Tracker'],
    ['/materials', 'Materials'],
    ['/system', 'System'],
  ];
  for (const [route, heading] of routes) {
    const response = await page.goto(`http://127.0.0.1:${port}${route}`);
    assert.equal(response?.status(), 200, `${route} should serve the app shell directly`);
    try { await page.getByRole('main').getByText(heading).last().waitFor(); }
    catch (error) { console.error(`Failed route ${route}:`, await page.locator('body').innerText(), errors); throw error; }
  }
  await page.goto(`http://127.0.0.1:${port}/materials`);
  await page.getByRole('heading', { name: 'Role targets' }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Role families' }).locator('input[type="checkbox"]').count(), 22);
  await page.getByRole('textbox', { name: 'Titles and custom searches' }).fill('Data Engineer; Product Manager');
  await page.getByRole('button', { name: 'Add suggestions' }).click();
  await page.getByRole('button', { name: 'Save role targets' }).click();
  await page.getByRole('status').filter({ hasText: 'Target roles saved' }).waitFor();
  await page.goto(`http://127.0.0.1:${port}/discover`);
  await page.getByLabel('Job posting URL').fill('https://jobs.example.test/role');
  await page.getByRole('button', { name: 'Import job link' }).click();
  await page.getByRole('status').filter({ hasText: 'Job added' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: responsive shell, lazy loading across all direct routes, four-column job board, Save/Pass/Restore, preparation-only Apply, mobile navigation, and no browser errors');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
