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
const titleFormat = { type: 'json_schema', name: 'codex_output_schema', strict: true, schema: {
  type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 36 } },
  required: ['title'], additionalProperties: false } };
it('interactive fixture distinguishes the native title schema and returns fixed valid structured output', async () => {
  const mock = await startMockProvider({ interactive: true });
  const send = body => fetch(mock.url + '/responses', { method: 'POST', body: JSON.stringify(body) });
  try {
    const task = await send({ input: 'PRIVATE_TASK' });
    expect(await task.text()).toContain('"text":"OK"');
    const title = await send({ text: { format: titleFormat }, input: 'PRIVATE_TITLE_PROMPT' });
    const events = (await title.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    const text = events.at(-1).response.output[0].content[0].text;
    expect(JSON.parse(text)).toEqual({ title: 'Check connection' });
    expect(mock.snapshot()).toEqual({ responses: 2, taskResponses: 1, titleResponses: 1, unexpected: 0, rejected: 0 });
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
    // Each of the two launches may make one task and one title request; never unlimited.
    await (await send({})).text(); await (await send({ text: { format: titleFormat } })).text();
    expect((await send({})).status).toBe(429);
    expect(mock.snapshot().rejected).toBe(1);
  } finally { await mock.stop(); }
});
it('refuses malformed/unknown structured requests and warmup rather than calling them normal tasks', async () => {
  const mock = await startMockProvider({ interactive: true });
  try {
    for (const body of ['not-json', '[]', JSON.stringify({ generate: false }),
      JSON.stringify({ text: { format: { type: 'json_schema', schema: { type: 'object' } } } })]) {
      const response = await fetch(mock.url + '/responses', { method: 'POST', body });
      expect(response.status).toBe(400);
    }
    expect(mock.snapshot()).toEqual({ responses: 0, taskResponses: 0, titleResponses: 0, unexpected: 0, rejected: 4 });
  } finally { await mock.stop(); }
});
it('refuses both native normal-review entry points without explicit terminal execution', async () => {
  for (const args of [[], ['--run-authorized-normal-start'], ['--run-authorized-normal-retry']]) {
    await expect(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./normal-start-review.mjs', import.meta.url)), ...args],
      { cwd: '/tmp', timeout: 3000 })).rejects.toMatchObject({ code: 1, stdout: '',
        stderr: expect.stringContaining('Explicit normal-start authorization and terminal required.') });
  }
});
