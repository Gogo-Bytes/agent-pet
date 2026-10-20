import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { readHookInput } from '../hook-runtime/input.js';
import { privatePath, readPrivateActivation } from '../hook-runtime/private-activation.js';
import { validHookEndpoint } from '../hook-runtime/transport.js';
import { normalizeCodexHook, MAX_CODEX_HOOK_BYTES } from './normalize.js';
async function main(): Promise<void> {
  if (process.argv.length !== 3) return;
  const input = await readHookInput(process.stdin, MAX_CODEX_HOOK_BYTES);
  if (input === undefined) return;
  const normalized = normalizeCodexHook(input);
  if (normalized.status !== 'accepted' || normalized.fact.childId !== undefined) return;
  const value = readPrivateActivation(process.argv[2]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'configurationId,executable,observerExecutable,provider,schemaVersion,token,url' ||
      v.schemaVersion !== 1 || v.provider !== 'codex' || typeof v.configurationId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.configurationId) ||
      !privatePath(v.executable) || !privatePath(v.observerExecutable) ||
      typeof v.url !== 'string' || typeof v.token !== 'string' ||
      !validHookEndpoint(v.url, v.token, '/codex-native-presence') || new URL(v.url).href !== v.url) return;
  const body = JSON.stringify({ schemaVersion: 1, hookPid: process.pid, eventId: randomUUID(), fact: normalized.fact });
  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); request.destroy(); resolve(); };
    const request = http.request(v.url as string, { method: 'POST', agent: false, headers: {
      Authorization: 'Bearer ' + v.token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    } }, response => { response.destroy(); finish(); });
    const timer = setTimeout(finish, 1000);
    request.on('error', finish); request.on('close', finish); request.end(body);
  });
}
// No environment injection, Agent control or hook output. Observer failure never blocks Codex.
void main().then(() => process.exit(0), () => process.exit(0));
