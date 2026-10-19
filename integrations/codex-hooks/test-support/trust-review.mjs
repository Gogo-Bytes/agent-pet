import { spawn } from 'node:child_process';
import { prepareIsolated } from './isolated-context.mjs';
import { withTemporaryAuth } from './temporary-auth.mjs';
const localAuth = process.argv[2] === '--run-authorized-review-local-auth';
const retry = process.argv[2] === '--run-authorized-review-r1';
if ((!retry && !localAuth && process.argv[2] !== '--run-authorized-review') || process.argv.length !== 3 || !process.stdin.isTTY) {
  console.error('Run this reviewed operation in an interactive terminal with --run-authorized-review.'); process.exitCode = 1;
} else {
  try {
    const ctx = await prepareIsolated(localAuth ? 'review-auth' : retry ? 'review-r1' : 'review');
    console.log('这是隔离 Codex，只审核本产品的 10 条 hook。进入后输入 /hooks，核对并信任这些条目，然后正常退出。不要发送任务；若要求登录，请直接退出。');
    const interactive = () => new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', ctx.profile, ctx.executable, '--no-daemon', '--no-alt-screen', ...(localAuth ? ['-c', 'cli_auth_credentials_store="file"'] : [])], {
        cwd: ctx.root + '/work', env: ctx.environment, stdio: 'inherit',
      });
      let force;
      let interrupted = false;
      const stop = () => { interrupted = true; child.kill('SIGTERM'); force ??= setTimeout(() => child.kill('SIGKILL'), 1000); };
      const deadline = setTimeout(stop, 180000);
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      const finish = () => { clearTimeout(deadline); clearTimeout(force); process.off('SIGINT', stop); process.off('SIGTERM', stop); };
      child.once('error', error => { finish(); reject(error); });
      child.once('close', code => { finish(); resolve(interrupted ? null : code); });
    });
    const code = localAuth ? await withTemporaryAuth('/Users/gan/.codex/auth.json', ctx.root + '/config/auth.json', interactive) : await interactive();
    if (code !== 0) throw new Error('Review interrupted');
    await ctx.verify();
    const status = await ctx.probe({ root: ctx.root, mode: 'hooks-only', resultFileName: localAuth ? 'auth-review-status.json' : 'review-status.json', expectedHookCommand: ctx.command,
      launch: hookEnv => ctx.launch(ctx.executable, ctx.root, ctx.environment, hookEnv) });
    console.log(JSON.stringify(status));
    if (status.outcome !== 'hooks-listed' || !ctx.hasReviewedOwnHooks(status.hookStatus)) {
      console.log('审核尚未完成，已停止；脚本没有自动批准信任，也没有启动任务。'); process.exitCode = 1;
    } else {
      await ctx.verify();
      const result = await ctx.probe({ root: ctx.root, sandboxMode: 'read-only', resultFileName: localAuth ? 'auth-review-start.json' : 'review-start.json',
        launch: hookEnv => ctx.launch(ctx.executable, ctx.root, ctx.environment, hookEnv) });
      console.log(JSON.stringify(result));
      if (!result.threadStarted || !result.events.some(event => event.kind === 'session-started')) process.exitCode = 1;
    }
  } catch(error) {
    const known = new Map([
      ['Isolated configuration changed','isolated-configuration-changed'],
      ['Existing helper changed','existing-helper-changed'],
      ['Unsafe isolated directory','unsafe-isolated-directory'],
      ['Unsafe isolated file','unsafe-isolated-file'],
      ['Observer changed','observer-changed'],
      ['Program changed','program-changed'],
      ['Isolated target changed','isolated-target-changed'],
      ['Review interrupted','review-interrupted'],
      ['Unsafe authentication source','unsafe-authentication-source'],
      ['Authentication source changed','authentication-source-changed'],
      ['Temporary authentication changed','temporary-authentication-changed'],
    ]);
    const category = known.get(error?.message) ?? (['EEXIST','ENOENT','EACCES','EPERM'].includes(error?.code) ? error.code : 'internal-check-failed');
    console.error(`REVIEW_STOPPED: ${category}; daily configuration untouched`); process.exitCode = 1;
  }
}
