/** Explicitly loaded test fixture only. Never imported/deployed by the product. */
type CheckContext = {
  mode?: string;
  isIdle(): boolean;
  ui: { confirm(title: string, text: string): Promise<boolean>; notify(text: string, kind: string): void };
};
type CheckApi = {
  registerCommand(name: string, command: { description: string; handler(args: string, ctx: CheckContext): Promise<void> }): void;
  registerProvider(name: string, provider: {
    baseUrl: string; apiKey: string; api: string;
    models: { id: string; name: string; reasoning: boolean; input: string[];
      cost: { input: number; output: number; cacheRead: number; cacheWrite: number }; contextWindow: number; maxTokens: number }[];
    streamSimple(): never;
  }): void;
};

export default function liveCheck(pi: CheckApi) {
  // This fixture does not emit observation events or contact any socket/provider.
  // Pi itself produces the real ui_prompt and failed-run lifecycle events.
  pi.registerCommand('agent-pet-check-wait', {
    description: 'Agent Pet：只打开测试确认框，不请求模型或更改设置',
    async handler(_args, ctx) {
      if (ctx.mode !== 'tui' || !ctx.isIdle()) return;
      await ctx.ui.confirm('Agent Pet 等待测试', '请保持这个窗口打开。检查结束后选确定或按 Esc；不会更改设置。');
      ctx.ui.notify('等待测试已结束，未更改设置。', 'info');
    },
  });
  // Never overrides a real provider or selects a model. The user must select this
  // unmistakably named model and send a test prompt, then restore their own model.
  pi.registerProvider('agent-pet-live-check', {
    baseUrl: 'http://127.0.0.1:9', apiKey: 'local-fixture-not-a-secret', api: 'agent-pet-local-check',
    models: [{ id: 'fail-local', name: 'Agent Pet 本机出错测试（不联网）', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 16 }],
    streamSimple(): never { throw new Error('AGENT_PET_LOCAL_TEST_FAILURE: expected local test failure'); },
  });
}
