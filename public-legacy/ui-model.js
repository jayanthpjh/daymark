export function profileIdentity(state) {
  const name = state.resumeDraft?.fields?.name || state.profile?.name || '';
  return {name, needsReview: Boolean(state.resumeDraft) || !state.onboarding?.profileConfirmed};
}

export function setupReadiness(state, configured) {
  const requirements = [
    ['resume', 'Resume parsed', Boolean(state.profile?.resumeText && (state.resumeDraft || state.onboarding?.profileConfirmed)), 'profile'],
    ['profile', 'Profile confirmed', Boolean(state.onboarding?.profileConfirmed && state.profile?.name && state.profile?.roleSearch), 'profile'],
    ['answers', 'Answer pack completed', Boolean(state.answerPack?.completed), 'answers'],
    ['apify', 'Job feed key saved', Boolean(configured.apify), 'settings'],
    ['nvidia', 'Generation key saved', Boolean(configured.nvidia), 'settings'],
    ['email', 'Application email saved', Boolean(configured.email), 'settings'],
    ['proton', 'Bridge access configured', Boolean(configured.proton), 'settings'],
    ['ats', 'Default ATS password saved', Boolean(configured.ats), 'settings'],
  ].map(([id,label,complete,page])=>({id,label,complete,page}));
  return {ready: requirements.every(item=>item.complete), requirements, missing: requirements.filter(item=>!item.complete).map(item=>item.id)};
}

export const defaultJobFilters = {search:'', location:'', source:'', age:'', pay:'', status:'', sort:'recommended'};

export function jobDate(job) {
  const posted = Date.parse(job.posted);
  return Number.isFinite(posted) ? posted : Date.parse(job.first_seen_at || job.updatedAt || '') || 0;
}

export function jobStatus(job, tasks=[], applications=[]) {
  const application = applications.filter(item=>item.jobId===job.id || item.id===job.id).sort((a,b)=>Date.parse(b.updatedAt||'')-Date.parse(a.updatedAt||''))[0];
  if (application?.status==='submitted') return 'submitted';
  const related=tasks.filter(item=>item.jobId===job.id && item.type!=='collect');
  const task = (related.filter(item=>item.type==='fill'&&!['cancelled','completed'].includes(item.status)).length?related.filter(item=>item.type==='fill'&&!['cancelled','completed'].includes(item.status)):related).sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||'')-Date.parse(a.updatedAt||a.createdAt||''))[0];
  return application?.status || task?.status || 'not_started';
}

export function filterJobs(jobs, filters, tasks=[], applications=[], now=Date.now()) {
  const text = value=>String(value||'').toLowerCase();
  const result = jobs.filter(job=>{
    const search = `${job.company||''} ${job.role||''} ${(job.tags||[]).join(' ')}`;
    const age = jobDate(job);
    return (!filters.search || text(search).includes(text(filters.search))) &&
      (!filters.location || text(job.location).includes(text(filters.location))) &&
      (!filters.source || job.source===filters.source) &&
      (!filters.age || age>0 && now-age<=Number(filters.age)*86400000) &&
      (!filters.pay || (filters.pay==='listed')===Boolean(job.salary && !/not listed|unknown|not provided/i.test(job.salary))) &&
      (!filters.status || (filters.status==='in_flight'?['queued','running'].includes(jobStatus(job,tasks,applications)):jobStatus(job,tasks,applications)===filters.status));
  });
  return result.sort((a,b)=>filters.sort==='match' ? (b.match||0)-(a.match||0) || jobDate(b)-jobDate(a) : filters.sort==='newest'?jobDate(b)-jobDate(a):jobRecommendation(b,now)-jobRecommendation(a,now)||(b.match||0)-(a.match||0)||jobDate(b)-jobDate(a)||String(a.id).localeCompare(String(b.id)));
}

export function jobRecommendation(job,now=Date.now()){const date=jobDate(job);const freshness=date?100*Math.exp(-Math.max(0,now-date)/(7*86400000)):0;return .7*Math.max(0,Math.min(100,Number(job.match)||0))+.3*freshness;}
export function paginateJobs(jobs,page=1,pageSize=24){const pages=Math.max(1,Math.ceil(jobs.length/pageSize)),current=Math.max(1,Math.min(pages,Number(page)||1));return {items:jobs.slice((current-1)*pageSize,current*pageSize),page:current,pages,total:jobs.length,start:jobs.length?(current-1)*pageSize+1:0,end:Math.min(current*pageSize,jobs.length)};}
