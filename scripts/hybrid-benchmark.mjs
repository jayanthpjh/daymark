// Synthetic fixtures only. Uses configured endpoints; never reads applicant state or saved credentials.
import { performance } from 'node:perf_hooks';
import { requestLlmJson } from '../llm-client.mjs';
import { understandForm } from '../form-understanding.mjs';
import { tailorResume, identityLinesIntact } from '../tailoring-engine.mjs';
import { reviewFactualDraft } from '../factual-review.mjs';

const source = 'Alex Example\napplicant@example.test\n\nSUMMARY\nSoftware engineer building reporting tools.\n\nSKILLS\nPython, SQL\n\nEXPERIENCE\nEngineer, Example Company\n2021 - 2024\n- Built 12 reporting tools with Python and SQL.\n\nEDUCATION\nB.S. Computer Science, Example University, 2021';
const description = 'Software engineer to build reporting tools with Python and SQL.';
const repeats = Number(process.env.BENCHMARK_REPEATS || 3);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) throw new Error('BENCHMARK_REPEATS must be 1–20.');
if (!process.env.LLM_BASE_URL || !process.env.NVIDIA_API_KEY) throw new Error('Set LLM_BASE_URL, LLM_MODEL, NVIDIA_API_KEY and NVIDIA_MODEL explicitly for this benchmark.');
const measurements = [];
for (let index = 0; index < repeats; index++) {
  for (const task of ['form', 'tailor']) {
    const started = performance.now();
    let passed = false, error = '';
    try {
      if (task === 'form') {
        const mapping = await understandForm([{id:'email',label:'Email',type:'email',value:''},{id:'consent',label:'I consent to terms',type:'checkbox',manual:true}], {env:process.env});
        passed = mapping.email === 'email' && !Object.hasOwn(mapping, 'consent');
      } else {
        const llm = async (messages, maxTokens) => (await requestLlmJson({task, messages, maxTokens})).value;
        const draft = await tailorResume({mode:'strong',source,description,llm});
        await reviewFactualDraft({source,...draft,llm});
        passed = !draft.fellBack && !draft.claims.length && !identityLinesIntact(source,draft.resume).length;
      }
    } catch { error = 'Request or quality validation failed'; }
    measurements.push({task,seconds:Number(((performance.now()-started)/1000).toFixed(2)),passed,error});
  }
}
const summary = ['form','tailor'].map(task => {
  const samples = measurements.filter(item=>item.task===task), times=samples.map(item=>item.seconds).sort((a,b)=>a-b);
  return {task,model:task==='form'?process.env.LLM_MODEL:process.env.NVIDIA_MODEL,samples:samples.length,passed:samples.filter(item=>item.passed).length,medianSeconds:times[Math.floor(times.length/2)],p95Seconds:times[Math.ceil(times.length*.95)-1]};
});
console.log(JSON.stringify({synthetic:true,summary,measurements},null,2));
if (measurements.some(item=>!item.passed)) process.exitCode=1;
