import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Local development has no container/systemd restart policy. Keep one child only.
export function supervise({spawnChild, schedule=setTimeout, cancel=clearTimeout,
  now=Date.now, log=event=>console.error(JSON.stringify({...event,at:new Date().toISOString()})),
  onExit=()=>{}, maxRestarts=5}={}) {
  let child, timer, stopping=false, restarts=0, startedAt=0;
  const start=()=>{
    timer=null;if(stopping)return;
    startedAt=now();let finished=false;
    const finish=(code,signal)=>{
      if(finished)return;finished=true;child=null;
      if(stopping){onExit(0);return;}
      if(now()-startedAt>=60_000)restarts=0;
      if(restarts>=maxRestarts){log({event:'service_restart_limit'});onExit(1);return;}
      const delayMs=Math.min(1000*2**restarts++,30_000);
      log({event:'service_restart_scheduled',code:code??null,signal:signal??null,delayMs});
      timer=schedule(start,delayMs);
    };
    try {
      child=spawnChild();
      child.once('error',()=>finish(1,null));
      child.once('exit',finish);
    }catch{finish(1,null);}
  };
  start();
  return {stop(signal='SIGTERM'){
    if(stopping)return;stopping=true;if(timer!==null)cancel(timer);
    if(child)child.kill(signal);else onExit(0);
  }};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const entry=fileURLToPath(new URL('../server.mjs',import.meta.url));
  const runner=supervise({spawnChild:()=>spawn(process.execPath,[...process.execArgv,entry],{stdio:'inherit',env:process.env}),onExit:code=>process.exit(code)});
  process.on('SIGINT',()=>runner.stop('SIGINT'));
  process.on('SIGTERM',()=>runner.stop('SIGTERM'));
}
