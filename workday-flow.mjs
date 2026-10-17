import {applicationFormSurface} from './application-questions.mjs';
export async function workdayFinalReviewReady(page){page=await applicationFormSurface(page);return await page.getByRole('heading',{name:'Review',exact:true}).isVisible().catch(()=>false);}
export async function enterWorkdayApplication(page,progress,{preferSignIn=false,allowRegistration=false}={}){
 const apply=page.getByRole('button',{name:'Apply',exact:true});
 const inAccountFlow=/\/(?:apply|login|createAccount|forgotPassword|resetPassword|verifyEmail|verifyAccount)(?:\/|$)/i.test(new URL(page.url()).pathname);
 if(!inAccountFlow){
  try{await Promise.race([apply.waitFor({state:'visible',timeout:20000}),page.locator('input[type="password"],input[type="file"],input[autocomplete="given-name"],input[autocomplete="one-time-code"]').first().waitFor({state:'attached',timeout:20000})]);}
  catch{throw new Error('Workday has not loaded an application or account form. Check the page in Chrome, then Continue processing.');}
 }
 if(!inAccountFlow&&await apply.count()&&await apply.isVisible()){
  await progress('Opening Workday application options…');await apply.click();
  const autofill=page.getByRole('button',{name:'Autofill with Resume',exact:true});
  await autofill.waitFor({state:'visible',timeout:15000});await autofill.click();
  await page.locator('input[type="password"],input[type="file"],input[autocomplete="given-name"]').first().waitFor({state:'attached',timeout:20000});
 }
 if(preferSignIn&&await page.getByRole('heading',{name:'Create Account',exact:true}).isVisible().catch(()=>false)){await progress('Opening existing-account sign-in…');await page.getByRole('button',{name:'Sign In',exact:true}).last().click();await page.getByRole('textbox',{name:'Email Address',exact:true}).waitFor({state:'visible',timeout:15000});return;}
 if(!allowRegistration&&await page.getByRole('heading',{name:'Create Account',exact:true}).isVisible().catch(()=>false))throw new Error('Workday requires an account for this employer. Create it in the open browser, or choose Sign In for an existing account, then Continue processing. No application has been submitted.');
}
