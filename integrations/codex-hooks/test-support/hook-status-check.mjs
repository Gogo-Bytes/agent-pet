import { prepareIsolated } from './isolated-context.mjs';
if (process.argv[2] !== '--run-authorized-check' || process.argv.length !== 3) {
  console.error('Explicit authorized-check argument required.'); process.exitCode = 1;
} else {
  try {
    const ctx = await prepareIsolated('status');
    const result = await ctx.probe({ root: ctx.root, mode: 'hooks-only', expectedHookCommand: ctx.command,
      launch: hookEnv => ctx.launch(ctx.executable, ctx.root, ctx.environment, hookEnv) });
    console.log(JSON.stringify(result));
  } catch { console.error('CHECK_STOPPED; no existing configuration or trust changed'); process.exitCode = 1; }
}
