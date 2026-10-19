import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
const run = promisify(execFile);
it.each([{args:[]}, {args:['--run-authorized-review']}])('refuses noninteractive review before preparing real targets (%j)', async ({args}) => {
  // An empty cwd proves the gate does not compile sources or inspect the fixed installation.
  await expect(run(process.execPath,
    [fileURLToPath(new URL('./trust-review.mjs', import.meta.url)), ...args], {cwd:'/tmp',timeout:3000}))
    .rejects.toMatchObject({code:1,stdout:'',stderr:expect.stringContaining('interactive terminal')});
});
