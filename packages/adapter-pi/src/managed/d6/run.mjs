// Test-only bounded supervisor. Child output is capped and never forwarded (including raw errors).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const require = createRequire(import.meta.url);
const schemaJs = ts.transpileModule(readFileSync(join(here, 'evidence.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { serializeEnvironment, serializeCases, serializeCleanup, caseIds, exitCode } = await import(`data:text/javascript;base64,${Buffer.from(schemaJs).toString('base64')}`);
let output;
try {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', timeout: 2000, maxBuffer: 1024 });
  if (git.status !== 0 || !/^[a-f0-9]{40}\n$/.test(git.stdout)) throw new Error('D6_SETUP');
  const digest = createHash('sha256');
  for (const name of readdirSync(here).filter(name => /\.(ts|mjs)$/.test(name)).sort()) {
    digest.update(name + '\0'); digest.update(readFileSync(join(here, name)));
  }
  output = mkdtempSync('/tmp/agent-pet-d61-evidence-');
  const child = spawnSync(process.execPath, [require.resolve('vitest/vitest.mjs'), 'run',
    'packages/adapter-pi/src/managed/d6/harness.test.ts', '--pool=threads', '--poolOptions.threads.singleThread',
    '--no-file-parallelism', '--reporter=dot'], {
    cwd: repo, env: { ...process.env, D61_OUTPUT: output, D61_COMMIT: git.stdout.trim(), D61_DIGEST: digest.digest('hex') },
    timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 16384, encoding: 'utf8',
  });
  // spawnSync has waited for the owned child. No automatic retry or fixture cleanup on failure.
  const read = (name, max) => {
    const path = join(output, name);
    if (statSync(path).size > max) throw new Error('D6_EVIDENCE');
    return readFileSync(path, 'utf8');
  };
  const environment = JSON.parse(read('environment.json', 8192));
  const cases = read('cases.jsonl', 16384).trimEnd().split('\n').map(line => JSON.parse(line));
  const cleanup = JSON.parse(read('cleanup.json', 8192));
  serializeEnvironment(environment); serializeCases(cases); serializeCleanup(cleanup);
  const code = child.status === 0 && !child.error ? exitCode(cases, cleanup) : 1;
  console.log(`D61 behavior=${code === 1 ? 'FAIL' : cases.some(c => c.status === 'NOT-RUN') ? 'NOT-RUN' : 'PASS'} productionAdmission=BLOCKED exit=${code}`);
  console.log(`SANITIZED_EVIDENCE=${output}`);
  process.exitCode = code;
} catch {
  // Incomplete evidence is NOT passing test evidence. Preserve the attempt and report only fixed codes.
  if (output) {
    const summary = { schema: 1, status: 'FAIL', code: 'INCOMPLETE_EVIDENCE', productionAdmission: 'BLOCKED', preserved: true };
    writeFileSync(join(output, 'runner.json'), JSON.stringify(summary) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(`SANITIZED_EVIDENCE=${output}`);
  }
  console.log('D61 behavior=NOT-RUN productionAdmission=BLOCKED runner=FAIL code=INCOMPLETE_EVIDENCE exit=1');
  process.exitCode = 1;
}
