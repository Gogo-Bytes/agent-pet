import { describe, expect, it } from 'vitest';
import { readPiBridgeConfig } from './pi-config.js';

describe('pi bridge startup configuration', () => {
  it('requires an explicit endpoint and sufficiently long token', () => {
    expect(readPiBridgeConfig({})).toBeUndefined();
    expect(readPiBridgeConfig({
      AGENT_PET_PI_ENDPOINT: '/tmp/agent-pet.sock',
      AGENT_PET_PI_TOKEN: 'short',
    })).toBeUndefined();
  });

  it('does not enable pi observation accidentally', () => {
    expect(readPiBridgeConfig({
      AGENT_PET_PI_ENDPOINT: '/tmp/agent-pet.sock',
      AGENT_PET_PI_TOKEN: '0123456789abcdef',
    })).toEqual({ endpoint: '/tmp/agent-pet.sock', token: '0123456789abcdef' });
  });
});
