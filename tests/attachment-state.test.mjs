import test from 'node:test';import assert from 'node:assert/strict';import {inspectResumeAttachment} from '../attachment-state.mjs';
test('attachment inspection checks the expected live filename, never a historical upload record',async()=>{
 let expected;const page={resumeAttachmentRecorded:true,evaluate:async(fn,name)=>{expected=name;return {status:'missing'};}};
 const absent=await inspectResumeAttachment(page,'/private/documents/Alex_Acme_Resume_v3.pdf');assert.equal(absent.status,'missing');assert.equal(expected,'Alex_Acme_Resume_v3.pdf');
 for(const status of ['pending','rejected','accepted']){page.evaluate=async()=>({status});assert.equal((await inspectResumeAttachment(page,'/tmp/resume.pdf')).status,status);}
 assert.equal((await inspectResumeAttachment(page,'')).status,'missing');
});
import {chromium} from 'playwright';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
(browser?test:test.skip)('live filename receipt verifies upload without relying on an old task flag',async()=>{const page=await browser.newPage();await page.setContent('<div>Alex_Acme_v2.pdf<button aria-label="Remove resume"></button></div>');assert.equal((await inspectResumeAttachment(page,'/tmp/Alex_Acme_v2.pdf')).status,'accepted');assert.equal((await inspectResumeAttachment(page,'/tmp/Alex_Acme_v1.pdf')).status,'missing');await page.setContent('<div aria-busy="true">Alex_Acme_v2.pdf<button aria-label="Remove resume"></button></div>');assert.equal((await inspectResumeAttachment(page,'/tmp/Alex_Acme_v2.pdf')).status,'pending');await page.close();});
test.after(async()=>browser?.close());
(browser?test:test.skip)('an unrelated form-level validation message does not reject an accepted resume file',async()=>{const page=await browser.newPage();await page.setContent('<form><input id="resume" type="file"><div role="alert">City is required.</div></form>');await page.locator('#resume').setInputFiles({name:'Jayanth_Mastercard_Resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 test')});const status=await inspectResumeAttachment(page,'/tmp/Jayanth_Mastercard_Resume.pdf');assert.equal(status.status,'accepted');await page.close();});
(browser?test:test.skip)('a Workday upload receipt in the top-level page is found when form controls are inside an iframe',async()=>{const page=await browser.newPage();await page.setContent('<iframe></iframe><div>Jayanth_Resume.pdf <span>Successfully Uploaded!</span></div>');await page.frames()[1].setContent('<input aria-label="Form field">');const status=await inspectResumeAttachment(page,'/tmp/Jayanth_Resume.pdf');assert.equal(status.status,'accepted');assert.equal(status.method,'employer_upload_receipt');await page.close();});
