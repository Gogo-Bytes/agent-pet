import {mkdtemp,readFile,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {isExpectedIsolatedConfig,writeOrVerifyHelper} from './isolated-context.mjs';
const initial='cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n';
it('accepts only the unchanged isolated config or the exact native UI addition observed before startup failed',()=>{
  expect(isExpectedIsolatedConfig(initial)).toBe(true);
  expect(isExpectedIsolatedConfig(initial+'\n[tui]\nscreen_reader_detection_done = true\n')).toBe(true);
  for(const text of [initial.replace('ephemeral','file'),initial.replace('false','true'),
    initial+'\n[projects."/elsewhere"]\ntrust_level = "trusted"\n',
    initial+'\n[tui]\nscreen_reader_detection_done = true\nother = true\n',
    initial+'\n[features]\nscreen_reader_detection_done = true\n'])
    expect(isExpectedIsolatedConfig(text)).toBe(false);
});
it('resumes only byte-identical protected own helpers and never overwrites a modified file or symlink',async()=>{
  const root=await mkdtemp(join(tmpdir(),'agent-pet-review-prepare-fixture-'));
  try {
    const file=join(root,'own.cjs');
    await writeOrVerifyHelper(file,'known helper');
    await expect(writeOrVerifyHelper(file,'known helper')).rejects.toMatchObject({code:'EEXIST'});
    await writeOrVerifyHelper(file,'known helper',true);
    await expect(writeOrVerifyHelper(file,'changed helper',true)).rejects.toThrow('Existing helper changed');
    expect(await readFile(file,'utf8')).toBe('known helper');
    await chmod(file,0o644);
    await expect(writeOrVerifyHelper(file,'known helper',true)).rejects.toThrow('Existing helper changed');
    await chmod(file,0o600);
    const link=join(root,'link.cjs');await symlink(file,link);
    await expect(writeOrVerifyHelper(link,'known helper',true)).rejects.toThrow('Existing helper changed');
    expect(await readFile(file,'utf8')).toBe('known helper');
    const other=join(root,'other.cjs');await writeFile(other,'other',{mode:0o600});
    await expect(writeOrVerifyHelper(other,'known helper',true)).rejects.toThrow('Existing helper changed');
    expect(await readFile(other,'utf8')).toBe('other');
  } finally {await rm(root,{recursive:true,force:true});}
});
