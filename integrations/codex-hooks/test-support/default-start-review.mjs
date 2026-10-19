import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile, realpath, lstat, copyFile, chmod, symlink } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, basename } from 'node:path';
import { build } from 'vite';
import { environment, resolveEntry } from './cli-check.mjs';
import { startMockProvider, mockProviderArguments } from './mock-provider.mjs';
import { normalRoundChecks } from './normal-review-checks.mjs';
const ROOT = '/private/tmp/agent-pet-codex-default-20261019-61d04a';
if (process.argv[2] !== '--run-authorized-default-start' || process.argv.length !== 3 || !process.stdin.isTTY) {
  console.error('Explicit default-start authorization and terminal required.'); process.exitCode = 1;
} else {
  let mock, collection, child, owned = false, phase = 'prepare', daemonCleanup = null, daemonAttempted = false, receiverCleanup = true;
  const rounds = [], metrics = { connected: 0, disconnected: 0 }, results = { privateRestart: false, commandUnchanged: false };
  const bounded = (executable, args, terminal, timeout) => new Promise((done, reject) => {
    child = spawn(executable, args, { cwd: join(ROOT, 'work'), env: environment(ROOT), stdio: terminal ? 'inherit' : ['ignore','pipe','pipe'] });
    const running = child; let bytes = 0, force;
    if (!terminal) for (const stream of [running.stdout, running.stderr]) stream.on('data', chunk => {
      bytes += chunk.length; if (bytes > 65536) running.kill('SIGTERM');
    });
    const stop = () => { running.kill('SIGTERM'); force ??= setTimeout(() => running.kill('SIGKILL'), 1000); };
    const timer = setTimeout(stop, timeout);
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    const clean = () => { clearTimeout(timer); clearTimeout(force); process.off('SIGINT', stop); process.off('SIGTERM', stop); child = undefined; };
    running.once('error', error => { clean(); reject(error); }); running.once('close', code => { clean(); done(code); });
  });
  let installed, testExecutable;
  const binaryDigest = async path => {
    const stat = await lstat(path); if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error('Program limit');
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) {
      size += chunk.length; if (size > 512 * 1024 * 1024) throw new Error('Program limit'); hash.update(chunk);
    }
    return hash.digest('hex');
  };
  let programDigest, binaryMatched = false;
  try {
    installed = await resolveEntry(); await mkdir(ROOT, { mode: 0o700 }); owned = true;
    for (const name of ['home','config','cache','tmp','work','runtime','data']) await mkdir(join(ROOT, name), { mode: 0o700 });
    const compile = async (source, name) => {
      const output = await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: [/^@agent-pet\//] }, build: { write: false, ssr: resolve(source),
        rollupOptions: { output: { format: 'cjs' } } } });
      const chunk = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry);
      if (!chunk) throw new Error('Missing own fixture runtime');
      const path = join(ROOT, 'runtime', name); await writeFile(path, chunk.code, { flag: 'wx', mode: 0o600 }); return { path, text: chunk.code };
    };
    const registry = await compile('apps/desktop/src/main/configurations.ts', 'configurations.cjs');
    const hook = await compile('integrations/codex-hooks/native-hook-entry.ts', 'native-hook.cjs');
    const probeSource = resolve('apps/desktop/out/claude-runtime/process-probe'), stat = await lstat(probeSource);
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 512 * 1024 || (stat.mode & 0o022)) throw new Error();
    const probe = join(ROOT, 'runtime/process-probe'); await copyFile(probeSource, probe, constants.COPYFILE_EXCL); await chmod(probe, 0o700);
    // Copy the verified existing binary, never link a writable managed installation to daily files.
    const managed = join(ROOT, 'config/packages/app-server-daemon');
    const release = join(managed, 'releases/0.163.0');
    await mkdir(join(release, 'bin'), { recursive: true, mode: 0o700 });
    testExecutable = join(release, 'bin/codex');
    programDigest = await binaryDigest(installed.executable);
    await copyFile(installed.executable, testExecutable, constants.COPYFILE_EXCL); await chmod(testExecutable, 0o700);
    const current = await resolveEntry();
    if (current.identity !== installed.identity || await binaryDigest(testExecutable) !== programDigest) throw new Error('Program changed');
    binaryMatched = true; await symlink(release, join(managed, 'current'));
    mock = await startMockProvider({ interactive: true });
    const settings = mockProviderArguments(mock.url).filter((_, index) => index % 2 === 1).join('\n');
    await writeFile(join(ROOT, 'config/config.toml'), 'cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n' + settings + '\n', { flag: 'wx', mode: 0o600 });
    const { Configurations } = createRequire(import.meta.url)(registry.path);
    const node = await realpath(process.execPath);
    const options = { directory: join(ROOT, 'data'), adapter: () => { throw new Error('No pi fixture permitted'); },
      publish: value => { if (value.connected) metrics.connected++; else metrics.disconnected++; },
      codex: { nodeExecutable: node, observerExecutable: node, runAsNode: false, probePath: probe,
        chooseExecutable: async () => installed.executable, runtimeAssets: async () => ({ nativeHook: hook.text }) } };
    collection = new Configurations(options);
    const state = await collection.create({ provider: 'codex', name: 'Isolated default Codex', targetPath: join(ROOT, 'config') });
    const id = state.records[0]?.id; if (!id) throw new Error();
    const preview = (await collection.preview(id)).records[0]?.codex?.preview;
    if (!preview?.canApply) throw new Error('Cannot prepare exact native setup');
    if ((await collection.confirm(id, preview.id)).records[0]?.codex?.status !== 'waiting') throw new Error();
    const { readFile } = await import('node:fs/promises');
    const hooks = await readFile(join(ROOT, 'config/hooks.json'));
    const launch = async timeout => {
      const current = await resolveEntry();
      if (current.identity !== installed.identity || current.executable !== installed.executable || await binaryDigest(testExecutable) !== programDigest ||
          !(await readFile(join(ROOT, 'config/hooks.json'))).equals(hooks)) throw new Error('Installation changed');
      daemonAttempted = true;
      return bounded(testExecutable, ['--no-alt-screen','--sandbox','read-only','--ask-for-approval','never'], true, timeout);
    };
    phase = 'first-default-tui'; const initial = mock.snapshot();
    console.log('DEFAULT_REVIEW_READY: review only these 10 own Agent Pet hooks; then send "Reply OK only. Do not use tools." once and /quit.');
    const firstCode = await launch(120000);
    rounds.push(normalRoundChecks({ exitCode: firstCode, before: initial, after: mock.snapshot(), connectedBefore: 0, connectedAfter: metrics.connected }));
    if (!rounds[0].passed) throw new Error('First default round failed');
    phase = 'restore'; await collection.stop(); collection = new Configurations(options);
    // Startup restore is asynchronous; wait for its bounded native self-check, never create a second receiver.
    const until = Date.now() + 5000;
    while (collection.snapshot().records[0]?.codex?.busy && Date.now() < until) await new Promise(done => setTimeout(done, 20));
    results.privateRestart = collection.snapshot().records[0]?.codex?.status === 'waiting';
    if (!results.privateRestart) throw new Error('Private receiver not restored');
    const before = mock.snapshot(), count = metrics.connected;
    phase = 'second-default-tui'; console.log('DEFAULT_RESTART_READY: same trusted hooks; send the same fixed task once and /quit.');
    const secondCode = await launch(45000);
    rounds.push(normalRoundChecks({ exitCode: secondCode, before, after: mock.snapshot(), connectedBefore: count, connectedAfter: metrics.connected }));
    results.commandUnchanged = (await readFile(join(ROOT, 'config/hooks.json'))).equals(hooks);
    if (!rounds[1].passed || !results.commandUnchanged) throw new Error('Second default round failed');
    phase = 'verified';
  } catch { process.exitCode = 1; }
  finally {
    child?.kill('SIGTERM'); await collection?.stop().catch(() => { receiverCleanup = false; });
    // Native shutdown addresses only this exclusive CODEX_HOME; never daily daemon files or sockets.
    if (owned && testExecutable && daemonAttempted) {
      try { daemonCleanup = await binaryDigest(testExecutable) === programDigest &&
        await bounded(testExecutable, ['app-server','daemon','stop'], false, 5000) === 0; }
      catch { daemonCleanup = false; }
    }
    await mock?.stop();
    const passed = phase === 'verified' && daemonCleanup === true && receiverCleanup;
    if (owned) await writeFile(join(ROOT, 'default-result.json'), JSON.stringify({ phase, rounds, metrics, ...results,
      modelFixture: mock?.snapshot() ?? null, daemonCleanup, receiverCleanup, binaryMatched, credentialsUsed: false, specialConnectionEnvironment: false,
      networkPolicy: 'native-default-not-os-filtered', realModelUsed: false, passed }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ phase, rounds, daemonCleanup, passed })); if (!passed) process.exitCode = 1;
  }
}
