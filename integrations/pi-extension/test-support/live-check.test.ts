import { describe, expect, it, vi } from 'vitest';
import liveCheck from './live-check.js';

describe('explicit live test fixture', () => {
  function setup() {
    type Api = Parameters<typeof liveCheck>[0];
    const commands = new Map<string, Parameters<Api['registerCommand']>[1]>();
    const registerProvider = vi.fn<Api['registerProvider']>();
    liveCheck({ registerCommand: (name, command) => commands.set(name, command), registerProvider });
    return { commands, registerProvider };
  }
  it('only opens a native confirmation when invoked in an idle TUI', async () => {
    const { commands } = setup();
    const ui = { confirm: vi.fn(async () => true), notify: vi.fn() };
    const command = commands.get('agent-pet-check-wait')!;
    for (const ctx of [{ mode: 'rpc', isIdle: () => true }, { mode: 'tui', isIdle: () => false }]) await command.handler('', { ...ctx, ui });
    expect(ui.confirm).not.toHaveBeenCalled();
    await command.handler('', { mode: 'tui', isIdle: () => true, ui });
    expect(ui.confirm).toHaveBeenCalledOnce(); expect(ui.notify).toHaveBeenCalledOnce();
  });
  it('uses a distinct zero-cost local failure provider that throws without accessing the prompt', () => {
    const { registerProvider } = setup();
    expect(registerProvider).toHaveBeenCalledOnce();
    const [name, provider] = registerProvider.mock.calls[0]!;
    expect(name).toBe('agent-pet-live-check');
    expect(provider.models[0]!.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(() => provider.streamSimple()).toThrow('AGENT_PET_LOCAL_TEST_FAILURE');
  });
});
