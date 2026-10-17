import {createHash} from 'node:crypto';
export const protectedApplications=Object.freeze([
 {jobId:'manual-e96173eb-2d0c-47f2-86f8-ce0869b1baad',company:'Quisitive'},
 {jobId:'manual-324af38d-0f44-4718-9a58-ddec0e06d899',company:'Newsela'},
]);
export function cleanupPreview(state){
 const keep=new Set(protectedApplications.map(a=>a.jobId));
 for(const expected of protectedApplications){const app=state.applications.find(a=>a.jobId===expected.jobId);if(!app||app.status!=='submitted'||!app.submittedAt||!app.receipt?.proof)throw Error(`Cannot verify protected ${expected.company} submission and receipt.`);}
 if(state.tasks.some(t=>['queued','running'].includes(t.status)))throw Error('Pause queued work and wait for running applications to stop before cleanup.');
 const jobs=state.jobs.filter(j=>!keep.has(j.id)).map(j=>j.id).sort();
 const tasks=state.tasks.filter(t=>!keep.has(t.jobId)).map(t=>t.id).sort();
 const applications=state.applications.filter(a=>!keep.has(a.jobId)).map(a=>a.id||a.jobId).sort();
 const paths=value=>{const found=[];const walk=x=>{if(typeof x==='string'&&x.startsWith('/'))found.push(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')Object.values(x).forEach(walk);};walk(value);return found;};
 const protectedPaths=new Set(paths({tasks:state.tasks.filter(t=>keep.has(t.jobId)),applications:state.applications.filter(a=>keep.has(a.jobId)),profile:state.profile}));
 const files=[...new Set(paths(state.tasks.filter(t=>tasks.includes(t.id)).map(t=>t.artifacts)))].filter(p=>!protectedPaths.has(p)).sort();
 const fingerprint=createHash('sha256').update(JSON.stringify({jobs,tasks,applications,files,protected:state.applications.filter(a=>keep.has(a.jobId))})).digest('hex');
 return {fingerprint,protected:protectedApplications,counts:{postings:jobs.length,tasks:tasks.length,applications:applications.length,documentReferences:files.length},jobs,tasks,applications,files};
}
export function applyCleanup(state,preview,confirmedFingerprint){
 const current=cleanupPreview(state);if(current.fingerprint!==confirmedFingerprint||preview.fingerprint!==current.fingerprint)throw Error('Cleanup preview changed. Review a fresh preview.');
 state.jobs=state.jobs.filter(j=>!current.jobs.includes(j.id));state.tasks=state.tasks.filter(t=>!current.tasks.includes(t.id));state.applications=state.applications.filter(a=>!current.applications.includes(a.id||a.jobId));
 state.preferences||={};state.preferences.autoApply={...state.preferences.autoApply,enabled:false};
 state.cleanup={at:new Date().toISOString(),fingerprint:current.fingerprint,pendingFiles:current.files,deletedCounts:current.counts};return state;
}
