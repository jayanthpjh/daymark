import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAP={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','^':'\\textasciicircum{}','_':'\\_','%':'\\%','~':'\\textasciitilde{}'};
// Resume text is data: every character reaching the .tex goes through this.
export const escapeLatex=value=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/\s*\n\s*/g,' ').replace(/[\\{}$&#^_%~]/g,c=>MAP[c]);

const TITLES={SKILLS:'Technical Skills',SUMMARY:'Summary'};
const ORDER=['SUMMARY','EDUCATION','EXPERIENCE','PROJECTS','SKILLS'];
const dateLike=t=>/\b(?:19|20)\d{2}\b|\bPresent\b/i.test(t)&&t.length<70&&!/[.!?]$/.test(t)&&!/^[-•*]/.test(t);
const bullet=t=>/^[-•*]\s+/.test(t);
const unbullet=t=>t.replace(/^[-•*]\s+/,'');

export function parseResume(body,name=''){
  const lines=String(body).replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim());
  const sections=[];let head=[],cur=null;
  for(const line of lines){
    if(!line)continue;
    if(/^[A-Z][A-Z &/]+$/.test(line)&&line.length<40){cur={key:line,lines:[]};sections.push(cur);continue;}
    (cur?cur.lines:head).push(line);
  }
  if(name&&head[0]?.trim()===name.trim())head.shift();
  return {name:name||head.shift()||'',contact:head,sections};
}
export const resumeEntries=lines=>{ // [{title,sub,date,bullets,text}]
  const out=[];let cur=null;
  for(const line of lines){
    if(bullet(line)){if(!cur){cur={title:'',sub:'',date:'',bullets:[]};out.push(cur);}cur.bullets.push(unbullet(line));continue;}
    if(cur&&!cur.date&&!cur.bullets.length&&dateLike(line)&&cur.title){cur.date=line;continue;}
    const parts=line.split(' | ').map(x=>x.trim());
    let date='';if(parts.length>2&&dateLike(parts.at(-1)))date=parts.pop();
    cur={title:parts[0],sub:parts.slice(1).join(' | '),date,bullets:[]};out.push(cur);
  }
  return out;
};
const items=bs=>bs.length?`\\resumeItemListStart\n${bs.map(b=>`\\resumeItem{${escapeLatex(b)}}`).join('\n')}\n\\resumeItemListEnd\n`:'';
function renderSection(key,lines){
  if(key==='SKILLS')return lines.map(l=>{const m=/^([^:]{1,40}):\s*(.+)$/.exec(unbullet(l));return m?`\\textbf{${escapeLatex(m[1])}}{: ${escapeLatex(m[2])}}\\\\`:`${escapeLatex(unbullet(l))}\\\\`;}).join('\n');
  if(['EXPERIENCE','EDUCATION','PROJECTS'].includes(key))
    return `\\resumeSubHeadingListStart\n${resumeEntries(lines).map(e=>`\\resumeSubheading{${escapeLatex(e.title||'')}}{${escapeLatex(e.date||'')}}{${escapeLatex(e.sub||'')}}{}\n${items(e.bullets)}`).join('')}\\resumeSubHeadingListEnd`;
  return lines.map(l=>escapeLatex(unbullet(l))).join('\n\n');
}
const here=path.dirname(fileURLToPath(import.meta.url));
export async function renderJake(body,name='',{fontSize=11}={}){
  const {name:who,contact,sections}=parseResume(body,name);
  const pt=fontSize>=11.5?12:fontSize>=10.5?11:10;
  const pre=(await fs.readFile(path.join(here,'templates/jake/preamble.tex'),'utf8')).replace('%%PT%%',String(pt));
  const known=sections.filter(s=>s.lines.length).sort((a,b)=>{const r=k=>ORDER.includes(k)?ORDER.indexOf(k):ORDER.length;return r(a.key)-r(b.key);});
  const secs=known.map(s=>`\\section{${escapeLatex(TITLES[s.key]||s.key.charAt(0)+s.key.slice(1).toLowerCase())}}\n${renderSection(s.key,s.lines)}\n`).join('\n');
  return `${pre}\\begin{document}\n\\begin{center}\n\\textbf{\\Huge \\scshape ${escapeLatex(who)}} \\\\ \\vspace{1pt}\n${contact.length?`\\small ${contact.map(escapeLatex).join(' $|$ ')}\n`:''}\\end{center}\n\n${secs}\n\\end{document}\n`;
}

// Runs a command with no shell, a stripped env and a hard timeout. Resolves {code,timedOut}; rejects if it cannot start.
export const defaultRunner=(cmd,args,{cwd,timeoutMs})=>new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{cwd,shell:false,stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TECTONIC_CACHE_DIR:process.env.TECTONIC_CACHE_DIR}});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('close',code=>{clearTimeout(timer);resolve({code,timedOut});});
});
export const TECTONIC_ARGS=['--untrusted','--only-cached','resume.tex'];

export async function countPdfPages(pdf){
  try{
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc=await getDocument({data:new Uint8Array(pdf),useSystemFonts:true,verbosity:0}).promise;
    const n=doc.numPages;await doc.destroy();return n;
  }catch{return 0;}
}

// Returns true when outputPath was written from LaTeX; false means "use the pdfkit fallback". Never throws for build problems.
// A resume that runs past one page is rebuilt one size smaller (12 -> 11 -> 10pt); the smallest result is kept if it still spills.
export async function createLatexPdf(body,name,outputPath,{fontSize,runner=defaultRunner,timeoutMs=30_000,binary='tectonic',pageCounter=countPdfPages}={}){
  let dir,best=null;
  try{
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-tex-'));
    const start=fontSize>=11.5?12:fontSize>=10.5?11:10;
    for(const size of [12,11,10].filter(v=>v<=start)){
      await fs.writeFile(path.join(dir,'resume.tex'),await renderJake(body,name,{fontSize:size}),{mode:0o600});
      await fs.rm(path.join(dir,'resume.pdf'),{force:true});
      const r=await runner(binary,TECTONIC_ARGS,{cwd:dir,timeoutMs});
      if(!r||r.timedOut||r.code!==0){if(best)break;return false;}
      const pdf=await fs.readFile(path.join(dir,'resume.pdf'));
      if(pdf.subarray(0,4).toString()!=='%PDF'){if(best)break;return false;}
      best=pdf;
      if(await pageCounter(pdf)<=1)break;
    }
    if(!best)return false;
    await fs.writeFile(outputPath,best,{mode:0o600});return true;
  }catch{return false;}
  finally{if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
