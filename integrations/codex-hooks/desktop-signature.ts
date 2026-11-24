import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { codexHookEvents, sessionHookEvents } from './hook-source.js';

export const desktopExecutable = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
export const eventsForCodexHost = (executable: string) => executable === desktopExecutable ? sessionHookEvents : codexHookEvents;
const verify = promisify(execFile);

// codesign verifies a file for discovery, or the running code when given a decimal PID.
export async function verifyDesktopSignature(target: typeof desktopExecutable | number): Promise<void> {
  await verify('/usr/bin/codesign', ['--verify', '-R=anchor apple generic and identifier "codex" and certificate leaf[subject.OU] = "2DC432GLL2"', String(target)], { timeout: 1500, maxBuffer: 4096 });
}
