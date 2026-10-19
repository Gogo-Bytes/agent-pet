import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { probeCodexStart } from './native-start.js';
const source = `
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
 const request=JSON.parse(line);
 if(request.method==='initialize') console.log(JSON.stringify({id:1,result:{private:'SECRET'}}));
 else if(request.method==='thread/start') {
   console.log(JSON.stringify(process.env.MODE==='error'?{id:2,error:{message:'SECRET'}}:
     process.env.MODE==='request'?{id:4,method:'private/request',params:{private:'SECRET'}}:{id:2,result:{thread:{id:'SECRET'}}}));
 } else if(request.method!=='initialized') process.exit(9);
});`;
async function fixture(mode: string, fn: (root: string, result: Awaited<ReturnType<typeof probeCodexStart>>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-codex-start-fixture-'));
  try {
    await mkdir(join(root, 'work'));
    const result = await probeCodexStart({ root, timeoutMs: 200, launch: () => spawn(process.execPath,
      ['-e', mode === 'timeout' ? 'setInterval(()=>{},1000)' : source], { detached: true, env: { MODE: mode }, stdio: ['pipe', 'pipe', 'pipe'] }) });
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
