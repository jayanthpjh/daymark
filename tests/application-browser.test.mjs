import test from 'node:test';
import assert from 'node:assert/strict';
import { canReuseApplicationContext, launchApplicationBrowser } from '../application-browser.mjs';

test('launches an isolated Playwright browser without spawning system Chrome', async () => {
  let captured;
  const chromium = {
    async launchPersistentContext(profilePath, options) {
      captured = { profilePath, options };
      return { pages: () => [] };
    },
  };

  const context = await launchApplicationBrowser(chromium, '/tmp/daymark-profile', false);

  assert.deepEqual(captured, {
    profilePath: '/tmp/daymark-profile',
    options: {
      headless: true,
      acceptDownloads: false,
      viewport: { width: 1280, height: 900 },
    },
  });
  assert.equal(context.pages().length, 0);
});

test('keeps a user-requested browser visible while using the isolated Playwright browser', async () => {
  let options;
  const chromium = { async launchPersistentContext(_profilePath, value) { options = value; return {}; } };

  await launchApplicationBrowser(chromium, '/tmp/daymark-profile', true);

  assert.equal(options.headless, false);
  assert.equal(Object.hasOwn(options, 'channel'), false);
});


test('ordinary processing and old handoff flags cannot expose the backend browser',async()=>{
 const {shouldShowApplicationBrowser}=await import('../application-browser.mjs');
 for(const task of [{},{manualHandoff:true},{watchBrowser:true},{visibleBrowserApproved:true}])assert.equal(shouldShowApplicationBrowser(task),false);
 assert.equal(shouldShowApplicationBrowser({manualHandoff:true,visibleBrowserApproved:true}),true);
});

test('reopens a saved browser profile when a manual checkpoint needs a visible browser',()=>{
 const context={pages:()=>[]};
 assert.equal(canReuseApplicationContext(context,true,false),false);
 assert.equal(canReuseApplicationContext(context,false,true),false);
 assert.equal(canReuseApplicationContext(context,true,true),true);
 assert.equal(canReuseApplicationContext({pages:()=>{throw new Error('closed');}},true,true),false);
});
