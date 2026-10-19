import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmod, copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { environment, resolveEntry } from './cli-check.mjs';
import { startMockProvider, mockProviderArguments } from './mock-provider.mjs';
import { normalRoundChecks } from './normal-review-checks.mjs';

const ROOT = '/private/tmp/agent-pet-codex-normal-20261019-9fe182';
const ID = 'a43f9e8c-3a82-457c-93c0-5ac20caf7771';
const retry = process.argv[2] === '--run-authorized-normal-retry';
if ((!retry && process.argv[2] !== '--run-authorized-normal-start') || process.argv.length !== 3 || !process.stdin.isTTY) {
  console.error('Explicit normal-start authorization and terminal required.'); process.exitCode = 1;
} else {
  let mock, controller, child, ownedRoot = false, phase = 'prepare';
  const metrics = { connected: 0, disconnected: 0 }, rounds = [];
  const resultName = retry ? 'normal-retry-result.json' : 'normal-result.json';
  const failureName = retry ? 'normal-retry-failure.json' : 'normal-failure.json';
  try {
    const installed = await resolveEntry();
    let privateFiles;
    if (retry) {
      const output = await build({ configFile: false, logLevel: 'silent', build: { write: false,
        ssr: resolve('integrations/hook-runtime/private-activation.ts'), rollupOptions: { output: { format: 'es' } } } });
      const chunk = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry);
      if (!chunk) throw new Error('Missing private verification');
      privateFiles = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
      for (const name of ['', 'home', 'config', 'cache', 'tmp', 'work', 'runtime']) privateFiles.verifyPrivateDirectory(join(ROOT, name));
      const failure = JSON.parse(privateFiles.readPrivateFile(join(ROOT, 'normal-failure.json'), 8192).toString('utf8'));
      if (failure.phase !== 'first-tui' || failure.category !== 'check-failed' ||
          failure.modelFixture?.responses !== 2 || failure.modelFixture.unexpected !== 0 || failure.modelFixture.rejected !== 0)
        throw new Error('Unexpected first failure');
      // One explicit retry only. Never overwrite prior evidence or launch if its result exists.
      for (const name of [resultName, failureName]) {
        try { await lstat(join(ROOT, name)); throw new Error('Retry already attempted'); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
      ownedRoot = true;
    } else {
      await mkdir(ROOT, { mode: 0o700 }); ownedRoot = true;
      for (const name of ['home', 'config', 'cache', 'tmp', 'work', 'runtime']) await mkdir(join(ROOT, name), { mode: 0o700 });
    }
    const compile = async (source, name) => {
      const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, ssr: resolve(source), rollupOptions: { output: { format: 'cjs' } } } });
      const chunk = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry);
      if (!chunk) throw new Error('Missing review artifact');
      if (retry) {
        if (privateFiles.readPrivateFile(join(ROOT, 'runtime', name), 512 * 1024).toString('utf8') !== chunk.code)
          throw new Error('Prepared artifact changed');
      } else await writeFile(join(ROOT, 'runtime', name), chunk.code, { flag: 'wx', mode: 0o600 });
      return chunk.code;
    };
    await compile('apps/desktop/src/main/codex-normal-observer.ts', 'controller.cjs');
    const source = await compile('integrations/codex-hooks/native-hook-entry.ts', 'native-hook.cjs');
    const probeSource = resolve('apps/desktop/out/claude-runtime/process-probe');
    const stat = await lstat(probeSource);
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 512 * 1024 || !(stat.mode & 0o111) || (stat.mode & 0o022)) throw new Error('Unsafe own helper');
    const probe = join(ROOT, 'runtime/process-probe');
    if (retry) {
      const saved = await lstat(probe);
      if (await realpath(probe) !== probe || !saved.isFile() || saved.uid !== process.getuid() || saved.nlink !== 1 ||
          (saved.mode & 0o7777) !== 0o700 || saved.size !== stat.size || !(await readFile(probe)).equals(await readFile(probeSource)))
        throw new Error('Prepared helper changed');
    } else { await copyFile(probeSource, probe, constants.COPYFILE_EXCL); await chmod(probe, 0o700); }
    const { CodexNormalObserver } = createRequire(import.meta.url)(join(ROOT, 'runtime/controller.cjs'));
    const executable = installed.executable, node = await realpath(process.execPath);
    const options = { directory: join(ROOT, 'runtime', `codex-normal-${ID}`), configurationId: ID,
      executable, observerExecutable: node, nodeExecutable: node, runAsNode: false, probePath: probe,
      name: () => 'Isolated Codex', publish: value => { if (value.connected) metrics.connected++; else metrics.disconnected++; } };
    controller = new CodexNormalObserver(options);
    if (!await (retry ? controller.restore() : controller.initialize(source))) throw new Error('Private runtime preparation failed');
    const hookPath = join(ROOT, 'config/hooks.json'), privateHook = join(options.directory, 'hook.json');
    const hooks = await readFile(privateHook);
    if (retry) {
      if (!privateFiles.readPrivateFile(hookPath, 256 * 1024).equals(hooks)) throw new Error('Native hook file changed');
    } else {
      await writeFile(hookPath, hooks, { flag: 'wx', mode: 0o600 });
      await writeFile(join(ROOT, 'config/config.toml'), 'cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n', { flag: 'wx', mode: 0o600 });
    }
    const digest = value => createHash('sha256').update(value).digest('hex');
    const activationPath = join(options.directory, 'activation.json');
    const oldActivation = digest(await readFile(activationPath));
    mock = await startMockProvider({ interactive: true });
    const launch = async timeout => {
      const before = await resolveEntry();
      if (before.executable !== installed.executable || before.identity !== installed.identity ||
          !(await readFile(hookPath)).equals(hooks) || !(await readFile(privateHook)).equals(hooks)) throw new Error('Review target changed');
      return new Promise((done, reject) => {
        child = spawn('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))',
          executable, ...mockProviderArguments(mock.url), '--no-daemon', '--no-alt-screen', '--sandbox', 'read-only', '--ask-for-approval', 'never'],
        { cwd: join(ROOT, 'work'), env: environment(ROOT), stdio: 'inherit' });
        let force;
        const stop = () => { child.kill('SIGTERM'); force ??= setTimeout(() => child.kill('SIGKILL'), 1000); };
        const deadline = setTimeout(stop, timeout);
        const cleanup = () => { clearTimeout(deadline); clearTimeout(force); process.off('SIGINT', stop); process.off('SIGTERM', stop); };
        process.on('SIGINT', stop); process.on('SIGTERM', stop);
        child.once('error', error => { cleanup(); reject(error); });
        child.once('close', code => { cleanup(); child = undefined; done(code); });
      });
    };
    phase = 'first-tui';
    console.log('ISOLATED_REVIEW_READY: review only these 10 Agent Pet hooks; then send "Reply OK only. Do not use tools." and /quit.');
    const initial = mock.snapshot();
    const firstCode = await launch(120000);
    rounds.push(normalRoundChecks({ exitCode: firstCode, before: initial, after: mock.snapshot(),
      connectedBefore: 0, connectedAfter: metrics.connected }));
    if (!rounds[0].passed) throw new Error('First normal observation not verified');
    phase = 'restore';
    await controller.stop(); controller = new CodexNormalObserver(options);
    if (!await controller.restore()) throw new Error('Private restart failed');
    const rotated = digest(await readFile(activationPath)) !== oldActivation;
    const connectedBefore = metrics.connected, beforeSecond = mock.snapshot();
    phase = 'second-tui';
    console.log('ISOLATED_RESTART_READY: same hook command, no connection environment; send the same fixed task once and /quit.');
    const secondCode = await launch(45000);
    rounds.push(normalRoundChecks({ exitCode: secondCode, before: beforeSecond, after: mock.snapshot(),
      connectedBefore, connectedAfter: metrics.connected }));
    const hooksUnchanged = (await readFile(hookPath)).equals(hooks) && (await readFile(privateHook)).equals(hooks) &&
      (await readFile(join(options.directory, 'observer.cjs'), 'utf8')) === source;
    const result = { rounds, metrics: { ...metrics }, modelFixture: mock.snapshot(),
      activationRotated: rotated, hooksUnchanged,
      networkPolicy: 'loopback-only', credentialsUsed: false, specialConnectionEnvironment: false,
      scope: 'isolated-no-daemon-tui', passed: rounds.every(round => round.passed) && rotated && hooksUnchanged };
    await writeFile(join(ROOT, resultName), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
  } catch (error) {
    const category = error?.code === 'EEXIST' ? 'already-exists' : error?.code === 'EACCES' ? 'permission-denied' : 'check-failed';
    if (ownedRoot) await writeFile(join(ROOT, failureName), JSON.stringify({ phase, category, rounds, metrics: { ...metrics },
      modelFixture: mock?.snapshot() ?? null }), { flag: 'wx', mode: 0o600 }).catch(() => {});
    console.error('NORMAL_REVIEW_STOPPED: ' + phase + '/' + category + '; daily configuration untouched'); process.exitCode = 1;
  } finally { child?.kill('SIGTERM'); await controller?.stop(); await mock?.stop(); }
}
