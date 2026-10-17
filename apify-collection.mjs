export const feedLimit=200,dailyJobLimit=100;
export function apifyRunRequest(profile={}) {
 const input={limit:feedLimit,descriptionType:'text',includeCompanyDetails:true};
 for(const [field,key] of [['roleSearch','titleSearch'],['locationSearch','locationSearch']]){const values=String(profile[field]||'').split(/[\n,;]/).map(x=>x.trim()).filter(Boolean).slice(0,12);if(values.length)input[key]=values;}
 return {url:`https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-feed/runs?maxItems=${feedLimit}`,input};
}
export function apifyFailure(body,status){const error=new Error(String(body?.error?.message||`Apify request failed (${status}).`).slice(0,400));error.providerErrorCode=String(body?.error?.type||body?.error?.code||`http-${status}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);return error;}
export function newCollectionJobs(items,existingJobs,newCount,normalize){const urls=new Set(existingJobs.map(job=>job.url)),jobs=[];for(const item of items){if(jobs.length>=Math.max(0,dailyJobLimit-newCount))break;const job=normalize(item);if(!job||urls.has(job.url))continue;jobs.push(job);urls.add(job.url);}return jobs;}
