import { runCodexHook } from './command.js';
// An observer failure must never block a task or emit instructions to Codex.
void runCodexHook(process.stdin, process.env).then(() => process.exit(0), () => process.exit(0));
