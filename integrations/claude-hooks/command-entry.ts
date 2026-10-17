import { runClaudeHook } from './command.js';

// Dedicated hook process only: no diagnostics or JSON output can influence Claude.
// Do not import this entry from Main or a library caller.
void runClaudeHook(process.stdin, {
  ...(process.env.AGENT_PET_CLAUDE_URL ? { AGENT_PET_CLAUDE_URL: process.env.AGENT_PET_CLAUDE_URL } : {}),
  ...(process.env.AGENT_PET_CLAUDE_TOKEN ? { AGENT_PET_CLAUDE_TOKEN: process.env.AGENT_PET_CLAUDE_TOKEN } : {}),
  ...(process.env.AGENT_PET_CLAUDE_RUN_ID ? { AGENT_PET_CLAUDE_RUN_ID: process.env.AGENT_PET_CLAUDE_RUN_ID } : {}),
}).then(() => process.exit(0), () => process.exit(0));
