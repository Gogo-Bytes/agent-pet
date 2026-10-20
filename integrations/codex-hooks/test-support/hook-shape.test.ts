import {mkdtemp,readFile,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {build} from 'vite';
import {PassThrough} from 'node:stream';
import {expect,it} from 'vitest';
import {hookShape,recordHookShape,observeHookShape} from './hook-shape.js';
it('projects only known event/source and field types, never private or unknown strings',()=>{
 const shape=hookShape(JSON.stringify({hook_event_name:'SessionStart',session_id:'PRIVATE_ID',turn_id:null,agent_id:null,source:'startup',prompt:'PRIVATE_PROMPT',transcript_path:'PRIVATE_PATH',unknown:'PRIVATE_TOKEN'}));
 expect(shape).toMatchObject({event:'SessionStart',sessionIdType:'string',turnIdType:'null',agentIdType:'null',source:'startup',normalized:'invalid',detail:'identity'});
 expect(JSON.stringify(shape)).not.toContain('PRIVATE');
 expect(hookShape('{broken')).toMatchObject({event:'unknown',normalized:'invalid',detail:'json'});
 expect(JSON.stringify(hookShape(JSON.stringify({hook_event_name:'PRIVATE',source:'PRIVATE',reason:'PRIVATE'})))).not.toContain('PRIVATE');
});
it('appends bounded metadata only to a protected own record and refuses unsafe files or links',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agent-pet-hook-shape-fixture-'));
 try {
  const file=join(root,'shape.ndjson'),input=JSON.stringify({hook_event_name:'SessionEnd',session_id:'PRIVATE',reason:'other'});
  await writeFile(file,'',{mode:0o600});recordHookShape(file,input);
  const first=await readFile(file,'utf8');expect(first).not.toContain('PRIVATE');expect(JSON.parse(first).event).toBe('SessionEnd');
  await chmod(file,0o644);recordHookShape(file,input);expect(await readFile(file,'utf8')).toBe(first);
  await chmod(file,0o600);const link=join(root,'link');await symlink(file,link);recordHookShape(link,input);expect(await readFile(file,'utf8')).toBe(first);
  await writeFile(file,'x'.repeat(16*1024));recordHookShape(file,input);expect((await readFile(file)).length).toBe(16*1024);
 } finally {await rm(root,{recursive:true,force:true});}
});

it('leaves original input intact, records once and removes probe listeners', async () => {
 const input=new PassThrough(), original:Buffer[]=[], records:string[]=[];
 observeHookShape(input,value=>records.push(value));
 input.on('data',chunk=>original.push(chunk));
 const finished=new Promise<void>(done=>input.once('close',done));
 const payload=JSON.stringify({hook_event_name:'SessionStart',session_id:'fixture',source:'startup'});
 input.write(payload.slice(0,12));input.end(payload.slice(12));await finished;
 expect(Buffer.concat(original).toString()).toBe(payload);
 expect(records).toEqual([payload]);expect(hookShape(records[0]!)).toMatchObject({normalized:'accepted',detail:'session-started'});
 expect(input.listenerCount('data')).toBe(1);expect(input.listenerCount('end')).toBe(0);expect(input.listenerCount('close')).toBe(0);
});
it('stops copying oversized input, keeps the original consumer and isolates diagnostic failure', async () => {
 const input=new PassThrough();let count=0, attempts=0;
 observeHookShape(input,value=>{attempts++;expect(hookShape(value).normalized).toBe('invalid');throw new Error('fixture');});
 input.on('data',chunk=>{count+=chunk.length;});
 const finished=new Promise<void>(done=>input.once('close',done));
 input.write(Buffer.alloc(64*1024+1));input.end('tail');await finished;
 expect(attempts).toBe(1);expect(count).toBe(64*1024+5);expect(input.destroyed).toBe(true);
 expect(input.listenerCount('data')).toBe(1);
});

it('never blocks the hook on a record path replaced with a FIFO', async () => {
 const root=await mkdtemp(join(tmpdir(),'agent-pet-shape-fifo-fixture-'));
 const run=promisify(execFile);
 try {
  const fifo=join(root,'shape.fifo');await run('/usr/bin/mkfifo',['-m','600',fifo]);
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,ssr:resolve('integrations/codex-hooks/test-support/hook-shape.ts'),rollupOptions:{output:{format:'cjs'}}}});
  const bundle=Array.isArray(output)?output[0]:output;
  if(!bundle || !('output' in bundle))throw new Error('Missing fixture bundle');
  const entry=bundle.output.find(item=>item.type==='chunk'&&item.isEntry);
  if(!entry || entry.type!=='chunk')throw new Error('Missing fixture entry');
  const module=join(root,'shape.cjs');await writeFile(module,entry.code,{mode:0o600});
  const result=await run(process.execPath,['-e',"require(process.argv[1]).recordHookShape(process.argv[2], '{}');",module,fifo],{timeout:1000});
  expect(result.stdout).toBe('');expect(result.stderr).toBe('');
 } finally {await rm(root,{recursive:true,force:true});}
});
