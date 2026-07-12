import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicLiveApiClient } from './live-api-client.js';

describe('anthropicLiveApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns billed input tokens reported by the provider response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ usage: { input_tokens: 123 } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await anthropicLiveApiClient('task-1', 'hello world', 'sk-fake-key');
    expect(result).toEqual({ taskId: 'task-1', billedInputTokens: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-fake-key');
  });

  it('throws a descriptive error when the provider responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid api key',
      }),
    );

    await expect(anthropicLiveApiClient('task-1', 'hello', 'bad-key')).rejects.toThrow(/401/);
  });

  it('defaults billedInputTokens to 0 when usage is missing from the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' }),
    );
    const result = await anthropicLiveApiClient('task-1', 'hello', 'sk-fake-key');
    expect(result.billedInputTokens).toBe(0);
  });
});
