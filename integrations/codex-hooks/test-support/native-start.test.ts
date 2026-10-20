import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { probeCodexStart, classifyRpcError } from './native-start.js';
const source = `
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
 const request=JSON.parse(line);
 if(request.method==='initialize') console.log(JSON.stringify({id:1,result:{private:'SECRET'}}));
 else if(request.method==='hooks/list' && process.env.MODE==='hooks') {
   console.log(JSON.stringify({id:3,result:{data:[{cwd:'SECRET',errors:[],warnings:[],hooks:[{enabled:true,trustStatus:'untrusted',eventName:'sessionStart',source:'user',sourcePath:process.env.ROOT+'/config/hooks.json',handlerType:'command',command:'known command',currentHash:'SECRET'}]}]}}));
 }
 else if(request.method==='thread/start') {
   console.log(JSON.stringify(process.env.MODE==='error'?{id:2,error:{message:'SECRET'}}:
     process.env.MODE==='request'?{id:4,method:'private/request',params:{private:'SECRET'}}:{id:2,result:{thread:{id:'SECRET'}}}));
 } else if(request.method!=='initialized') process.exit(9);
});`;
async function fixture(mode: string, fn: (root: string, result: Awaited<ReturnType<typeof probeCodexStart>>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-codex-start-fixture-'));
  try {
    await mkdir(join(root, 'work'));
    const result = await probeCodexStart({ root, timeoutMs: 200, ...(mode === 'hooks' ? { mode: 'hooks-only', expectedHookCommand: 'known command' } as const : {}), launch: () => spawn(process.execPath,
      ['-e', mode === 'timeout' ? 'setInterval(()=>{},1000)' : source], { detached: true, env: { MODE: mode, ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'] }) });
    await fn(root, result);
  } finally { await rm(root, { recursive: true, force: true }); }
}
it('sends only initialize/thread-start and stores no server text or native identity', async () => fixture('ok', async (root, result) => {
  expect(result).toMatchObject({ initialized: true, threadStarted: true, rpcError: false, events: [], outcome: 'thread-started' });
  expect(await readFile(join(root, 'result.json'), 'utf8')).not.toContain('SECRET');
}));
it.each(['error', 'request', 'timeout'])('stops on %s without authorizing or starting a model task', async mode => fixture(mode, async (_root, result) => {
  expect(result.threadStarted).toBe(false);
  expect(result.outcome).toBe(mode === 'error' ? 'rpc-error' : mode === 'request' ? 'server-request' : 'timeout');
  expect(result.events).toEqual([]);
}));
it('stops an owned same-group descendant even when the group leader closes first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-codex-descendant-'));
  let pid: number | undefined;
  try {
    await mkdir(join(root, 'work'));
    const code = `
const fs=require('node:fs'), cp=require('node:child_process'), readline=require('node:readline');
const file=process.env.FIXTURE_ROOT+'/child.json';
cp.spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});require("node:fs").writeFileSync('+JSON.stringify(file)+',JSON.stringify({pid:process.pid}));setInterval(()=>require("node:fs").appendFileSync('+JSON.stringify(file+'.heartbeat')+',"."),20)'],{stdio:'ignore'});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const req=JSON.parse(line);
 if(req.id===1) console.log(JSON.stringify({id:1,result:{}}));
 if(req.id===2){const timer=setInterval(()=>{if(fs.existsSync(file)){clearInterval(timer);console.log(JSON.stringify({id:2,result:{thread:{id:'fixture'}}}));}},10);}
});`;
    const result = await probeCodexStart({ root, timeoutMs: 3000,
      launch: () => spawn(process.execPath, ['-e', code], { detached: true, env: { FIXTURE_ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'] }) });
    pid = JSON.parse(await readFile(join(root, 'child.json'), 'utf8')).pid;
    expect(result.outcome).toBe('thread-started');
    // SIGKILL delivery/reaping is asynchronous; kill(pid,0) can still see a zombie.
    // Prove no descendant keeps executing, rather than requiring immediate PID removal.
    await new Promise(done => setTimeout(done, 50));
    const heartbeat = join(root, 'child.json.heartbeat');
    const count = async () => readFile(heartbeat, 'utf8').then(text => text.length, () => 0);
    const before = await count(); expect(before).toBeGreaterThan(0);
    await new Promise(done => setTimeout(done, 200));
    expect(await count()).toBe(before);
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* already reaped */ } }
    await rm(root, { recursive: true, force: true });
  }
});

it('classifies only bounded error codes/categories without exposing error text', () => {
  expect(classifyRpcError({code:-32602,message:'SECRET'})).toEqual({kind:'invalid-params',code:-32602});
  expect(classifyRpcError({code:-32601,message:'SECRET'})).toEqual({kind:'unsupported-method',code:-32601});
  expect(classifyRpcError({message:'Hook trust required SECRET'})).toEqual({kind:'hook-trust-required',code:null});
  expect(classifyRpcError({message:'Authentication required SECRET'})).toEqual({kind:'authentication-required',code:null});
  expect(classifyRpcError({message:'Sandbox failed SECRET'})).toEqual({kind:'sandbox-rejected',code:null});
  expect(classifyRpcError({code:Infinity,message:'SECRET'})).toEqual({kind:'unknown',code:null});
});

it('queries only hook status without creating a thread or changing trust', async () => fixture('hooks', async (root, result) => {
  expect(result).toMatchObject({initialized:true,threadStarted:false,outcome:'hooks-listed',hookStatus:{own:1,untrusted:1,trusted:0}});
  expect(await readFile(join(root,'hook-status.json'),'utf8')).not.toContain('SECRET');
}));

it('rejects arbitrary result paths before launching and preserves exclusive review evidence', async () => {
  const launch = vi.fn();
  await expect(probeCodexStart({root:'/unused',launch,
    // @ts-expect-error Exercise the JavaScript caller boundary.
    resultFileName:'../outside.json'})).rejects.toThrow('Invalid isolated result path');
  expect(launch).not.toHaveBeenCalled();
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-codex-review-fixture-'));
  try {
    await mkdir(join(root,'work'));
    const run = () => probeCodexStart({root,resultFileName:'review-status.json',mode:'hooks-only',expectedHookCommand:'known command',
      launch: () => spawn(process.execPath,['-e',source],{detached:true,env:{MODE:'hooks',ROOT:root},stdio:['pipe','pipe','pipe']})});
    await run();
    const first = await readFile(join(root,'review-status.json'),'utf8');
    expect(first).not.toContain('SECRET');
    await expect(run()).rejects.toMatchObject({code:'EEXIST'});
    expect(await readFile(join(root,'review-status.json'),'utf8')).toBe(first);
  } finally { await rm(root,{recursive:true,force:true}); }
});

it('keeps the authenticated receiver alive for a SessionStart arriving after the thread acknowledgement', async () => {
  const root=await mkdtemp(join(tmpdir(),'agent-pet-codex-hook-order-'));
  const code=`const readline=require('node:readline'),http=require('node:http'),crypto=require('node:crypto');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);
 if(request.id===1)console.log(JSON.stringify({id:1,result:{}}));
 if(request.id===2){console.log(JSON.stringify({id:2,result:{thread:{id:'fixture'}}}));setTimeout(()=>{
 const body=JSON.stringify({schemaVersion:1,runId:process.env.AGENT_PET_CODEX_RUN_ID,eventId:crypto.randomUUID(),fact:{kind:'session-started',providerSessionId:'fixture',source:'startup'}});
 const req=http.request(process.env.AGENT_PET_CODEX_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.AGENT_PET_CODEX_TOKEN,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>res.resume());req.on('error',()=>{});req.end(body);
 },50);}
});`;
  try {
    await mkdir(join(root,'work'));
    const result=await probeCodexStart({root,timeoutMs:1000,
      waitForSessionStart:true,
      launch:env=>spawn(process.execPath,['-e',code],{detached:true,env,stdio:['pipe','pipe','pipe']})});
    expect(result.threadStarted).toBe(true);
    expect(result.events).toContainEqual({kind:'session-started',hasTurnId:false,hasChildId:false,source:'startup'});
  } finally {await rm(root,{recursive:true,force:true});}
});

it('never treats thread acknowledgement alone as the expected hook callback',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agent-pet-codex-no-hook-'));
 try {
  await mkdir(join(root,'work'));
  const result=await probeCodexStart({root,timeoutMs:100,waitForSessionStart:true,
   launch:()=>spawn(process.execPath,['-e',source],{detached:true,env:{MODE:'ok',ROOT:root},stdio:['pipe','pipe','pipe']})});
  expect(result.threadStarted).toBe(true);expect(result.events).toEqual([]);expect(result.outcome).toBe('timeout');
 } finally{await rm(root,{recursive:true,force:true});}
});
