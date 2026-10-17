// Opens every screen of the React app in a real browser and fails on any page error or an empty page.
// Run with the app up: node tests/browser-screens.mjs [http://localhost:4173]
import {launchTestBrowser} from './helpers/browser.mjs';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:4173';
const browser=await launchTestBrowser();if(!browser){console.log('skipped: no browser');process.exit(0);}
try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/','/discover','/applications','/questions','/tracker','/mail','/calendar','/materials','/system']){
    await page.goto(base+route);await page.waitForTimeout(2500);
    const text=await page.locator('body').innerText();
    assert.ok(text.length>200,`${route} rendered an empty page`);
    assert.deepEqual(errors,[],`${route}: ${errors.join(' | ')}`);
    console.log('ok -',route);
  }
  console.log('PASS: every screen renders without errors');
}finally{await browser.close();}
