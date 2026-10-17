// Launches a headless Chromium for fixture tests. Falls back to any Chromium build already installed on this
// Mac when the build Playwright expects is missing, so browser tests run instead of silently skipping.
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
function fallbackExecutables(){
  const found=[];
  if(process.env.DAYMARK_TEST_CHROME)found.push(process.env.DAYMARK_TEST_CHROME);
  const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
  try{
    for(const dir of fs.readdirSync(cache).filter(name=>name.startsWith('chromium_headless_shell-')).sort().reverse()){
      for(const arch of fs.readdirSync(path.join(cache,dir)))found.push(path.join(cache,dir,arch,'chrome-headless-shell'));
    }
  }catch{}
  found.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return found.filter(file=>fs.existsSync(file));
}
export async function launchTestBrowser(){
  try{return await chromium.launch({headless:true});}catch{}
  for(const executablePath of fallbackExecutables()){
    try{return await chromium.launch({headless:true,executablePath});}catch{}
  }
  return null;
}
