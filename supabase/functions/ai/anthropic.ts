/**
 * Adapter for the Anthropic API. The only file that knows this provider's
 * SDK, model names and prices. The key comes from the function secret
 * ANTHROPIC_API_KEY and never leaves the server (CLAUDE.md rule 3).
 *
 * Models can be changed without touching code:
 *   npx supabase secrets set AI_MODEL_PLAN=... AI_MODEL_LIGHT=...
 */
import Anthropic from '@anthropic-ai/sdk';

import { AiError, type AiProvider, type AiRequest, type AiResult, type Tier } from './provider.ts';

const DEFAULT_MODELS: Record<Tier, string> = {
  plan: 'claude-opus-5-5',
  light: 'claude-haiku-5-5',
};

/** How hard the model thinks: more for the one-time plan, little for daily content. */
const EFFORT: Record<Tier, 'low' | 'medium'> = { plan: 'medium', light: 'low' };

/** US dollars per million tokens: [input, output]. Used for the estimate in ai_usage only. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

/** Edge Functions must answer within 150 seconds; stop a little before that. */
const TIMEOUT_MS = 140_000;

export class AnthropicProvider implements AiProvider {
  modelFor(tier: Tier): string {
    const override = Deno.env.get(tier === 'plan' ? 'AI_MODEL_PLAN' : 'AI_MODEL_LIGHT');
    return override || DEFAULT_MODELS[tier];
  }

  async complete(request: AiRequest): Promise<AiResult> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new AiError('AI is not set up yet: the server has no API key.', 503);
    }
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const model = this.modelFor(request.tier);

    let message: Anthropic.Message;
    try {
      // Streaming keeps the connection alive during long answers; only the
      // finished message is used.
      message = await client.messages
        .stream({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          output_config: {
            effort: EFFORT[request.tier],
            format: { type: 'json_schema', schema: request.schema },
          },
        })
        .finalMessage();
    } catch (error) {
      throw toAiError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new AiError('The AI model declined this request.', 422);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiError('The AI answer was cut off because it became too long.', 502);
    }
    const text = message.content.find((block) => block.type === 'text');
    let json: unknown;
    try {
      json = JSON.parse(text?.text ?? '');
    } catch {
      throw new AiError('The AI answer could not be read.', 502);
    }

    const usage = message.usage;
    const inputTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const price = PRICES[model];
    return {
      json,
      model,
      inputTokens,
      outputTokens: usage.output_tokens,
      costEstimate: price
        ? (inputTokens * price[0] + usage.output_tokens * price[1]) / 1_000_000
        : null,
    };
  }
}

function toAiError(error: unknown): AiError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('The server\'s AI key was rejected. Check the ANTHROPIC_API_KEY secret.', 503);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('The AI key may not use this model.', 503);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('The configured AI model does not exist.', 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('The AI service is busy or out of credit. Try again in a minute.', 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('The AI service did not answer in time. Try again.', 504);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`The AI service returned an error (${error.status ?? 'unknown'}).`, 502);
  }
  return new AiError('The AI call failed.', 502);
}
