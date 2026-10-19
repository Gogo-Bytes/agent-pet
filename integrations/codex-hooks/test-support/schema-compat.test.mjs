import { expect, it } from 'vitest';
import { readOnlyMode } from './schema-compat.mjs';
it.each(['read-only', 'readOnly'])('selects only the installed schema read-only spelling %s', mode => {
  const root = { title: 'ThreadStartParams', properties: { sandbox: { anyOf: [{ $ref: '#/definitions/SandboxMode' }, {type:'null'}] } } };
  expect(readOnlyMode([root, {title:'SandboxMode', enum:[mode,'workspace-write','danger-full-access']}])).toBe(mode);
});
it('handles a bundled protocol and inline sandbox enum', () => {
  expect(readOnlyMode([{definitions:{ThreadStartParams:{properties:{sandbox:{enum:['read-only','workspace-write']}}}}}])).toBe('read-only');
});
it('never substitutes a writable/unsafe policy, follows an external ref, or loops forever', () => {
  for (const sandbox of [{enum:['workspace-write','danger-full-access']}, {$ref:'../../private.json'}, {$ref:'#/definitions/SandboxMode'}])
    expect(readOnlyMode([{title:'ThreadStartParams',properties:{sandbox}}, {title:'SandboxMode',$ref:'#/definitions/SandboxMode'}])).toBeUndefined();
});
it('reads only the fixed self-generated schema files', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { readGeneratedMode } = await import('./schema-compat.mjs');
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-schema-fixture-'));
  try {
    await mkdir(join(root,'v2'));
    await writeFile(join(root,'v2/ThreadStartParams.json'),JSON.stringify({title:'ThreadStartParams',properties:{sandbox:{$ref:'#/definitions/SandboxMode'}}}));
    await writeFile(join(root,'SandboxMode.json'),JSON.stringify({title:'SandboxMode',enum:['read-only','workspace-write']}));
    expect(await readGeneratedMode(root)).toBe('read-only');
  } finally { await rm(root,{recursive:true,force:true}); }
});
it('does not follow a symlink masquerading as the generated v2 directory', async () => {
  const { mkdtemp, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { readGeneratedMode } = await import('./schema-compat.mjs');
  const root = await mkdtemp(join(tmpdir(), 'agent-pet-schema-fixture-'));
  try {
    await symlink('/does-not-exist-private',join(root,'v2'));
    await expect(readGeneratedMode(root)).rejects.toThrow('Unsafe schema directory');
  } finally { await rm(root,{recursive:true,force:true}); }
});
