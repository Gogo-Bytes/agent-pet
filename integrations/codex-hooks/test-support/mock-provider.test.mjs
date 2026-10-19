import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { mockProviderArguments, startMockProvider } from './mock-provider.mjs';
it('serves one fixed local Responses stream without retaining or reflecting the request', async () => {
  const mock = await startMockProvider();
  try {
    const response = await fetch(mock.url + '/responses', { method: 'POST', body: 'PRIVATE_PROMPT' });
    const text = await response.text();
    expect(text).toContain('event: response.completed'); expect(text).not.toContain('PRIVATE');
    expect(mock.snapshot()).toEqual({ responses: 1, unexpected: 0, rejected: 0 });
    const denied = await fetch(mock.url + '/responses', { method: 'POST', headers: { Authorization: 'PRIVATE' }, body: '{}' });
    expect(denied.status).toBe(400); expect(JSON.stringify(mock.snapshot())).not.toContain('PRIVATE');
  } finally { await mock.stop(); }
});
it('only produces local unauthenticated provider overrides with retry disabled', () => {
  expect(mockProviderArguments('http://127.0.0.1:1234/v1')).toContain('model_providers.agent_pet_fixture.request_max_retries=0');
  for (const url of ['https://example.com/v1','http://127.0.0.1:1234/other','http://secret@127.0.0.1:1234/v1'])
    expect(() => mockProviderArguments(url)).toThrow();
});
it('refuses implicit real execution before inspecting installation or configuration', async () => {
  await expect(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./first-turn-check.mjs', import.meta.url))], { cwd: '/tmp', timeout: 3000 }))
    .rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('Explicit local-first-turn') });
});
