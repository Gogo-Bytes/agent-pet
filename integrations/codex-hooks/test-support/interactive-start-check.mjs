import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {lstat,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import {prepareIsolated} from './isolated-context.mjs';
import {startAccountProxy} from './account-proxy.mjs';
import {withTemporaryAuth} from './temporary-auth.mjs';
const retry=process.argv[2]==='--run-authorized-interactive-start-r1';
const prefix=retry?'review-interactive-r1':'review-interactive';
const receiverName=retry?'interactive-r1-receiver.cjs':'interactive-receiver.cjs';
if((!retry && process.argv[2]!=='--run-authorized-interactive-start') || process.argv.length!==3 || !process.stdin.isTTY) {
 console.error('Explicit interactive-start argument and terminal required.');process.exitCode=1;
} else {
 let proxy,receiver,child,live=false;
 const events=[];
 try {
  const ctx=await prepareIsolated(prefix);await ctx.verify();
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,ssr:resolve('integrations/codex-hooks/transport.ts'),outDir:join(ctx.root,'runtime'),emptyOutDir:false,rollupOptions:{output:{format:'cjs',entryFileNames:receiverName}}}});
  const entry=(Array.isArray(output)?output[0]:output).output.find(item=>item.type==='chunk'&&item.isEntry);
  if(!entry)throw new Error('Missing standalone entry');
  const file=join(ctx.root,'runtime',receiverName);await writeFile(file,entry.code,{flag:'wx',mode:0o600});
  const {startCodexHookReceiver}=createRequire(import.meta.url)(file);
  const run=randomUUID(),token=randomBytes(32).toString('hex');
  receiver=await startCodexHookReceiver({token,acceptRun:id=>live && id===run,onFact:({fact})=>{
   if(events.length<32){const item={kind:fact.kind,...(fact.kind==='session-started'?{source:fact.source}:{})};events.push(item);console.log('\n'+JSON.stringify({nativeHook:item}));}
  }});
  proxy=await startAccountProxy();
  const code=await withTemporaryAuth('/Users/gan/.codex/auth.json',join(ctx.root,'config/auth.json'),()=>new Promise((done,reject)=>{
   child=spawn('/usr/bin/sandbox-exec',['-p',ctx.profile,ctx.executable,'--no-daemon','--no-alt-screen','-c','cli_auth_credentials_store="file"'],{
    cwd:join(ctx.root,'work'),env:{...ctx.environment,...proxy.environment,...(retry?{NODE_OPTIONS:'--require='+join(ctx.root,'runtime/shape-preload.cjs'),AGENT_PET_CODEX_SHAPE_FILE:join(ctx.root,'runtime/startup-shape.ndjson')}:{}),AGENT_PET_CODEX_URL:receiver.url,AGENT_PET_CODEX_TOKEN:token,AGENT_PET_CODEX_RUN_ID:run},stdio:'inherit'});
   live=true;
   let force;
   const stop=()=>{child.kill('SIGTERM');force??=setTimeout(()=>child.kill('SIGKILL'),1000);};
   const deadline=setTimeout(stop,45000);
   const cleanup=()=>{live=false;clearTimeout(deadline);clearTimeout(force);process.off('SIGINT',stop);process.off('SIGTERM',stop);};
   process.on('SIGINT',stop);process.on('SIGTERM',stop);
   child.once('error',error=>{cleanup();reject(error);});child.once('exit',()=>{live=false;});child.once('close',code=>{cleanup();done(code);});
  }));
  await ctx.verify();
  const summary={mode:'interactive',exitCode:code,events,sessionStarted:events.some(event=>event.kind==='session-started'),sessionEnded:events.some(event=>event.kind==='session-ended'),accountGateway:proxy.summary(),credentialsRemoved:await lstat(join(ctx.root,'config/auth.json')).then(()=>false,error=>error.code==='ENOENT')};
  await writeFile(join(ctx.root,retry?'interactive-r1-review-start.json':'interactive-review-start.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});
  console.log('\n'+JSON.stringify({interactiveResult:summary}));
  if(code!==0 || !summary.sessionStarted || !summary.credentialsRemoved)process.exitCode=1;
 } catch {console.error('INTERACTIVE_START_STOPPED; daily configuration untouched');process.exitCode=1;}
 finally{live=false;await receiver?.stop();await proxy?.stop();}
}
