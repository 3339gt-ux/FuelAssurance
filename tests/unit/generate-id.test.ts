import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateId } from '@/lib/utils';

describe('generateId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() });

    expect(generateId()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('falls back to getRandomValues when randomUUID throws', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set(bytes);
      return target;
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => {
        throw new Error('secure context required');
      }),
      getRandomValues,
    });

    const id = generateId();
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(id).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('falls back to timestamp-based ID when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const id = generateId();
    expect(id).toMatch(/^fa-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });
});