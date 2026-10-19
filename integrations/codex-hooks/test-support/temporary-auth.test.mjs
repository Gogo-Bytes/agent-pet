import {mkdtemp,readFile,writeFile,chmod,symlink,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {withTemporaryAuth} from './temporary-auth.mjs';
async function fixture(fn) {
 const root=await mkdtemp(join(tmpdir(),'agent-pet-auth-fixture-'));
 const source=join(root,'source.json'),target=join(root,'target.json');
 try {await writeFile(source,'{"fixture":"FAKE_SECRET"}',{mode:0o600});await fn({root,source,target});}
 finally {await rm(root,{recursive:true,force:true});}
}
it.each([false,true])('leases protected credentials only during the operation and cleans up on failure=%s',async fail=>fixture(async({source,target})=>{
 const operation=async()=>{
  expect((await lstat(target)).mode&0o7777).toBe(0o600);
  expect(await readFile(target,'utf8')).toBe(await readFile(source,'utf8'));
  if(fail)throw new Error('fixture failure');return 'done';
 };
 const result=withTemporaryAuth(source,target,operation);
 if(fail)await expect(result).rejects.toThrow('fixture failure');else expect(await result).toBe('done');
 await expect(lstat(target)).rejects.toMatchObject({code:'ENOENT'});
 expect(await readFile(source,'utf8')).toBe('{"fixture":"FAKE_SECRET"}');
}));
it('refuses existing destinations and unsafe source files without overwriting or invoking the Agent',async()=>fixture(async({root,source,target})=>{
 const operation=vi.fn();
 await writeFile(target,'keep',{mode:0o600});
 await expect(withTemporaryAuth(source,target,operation)).rejects.toMatchObject({code:'EEXIST'});
 expect(await readFile(target,'utf8')).toBe('keep');
 await rm(target);await chmod(source,0o644);
 await expect(withTemporaryAuth(source,target,operation)).rejects.toThrow('Unsafe authentication source');
 await chmod(source,0o600);
 const link=join(root,'link');await symlink(source,link);
 await expect(withTemporaryAuth(link,target,operation)).rejects.toBeDefined();
 await writeFile(source,Buffer.alloc(65537));
 await expect(withTemporaryAuth(source,target,operation)).rejects.toThrow('Unsafe authentication source');
 expect(operation).not.toHaveBeenCalled();
 await expect(lstat(target)).rejects.toMatchObject({code:'ENOENT'});
}));
