import test from 'node:test';
import assert from 'node:assert/strict';
import { authPreflightScreen, assertAuthenticatedBeforeApplicationData } from '../ats-auth-preflight.mjs';

function fixture(screen) {
  return {
    url: () => `https://careers.example.test/${screen}`,
    locator: selector => ({
      first() { return this; },
      count: async () => Number(
        (selector.includes('logout') && screen === 'authenticated') ||
        (selector.includes('captcha') && screen === 'captcha') ||
        (selector.includes('new-password') && screen === 'reset') ||
        (selector.includes('one-time-code') && screen === 'code') ||
        (selector.includes('type="password"') && ['login', 'register', 'reset'].includes(screen))
      ),
      isVisible: async () => selector.includes('new-password') ? screen === 'reset' : selector.includes('captcha') ? screen === 'captcha' : selector.includes('one-time-code') ? screen === 'code' : selector.includes('password') ? ['login', 'register', 'reset'].includes(screen) : false,
      evaluateAll: async () => false,
    }),
    getByRole: (role, { name }) => ({
      first() { return this; },
      count: async () => Number(role === 'heading' && (
        (name === 'Sign In' && screen === 'login') ||
        (name === 'Create Account' && screen === 'register') ||
        (['Reset Password', 'Change Password'].includes(name) && screen === 'reset')
      )),
      isVisible: async () => role === 'heading' && /^(sign in|log in|login|create account|register|sign up)$/i.test(String(name)) && ((name === 'Sign In' && screen === 'login') || (name === 'Create Account' && screen === 'register')),
    }),
    evaluate: async () => screen === 'authenticated' ? '' : screen === 'guest' ? 'Apply now' : screen,
  };
}

test('detects unresolved authentication and hard challenges before filling', async () => {
  for (const screen of ['login', 'register', 'reset', 'code', 'captcha', 'guest']) assert.notEqual(await authPreflightScreen(fixture(screen)), 'authenticated');
  assert.equal(await authPreflightScreen(fixture('authenticated'),{authenticated:true}), 'authenticated');
});
test('refuses profile transmission until authenticated proof is visible', async () => {
  await assert.rejects(assertAuthenticatedBeforeApplicationData(fixture('login')), /authentication is required/i);
  await assert.rejects(assertAuthenticatedBeforeApplicationData(fixture('guest')), /applicant account/i);
  await assertAuthenticatedBeforeApplicationData(fixture('authenticated'),{authenticated:true});
});
test('guest mode still pauses on sign-in, verification and CAPTCHA screens',async()=>{
  assert.equal(await authPreflightScreen(fixture('guest'),{guest:true}),'guest_only');
  assert.equal(await authPreflightScreen(fixture('unknown-page'),{guest:true}),'unknown');
  assert.equal(await authPreflightScreen(fixture('guest'),{guest:false}),'guest_only');
  assert.equal(await authPreflightScreen(fixture('captcha'),{guest:true}),'captcha');
  assert.equal(await authPreflightScreen(fixture('code'),{guest:true}),'verification');
  assert.equal(await authPreflightScreen(fixture('login'),{guest:true}),'authentication');
});
test('a passive reCAPTCHA notice is not an account or a visible challenge',async()=>{
  const page=fixture('guest');const evaluate=page.evaluate;page.evaluate=async()=> 'Apply now. This site is protected by reCAPTCHA.';
  assert.equal(await authPreflightScreen(page,{guest:true}),'guest_only');
  assert.equal(await authPreflightScreen(page,{guest:false}),'guest_only');
});

test('guest-capable ATS forms pass the gate, account-only forms do not',async()=>{
 assert.equal(await assertAuthenticatedBeforeApplicationData(fixture('guest'),{guest:true}),true);
 await assert.rejects(assertAuthenticatedBeforeApplicationData(fixture('guest'),{guest:false}),/applicant account/i);
 for(const screen of ['login','register','reset','code','captcha'])await assert.rejects(assertAuthenticatedBeforeApplicationData(fixture(screen),{guest:true}));
});
test('a guest form with a header sign-in link and applicant fields is still a guest form',async()=>{
 const page=fixture('unknown-page');
 page.locator=(selector=>{const base=fixture('unknown-page').locator(selector);return {...base,evaluateAll:async()=>selector.includes('input:not')?5:false};});
 assert.equal(await authPreflightScreen(page,{guest:true}),'guest_only');
 assert.equal(await authPreflightScreen(page,{guest:false}),'unknown');
});
