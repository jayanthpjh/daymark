// Authentication is deterministic. Mail content and credentials never enter model prompts.
class AuthPause extends Error { constructor(message, authStatus = 'authentication') { super(message); this.authStatus = authStatus; } }
export function accountScope(raw,email){
 const url=new URL(raw);if(url.protocol!=='https:'||!/^[-a-z0-9]+\.wd\d+\.myworkdayjobs\.com$/i.test(url.hostname))throw new AuthPause('Unsupported Workday account host.');
 const parts=url.pathname.split('/').filter(Boolean);const site=/^[a-z]{2}-[a-z]{2}$/i.test(parts[0]||'')?parts[1]:parts[0];
 if(!site||site==='job')throw new AuthPause('Unable to identify this employer career site.');
 return `${url.hostname.toLowerCase()}/${site.toLowerCase()}/${String(email).trim().toLowerCase()}`;
}
export function safeAuthUrl(raw,applicationUrl){
 try{const url=new URL(raw),base=new URL(applicationUrl);return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname===base.hostname&&accountScope(url.href,'')===accountScope(base.href,'')?url.href:'';}catch{return '';}
}
export function findAuthMessage(messages,{email,applicationUrl,company,purpose,since,usedIds=[]}){
 const parsedUrl=new URL(applicationUrl);const atsHost=parsedUrl.hostname.toLowerCase();
 const senderRules=[
  {host:/\.myworkdayjobs\.com$/,senders:/@(?:[a-z0-9-]+\.)*(?:workday\.com|myworkday\.com|myworkdayjobs\.com)$/i},
  {host:/greenhouse\.(?:io|com)$|job-boards\.greenhouse\.io$/,senders:/@(?:[a-z0-9-]+\.)*(?:greenhouse\.io|greenhouse-mail\.io)$/i},
  {host:/lever\.(?:co|com)$/,senders:/@(?:lever\.co|lever\.com)$/i},
  {host:/ashbyhq\.com$/,senders:/@(?:ashbyhq\.com|ashby-mail\.com)$/i},
  {host:/avature\.(?:net|com)$/,senders:/@(?:avature\.net|avature\.com)$/i},
  {host:/successfactors\.(?:com|eu|de|net)$|jobs2web\.com$/,senders:/@(?:successfactors\.(?:com|eu|de|net)|jobs2web\.com)$/i},
  {host:/smartrecruiters\.com$/,senders:/@(?:smartrecruiters\.com)$/i},
  {host:/icims\.com$/,senders:/@(?:icims\.com)$/i},
 ];
 const senderRule=senderRules.find(item=>item.host.test(atsHost));if(!senderRule)return null;
 const employer=String(company||'').replace(/^\d+\s*/,'').replace(/\b(?:company|corporation|inc|llc|lp|ltd)\b/gi,'').trim().toLowerCase();
 const candidates=messages.filter(mail=>{
  const date=Date.parse(mail.receivedAt||mail.date);if(!Number.isFinite(date)||date<since||date>Date.now()+60000||usedIds.includes(mail.id))return false;
  if(!mail.recipients?.some(address=>address.toLowerCase()===email.toLowerCase()))return false;
  if(!senderRule.senders.test(mail.senderAddress||''))return false;
  const text=`${mail.subject||''}\n${mail.text||''}`;
  const matches=purpose==='reset'?/reset.{0,30}password|password.{0,30}reset/i.test(text):purpose==='security'?/security code/i.test(text):/verif(?:y|ication)|confirm.{0,20}(?:email|account)|one[- ]time.{0,10}code/i.test(text);
  const links=/\.myworkdayjobs\.com$/i.test(atsHost)?(mail.links||[]).map(link=>safeAuthUrl(link,applicationUrl)).filter(Boolean):[];
  return matches&&(links.length||(employer.length>=5&&text.toLowerCase().includes(employer)));
 }).sort((a,b)=>Date.parse(b.receivedAt||b.date)-Date.parse(a.receivedAt||a.date));
 for(const mail of candidates){
  const links=/\.myworkdayjobs\.com$/i.test(atsHost)?(mail.links||[]).map(link=>safeAuthUrl(link,applicationUrl)).filter(Boolean):[];
  const link=links.find(raw=>purpose==='reset'?/reset|password/i.test(new URL(raw).pathname):/verif|confirm|activat/i.test(new URL(raw).pathname));
  const body=String(mail.text||'');
  // Greenhouse security codes are 8 letters and digits, e.g. "...security code field on your application: aB3dE5gH".
  const code=purpose==='security'?(body.match(/security code[^\n:]{0,60}:\s*([A-Za-z0-9]{6,10})\b/i)||body.match(/\bcode\s*(?:is|:)\s*([A-Za-z0-9]{6,10})\b/i)||[])[1]:(body.match(/(?:code|otp|one[- ]time password)\s*(?:is|:)?\s*(\d{4,8})\b/i)||[])[1];
  if(link||code)return {id:mail.id,link:link||'',code:code||''};
 }
 return null;
}
const visible=async locator=>await locator.count()>0&&await locator.isVisible().catch(()=>false);
export async function workdayAuthScreen(page){
 if(await visible(page.locator('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[title*="challenge" i]').first()))return 'captcha';
 if(await visible(page.locator('input[autocomplete="one-time-code"],input[data-automation-id*="verificationCode" i]').first()))return 'code';
 const heading=async name=>visible(page.getByRole('heading',{name,exact:true}));
 // Workday can leave registration fields mounted behind its sign-in overlay.
 // Resolve the foreground sign-in/recovery screen before inspecting those fields.
 if(await heading('Sign In'))return 'login';
 if(await heading('Forgot Password'))return 'forgot';
 if(await heading('Reset Password')||await heading('Change Password'))return 'reset';
 // Prefer the visible form heading over generic email copy elsewhere on the page.
 if(await heading('Create Account'))return 'register';
 if(await visible(page.locator('input[autocomplete="new-password"]').first()))return 'reset';
 const body=await page.locator('body').innerText();
 if(/check your (?:email|inbox)|verification email (?:has been|was) sent|email has been sent|password reset.{0,40}sent/i.test(body))return 'mail';
 if(/\/apply(?:\/|$)/.test(new URL(page.url()).pathname)){
  for(const name of ['Autofill with Resume','My Information','My Experience','Application Questions','Voluntary Disclosures','Review'])if(await heading(name))return 'application';
 }
 if(await visible(page.locator('input[type="password"]').first()))return 'unknown-auth';
 if(await page.locator('input[type="file"]').count()||await visible(page.locator('input[autocomplete="given-name"],input[data-automation-id="legalNameSection_firstName"]').first()))return 'application';
 return 'unknown';
}
export async function authenticateWorkday(page,options){
 try{return await runWorkdayAuthentication(page,options);}catch(error){
  if(error instanceof AuthPause)throw error;
  // Browser exceptions can contain fill values or token-bearing URLs in their call logs.
  throw new AuthPause('Employer authentication could not continue. Check the browser and Proton Bridge, then Continue processing.');
 }
}
async function runWorkdayAuthentication(page,{applicationUrl,company,credentials,account={},saveAccount,readMail,findMail,progress,assertActive,allowRegistrationConsent=false,wait=ms=>page.waitForTimeout(ms),now=Date.now}){
 if(!credentials?.username||!credentials?.password)throw new AuthPause('Add your application email and default ATS password in Settings, then Continue processing.');
 const email=credentials.username;const expected=accountScope(applicationUrl,email);const started=now();
 const persist=async patch=>{account={...account,...patch};await saveAccount(account);};
 const check=async()=>{await assertActive();if(accountScope(page.url(),email)!==expected)throw new AuthPause('Authentication moved outside this employer career site. Complete it in Chrome, then Continue processing.');};
 const findMessage=async(purpose,since,usedIds)=>findMail?findMail({email,applicationUrl,company,purpose,since,usedIds}):findAuthMessage(await readMail(),{email,applicationUrl,company,purpose,since,usedIds});
 const button=name=>page.getByRole('button',{name,exact:true}).last();
 const fillEmail=async()=>{const field=page.getByRole('textbox',{name:/^Email Address\*?$/i});if(!await visible(field))throw new AuthPause('The employer email field was not recognized. Complete this step in Chrome.');await field.fill(email);};
 const settle=async previous=>{for(let i=0;i<24;i++){await wait(500);await check();const next=await workdayAuthScreen(page);if(next!==previous&&next!=='unknown')return;const error=await page.locator('[role="alert"],[data-automation-id="errorMessage"]').allTextContents();if(error.some(text=>text.trim()))return;}};
 const errors=async()=>{
  const alerts=(await page.locator('[role="alert"],[data-automation-id="errorMessage"]').allTextContents()).join(' ').trim();
  if(alerts)return alerts;
  const body=await page.locator('body').innerText();
  return (body.match(/(?:an? account.{0,80}already exists|email.{0,50}already.{0,30}(?:registered|exists)|wrong email address.{0,100}|password.{0,80}(?:does not meet|cannot be|must not|previous password)|cannot reuse.{0,50}password|verification.{0,40}(?:expired|invalid))/i)||[])[0]||'';
 };
 for(let step=0;step<14;step++){
  await check();const screen=await workdayAuthScreen(page);
  if(screen==='application'){await persist({status:'active',verifiedAt:new Date(now()).toISOString(),pending:null,loginAttemptAt:null});await progress('Employer account access confirmed. Continuing application filling…');return;}
  if(screen==='forgot'||screen==='reset'||account.pending?.kind==='reset')throw new AuthPause('Complete password recovery in the employer browser, update the saved ATS password in Settings, then Continue processing. Daymark will not request or submit a password reset.','password_reset');
  if(screen==='captcha')throw new AuthPause('Complete the CAPTCHA in Chrome, then Continue processing. Your account progress is saved.','captcha');
  if(screen==='register'){
   if(account.status==='active'||account.pending?.kind==='reset') {await button('Sign In').click();await settle(screen);continue;}
   if(account.pending?.kind==='register'){
    await progress('Checking for the employer verification email…');
    // Never repeat account creation after an uncertain response.
    const message=await findMessage('verify',account.pending.since,account.usedMailIds||[]);
    if(message?.link){await check();await page.goto(message.link,{waitUntil:'domcontentloaded',timeout:30000});await persist({usedMailIds:[...(account.usedMailIds||[]),message.id].slice(-20)});await settle(screen);continue;}
    // The earlier registration response is uncertain. Do not submit Create Account again;
    // try the saved login once in case Workday created the account but its email is delayed.
    await progress('No verification email found. Trying the existing employer account with your saved login…');
    await button('Sign In').click();await settle(screen);continue;
   }
   await progress('Preparing a new employer account with your saved application email…');await fillEmail();
   const passwords=page.locator('input[type="password"]');if(await passwords.count()!==2)throw new AuthPause('Unrecognized registration fields. Complete registration in Chrome.');
   await passwords.nth(0).fill(credentials.password);await passwords.nth(1).fill(credentials.password);
   const consent=page.getByRole('checkbox',{name:/consent|privacy|agree/i}).first();
   if(await visible(consent)&&!await consent.isChecked()){
    const recognized=page.getByRole('checkbox',{name:'Yes, I consent',exact:true});
    if(!allowRegistrationConsent||await recognized.count()!==1||!await visible(recognized))throw new AuthPause('Registration details are filled. Review the employer consent in Chrome, select it if you agree, then Continue processing.');
    await check();await progress('Checking the authorized Workday registration consent…');await recognized.check();
    if(!await recognized.isChecked())throw new AuthPause('The registration consent could not be checked. Complete this step in Chrome.');
    await persist({registrationConsent:{label:'Yes, I consent',acceptedAt:new Date(now()).toISOString(),source:'user_authorized'}});
   }
   await check();await persist({status:'pending',pending:{kind:'register',since:now()-2000}});await button('Create Account').click();await settle(screen);
   const error=await errors();
   if(/already.{0,30}(?:exists|registered)|account.{0,30}exists/i.test(error)){await persist({pending:null,status:'existing'});await button('Sign In').click();await settle(screen);continue;}
   if(error){await persist({pending:null});throw new AuthPause('Workday could not create the account. Review its registration message in Chrome; the saved password may not meet its requirements.');}
   continue;
  }
  if(screen==='login'&&account.pending?.kind!=='reset'){
   if(!account.status&&!account.pending){const create=button('Create Account');if(await visible(create)){await create.click();await settle(screen);continue;}}
   if(account.pending?.kind==='register'){
    await progress('Checking the account verification email…');
    const mail=await findMessage('verify',account.pending.since,account.usedMailIds||[]);
    if(mail?.link){await check();await page.goto(mail.link,{waitUntil:'domcontentloaded',timeout:30000});await persist({usedMailIds:[...(account.usedMailIds||[]),mail.id].slice(-20),pending:null,status:'existing'});await settle(screen);continue;}
    // Some employers create accounts immediately without verification.
   }
   if(account.loginAttemptAt&&now()-account.loginAttemptAt<60000)throw new AuthPause('A sign-in was just attempted. Check the employer message or complete CAPTCHA in Chrome before continuing.');
   const emailField=page.getByRole('textbox',{name:/^Email Address\*?$/i});
   if(!await visible(emailField)){
    const emailSignIn=button(/^Sign in with email$/i);
    if(await visible(emailSignIn)){
     await progress('Opening email sign-in…');await emailSignIn.click();
     await emailField.waitFor({state:'visible',timeout:15000});await check();continue;
    }
   }
   await progress('Signing in to the employer account…');await fillEmail();await page.locator('input[type="password"]').first().fill(credentials.password);
   await persist({loginAttemptAt:now()});await button('Sign In').click();await settle(screen);
   const error=await errors();const body=await page.locator('body').innerText();
   if(/wrong email|incorrect|invalid (?:email|password)|account.*locked/i.test(error+' '+body)){
    throw new AuthPause('The saved employer password was not accepted. Complete password recovery in the employer browser, update the saved ATS password in Settings, then Continue processing. Daymark will not request or submit a password reset.');
   }
   if(await workdayAuthScreen(page)==='login')throw new AuthPause('Workday has not confirmed sign-in. Complete any employer check in Chrome, then Continue processing.');
   continue;
  }
  if(screen==='mail'||screen==='code'||(screen==='unknown'&&account.pending)){
   if(!account.pending&&(screen==='mail'||screen==='code')){
    // Account creation may have been completed by the user in the same browser.
    await persist({status:'pending',pending:{kind:'register',since:now()-15*60000,source:'browser_verification_checkpoint'}});
   }
   const pending=account.pending;if(!pending)throw new AuthPause('Complete employer verification in Chrome, then Continue processing.');
   if(pending.kind!=='register')throw new AuthPause('Complete employer verification in Chrome, then Continue processing.');
   await progress('Waiting for the employer verification email…');
   let mail;
   for(let poll=0;poll<3;poll++){await check();mail=await findMessage('verify',pending.since,account.usedMailIds||[]);if(mail||now()-started>120000)break;await wait(5000);}
   if(!mail&&pending.kind==='register'&&['mail','code','unknown'].includes(screen)){
    // The registration may have created the account even when its verification
    // message is delayed. Try the existing account once from the check-email page.
    const signInButton=button('Sign In'),signInLink=page.getByRole('link',{name:'Sign In',exact:true}).last();
    if(await visible(signInButton)||await visible(signInLink)){
     await progress('No verification email found. Trying the existing employer account with your saved login…');
     if(await visible(signInButton))await signInButton.click();else await signInLink.click();
     await settle(screen);
     if(await workdayAuthScreen(page)!=='login')throw new AuthPause('No matching employer verification email arrived. Open Sign In in Chrome, then Continue processing.');
     continue;
    }
   }
   if(!mail)throw new AuthPause('No matching employer verification email arrived yet. Check Proton Bridge or complete verification in Chrome, then Continue processing.');
   await check();
   if(mail.link){await page.goto(mail.link,{waitUntil:'domcontentloaded',timeout:30000});}
   else if(screen==='code'){
    await page.locator('input[autocomplete="one-time-code"],input[data-automation-id*="verificationCode" i]').first().fill(mail.code);
    const verify=button('Verify');if(!await visible(verify))throw new AuthPause('Verification code filled. Complete verification in Chrome.');await verify.click();
   }else throw new AuthPause('A matching code arrived, but the verification field is not visible. Complete verification in Chrome.');
   await settle(screen);
   if(await errors())throw new AuthPause('The employer rejected or expired the verification step. Review it in Chrome, then Continue processing.');
   await persist({usedMailIds:[...(account.usedMailIds||[]),mail.id].slice(-20)});continue;
  }
  if(screen==='unknown-auth')throw new AuthPause('This employer authentication step is not recognized. Complete it in Chrome, then Continue processing.');
  if(now()-started>120000)break;
  await wait(1000);
 }
 throw new AuthPause('Employer authentication is still pending. Check Chrome, then Continue processing.');
}

// Sign-in shapes for ATSs that use the bounded generic flow in ats-login.mjs.
// Registration is attempted only on a clearly labeled form with recognized fields;
// consent, extra required fields, password resets and challenges stay with the applicant.
//   entry           link or button on the posting that opens the sign-in screen
//   identifierFirst the email/username is asked on its own screen before the password
//   next / submit   accessible names of the two buttons
export const SIGN_IN_PROFILES=Object.freeze({
 icims:Object.freeze({entry:/^(log in|sign in|login)$/i,identifierFirst:true,next:/^(next|continue)$/i,submit:/^(log in|sign in|login|submit|continue)$/i,username:'input[name*="loginName" i]:visible,input[id*="loginName" i]:visible',registration:true}),
 avature:Object.freeze({entry:/^(sign in|log in|login)$/i,identifierFirst:false,next:/^(next|continue)$/i,submit:/^(sign in|log in|login)$/i,username:'input[name*="login" i]:visible,input[name*="username" i]:visible',registration:true}),
 successfactors:Object.freeze({entry:/^(sign in|log in|login)$/i,identifierFirst:false,next:/^(next|continue)$/i,submit:/^(sign in|log in|login)$/i,username:'input[name="j_username"]:visible,input[id="username"]:visible,input[name*="username" i]:visible',registration:true}),
});
export const signInProfileFor=adapterId=>Object.hasOwn(SIGN_IN_PROFILES,adapterId)?SIGN_IN_PROFILES[adapterId]:null;
