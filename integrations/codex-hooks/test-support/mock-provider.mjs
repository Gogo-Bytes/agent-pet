import http from 'node:http';
/** Test-only fixed Responses fixture. Never forwards, retains bodies or uses credentials. */
export async function startMockProvider() {
  const counts = { responses: 0, unexpected: 0, rejected: 0 };
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/responses' || req.headers.authorization) {
      counts.unexpected++; req.resume(); res.writeHead(400); res.end(); return;
    }
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) { counts.rejected++; req.destroy(); } });
    req.on('error', () => {});
    req.on('end', () => {
      if (req.destroyed) return;
      if (++counts.responses > 2) { counts.rejected++; res.writeHead(429); res.end(); return; }
      const item = { id: 'msg-fixture', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'OK', annotations: [] }] };
      const events = [
        { type: 'response.created', response: { id: 'resp-fixture', status: 'in_progress', output: [] } },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'resp-fixture', object: 'response', created_at: 0,
          status: 'completed', model: 'agent-pet-fixture', output: [item],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ];
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
      for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  server.requestTimeout = 2000; server.headersTimeout = 1000;
  server.on('connection', socket => { sockets.add(socket); socket.setTimeout(2000, () => socket.destroy()); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/v1`, snapshot: () => ({ ...counts }),
    async stop() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

export function mockProviderArguments(url) {
  const parsed = new URL(url);
  if (parsed.origin !== `http://127.0.0.1:${parsed.port}` || parsed.username || parsed.password || !parsed.port || parsed.pathname !== '/v1' || parsed.search || parsed.hash)
    throw new Error('Invalid fixture origin');
  const settings = ['model="agent-pet-fixture"', 'model_provider="agent_pet_fixture"',
    'features.apps=false', 'model_providers.agent_pet_fixture.name="Agent Pet local fixture"',
    `model_providers.agent_pet_fixture.base_url=${JSON.stringify(url)}`,
    'model_providers.agent_pet_fixture.wire_api="responses"',
    'model_providers.agent_pet_fixture.requires_openai_auth=false',
    'model_providers.agent_pet_fixture.supports_websockets=false',
    'model_providers.agent_pet_fixture.request_max_retries=0',
    'model_providers.agent_pet_fixture.stream_max_retries=0'];
  return settings.flatMap(setting => ['-c', setting]);
}
