import { collectionRoleTerms } from './job-sources/role-families.mjs';
export const feedLimit=200,dailyJobLimit=100;
export function apifyRunRequest(profile={}) {
 const input={limit:feedLimit,descriptionType:'text',includeCompanyDetails:true};
 const titleSearch=profile.roleFamilies?.length?collectionRoleTerms(profile.roleSearch,profile.roleFamilies,{limit:12,rotation:Math.floor(Date.now()/(5*60*1000))}):String(profile.roleSearch||'').split(/[\n,;]/).map(x=>x.trim()).filter(Boolean).slice(0,12);
 if(titleSearch.length)input.titleSearch=titleSearch;
 const locations=String(profile.locationSearch||'').split(/[\n,;]/).map(x=>x.trim()).filter(Boolean).slice(0,12);if(locations.length)input.locationSearch=locations;
 return {url:`https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-feed/runs?maxItems=${feedLimit}`,input};
}
export function apifyFailure(body,status){const error=new Error(String(body?.error?.message||`Apify request failed (${status}).`).slice(0,400));error.providerErrorCode=String(body?.error?.type||body?.error?.code||`http-${status}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);return error;}
export function newCollectionJobs(items,existingJobs,newCount,normalize){const urls=new Set(existingJobs.map(job=>job.url)),jobs=[];for(const item of items){if(jobs.length>=Math.max(0,dailyJobLimit-newCount))break;const job=normalize(item);if(!job||urls.has(job.url))continue;jobs.push(job);urls.add(job.url);}return jobs;}
