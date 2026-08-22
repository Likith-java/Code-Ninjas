import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, ApiError } from './client.js';

afterEach(() => vi.restoreAllMocks());

describe('api session handling', () => {
  test('emits session-expired for unauthorized responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid or expired session' } }),
    }));
    const handler = vi.fn();
    window.addEventListener('auth:session-expired', handler);

    await expect(api('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('auth:session-expired', handler);
  });
});