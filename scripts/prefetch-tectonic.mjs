// One-time: renders a sample Jake resume with network access so Tectonic caches the LaTeX packages the template needs.
// After this, Daymark renders with `--only-cached` and never touches the network. Run again only if Tectonic reports a missing file.
import {spawnSync} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {renderJake} from '../latex-resume.mjs';

const sample='Alex Doe\napply@example.test | 555-0100\n\nSUMMARY\nData engineer.\n\nSKILLS\nPython, SQL, Snowflake\n\nEXPERIENCE\nSenior Data Engineer, Northwind Analytics\nMar 2021 - Present\n- Rebuilt 120 dbt models on Snowflake.\n\nEDUCATION\nB.S. Computer Science, University of Texas at Austin, 2018';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-tectonic-prefetch-'));
try{
  console.log('Rendering a sample resume at 10, 11 and 12pt. Tectonic will download LaTeX packages the first time; this can take a minute.');
  for(const fontSize of [10,11,12]){
    await fs.writeFile(path.join(dir,'resume.tex'),await renderJake(sample,'Alex Doe',{fontSize}));
    const run=spawnSync('tectonic',['--untrusted','resume.tex'],{cwd:dir,stdio:'inherit',timeout:300_000});
    if(run.error||run.status!==0){console.error(`Prefetch failed at ${fontSize}pt. Check your network and that tectonic is on PATH.`);process.exitCode=1;break;}
    const pdf=await fs.readFile(path.join(dir,'resume.pdf'));console.log(`${fontSize}pt ok: ${pdf.length} byte PDF.`);
  }
  if(!process.exitCode)console.log('The package cache is ready for offline renders.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
