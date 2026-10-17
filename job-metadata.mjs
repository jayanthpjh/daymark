export function safeImageUrl(value,base){try{const candidate=typeof value==='object'?value?.url||value?.contentUrl:value;if(typeof candidate!=='string'||!candidate.trim())return '';const url=new URL(candidate,base);return url.protocol==='https:'&&!url.username&&!url.password&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)?url.href:'';}catch{return '';}}
const decode=value=>String(value||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
export function postingMetadata(html,url){
 const nodes=[];const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){nodes.push(value);if(value['@graph'])visit(value['@graph']);}};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(match[1]));}catch{}
 const job=nodes.find(node=>[node['@type']].flat().includes('JobPosting'))||{};
 const org=job.hiringOrganization||{};
 const meta={};for(const match of html.matchAll(/<meta\b([^>]+)>/gi)){const attributes={};for(const attr of match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attributes[attr[1].toLowerCase()]=decode(attr[2]);const key=attributes.property||attributes.name;if(key)meta[key.toLowerCase()]=attributes.content||'';}
 const pageTitle=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim();
 const title=decode(job.title||meta['og:title']||pageTitle).replace(/<[^>]*>/g,'').trim();
 const titleCompany=pageTitle.match(/\bat\s+(.+?)(?:\s+[|–—-]\s+.*)?$/i)?.[1]?.trim()||'';
 const urlParts=new URL(url).pathname.split('/').filter(Boolean);
 const boardSlug=/job-boards\.greenhouse\.io$/i.test(new URL(url).hostname)?urlParts[0]:'';
 const slugCompany=boardSlug?boardSlug.split(/[-_]+/).filter(Boolean).map(part=>part[0].toUpperCase()+part.slice(1)).join(' '):'';
 const parts=title.split(/\s+[|–—-]\s+/);
 const address=[job.jobLocation].flat().filter(Boolean).map(loc=>loc.address).filter(Boolean).map(a=>[a.addressLocality,a.addressRegion,a.addressCountry].filter(Boolean).join(', ')).join(' · ');
 const descriptionText=decode(job.description||meta.description||meta['og:description']||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const descriptionLocation=descriptionText.match(/^(Remote(?:\s*[-–]\s*(?:US|U\.?S\.?|United States))?|[A-Z][A-Za-z.' -]+,\s*[A-Z]{2}(?:,\s*(?:US|United States))?)(?=[\s.,]|$)/)?.[1]||'';
 const salary=job.baseSalary?.value;const pay=salary&&(salary.minValue||salary.value)?`${job.baseSalary.currency||''} ${salary.minValue||salary.value}${salary.maxValue?'–'+salary.maxValue:''}${salary.unitText?' / '+salary.unitText:''}`:'';
 return {role:title?decode(job.title||parts[0]):'',company:decode(org.name||titleCompany||slugCompany||meta['og:site_name']||((parts.length>1)?parts.at(-1):new URL(url).hostname)),location:job.jobLocationType==='TELECOMMUTE'?'Remote':address||meta['og:locality']||descriptionLocation,posted:job.datePosted||'',salary:pay,description:decode(job.description||meta.description||meta['og:description']||'').replace(/<[^>]*>/g,' '),logoUrl:safeImageUrl(org.logo||nodes.find(n=>[n['@type']].flat().includes('Organization'))?.logo,url),companyWebsite:safeImageUrl(org.url||org.sameAs,url)};
}
