import fs from 'node:fs/promises';
import path from 'node:path';

export async function clearStaleBrowserSingletons(profilePath){
 await Promise.all(['SingletonLock','SingletonSocket','SingletonCookie'].map(name=>fs.rm(path.join(profilePath,name),{force:true})));
}

export async function navigateEmployer(page,url,{progress=async()=>{},attempts=3}={}){
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});}
  catch(error){if(attempt===attempts||!/ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION|ERR_TIMED_OUT|ERR_ABORTED|Timeout/i.test(String(error.message)))throw error;await progress(`Employer page retry ${attempt+1} of ${attempts}…`);await page.waitForTimeout(500*attempt);}
 }
}
export function isBlankBrowserPage(url){return url==='about:blank'||url==='about:srcdoc'||!url;}
export function employerIdentity(original,resolved){const source=new URL(original),target=new URL(resolved);if(target.protocol!=='https:'||target.username||target.password)throw new Error('The employer address is not a supported secure application URL.');const parts=target.pathname.split('/').filter(Boolean);return {originalPostingUrl:source.href,resolvedEmployerUrl:target.href,host:target.hostname,applicationPath:target.pathname,careerSite:/^[a-z]{2}-[a-z]{2}$/i.test(parts[0]||'')?parts[1]:parts[0],requisition:target.pathname.match(/_([a-z0-9]+)(?:\/|$)/i)?.[1]||''};}
export function matchesEmployer(identity,url){try{const target=new URL(url);if(target.protocol!=='https:'||target.hostname!==identity.host)return false;if(identity.requisition&&!target.pathname.includes('_'+identity.requisition))return false;if(/myworkdayjobs\.com$/i.test(identity.host)){const parts=target.pathname.split('/').filter(Boolean);const site=/^[a-z]{2}-[a-z]{2}$/i.test(parts[0]||'')?parts[1]:parts[0];if(site!==identity.careerSite)return false;}else if(identity.applicationPath&&target.pathname!==identity.applicationPath)return false;return true;}catch{return false;}}

export function applicationRecoveryUrl(task,{postingUrl,embedUrl=''}){
 const hostOf=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.hostname:'';}catch{return '';}};
 const allowed=new Set([hostOf(postingUrl),hostOf(embedUrl),task.employerIdentity?.host,task.landedHost].filter(Boolean));
 for(const value of [task.checkpoint?.url,task.employerIdentity?.resolvedEmployerUrl,embedUrl,postingUrl]){
  const host=hostOf(value);if(host&&allowed.has(host))return value;
 }
 throw new Error('No verified employer address is available. Open the original posting to restart this application.');
}
