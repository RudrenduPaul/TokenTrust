import type { LiveApiCall, LiveApiClient } from './tt02_cost_delta.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const LIVE_MODEL = 'claude-3-5-haiku-latest';

/**
 * Default --live API client: sends a single minimal message so the
 * provider's own response reports real, billed input-token usage for the
 * task's context text -- this is the "verify the estimate against a real
 * provider-billed total" step named in [redacted] (borrowing tokbench's
 * stronger meter). Only ever invoked after evaluateLiveGate has returned
 * { allowed: true } -- see tt02_cost_delta.ts.
 */
export const anthropicLiveApiClient: LiveApiClient = async (
  taskId,
  contextText,
  apiKey,
): Promise<LiveApiCall> => {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: LIVE_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: contextText }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`--live API call failed for task "${taskId}": ${response.status} ${body}`);
  }

  const data = (await response.json()) as { usage?: { input_tokens?: number } };
  const billedInputTokens = data.usage?.input_tokens ?? 0;
  return { taskId, billedInputTokens };
};
