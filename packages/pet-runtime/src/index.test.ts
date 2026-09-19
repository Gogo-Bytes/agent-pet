import { describe, expect, it } from 'vitest';
import {
  animationForStatus,
  validatePetManifest,
  type PetManifest,
} from './index.js';

const validManifest: PetManifest = {
  id: 'starter-cat',
  version: '1.0.0',
  model: 'starter-cat.glb',
  animations: {
    idle: 'Idle',
    working: 'Work',
    error: 'Error',
  },
  license: 'CC-BY-4.0',
};

describe('pet runtime contracts', () => {
  it('maps status to an available animation with idle fallback', () => {
    expect(animationForStatus('working', validManifest.animations)).toBe('Work');
    expect(animationForStatus('error-unread', validManifest.animations)).toBe('Error');
    expect(animationForStatus('completed-unread', validManifest.animations)).toBe('Idle');
  });

  it('accepts a valid local GLB manifest', () => {
    expect(validatePetManifest(validManifest)).toEqual({ valid: true, manifest: validManifest });
  });

  it('rejects manifests without an idle animation or with remote models', () => {
    expect(validatePetManifest({ ...validManifest, model: 'https://example.com/pet.glb' })).toEqual({
      valid: false,
      reason: 'model-must-be-local-glb',
    });
    expect(validatePetManifest({
      ...validManifest,
      animations: { working: 'Work' },
    })).toEqual({ valid: false, reason: 'idle-animation-required' });
  });
});
