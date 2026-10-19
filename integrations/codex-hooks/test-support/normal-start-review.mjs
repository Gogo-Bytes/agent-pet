import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmod, copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { environment, resolveEntry } from './cli-check.mjs';
import { startMockProvider, mockProviderArguments } from './mock-provider.mjs';

const ROOT = '/private/tmp/agent-pet-codex-normal-20261019-9fe182';
const ID = 'a43f9e8c-3a82-457c-93c0-5ac20caf7771';
if (process.argv[2] !== '--run-authorized-normal-start' || process.argv.length !== 3 || !process.stdin.isTTY) {
  console.error('Explicit normal-start authorization and terminal required.'); process.exitCode = 1;
} else {
  let mock, controller, child, ownedRoot = false, phase = 'prepare';
  try {
    const installed = await resolveEntry();
    await mkdir(ROOT, { mode: 0o700 }); ownedRoot = true;
    for (const name of ['home', 'config', 'cache', 'tmp', 'work', 'runtime']) await mkdir(join(ROOT, name), { mode: 0o700 });
    const compile = async (source, name) => {
      const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, ssr: resolve(source), rollupOptions: { output: { format: 'cjs' } } } });
      const chunk = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry);
      if (!chunk) throw new Error('Missing review artifact');
      await writeFile(join(ROOT, 'runtime', name), chunk.code, { flag: 'wx', mode: 0o600 }); return chunk.code;
    };
    await compile('apps/desktop/src/main/codex-normal-observer.ts', 'controller.cjs');
    const source = await compile('integrations/codex-hooks/native-hook-entry.ts', 'native-hook.cjs');
    const probeSource = resolve('apps/desktop/out/claude-runtime/process-probe');
    const stat = await lstat(probeSource);
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 512 * 1024 || !(stat.mode & 0o111) || (stat.mode & 0o022)) throw new Error('Unsafe own helper');
    const probe = join(ROOT, 'runtime/process-probe');
    await copyFile(probeSource, probe, constants.COPYFILE_EXCL); await chmod(probe, 0o700);
    const { CodexNormalObserver } = createRequire(import.meta.url)(join(ROOT, 'runtime/controller.cjs'));
    const metrics = { connected: 0, disconnected: 0 };
    const executable = installed.executable, node = await realpath(process.execPath);
    const options = { directory: join(ROOT, 'runtime', `codex-normal-${ID}`), configurationId: ID,
      executable, observerExecutable: node, nodeExecutable: node, runAsNode: false, probePath: probe,
      name: () => 'Isolated Codex', publish: value => { if (value.connected) metrics.connected++; else metrics.disconnected++; } };
    controller = new CodexNormalObserver(options);
    if (!await controller.initialize(source)) throw new Error('Private runtime preparation failed');
    const hookPath = join(ROOT, 'config/hooks.json'), privateHook = join(options.directory, 'hook.json');
    const hooks = await readFile(privateHook);
    await writeFile(hookPath, hooks, { flag: 'wx', mode: 0o600 });
    await writeFile(join(ROOT, 'config/config.toml'), 'cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n', { flag: 'wx', mode: 0o600 });
    const digest = value => createHash('sha256').update(value).digest('hex');
    const activationPath = join(options.directory, 'activation.json');
    const oldActivation = digest(await readFile(activationPath));
    mock = await startMockProvider();
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
    const firstCode = await launch(120000), firstRequests = mock.snapshot().responses, firstConnected = metrics.connected > 0;
    if (firstCode !== 0 || firstRequests !== 1 || !firstConnected) throw new Error('First normal observation not verified');
    phase = 'restore';
    await controller.stop(); controller = new CodexNormalObserver(options);
    if (!await controller.restore()) throw new Error('Private restart failed');
    const rotated = digest(await readFile(activationPath)) !== oldActivation;
    const connectedBefore = metrics.connected;
    phase = 'second-tui';
    console.log('ISOLATED_RESTART_READY: same hook command, no connection environment; send the same fixed task once and /quit.');
    const secondCode = await launch(45000);
    const hooksUnchanged = (await readFile(hookPath)).equals(hooks) && (await readFile(privateHook)).equals(hooks) &&
      (await readFile(join(options.directory, 'observer.cjs'), 'utf8')) === source;
    const result = { firstCode, secondCode, firstRequests, modelFixture: mock.snapshot(), firstConnected,
      secondConnected: metrics.connected > connectedBefore, activationRotated: rotated, hooksUnchanged,
      networkPolicy: 'loopback-only', credentialsUsed: false, specialConnectionEnvironment: false,
      scope: 'isolated-no-daemon-tui', passed: secondCode === 0 && metrics.connected > connectedBefore && rotated && hooksUnchanged &&
        mock.snapshot().responses === 2 && mock.snapshot().unexpected === 0 };
    await writeFile(join(ROOT, 'normal-result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
  } catch (error) {
    const category = error?.code === 'EEXIST' ? 'already-exists' : error?.code === 'EACCES' ? 'permission-denied' : 'check-failed';
    if (ownedRoot) await writeFile(join(ROOT, 'normal-failure.json'), JSON.stringify({ phase, category, modelFixture: mock?.snapshot() ?? null }), { flag: 'wx', mode: 0o600 }).catch(() => {});
    console.error('NORMAL_REVIEW_STOPPED: ' + phase + '/' + category + '; daily configuration untouched'); process.exitCode = 1;
  } finally { child?.kill('SIGTERM'); await controller?.stop(); await mock?.stop(); }
}
